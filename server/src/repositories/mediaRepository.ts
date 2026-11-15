import { randomUUID } from 'node:crypto';
import { ID, Query, type AppwriteDatabase } from '../database/appwrite';
import { optimizeUpload, RESPONSIVE_WIDTHS, THUMB_WIDTH } from '../media/imageOptimizer';
import { RowRepository, type Row } from './rowRepository';

export interface MediaAssetView {
  id: string; name: string; kind: 'image' | 'avatar' | 'document'; size: number; mimeType: string; url: string; createdAt: string;
  width?: number; height?: number; hasAlpha?: boolean; optimized?: boolean; widths?: number[]; thumbUrl?: string; originalUrl?: string;
}
type Actor = { userId: string; username: string; role: string };
export type MediaVariant = 'original' | 'thumb' | number;

const webpName = (name: string) => name.replace(/\.(png|jpe?g|webp|avif|tiff?)$/i, '') + '.webp';

export class MediaRepository {
  private readonly rows: RowRepository;
  private readonly audit: RowRepository;
  private columnKeys?: Promise<Set<string>>;
  constructor(private readonly database: AppwriteDatabase, private readonly bucketId: string) {
    this.rows = new RowRepository(database, 'media_assets');
    this.audit = new RowRepository(database, 'audit_logs');
  }

  private optionalColumns(): Promise<Set<string>> {
    if (!this.columnKeys) {
      this.columnKeys = this.database.tables.listColumns(this.database.databaseId, 'media_assets', [])
        .then((result) => new Set((result.columns as Array<{ key: string }>).map((column) => column.key)))
        .catch(() => new Set<string>());
    }
    return this.columnKeys;
  }

  async list(): Promise<MediaAssetView[]> {
    let rows: Row[];
    try { rows = await this.rows.list([Query.orderDesc('createdAt'), Query.limit(500)]); } catch { return []; }
    return rows.map((row) => this.toAsset(row));
  }

  private async putDerived(storageId: string, bytes: Buffer | Uint8Array, mimeType: string, name: string): Promise<void> {
    try { await this.database.storage.createFile(this.bucketId, storageId, new File([bytes.slice()], name, { type: mimeType })); } catch { /* variants are best-effort; the primary always exists */ }
  }

  async upload(input: { name: string; kind: 'image' | 'avatar' | 'document'; mimeType: string; bytes: Uint8Array }, actor: Actor): Promise<MediaAssetView> {
    const bytes = Buffer.from(input.bytes.slice());
    const optimized = input.kind === 'document' ? null : await optimizeUpload(bytes, input.mimeType);
    const primaryBytes = optimized ? optimized.primary : bytes;
    const primaryMime = optimized ? optimized.mimeType : input.mimeType;
    const file = new File([primaryBytes.slice()], optimized ? webpName(input.name) : input.name, { type: primaryMime });
    let fileId: string;
    try {
      const created = await this.database.storage.createFile(this.bucketId, ID.unique(), file);
      fileId = String(created.$id);
    } catch {
      throw new Error('Media storage is not available. Confirm the storage bucket exists and the API key can write to it.');
    }
    if (optimized) {
      // Lossless WebP is a perfect substitute, so the original is only retained for lossy conversions.
      if (!optimized.lossless) await this.putDerived(`${fileId}-orig`, bytes, input.mimeType, input.name);
      await this.putDerived(`${fileId}-t`, optimized.thumb, 'image/webp', webpName(input.name));
      for (const variant of optimized.variants) await this.putDerived(`${fileId}-w${variant.width}`, variant.bytes, 'image/webp', webpName(input.name));
    }
    const id = `media_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    const now = new Date().toISOString();
    const data: Record<string, unknown> = { id, name: input.name, kind: input.kind, size: primaryBytes.byteLength, mimeType: primaryMime, fileId, createdAt: now, uploadedBy: actor.userId };
    const columns = await this.optionalColumns();
    if (optimized && columns.size > 0) {
      if (columns.has('width')) data.width = optimized.width;
      if (columns.has('height')) data.height = optimized.height;
      if (columns.has('hasAlpha')) data.hasAlpha = optimized.hasAlpha;
      if (columns.has('optimized')) data.optimized = true;
      if (columns.has('originalMime')) data.originalMime = optimized.lossless ? '' : input.mimeType;
      if (columns.has('widths')) data.widths = JSON.stringify(optimized.variants.map((variant) => variant.width));
    }
    await this.rows.insert(data);
    await this.writeAudit(actor, 'media.upload', 'media_asset', id, input.name);
    return this.toAsset({ ...data, $id: id });
  }

  async rename(id: string, name: string, actor: Actor): Promise<MediaAssetView> {
    const row = await this.rows.findOne('id', id);
    if (!row) throw new Error('Media asset not found.');
    const updated = await this.rows.patch(row.$id, { name });
    await this.writeAudit(actor, 'media.rename', 'media_asset', id, name);
    return this.toAsset(updated);
  }

  async remove(id: string, actor: Actor): Promise<void> {
    const row = await this.rows.findOne('id', id);
    if (!row) throw new Error('Media asset not found.');
    const fileId = String(row.fileId);
    const derived = [`${fileId}-orig`, `${fileId}-t`, ...RESPONSIVE_WIDTHS.map((width) => `${fileId}-w${width}`), `${fileId}-w${THUMB_WIDTH}`];
    for (const storageId of [fileId, ...derived]) {
      try { await this.database.storage.deleteFile(this.bucketId, storageId); } catch { /* already gone */ }
    }
    await this.rows.delete(row.$id);
    await this.writeAudit(actor, 'media.delete', 'media_asset', id, 'deleted');
  }

  async view(id: string, variant?: MediaVariant): Promise<{ bytes: ArrayBuffer; mimeType: string; name: string } | null> {
    let row: Row | null;
    try { row = await this.rows.findOne('id', id); } catch { return null; }
    if (!row) return null;
    const fileId = String(row.fileId);
    const baseMime = String(row.mimeType || 'application/octet-stream');
    let storageId = fileId;
    let mimeType = baseMime;
    if (variant === 'original') { storageId = `${fileId}-orig`; mimeType = String(row.originalMime || baseMime); }
    else if (variant === 'thumb') { storageId = `${fileId}-t`; mimeType = 'image/webp'; }
    else if (typeof variant === 'number') { storageId = `${fileId}-w${variant}`; mimeType = 'image/webp'; }
    let bytes: ArrayBuffer;
    try { bytes = await this.database.storage.getFileView(this.bucketId, storageId); }
    catch {
      if (storageId === fileId) return null;
      try { bytes = await this.database.storage.getFileView(this.bucketId, fileId); mimeType = baseMime; } catch { return null; }
    }
    return { bytes, mimeType, name: String(row.name) };
  }

  private toAsset(row: Row): MediaAssetView {
    const id = String(row.id);
    const kind = row.kind === 'avatar' || row.kind === 'document' ? row.kind : 'image';
    const url = `/api/media/${id}/view`;
    let widths: number[] | undefined;
    try { widths = row.widths ? (JSON.parse(String(row.widths)) as number[]) : undefined; } catch { widths = undefined; }
    const asset: MediaAssetView = { id, name: String(row.name), kind, size: Number(row.size) || 0, mimeType: String(row.mimeType || ''), url, createdAt: String(row.createdAt) };
    if (row.width !== undefined) asset.width = Number(row.width);
    if (row.height !== undefined) asset.height = Number(row.height);
    if (row.hasAlpha !== undefined) asset.hasAlpha = Boolean(row.hasAlpha);
    if (row.optimized !== undefined) asset.optimized = Boolean(row.optimized);
    if (widths) asset.widths = widths;
    if (kind !== 'document') { asset.thumbUrl = `${url}?variant=thumb`; asset.originalUrl = `${url}?variant=original`; }
    return asset;
  }
  private async writeAudit(actor: Actor, action: string, resourceType: string, resourceId: string, reason: string) {
    await this.audit.insert({ id: `audit_${randomUUID()}`, actorUserId: actor.userId, actorUsername: actor.username.slice(0, 32) || 'Admin', actorRole: actor.role, action, ipAddress: '', resourceType, resourceId: resourceId.slice(0, 64), status: 'success', reason: reason.slice(0, 255), createdAt: new Date().toISOString() });
  }
}