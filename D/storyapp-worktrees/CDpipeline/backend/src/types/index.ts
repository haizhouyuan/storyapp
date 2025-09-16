export type { 
  GenerateStoryRequest, 
  GenerateStoryResponse,
  SaveStoryRequest, 
  SaveStoryResponse,
  GetStoriesResponse,
  GetStoryResponse,
  DeleteStoryRequest,
  DeleteStoryResponse,
  GenerateFullStoryRequest,
  GenerateFullStoryResponse,
  StoryTree,
  StoryTreeNode
} from './shared';

export interface LogEntry {
  _id?: any;
  sessionId: string;
  timestamp: Date;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  eventType: string;
  message: string;
  data?: any;
  performance?: PerformanceMetrics;
  context?: {
    userAgent?: string;
    ip?: string;
    userId?: string;
  };
  stackTrace?: string;
}

export interface PerformanceMetrics {
  startTime: number;
  endTime?: number;
  duration?: number;
  tokensUsed?: number;
  apiCalls?: number;
  memoryUsage?: number;
}

export interface AdminLogsResponse {
  logs: LogEntry[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface AdminStatsResponse {
  overview: {
    totalSessions: number;
    sessionsLast24h: number;
    successRate: number;
    avgDuration: number;
  };
  topEvents: Array<{
    eventType: string;
    count: number;
  }>;
  errors: Array<{
    message: string;
    count: number;
    lastOccurred: string;
  }>;
}

export interface AdminPerformanceResponse {
  timeline: Array<{
    _id: {
      date: string;
      hour: number;
    };
    avgDuration: number;
    apiCalls: number;
    errorCount: number;
    successRate: number;
  }>;
  summary: {
    avgResponseTime: number;
    totalApiCalls: number;
    errorRate: number;
  };
}

export interface AdminExportRequest {
  startDate?: string;
  endDate?: string;
  logLevel?: string;
  eventType?: string;
  format: 'json' | 'csv';
}

export interface AdminCleanupRequest {
  days: number;
}