import mongoose from 'mongoose';

const DB_STATES = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };

export function getHealth({ emailConfigured } = {}) {
  const db = DB_STATES[mongoose.connection.readyState] ?? 'unknown';
  return {
    status: db === 'connected' ? 'ok' : 'degraded',
    db,
    ...(emailConfigured === undefined ? {} : { email: emailConfigured ? 'configured' : 'not_configured' }),
    uptimeSeconds: Math.round(process.uptime()),
    time: new Date().toISOString(),
  };
}
