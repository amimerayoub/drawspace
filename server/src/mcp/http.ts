import express, { Router, type Request, type Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { rateLimit } from '../middleware/rateLimit';
import { BlogService } from '../content/blogService';
import { WordService } from '../content/wordService';
import { McpKeyService, type McpKeyContext } from './keyService';
import { buildMcpServer } from './tools';

function presentedKey(request: Request): string | undefined {
  const header = request.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) return header.slice(7).trim() || undefined;
  const alternative = request.headers['x-mcp-api-key'];
  if (typeof alternative === 'string' && alternative.trim()) return alternative.trim();
  return undefined;
}

/**
 * Stateless Streamable HTTP MCP endpoint. Each POST gets a fresh server and
 * transport; authentication is a dedicated scoped MCP key, never an Appwrite key.
 */
export function mcpRoutes(keys: McpKeyService, words: WordService, blogs: BlogService): Router {
  const router = Router();
  router.use(express.json({ limit: '3mb', strict: true }));
  router.use(rateLimit(120, 60_000));
  router.use(async (request: Request, response: Response, next) => {
    try {
      const key = presentedKey(request);
      if (!key) { response.status(401).json({ error: 'Missing MCP API key. Send Authorization: Bearer <key>.', code: 'MCP_UNAUTHORIZED' }); return; }
      const context = await keys.authenticate(key);
      if (!context) { response.status(401).json({ error: 'Invalid, revoked, or expired MCP API key.', code: 'MCP_INVALID_KEY' }); return; }
      response.locals.mcp = context;
      next();
    } catch (error) { next(error); }
  });

  router.post('/', async (request: Request, response: Response) => {
    const context = response.locals.mcp as McpKeyContext;
    const server = buildMcpServer(words, blogs, context);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    response.on('close', () => { void transport.close(); void server.close(); });
    try {
      await server.connect(transport);
      await transport.handleRequest(request, response, request.body);
    } catch {
      if (!response.headersSent) response.status(500).json({ error: 'MCP request failed.', code: 'MCP_TRANSPORT_ERROR' });
    }
  });

  const methodNotAllowed = (_request: Request, response: Response) => {
    response.status(405).json({ error: 'Method not allowed. The DrawSpace MCP endpoint accepts POST requests.', code: 'METHOD_NOT_ALLOWED' });
  };
  router.get('/', methodNotAllowed);
  router.delete('/', methodNotAllowed);
  return router;
}