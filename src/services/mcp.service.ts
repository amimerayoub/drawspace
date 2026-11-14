import { apiGet, apiPost } from './apiClient';

export const MCP_SCOPES = [
  'blogs:read', 'blogs:create', 'blogs:update', 'blogs:publish', 'blogs:delete',
  'words:read', 'words:create', 'words:update', 'words:delete', 'words:import', 'words:export',
  'blogs:import', 'blogs:export', 'analytics:read',
] as const;
export type McpScope = typeof MCP_SCOPES[number];

export const MCP_READ_ONLY_SCOPES: McpScope[] = ['blogs:read', 'words:read', 'analytics:read'];

export interface McpKeyView {
  id: string; name: string; keyPrefix: string; scopes: string[]; status: string;
  createdBy: string; createdAt: string; expiresAt: string; lastUsedAt: string; revokedAt: string;
}
export interface McpStatus {
  tableAvailable: boolean; activeKeys: number; revokedKeys: number;
  bootstrapConfigured: boolean; transport: string; scopes: string[]; tools: string[];
}
export interface McpAuditEntry {
  id: string; action: string; actorUsername: string; actorRole: string;
  resourceType: string; resourceId: string; status: string; reason: string; createdAt: string;
}
export interface McpKeySecret { data: McpKeyView; key: string; message: string }
export interface McpRotateResult { data: McpKeyView; key: string; revokedId: string; message: string }
export interface McpKeyInput { name: string; scopes: string[]; expiresInDays?: number }

export const mcpService = {
  status: () => apiGet<McpStatus>('/api/v1/admin/mcp/status'),
  keys: () => apiGet<McpKeyView[]>('/api/v1/admin/mcp/keys'),
  createKey: (input: McpKeyInput) => apiPost<McpKeySecret>('/api/v1/admin/mcp/keys', input, { raw: true }),
  revokeKey: (id: string) => apiPost<McpKeyView>(`/api/v1/admin/mcp/keys/${encodeURIComponent(id)}/revoke`, { confirm: true }),
  rotateKey: (id: string) => apiPost<McpRotateResult>(`/api/v1/admin/mcp/keys/${encodeURIComponent(id)}/rotate`, { confirm: true }, { raw: true }),
  audit: (limit = 100) => apiGet<McpAuditEntry[]>(`/api/v1/admin/mcp/audit?limit=${limit}`),
};