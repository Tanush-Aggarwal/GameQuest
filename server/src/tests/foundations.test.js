import request from 'supertest';
import express from 'express';
import { z } from 'zod';
import pino from 'pino';
import { createApp } from '../app.js';
import { loadConfig } from '../config/index.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { validate } from '../middleware/validate.js';
import { ConflictError, UpstreamError } from '../utils/errors.js';

const logger = pino({ level: 'silent' });
const config = loadConfig({ NODE_ENV: 'test', MONGODB_URI: 'mongodb://localhost/test' });

describe('config', () => {
  it('throws a readable error when MONGODB_URI is missing', () => {
    expect(() => loadConfig({ NODE_ENV: 'test' })).toThrow(/MONGODB_URI/);
  });

  it('requires CLIENT_ORIGIN in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', MONGODB_URI: 'mongodb://x' })).toThrow(/CLIENT_ORIGIN/);
  });
});

describe('app', () => {
  const app = createApp({ config, logger });

  it('GET /api/v1/health reports degraded (503) when the DB is not connected', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'degraded', db: 'disconnected' });
  });

  it('unknown routes return the standard error shape', async () => {
    const res = await request(app).get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('malformed JSON returns a 400 validation error', async () => {
    const res = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('sets security headers and CORS for the client origin only', async () => {
    const res = await request(app).get('/api/v1/health').set('Origin', config.clientOrigin);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['access-control-allow-origin']).toBe(config.clientOrigin);
    expect(res.headers['access-control-allow-credentials']).toBe('true');

    const other = await request(app).get('/api/v1/health').set('Origin', 'https://evil.example');
    // Browsers block the response unless the header matches their origin.
    expect(other.headers['access-control-allow-origin']).not.toBe('https://evil.example');
  });
});

describe('error handler + validate', () => {
  function build(routeFn) {
    const a = express();
    a.use(express.json());
    routeFn(a);
    a.use(errorHandler);
    return a;
  }

  it('maps typed errors to status, code and message', async () => {
    const a = build((x) => {
      x.get('/c', (_q, _r, next) => next(new ConflictError('dup', { field: 'email' })));
      x.get('/u', (_q, _r, next) => next(new UpstreamError()));
    });
    const c = await request(a).get('/c');
    expect(c.status).toBe(409);
    expect(c.body).toEqual({ error: { code: 'CONFLICT', message: 'dup', details: { field: 'email' } } });
    expect((await request(a).get('/u')).status).toBe(502);
  });

  it('hides internals of unexpected errors', async () => {
    const a = build((x) => x.get('/boom', () => { throw new Error('secret db string'); }));
    const res = await request(a).get('/boom');
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('secret');
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
  });

  it('validate() parses query strings (Express 5)', async () => {
    const schema = z.object({ limit: z.coerce.number().int().default(20) });
    const a = build((x) => x.get('/q', validate(schema, 'query'), (req, res) => res.json(req.query)));
    expect((await request(a).get('/q?limit=5')).body).toEqual({ limit: 5 });
    expect((await request(a).get('/q?limit=abc')).status).toBe(400);
  });

  it('rejects oversized bodies with 413', async () => {
    const a = express();
    a.use(express.json({ limit: '1kb' }));
    a.post('/x', (_q, r) => r.end());
    a.use(errorHandler);
    const res = await request(a).post('/x').send({ s: 'a'.repeat(5000) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('validate() rejects bad bodies with details and passes parsed data on', async () => {
    const schema = z.object({ n: z.coerce.number().int() });
    const a = build((x) => x.post('/v', validate(schema), (req, res) => res.json(req.body)));
    const bad = await request(a).post('/v').send({ n: 'x' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details[0].path).toBe('n');
    const ok = await request(a).post('/v').send({ n: '5' });
    expect(ok.body).toEqual({ n: 5 });
  });
});
