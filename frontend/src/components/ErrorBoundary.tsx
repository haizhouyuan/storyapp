import React, { Component, ErrorInfo, PropsWithChildren } from 'react';
import Button from './Button';

interface State {
  hasError: boolean;
  error?: Error;
  errorId: string;
}

export class StoryAppErrorBoundary extends Component<PropsWithChildren, State> {
  constructor(props: PropsWithChildren) {
    super(props);
    this.state = { 
      hasError: false,
      errorId: '' 
    };
  }

  static getDerivedStateFromError(error: Error): State {
    // 生成唯一错误ID用于追踪
    const errorId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    return { 
      hasError: true, 
      error,
      errorId 
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('StoryApp Error Boundary:', error, errorInfo);
    
    // 在生产环境发送错误到监控服务
    if (process.env.NODE_ENV === 'production') {
      this.sendErrorToMonitoring(error, errorInfo);
    }
  }

  private sendErrorToMonitoring(error: Error, errorInfo: ErrorInfo) {
    try {
      const errorData = {
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        errorId: this.state.errorId,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href,
        userId: localStorage.getItem('storyapp_user_id') || 'anonymous'
      };
      
      // 发送到后端错误监控服务
      fetch('/api/log-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorData)
      }).catch(err => {
        // 如果发送失败，至少在控制台记录
        console.warn('Failed to send error to monitoring service:', err);
      });
    } catch (monitoringError) {
      console.warn('Error in monitoring service:', monitoringError);
    }
  }

  private handleRestart = () => {
    // 清除可能的错误状态
    sessionStorage.clear();
    window.location.reload();
  };

  private handleGoHome = () => {
    // 清除状态并跳转到首页
    sessionStorage.clear();
    window.location.href = '/';
  };

  private handleReportError = () => {
    const { error, errorId } = this.state;
    const subject = `故事应用错误报告 - ${errorId}`;
    const body = `
错误ID: ${errorId}
时间: ${new Date().toLocaleString()}
错误信息: ${error?.message || '未知错误'}
页面: ${window.location.href}

请描述出错前的操作步骤：

`;
    
    const mailtoUrl = `mailto:support@storyapp.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoUrl, '_blank');
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-child-cream p-child-lg">
          <div className="text-center max-w-md mx-auto bg-white rounded-child-xl shadow-child-xl p-child-3xl">
            {/* 友好的错误图标 */}
            <div className="text-8xl mb-child-lg animate-bounce">😓</div>
            
            <h2 className="
              font-child 
              font-bold 
              text-child-2xl 
              text-gray-800 
              mb-child-lg
            ">
              哎呀，出了点小问题
            </h2>
            
            <p className="
              font-child 
              text-child-base 
              text-gray-600 
              mb-child-xl
              leading-relaxed
            ">
              故事暂时遇到了困难，不过别担心，我们马上就能修好它！
            </p>

            {/* 错误ID，方便技术支持 */}
            <div className="bg-gray-50 rounded-child p-child-md mb-child-xl">
              <p className="text-child-xs text-gray-500 mb-1">错误追踪号码</p>
              <p className="text-child-sm font-mono text-gray-700 font-bold">
                #{this.state.errorId}
              </p>
            </div>
            
            <div className="space-y-child-md">
              <Button 
                onClick={this.handleRestart}
                variant="primary"
                size="large"
                className="w-full"
                testId="error-restart-button"
              >
                🔄 重新开始
              </Button>
              
              <Button 
                onClick={this.handleGoHome}
                variant="secondary"
                size="medium"
                className="w-full"
                testId="error-home-button"
              >
                🏠 返回首页
              </Button>

              {/* 高级选项 */}
              <details className="text-left">
                <summary className="text-child-xs text-gray-500 cursor-pointer hover:text-gray-700 transition-colors">
                  更多选项
                </summary>
                <div className="mt-child-sm space-y-child-sm">
                  <Button 
                    onClick={this.handleReportError}
                    variant="accent"
                    size="small"
                    className="w-full text-child-xs"
                  >
                    📧 报告问题
                  </Button>
                  
                  {process.env.NODE_ENV === 'development' && (
                    <div className="bg-red-50 border border-red-200 rounded-child-lg p-child-sm">
                      <p className="text-red-700 text-child-xs font-bold mb-1">开发模式信息:</p>
                      <p className="text-red-600 text-child-xs font-mono break-all">
                        {this.state.error?.message}
                      </p>
                    </div>
                  )}
                </div>
              </details>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// 默认导出
export default StoryAppErrorBoundary;