import React from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useWorkflowStream } from '../useWorkflowStream';

jest.mock('react-hot-toast', () => {
  const mockToast = Object.assign(jest.fn(), {
    error: jest.fn(),
    success: jest.fn(),
  });
  return {
    __esModule: true,
    default: mockToast,
  };
});

const mockToast = jest.mocked(jest.requireMock('react-hot-toast').default, { shallow: false }) as jest.Mock &
  Record<'error' | 'success', jest.Mock>;

type MockEventHandlers = {
  onopen: ((event: any) => void) | null;
  onmessage: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
};

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  closed = false;
  onopen: MockEventHandlers['onopen'] = null;
  onmessage: MockEventHandlers['onmessage'] = null;
  onerror: MockEventHandlers['onerror'] = null;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
  }

  emitOpen() {
    this.onopen?.({ type: 'open' });
  }

  emitMessage(payload: unknown) {
    this.onmessage?.({
      data: JSON.stringify(payload),
    });
  }

  emitError() {
    this.onerror?.({ type: 'error' });
  }
}

const originalEventSource = global.EventSource;
const originalFetch = global.fetch;

beforeEach(() => {
  (global.EventSource as any) = MockEventSource;
  MockEventSource.instances = [];
  mockToast.mockClear();
  mockToast.error.mockClear();
  mockToast.success.mockClear();
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: [] }),
  }) as any;
});

afterEach(() => {
  if (originalEventSource) {
    global.EventSource = originalEventSource;
  }
  jest.clearAllTimers();
  jest.useRealTimers();
  global.fetch = originalFetch;
});

const TestComponent: React.FC<{ workflowId: string }> = ({ workflowId }) => {
  const { events, isConnected, error, refresh } = useWorkflowStream(workflowId);
  return (
    <div>
      <span data-testid="connected">{String(isConnected)}</span>
      <span data-testid="error">{error ?? ''}</span>
      <span data-testid="event-count">{events.length}</span>
      <button type="button" onClick={refresh}>
        refresh
      </button>
    </div>
  );
};

describe('useWorkflowStream', () => {
  it('loads history and supports manual refresh', async () => {
    render(<TestComponent workflowId="wf-1" />);

    expect(global.fetch).toHaveBeenNthCalledWith(1, '/api/story-workflows/wf-1/events', expect.anything());
    expect(global.fetch).toHaveBeenNthCalledWith(2, '/api/story-workflows/wf-1/stage-activity', expect.anything());

    await act(async () => {
      MockEventSource.instances[0]?.emitOpen();
    });

    const refreshButton = screen.getByText('refresh');
    await act(async () => {
      refreshButton.click();
    });

    expect(global.fetch).toHaveBeenCalledTimes(4);
  });

  it('notifies on disconnect and reconnect', async () => {
    jest.useFakeTimers();
    render(<TestComponent workflowId="wf-2" />);

    await act(async () => {
      MockEventSource.instances[0]?.emitOpen();
    });

    await act(async () => {
      MockEventSource.instances[0]?.emitMessage({
        workflowId: 'wf-2',
        category: 'info',
        eventId: 'evt-1',
        message: 'hello',
        timestamp: new Date().toISOString(),
      });
    });

    await act(async () => {
      MockEventSource.instances[0]?.emitError();
    });

    expect(mockToast.error).toHaveBeenCalledWith('事件流连接断开，稍后将自动重连');

    await act(async () => {
      jest.runOnlyPendingTimers();
    });

    await act(async () => {
      const next = MockEventSource.instances.at(-1);
      next?.emitOpen();
    });

    expect(mockToast.success).toHaveBeenCalledWith('事件流已重新连接');
  });
});
