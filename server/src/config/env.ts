import fs from 'node:fs';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  APPWRITE_ENDPOINT: z.string().url(),
  APPWRITE_PROJECT_ID: z.string().min(1),
  APPWRITE_API_KEY: z.string().min(1),
  DATABASE_ID: z.string().min(1).default('drawspace_db'),
  STORAGE_BUCKET_ID: z.string().min(1).default('media'),
  FRONTEND_ORIGINS: z.string().default('http://localhost:5173,https://drawspace.cloud'),
  ROOM_STATE_DRIVER: z.enum(['memory', 'redis']).default('memory'),
  REDIS_URL: z.string().url().optional(),
  DRAWSPACE_MCP_API_KEY: z.string().min(16).optional(),
  DRAWSPACE_MCP_SCOPES: z.string().optional(),
}).superRefine((values, context) => {
  if (values.ROOM_STATE_DRIVER === 'redis' && !values.REDIS_URL) context.addIssue({ code: 'custom', path: ['REDIS_URL'], message: 'Required when ROOM_STATE_DRIVER=redis' });
  if (values.NODE_ENV !== 'production') return;
  if (!values.FRONTEND_ORIGINS.trim()) context.addIssue({ code: 'custom', path: ['FRONTEND_ORIGINS'], message: 'Required in production' });
  for (const origin of values.FRONTEND_ORIGINS.split(',').map((item) => item.trim()).filter(Boolean)) {
    if (!origin.startsWith('https://')) context.addIssue({ code: 'custom', path: ['FRONTEND_ORIGINS'], message: 'Production origins must use HTTPS' });
  }
});

export interface ServerConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  appwriteEndpoint: string;
  appwriteProjectId: string;
  appwriteApiKey: string;
  databaseId: string;
  storageBucketId?: string;
  frontendOrigins: string[];
  roomStateDriver: 'memory' | 'redis';
  redisUrl?: string;
  mcpApiKey?: string;
  mcpScopes?: string[];
}

/** Call only at startup; errors name missing variables but never echo their values. */
export function loadConfig(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
  const values = { ...environment };
  if (values.NODE_ENV !== 'production' && fs.existsSync('.env.local')) {
    for (const raw of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const separator = line.indexOf('=');
      if (separator < 1) continue;
      const key = line.slice(0, separator).trim();
      let value = line.slice(separator + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (!values[key]) values[key] = value;
    }
  }
  const parsed = envSchema.safeParse(values);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid server environment; check: ${issues}`);
  }
  return {
    nodeEnv: parsed.data.NODE_ENV,
    port: parsed.data.PORT,
    appwriteEndpoint: parsed.data.APPWRITE_ENDPOINT.replace(/\/$/, ''),
    appwriteProjectId: parsed.data.APPWRITE_PROJECT_ID,
    appwriteApiKey: parsed.data.APPWRITE_API_KEY,
    databaseId: parsed.data.DATABASE_ID,
    storageBucketId: parsed.data.STORAGE_BUCKET_ID,
    frontendOrigins: parsed.data.FRONTEND_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean),
    roomStateDriver: parsed.data.ROOM_STATE_DRIVER,
    ...(parsed.data.REDIS_URL ? { redisUrl: parsed.data.REDIS_URL } : {}),
    ...(parsed.data.DRAWSPACE_MCP_API_KEY ? { mcpApiKey: parsed.data.DRAWSPACE_MCP_API_KEY } : {}),
    ...(parsed.data.DRAWSPACE_MCP_SCOPES ? { mcpScopes: parsed.data.DRAWSPACE_MCP_SCOPES.split(',').map((scope) => scope.trim()).filter(Boolean) } : {}),
  };
}
