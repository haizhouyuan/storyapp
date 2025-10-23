import { useEffect, useRef } from 'react';

interface SseLoggerOptions {
  enabled?: boolean;
  prefix?: string;
}

/**
 * 统一的 SSE 日志管理 Hook
 * 用于调试和监控 SSE 连接状态
 */
export function useSseLogger(
  eventSource: EventSource | null,
  options: SseLoggerOptions = {}
) {
  const { enabled = process.env.NODE_ENV === 'development', prefix = 'SSE' } = options;
  const messageCountRef = useRef(0);
  const errorCountRef = useRef(0);
  const lastMessageTimeRef = useRef<number>(Date.now());
  
  useEffect(() => {
    if (!eventSource || !enabled) return;
    
    const startTime = Date.now();
    
    // 连接打开
    const handleOpen = () => {
      console.log(`✅ [${prefix}] Connection opened`, {
        timestamp: new Date().toISOString(),
        readyState: eventSource.readyState
      });
    };
    
    // 收到消息
    const handleMessage = (e: MessageEvent) => {
      messageCountRef.current++;
      const now = Date.now();
      const timeSinceLastMessage = now - lastMessageTimeRef.current;
      lastMessageTimeRef.current = now;
      
      let parsedData;
      try {
        parsedData = JSON.parse(e.data);
      } catch {
        parsedData = e.data;
      }
      
      console.log(`📨 [${prefix}] Message #${messageCountRef.current}`, {
        type: parsedData?.type || parsedData?.category || 'unknown',
        timeSinceLastMessage: `${timeSinceLastMessage}ms`,
        timestamp: new Date().toISOString(),
        data: parsedData
      });
    };
    
    // 发生错误
    const handleError = (e: Event) => {
      errorCountRef.current++;
      const uptime = Date.now() - startTime;
      
      console.error(`❌ [${prefix}] Error #${errorCountRef.current}`, {
        readyState: eventSource.readyState,
        readyStateText: getReadyStateText(eventSource.readyState),
        uptime: `${Math.floor(uptime / 1000)}s`,
        messageCount: messageCountRef.current,
        timestamp: new Date().toISOString(),
        event: e
      });
    };
    
    eventSource.addEventListener('open', handleOpen);
    eventSource.addEventListener('message', handleMessage);
    eventSource.addEventListener('error', handleError);
    
    // 定期统计
    const statsInterval = setInterval(() => {
      const uptime = Date.now() - startTime;
      const timeSinceLastMessage = Date.now() - lastMessageTimeRef.current;
      
      console.log(`📊 [${prefix}] Stats`, {
        uptime: `${Math.floor(uptime / 1000)}s`,
        messageCount: messageCountRef.current,
        errorCount: errorCountRef.current,
        readyState: eventSource.readyState,
        readyStateText: getReadyStateText(eventSource.readyState),
        timeSinceLastMessage: `${Math.floor(timeSinceLastMessage / 1000)}s`,
        avgMessageInterval: messageCountRef.current > 0
          ? `${Math.floor(uptime / messageCountRef.current / 1000)}s`
          : 'N/A'
      });
    }, 30000); // 每30秒
    
    // 初始日志
    console.log(`🎬 [${prefix}] Logger started`, {
      timestamp: new Date().toISOString(),
      readyState: eventSource.readyState
    });
    
    return () => {
      eventSource.removeEventListener('open', handleOpen);
      eventSource.removeEventListener('message', handleMessage);
      eventSource.removeEventListener('error', handleError);
      clearInterval(statsInterval);
      
      console.log(`🔌 [${prefix}] Logger cleanup`, {
        totalMessages: messageCountRef.current,
        totalErrors: errorCountRef.current,
        finalReadyState: getReadyStateText(eventSource.readyState)
      });
    };
  }, [eventSource, enabled, prefix]);
}

function getReadyStateText(readyState: number): string {
  switch (readyState) {
    case EventSource.CONNECTING:
      return 'CONNECTING (0)';
    case EventSource.OPEN:
      return 'OPEN (1)';
    case EventSource.CLOSED:
      return 'CLOSED (2)';
    default:
      return `UNKNOWN (${readyState})`;
  }
}



