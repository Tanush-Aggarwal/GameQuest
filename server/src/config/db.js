import mongoose from 'mongoose';

export async function connectDb(uri, logger, { autoIndex = true, maxPoolSize = 20, minPoolSize = 2 } = {}) {
  mongoose.connection.on('error', (err) => logger.error({ err }, 'MongoDB connection error'));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));

  await mongoose.connect(uri, {
    maxPoolSize,
    minPoolSize,
    socketTimeoutMS: 45_000,
    serverSelectionTimeoutMS: 10_000,
    autoIndex,
  });
  logger.info('MongoDB connected');
}

export async function disconnectDb() {
  await mongoose.disconnect();
}
