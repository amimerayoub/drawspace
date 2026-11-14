export const MCP_SCOPES = [
  'blogs:read', 'blogs:create', 'blogs:update', 'blogs:publish', 'blogs:delete',
  'words:read', 'words:create', 'words:update', 'words:delete', 'words:import', 'words:export',
  'blogs:import', 'blogs:export', 'analytics:read',
] as const;

export type McpScope = typeof MCP_SCOPES[number];

export const ALL_MCP_SCOPES: McpScope[] = [...MCP_SCOPES];
export const READ_ONLY_MCP_SCOPES: McpScope[] = ['blogs:read', 'words:read', 'analytics:read'];

export const MCP_KEY_PREFIX = 'ds_mcp_';

export function isMcpScope(value: string): value is McpScope {
  return (MCP_SCOPES as readonly string[]).includes(value);
}

export function normalizeScopes(values: readonly string[]): McpScope[] {
  const unique = new Set<McpScope>();
  for (const value of values) if (isMcpScope(value)) unique.add(value);
  return [...unique];
}