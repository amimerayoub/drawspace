import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Query, type AppwriteDatabase } from '../database/appwrite';
import { RowRepository, type Row } from '../repositories/rowRepository';
import { HttpError } from '../middleware/errors';
import { ALL_MCP_SCOPES, MCP_KEY_PREFIX, normalizeScopes, type McpScope } from './scopes';

export interface McpKeyContext { id: string; name: string; scopes: McpScope[]; source: 'env' | 'table' }
export interface McpKeyActor { userId: string; username: string; role: string }
export interface McpKeyView {
  id: string; name: string; keyPrefix: string; scopes: McpScope[]; status: string;
  createdBy: string; createdAt: string; expiresAt: string; lastUsedAt: string; revokedAt: string;
}
export interface McpKeyStatus {
  tableAvailable: boolean; activeKeys: number; revokedKeys: number;
  bootstrapConfigured: boolean; transport: string; scopes: McpScope[];
}

const TABLE = 'mcp_api_keys';

export function hashKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

export function generateMcpKey(): { key: string; keyHash: string; keyPrefix: string } {
  const key = `${MCP_KEY_PREFIX}${randomBytes(32).toString('base64url')}`;
  return { key, keyHash: hashKey(key), keyPrefix: key.slice(0, 12) };
}

function toView(row: Row): McpKeyView {
  return {
    id: row.$id,
    name: String(row.name ?? ''),
    keyPrefix: String(row.keyPrefix ?? ''),
    scopes: normalizeScopes(Array.isArray(row.scopes) ? row.scopes.map(String) : []),
    status: String(row.status ?? 'active'),
    createdBy: String(row.createdBy ?? ''),
    createdAt: String(row.createdAt ?? ''),
    expiresAt: String(row.expiresAt ?? ''),
    lastUsedAt: String(row.lastUsedAt ?? ''),
    revokedAt: String(row.revokedAt ?? ''),
  };
}

/**
 * MCP credentials are independent of Appwrite. Keys are stored as SHA-256 hashes;
 * the plaintext is returned exactly once at creation/rotation. Before the
 * mcp_api_keys migration is applied, only the optional env bootstrap key works.
 */
export class McpKeyService {
  private readonly keys: RowRepository;
  private readonly audit: RowRepository;
  private readonly bootstrapScopes: McpScope[];

  constructor(
    private readonly database: AppwriteDatabase,
    private readonly bootstrapKey?: string,
    bootstrapScopes?: string[],
  ) {
    this.keys = new RowRepository(database, TABLE);
    this.audit = new RowRepository(database, 'audit_logs');
    const requested = bootstrapScopes && bootstrapScopes.length > 0 ? normalizeScopes(bootstrapScopes) : [];
    this.bootstrapScopes = requested.length > 0 ? requested : ALL_MCP_SCOPES;
  }

  async authenticate(presented: string): Promise<McpKeyContext | null> {
    if (!presented) return null;
    const hash = hashKey(presented);
    if (this.bootstrapKey && safeEqualHex(hash, hashKey(this.bootstrapKey))) {
      return { id: 'bootstrap', name: 'Bootstrap key (env)', scopes: this.bootstrapScopes, source: 'env' };
    }
    let row: Row | null;
    try { row = await this.keys.findOne('keyHash', hash); }
    catch { return null; }
    if (!row || String(row.status) !== 'active') return null;
    const expiresAt = String(row.expiresAt ?? '');
    if (expiresAt && Date.parse(expiresAt) <= Date.now()) return null;
    const scopes = normalizeScopes(Array.isArray(row.scopes) ? row.scopes.map(String) : []);
    void this.keys.patch(row.$id, { lastUsedAt: new Date().toISOString() }).catch(() => undefined);
    return { id: row.$id, name: String(row.name ?? 'MCP key'), scopes, source: 'table' };
  }

  private async ensureTable(): Promise<void> {
    try { await this.database.tables.listRows(this.database.databaseId, TABLE, [Query.limit(1)]); }
    catch { throw new HttpError(503, 'MCP key storage is unavailable. Apply the content schema migration to create the mcp_api_keys table.', 'MIGRATION_REQUIRED'); }
  }

  async status(): Promise<McpKeyStatus> {
    let rows: Row[] = [];
    let tableAvailable = true;
    try { rows = await this.keys.list([Query.limit(500)]); }
    catch { tableAvailable = false; }
    return {
      tableAvailable,
      activeKeys: rows.filter((row) => String(row.status) === 'active').length,
      revokedKeys: rows.filter((row) => String(row.status) === 'revoked').length,
      bootstrapConfigured: Boolean(this.bootstrapKey),
      transport: 'streamable-http',
      scopes: ALL_MCP_SCOPES,
    };
  }

  async list(): Promise<McpKeyView[]> {
    await this.ensureTable();
    const rows = await this.keys.list([Query.limit(500)]);
    return rows.map(toView).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async create(input: { name: string; scopes: string[]; expiresInDays?: number }, actor: McpKeyActor): Promise<{ key: string; view: McpKeyView }> {
    await this.ensureTable();
    const name = input.name.trim();
    if (!name || name.length > 64) throw new HttpError(400, 'Key name must be 1 to 64 characters.', 'VALIDATION_ERROR');
    const scopes = normalizeScopes(input.scopes);
    if (scopes.length === 0) throw new HttpError(400, 'Select at least one valid scope.', 'VALIDATION_ERROR');
    if (input.expiresInDays !== undefined && (!Number.isInteger(input.expiresInDays) || input.expiresInDays < 1 || input.expiresInDays > 3650)) {
      throw new HttpError(400, 'Expiration must be between 1 and 3650 days.', 'VALIDATION_ERROR');
    }
    const { key, keyHash, keyPrefix } = generateMcpKey();
    const now = new Date().toISOString();
    const expiresAt = input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000).toISOString() : '';
    const id = this.database.newId();
    const data: Record<string, unknown> = {
      id, name, keyHash, keyPrefix, scopes, status: 'active',
      createdBy: actor.userId.slice(0, 36), createdAt: now, expiresAt, lastUsedAt: '', revokedAt: '',
    };
    const row = await this.database.tables.createRow(this.database.databaseId, TABLE, id, data) as Row;
    await this.writeAudit(actor, 'mcp_key.create', id, `${name}: ${scopes.join(', ')}`);
    return { key, view: toView(row) };
  }

  async revoke(id: string, actor: McpKeyActor): Promise<McpKeyView> {
    await this.ensureTable();
    const row = await this.keys.findOne('id', id);
    if (!row) throw new HttpError(404, 'MCP key not found.', 'NOT_FOUND');
    if (String(row.status) === 'revoked') return toView(row);
    const updated = await this.keys.patch(row.$id, { status: 'revoked', revokedAt: new Date().toISOString() });
    await this.writeAudit(actor, 'mcp_key.revoke', id, String(row.name ?? ''));
    return toView(updated);
  }

  async rotate(id: string, actor: McpKeyActor): Promise<{ key: string; view: McpKeyView; revokedId: string }> {
    await this.ensureTable();
    const row = await this.keys.findOne('id', id);
    if (!row) throw new HttpError(404, 'MCP key not found.', 'NOT_FOUND');
    if (String(row.status) !== 'active') throw new HttpError(400, 'Only active keys can be rotated.', 'VALIDATION_ERROR');
    const scopes = normalizeScopes(Array.isArray(row.scopes) ? row.scopes.map(String) : []);
    const created = await this.create({ name: String(row.name ?? 'MCP key'), scopes }, actor);
    await this.keys.patch(row.$id, { status: 'revoked', revokedAt: new Date().toISOString() });
    await this.writeAudit(actor, 'mcp_key.rotate', id, `rotated to ${created.view.id}`);
    return { key: created.key, view: created.view, revokedId: id };
  }

  private async writeAudit(actor: McpKeyActor, action: string, resourceId: string, reason: string): Promise<void> {
    await this.audit.insert({
      id: `audit_${randomBytes(16).toString('hex')}`,
      actorUserId: actor.userId, actorUsername: actor.username.slice(0, 32) || 'Admin', actorRole: actor.role,
      action, ipAddress: '', resourceType: 'mcp_key', resourceId: resourceId.slice(0, 64),
      status: 'success', reason: reason.slice(0, 255), createdAt: new Date().toISOString(),
    }).catch(() => undefined);
  }
}