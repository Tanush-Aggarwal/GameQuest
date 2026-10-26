/**
 * Builds the indexes declared on every Mongoose model (production runs with autoIndex off).
 * syncIndexes() also drops indexes that are no longer declared, so schema changes converge.
 *
 * Usage: npm run db:indexes   (reads MONGODB_URI from server/.env)
 */

import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import mongoose from 'mongoose';

const modelsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/models');

export async function syncAllIndexes(log = console.log) {
  for (const file of readdirSync(modelsDir).filter((f) => f.endsWith('.js'))) {
    await import(pathToFileURL(path.join(modelsDir, file)).href);
  }
  const results = {};
  for (const [name, model] of Object.entries(mongoose.models)) {
    const dropped = await model.syncIndexes();
    results[name] = dropped;
    log(`${name}: indexes in sync${dropped.length ? ` (dropped: ${dropped.join(', ')})` : ''}`);
  }
  return results;
}

// Run directly (`node scripts/sync-indexes.js`), but stay import-safe for seed.js.
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set. Add it to server/.env first.');
    process.exit(1);
  }
  try {
    await mongoose.connect(uri);
    await syncAllIndexes();
  } catch (err) {
    console.error('Index sync failed:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
