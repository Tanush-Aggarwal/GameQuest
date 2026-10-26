import { loadConfig } from './config/index.js';
import { connectDb, disconnectDb } from './config/db.js';
import { createLogger } from './utils/logger.js';
import { createApp } from './app.js';

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(err.message);
  console.error('Copy .env.example to server/.env and fill in the missing values.');
  process.exit(1);
}

const logger = createLogger({ level: config.logLevel, env: config.env });

try {
  await connectDb(config.mongoUri, logger);
} catch (err) {
  logger.fatal({ err }, 'Could not connect to MongoDB');
  process.exit(1);
}

const server = createApp({ config, logger }).listen(config.port, () => {
  logger.info(`API listening on :${config.port}`);
});

async function shutdown(signal) {
  logger.info({ signal }, 'Shutting down');
  setTimeout(() => process.exit(1), 10_000).unref();
  server.close(async () => {
    await disconnectDb();
    process.exit(0);
  });
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
