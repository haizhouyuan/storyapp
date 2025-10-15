
import { Router, Request, Response } from 'express';
import { createLogger } from '../config/logger';
import {
  createDetectiveWorkflow,
  getWorkflowById,
  listWorkflows,
  retryWorkflow,
  terminateWorkflow,
  rollbackWorkflow,
} from '../services/detectiveWorkflowService';
import type {
  CreateWorkflowRequest,
  RollbackWorkflowRequest,
  TerminateWorkflowRequest,
} from '@storyapp/shared';

const router = Router();
const workflowLogger = createLogger('routes:storyWorkflows');

router.get('/', async (req: Request, res: Response) => {
  try {
    const page = Number.parseInt(String(req.query.page ?? '1'), 10) || 1;
    const limit = Number.parseInt(String(req.query.limit ?? '10'), 10) || 10;
    const result = await listWorkflows({ page, limit });
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

export default router;
