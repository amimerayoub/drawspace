import type { ErrorRequestHandler, RequestHandler } from 'express';

export class HttpError extends Error {
  constructor(public readonly status: number, message: string, public readonly code = 'REQUEST_FAILED') { super(message); }
}

export const notFound: RequestHandler = (_request, response) => {
  response.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
};

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof HttpError) {
    response.status(error.status).json({ error: error.message, code: error.code });
    return;
  }
  const status = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'number' ? error.code : 0;
  if ([400, 404, 409, 429].includes(status)) {
    const message = status === 409 ? 'A record with these details already exists.' : status === 404 ? 'The requested record was not found.' : 'The request could not be completed.';
    response.status(status).json({ error: message, code: status === 409 ? 'CONFLICT' : status === 404 ? 'NOT_FOUND' : 'APPWRITE_REQUEST_FAILED' });
    return;
  }
  // Log classification only; SDK/server errors may contain private deployment details.
  console.error('[request-error]', error instanceof Error ? error.name : 'unknown');
  response.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
};
