import { ObjectId } from 'mongodb';
import { getDatabase, TABLES } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

// 日志级别枚举
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info', 
  WARN = 'warn',
  ERROR = 'error'
}

// 事件类型枚举
export enum EventType {
  // 故事生成相关
  STORY_GENERATION_START = 'story_generation_start',
  STORY_GENERATION_COMPLETE = 'story_generation_complete',
  STORY_GENERATION_ERROR = 'story_generation_error',
  
  // AI API调用相关
  AI_API_REQUEST = 'ai_api_request',
  AI_API_RESPONSE = 'ai_api_response',
  AI_API_ERROR = 'ai_api_error',
  AI_API_RETRY = 'ai_api_retry',
  
  // 数据处理相关
  JSON_PARSE_START = 'json_parse_start',
  JSON_PARSE_SUCCESS = 'json_parse_success',
  JSON_PARSE_ERROR = 'json_parse_error',
  CONTENT_VALIDATION = 'content_validation',
  QUALITY_CHECK = 'quality_check',
  
  // 数据库操作相关
  DB_SAVE_START = 'db_save_start',
  DB_SAVE_SUCCESS = 'db_save_success',
  DB_SAVE_ERROR = 'db_save_error',
  
  // 系统相关
  SESSION_START = 'session_start',
  SESSION_END = 'session_end',
  PERFORMANCE_METRICS = 'performance_metrics'
}

import type { 
  LogEntry,
  PerformanceMetrics
} from '../types';

// 会话信息接口
export interface SessionInfo {
  sessionId: string;
  startTime: number;
  topic?: string;
  mode?: 'progressive' | 'full_tree' | 'save';
  parameters?: any;
}

class Logger {
  private static instance: Logger;
  private sessions: Map<string, SessionInfo> = new Map();
  private logDir: string;
  private enableFileLogging: boolean;
  private enableDbLogging: boolean;
  private logLevel: LogLevel;

  private constructor() {
    // 从环境变量读取配置
    this.enableFileLogging = process.env.ENABLE_FILE_LOGGING === 'true';
    this.enableDbLogging = process.env.ENABLE_DB_LOGGING !== 'false'; // 默认启用
    this.logLevel = (process.env.LOG_LEVEL as LogLevel) || LogLevel.INFO;
    
    // 设置日志目录
    this.logDir = path.join(__dirname, '../../logs');
    
    // 确保日志目录存在
    if (this.enableFileLogging && !fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  // 创建新会话
  public createSession(topic?: string, mode?: 'progressive' | 'full_tree' | 'save', parameters?: any): string {
    const sessionId = uuidv4();
    const sessionInfo: SessionInfo = {
      sessionId,
      startTime: Date.now(),
      topic,
      mode,
      parameters
    };
    
    this.sessions.set(sessionId, sessionInfo);
    
    // 记录会话开始
    this.log(LogLevel.INFO, EventType.SESSION_START, '新的故事生成会话开始', {
      topic,
      mode,
      parameters
    }, { startTime: Date.now() }, sessionId);
    
    return sessionId;
  }

  // 结束会话
  public endSession(sessionId: string, success: boolean = true): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      const duration = Date.now() - session.startTime;
      
      this.log(LogLevel.INFO, EventType.SESSION_END, '故事生成会话结束', {
        success,
        totalDuration: duration
      }, {
        startTime: session.startTime,
        endTime: Date.now(),
        duration
      }, sessionId);
      
      this.sessions.delete(sessionId);
    }
  }

  // 核心日志记录方法
  public log(
    level: LogLevel,
    eventType: EventType,
    message: string,
    data?: any,
    performance?: PerformanceMetrics,
    sessionId?: string,
    context?: any,
    error?: Error
  ): void {
    // 检查日志级别
    if (!this.shouldLog(level)) {
      return;
    }

    const logEntry: LogEntry = {
      sessionId: sessionId || 'global',
      timestamp: new Date(),
      logLevel: level,
      eventType,
      message,
      data,
      performance,
      context,
      stackTrace: error?.stack
    };

    // 输出到控制台
    this.logToConsole(logEntry);

    // 保存到文件
    if (this.enableFileLogging) {
      this.logToFile(logEntry);
    }

    // 保存到数据库
    if (this.enableDbLogging) {
      this.logToDatabase(logEntry).catch(err => {
        console.error('数据库日志记录失败:', err);
      });
    }
  }

  // 便捷方法
  public debug(eventType: EventType, message: string, data?: any, sessionId?: string): void {
    this.log(LogLevel.DEBUG, eventType, message, data, undefined, sessionId);
  }

  public info(eventType: EventType, message: string, data?: any, performance?: PerformanceMetrics, sessionId?: string): void {
    this.log(LogLevel.INFO, eventType, message, data, performance, sessionId);
  }

  public warn(eventType: EventType, message: string, data?: any, sessionId?: string): void {
    this.log(LogLevel.WARN, eventType, message, data, undefined, sessionId);
  }

  public error(eventType: EventType, message: string, error?: Error, data?: any, sessionId?: string): void {
    this.log(LogLevel.ERROR, eventType, message, data, undefined, sessionId, undefined, error);
  }

  // 记录AI API调用
  public logAIApiCall(
    sessionId: string,
    model: string,
    requestData: any,
    responseData?: any,
    duration?: number,
    tokensUsed?: number,
    error?: Error
  ): void {
    if (error) {
      this.error(EventType.AI_API_ERROR, `AI API调用失败: ${model}`, error, {
        model,
        requestData,
        duration
      }, sessionId);
    } else {
      this.info(EventType.AI_API_RESPONSE, `AI API调用成功: ${model}`, {
        model,
        requestTokens: this.estimateTokens(JSON.stringify(requestData)),
        responseTokens: tokensUsed || this.estimateTokens(JSON.stringify(responseData)),
        requestData,
        responseData
      }, {
        startTime: Date.now() - (duration || 0),
        endTime: Date.now(),
        duration,
        tokensUsed,
        apiCalls: 1
      }, sessionId);
    }
  }

  // 记录性能指标
  public logPerformance(sessionId: string, metrics: PerformanceMetrics, description?: string): void {
    this.info(EventType.PERFORMANCE_METRICS, description || '性能指标记录', {
      description
    }, metrics, sessionId);
  }

  // 检查是否应该记录此级别的日志
  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const targetLevelIndex = levels.indexOf(level);
    return targetLevelIndex >= currentLevelIndex;
  }

  // 控制台输出
  private logToConsole(entry: LogEntry): void {
    const timestamp = entry.timestamp.toISOString();
    const prefix = `[${timestamp}] [${entry.logLevel.toUpperCase()}] [${entry.sessionId}] [${entry.eventType}]`;
    
    const logData = {
      message: entry.message,
      data: entry.data,
      performance: entry.performance
    };

    switch (entry.logLevel) {
      case LogLevel.DEBUG:
        console.debug(prefix, logData);
        break;
      case LogLevel.INFO:
        console.info(prefix, logData);
        break;
      case LogLevel.WARN:
        console.warn(prefix, logData);
        break;
      case LogLevel.ERROR:
        console.error(prefix, logData);
        if (entry.stackTrace) {
          console.error('Stack trace:', entry.stackTrace);
        }
        break;
    }
  }

  // 文件输出
  private logToFile(entry: LogEntry): void {
    try {
      const date = entry.timestamp.toISOString().split('T')[0];
      const filename = `story-logs-${date}.json`;
      const filepath = path.join(this.logDir, filename);
      
      const logLine = JSON.stringify(entry) + '\n';
      fs.appendFileSync(filepath, logLine, 'utf8');
    } catch (error) {
      console.error('文件日志记录失败:', error);
    }
  }

  // 数据库输出
  private async logToDatabase(entry: LogEntry): Promise<void> {
    try {
      const db = getDatabase();
      const logsCollection = db.collection('story_logs');
      
      await logsCollection.insertOne({
        ...entry,
        _id: new ObjectId()
      });
    } catch (error) {
      console.error('数据库日志记录失败:', error);
    }
  }

  // 简单的token估算
  private estimateTokens(text: string): number {
    if (!text) return 0;
    
    // 粗略估算：中文1字符≈1token，英文4字符≈1token
    const chineseCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const englishCount = text.length - chineseCount;
    return chineseCount + Math.ceil(englishCount / 4);
  }

  // 获取会话信息
  public getSession(sessionId: string): SessionInfo | undefined {
    return this.sessions.get(sessionId);
  }

  // 获取所有活跃会话
  public getActiveSessions(): SessionInfo[] {
    return Array.from(this.sessions.values());
  }
}

// 导出单例实例
export const logger = Logger.getInstance();

// 导出便捷函数
export const createSession = (topic?: string, mode?: 'progressive' | 'full_tree', parameters?: any): string => {
  return logger.createSession(topic, mode, parameters);
};

export const endSession = (sessionId: string, success?: boolean): void => {
  logger.endSession(sessionId, success);
};

export const logInfo = (eventType: EventType, message: string, data?: any, performance?: PerformanceMetrics, sessionId?: string): void => {
  logger.info(eventType, message, data, performance, sessionId);
};

export const logError = (eventType: EventType, message: string, error?: Error, data?: any, sessionId?: string): void => {
  logger.error(eventType, message, error, data, sessionId);
};

export const logAIApiCall = (sessionId: string, model: string, requestData: any, responseData?: any, duration?: number, tokensUsed?: number, error?: Error): void => {
  logger.logAIApiCall(sessionId, model, requestData, responseData, duration, tokensUsed, error);
};

export const logPerformance = (sessionId: string, metrics: PerformanceMetrics, description?: string): void => {
  logger.logPerformance(sessionId, metrics, description);
};