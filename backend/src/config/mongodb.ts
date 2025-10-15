import fs from 'fs';
import path from 'path';
import {
  MongoClient,
  Db,
  MongoClientOptions,
} from 'mongodb';
import { createLogger } from './logger';

// 使用集中化配置加载器
const { getTypedConfig } = require('../../../config/env-loader');

const logger = createLogger('mongodb');

const resolveDatabaseConfig = () => {
  const typedConfig = getTypedConfig();
  return {
    uri: process.env.MONGODB_URI || typedConfig.database.uri,
    name: process.env.MONGODB_DB_NAME || typedConfig.database.name,
  };
};

const asNumber = (value: string | undefined, fallback: number) => {
  const parsed = value ? parseInt(value, 10) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
};

const asCompressionLevel = (value: string | undefined, fallback: number): 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 => {
  const numericValue = asNumber(value, fallback);
  const clamped = Math.min(Math.max(numericValue, 0), 9);
  return clamped as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
};

const resolveFilePath = (maybeRelative: string) => {
  if (!maybeRelative) {
    return undefined;
  }

  // 已是绝对路径
  if (path.isAbsolute(maybeRelative) && fs.existsSync(maybeRelative)) {
    return maybeRelative;
  }

  const candidate = path.resolve(process.cwd(), maybeRelative);
  if (fs.existsSync(candidate)) {
    return candidate;
  }

  logger.warn({ path: maybeRelative }, '指定的 MongoDB TLS 文件不存在，使用原始路径继续');
  return maybeRelative;
};

const redactUri = (uri: string) => uri.replace(/:\/\/([^:]+):([^@]+)@/g, '://***:***@');

const buildMongoOptions = (): MongoClientOptions => {
  const options: MongoClientOptions = {
    maxPoolSize: asNumber(process.env.MONGODB_MAX_POOL_SIZE, 50),
    minPoolSize: asNumber(process.env.MONGODB_MIN_POOL_SIZE, 5),
    maxIdleTimeMS: asNumber(process.env.MONGODB_MAX_IDLE_TIME_MS, 30000),
    connectTimeoutMS: asNumber(process.env.MONGODB_CONNECT_TIMEOUT_MS, 20000),
    socketTimeoutMS: asNumber(process.env.MONGODB_SOCKET_TIMEOUT_MS, 60000),
    serverSelectionTimeoutMS: asNumber(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS, 30000),
    waitQueueTimeoutMS: asNumber(process.env.MONGODB_WAIT_QUEUE_TIMEOUT_MS, 0) || undefined,
    retryWrites: process.env.MONGODB_RETRY_WRITES !== 'false',
  };

  const compressors = (process.env.MONGODB_COMPRESSORS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (compressors.length > 0) {
    options.compressors = compressors as any;
  }

  const readPreference = process.env.MONGODB_READ_PREFERENCE;
  if (readPreference) {
    options.readPreference = readPreference as any;
  }

  if (process.env.MONGODB_DIRECT_CONNECTION === 'true') {
    options.directConnection = true;
  }

  const tlsCAFile = resolveFilePath(process.env.MONGODB_TLS_CA_FILE || process.env.MONGODB_CA_FILE || '');
  if (tlsCAFile) {
    options.tls = true;
    options.tlsCAFile = tlsCAFile;
  } else if (process.env.MONGODB_TLS === 'true') {
    options.tls = true;
  }

  const tlsCert = resolveFilePath(process.env.MONGODB_TLS_CERT_FILE || '');
  if (tlsCert) {
    options.tlsCertificateKeyFile = tlsCert;
  }

  if (process.env.MONGODB_TLS_ALLOW_INVALID_CERTS === 'true') {
    options.tlsAllowInvalidCertificates = true;
  }

  const zlibCompression = Array.isArray(options.compressors) && options.compressors.includes('zlib');
  if (!process.env.MONGODB_ZLIB_COMPRESSION_LEVEL && zlibCompression) {
    process.env.MONGODB_ZLIB_COMPRESSION_LEVEL = '6';
  }

  if (process.env.MONGODB_ZLIB_COMPRESSION_LEVEL) {
    options.zlibCompressionLevel = asCompressionLevel(process.env.MONGODB_ZLIB_COMPRESSION_LEVEL, 6);
  }

  return options;
};

// 数据库集合名称常量
export const COLLECTIONS = {
  STORIES: 'stories',
  STORY_WORKFLOWS: 'story_workflows',
  STORY_LOGS: 'story_logs',
  STORY_PROJECTS: 'story_projects',
  STORY_BLUEPRINTS: 'story_blueprints',
} as const;

let client: MongoClient | null = null;
let db: Db | null = null;
let connectingPromise: Promise<Db> | null = null;

const attachClientListeners = (mongoClient: MongoClient) => {
  mongoClient.on('topologyDescriptionChanged', (event: any) => {
    const previous = event.previousDescription?.type;
    const current = event.newDescription?.type;
    if (previous !== current) {
      logger.info({ previous, current }, 'MongoDB 拓扑状态更新');
    }
  });

  mongoClient.on('serverDescriptionChanged', (event: any) => {
    const { address, newDescription } = event;
    logger.debug({ address, newDescription: newDescription?.type }, 'MongoDB 节点状态变化');
  });

  mongoClient.on('serverClosed', (event: any) => {
    logger.warn({ address: event.address }, 'MongoDB 节点连接关闭');
  });

  mongoClient.on('connectionPoolCleared', (event: any) => {
    logger.warn({ address: event.address }, 'MongoDB 连接池已清空');
  });

  mongoClient.on('topologyClosed', () => {
    logger.warn('MongoDB 拓扑关闭，清理缓存实例');
    client = null;
    db = null;
    connectingPromise = null;
  });
};

const connectInternal = async (): Promise<Db> => {
  const { uri, name } = resolveDatabaseConfig();
  const options = buildMongoOptions();

  logger.info({ uri: redactUri(uri), dbName: name, options: {
    maxPoolSize: options.maxPoolSize,
    minPoolSize: options.minPoolSize,
    maxIdleTimeMS: options.maxIdleTimeMS,
    connectTimeoutMS: options.connectTimeoutMS,
    socketTimeoutMS: options.socketTimeoutMS,
    serverSelectionTimeoutMS: options.serverSelectionTimeoutMS,
    readPreference: options.readPreference,
    tls: options.tls,
    tlsCAFile: options.tlsCAFile,
  } }, '准备连接到 MongoDB');

  const mongoClient = new MongoClient(uri, options);
  attachClientListeners(mongoClient);

  await mongoClient.connect();
  const database = mongoClient.db(name);
  await database.command({ ping: 1 });

  client = mongoClient;
  db = database;
  logger.info({ dbName: name }, 'MongoDB 连接成功');

  return database;
};

/**
 * 连接到 MongoDB 数据库
 */
export async function connectToDatabase(): Promise<Db> {
  if (db) {
    try {
      await db.command({ ping: 1 });
      return db;
    } catch (error) {
      logger.warn({ err: (error as Error).message }, 'MongoDB ping 失败，准备重新连接');
      db = null;
      client = null;
    }
  }

  if (connectingPromise) {
    return connectingPromise;
  }

  connectingPromise = connectInternal().finally(() => {
    connectingPromise = null;
  });

  return connectingPromise;
}

/**
 * 获取数据库实例
 */
export function getDatabase(): Db {
  if (!db) {
    throw new Error('数据库未连接，请先调用 connectToDatabase()');
  }
  return db;
}

/**
 * 关闭数据库连接
 */
export async function closeDatabase(): Promise<void> {
  if (client) {
    await client.close();
    logger.info('MongoDB 连接已关闭');
  }
  client = null;
  db = null;
  connectingPromise = null;
}

/**
 * 检查数据库连接状态
 */
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const database = db ?? await connectToDatabase();
    await database.command({ ping: 1 });
    return true;
  } catch (error) {
    logger.error({ err: error }, '数据库健康检查失败');
    return false;
  }
}

/**
 * 获取数据库连接信息（用于测试）
 */
export async function getConnectionForTesting(): Promise<{ client: MongoClient; db: Db }> {
  const database = await connectToDatabase();
  if (!client) {
    throw new Error('数据库客户端未初始化');
  }
  return { client, db: database };
}
