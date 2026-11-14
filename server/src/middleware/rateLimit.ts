import type { RequestHandler } from 'express';

export function rateLimit(limit: number, windowMs: number): RequestHandler {
  const clients = new Map<string, { count: number; expires: number }>();
  return (request, response, next) => {
    const now = Date.now();
    const key = request.ip || request.socket.remoteAddress || 'unknown';
    let bucket = clients.get(key);
    if (!bucket || bucket.expires <= now) {
      bucket = { count: 0, expires: now + windowMs };
      clients.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > limit) {
      response.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.expires - now) / 1000))));
      response.status(429).json({ error: 'Too many requests', code: 'RATE_LIMITED' });
      return;
    }
    if (clients.size > 10_000) {
      for (const [client, state] of clients) if (state.expires <= now) clients.delete(client);
    }
    next();
  };
}
