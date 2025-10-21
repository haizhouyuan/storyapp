
import { Router, Request, Response } from 'express';
import { createLogger } from '../config/logger';
import {
  createDetectiveWorkflow,
  getWorkflowById,
  listWorkflows,
  retryWorkflow,
  terminateWorkflow,
  rollbackWorkflow,
  compileWorkflow,
  getWorkflowStageActivity,
} from '../services/detectiveWorkflowService';
import type {
  CreateWorkflowRequest,
  RollbackWorkflowRequest,
  TerminateWorkflowRequest,
  WorkflowStageStatus,
} from '@storyapp/shared';
import {
  registerWorkflowStream,
  getWorkflowEventHistory,
  publishWorkflowEvent,
} from '../services/workflowEventBus';

const router = Router();
const workflowLogger = createLogger('routes:storyWorkflows');
const enableTestEndpoints =
  process.env.ENABLE_WORKFLOW_TEST_ENDPOINTS === '1' || process.env.NODE_ENV !== 'production';

router.get('/', async (req: Request, res: Response) => {
  try {
    const page = Number.parseInt(String(req.query.page ?? '1'), 10) || 1;
    const limit = Number.parseInt(String(req.query.limit ?? '10'), 10) || 10;
    const statusParam = typeof req.query.status === 'string' ? req.query.status : undefined;
    let status: WorkflowStageStatus | undefined;
    if (statusParam) {
      const candidates: WorkflowStageStatus[] = ['pending', 'running', 'completed', 'failed'];
      if (!candidates.includes(statusParam as WorkflowStageStatus)) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_STATUS_FILTER',
          message: 'status 参数无效',
        });
      }
      status = statusParam as WorkflowStageStatus;
    }
    const result = await listWorkflows({ page, limit, status });
    res.json({ success: true, data: result });
  } catch (error: any) {
    workflowLogger.error({ err: error }, '获取工作流列表失败');
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: error?.message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const body = req.body as CreateWorkflowRequest;
  workflowLogger.info({ topic: body?.topic }, '创建侦探故事工作流请求');

  try {
    const workflow = await createDetectiveWorkflow({
      topic: body?.topic ?? '',
      locale: body?.locale,
    });
    res.status(201).json({ success: true, data: workflow });
  } catch (error: any) {
    workflowLogger.error({ err: error }, '创建侦探故事工作流失败');

    if (error?.code === 'VALIDATION_ERROR') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_REQUEST',
        messages: error?.messages ?? [],
      });
    }

    if (error?.code === 'DEEPSEEK_CONFIG_ERROR') {
      return res.status(503).json({
        success: false,
        error: 'AI_SERVICE_UNAVAILABLE',
        message: error?.message,
      });
    }

    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error?.message ?? '意外错误，请稍后再试',
    });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const workflow = await getWorkflowById(id);
    if (!workflow) {
      return res.status(404).json({ success: false, error: 'WORKFLOW_NOT_FOUND' });
    }

    res.json({ success: true, data: workflow });
  } catch (error: any) {
    workflowLogger.error({ err: error, id }, '获取侦探故事工作流失败');
    res.status(400).json({
      success: false,
      error: 'INVALID_WORKFLOW_ID',
      message: error?.message ?? 'Invalid workflow id',
    });
  }
});

router.post('/:id/retry', async (req: Request, res: Response) => {
  const { id } = req.params;
  workflowLogger.info({ id }, '重试侦探故事工作流');

  try {
    const workflow = await retryWorkflow(id);
    res.json({ success: true, data: workflow });
  } catch (error: any) {
    workflowLogger.error({ err: error, id }, '重试侦探故事工作流失败');
    const status = error?.message === 'Workflow not found' ? 404 : 500;
    res.status(status).json({ success: false, error: status === 404 ? 'WORKFLOW_NOT_FOUND' : 'INTERNAL_ERROR', message: error?.message });
  }
});


router.post('/:id/compile', async (req: Request, res: Response) => {
  const { id } = req.params;
  workflowLogger.info({ id }, '导出侦探故事工作流');
  try {
    const outputs = await compileWorkflow(id);
    res.json({ success: true, data: outputs });
  } catch (error: any) {
    const status = error?.message === 'Workflow not found' ? 404 : 400;
    workflowLogger.error({ err: error, id }, '导出工作流失败');
    res.status(status).json({ success: false, error: status === 404 ? 'WORKFLOW_NOT_FOUND' : 'COMPILE_FAILED', message: error?.message });
  }
});

router.post('/:id/terminate', async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = req.body as TerminateWorkflowRequest;
  workflowLogger.warn({ id, reason: body?.reason }, '终止侦探故事工作流');

  try {
    const workflow = await terminateWorkflow(id, body ?? {});
    res.json({ success: true, data: workflow });
  } catch (error: any) {
    workflowLogger.error({ err: error, id }, '终止工作流失败');
    const status = error?.message === 'Workflow not found' ? 404 : 500;
    res.status(status).json({ success: false, error: status === 404 ? 'WORKFLOW_NOT_FOUND' : 'INTERNAL_ERROR', message: error?.message });
  }
});

router.post('/:id/rollback', async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = req.body as RollbackWorkflowRequest;
  workflowLogger.info({ id, revisionId: body?.revisionId }, '回滚侦探故事工作流');

  if (!body?.revisionId) {
    return res.status(400).json({ success: false, error: 'INVALID_REQUEST', message: 'revisionId_required' });
  }

  try {
    const workflow = await rollbackWorkflow(id, body);
    res.json({ success: true, data: workflow });
  } catch (error: any) {
    workflowLogger.error({ err: error, id }, '回滚工作流失败');
    const status = error?.message === 'Workflow not found' ? 404 : error?.message === 'Revision not found' ? 404 : 500;
    const code = error?.message === 'Revision not found' ? 'REVISION_NOT_FOUND' : status === 404 ? 'WORKFLOW_NOT_FOUND' : 'INTERNAL_ERROR';
    res.status(status).json({ success: false, error: code, message: error?.message });
  }
});

router.get('/:id/events', (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const events = getWorkflowEventHistory(id);
    res.json({ success: true, data: events });
  } catch (error: any) {
    workflowLogger.error({ err: error, id }, '获取工作流事件失败');
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR', message: error?.message ?? 'unexpected_error' });
  }
});

router.get('/:id/stage-activity', (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const summary = getWorkflowStageActivity(id);
    res.json({ success: true, data: summary });
  } catch (error: any) {
    workflowLogger.error({ err: error, id }, '获取阶段活动失败');
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: error?.message ?? 'unexpected_error',
    });
  }
});

router.get('/:id/stream', (req: Request, res: Response) => {
  const { id } = req.params;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Keep-Alive', 'timeout=120, max=1000');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // 立即写入一条注释可触发代理和客户端建立事件流
  res.write(': connected\n\n');

  const unregister = registerWorkflowStream(id, res);

  req.on('close', () => {
    unregister();
  });
});

if (enableTestEndpoints) {
  router.post('/:id/test-events', (req: Request, res: Response) => {
    const { id } = req.params;
    const { category = 'info', stageId, status, message, meta } = req.body ?? {};

    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_MESSAGE',
        message: '测试事件需要有效的 message 字段',
      });
    }

    publishWorkflowEvent({
      workflowId: id,
      category,
      stageId,
      status,
      message,
      meta: typeof meta === 'object' ? meta : undefined,
    });

    const events = getWorkflowEventHistory(id);
    const event = events[events.length - 1];
    res.json({ success: true, data: event });
  });
}

export default router;
