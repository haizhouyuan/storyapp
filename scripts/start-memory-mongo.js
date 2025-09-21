#!/usr/bin/env node
const { MongoMemoryServer } = require('mongodb-memory-server');

(async () => {
  const mongod = await MongoMemoryServer.create({
    instance: {
      port: process.env.MONGO_MEMORY_PORT ? Number(process.env.MONGO_MEMORY_PORT) : 27017,
      dbName: process.env.MONGO_MEMORY_DB || 'storyapp'
    }
  });

  const uri = mongod.getUri();
  console.log(`🚀 Mongo Memory Server started at ${uri}`);
  console.log('Press Ctrl+C to stop');

  const cleanup = async () => {
    console.log('\n🛑 Stopping Mongo Memory Server...');
    await mongod.stop();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
})();
