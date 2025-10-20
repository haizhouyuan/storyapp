import { useCallback, useEffect, useState } from 'react';
import type { DetectiveWorkflowRecord } from '@storyapp/shared';
import { getWorkflow } from '../utils/detectiveApi';

export function resolveWorkflowId(record?: Partial<DetectiveWorkflowRecord> & { workflowId?: string } | null): string | undefined {
  if (!record) return undefined;
  return (record as any).workflowId || record?._id;
}

export function useDetectiveWorkflow(workflowId?: string, initialWorkflow?: DetectiveWorkflowRecord | null) {
  const [workflow, setWorkflow] = useState<DetectiveWorkflowRecord | null>(initialWorkflow ?? null);
  const [isLoading, setIsLoading] = useState<boolean>(() => Boolean(workflowId) && !initialWorkflow);
  const [error, setError] = useState<string | null>(null);

  const fetchWorkflow = useCallback(
    async (id?: string): Promise<DetectiveWorkflowRecord> => {
      const targetId = id ?? workflowId;
      if (!targetId) {
        const message = '缺少故事 ID';
        setError(message);
        throw new Error(message);
      }
      setIsLoading(true);
      try {
        const data = await getWorkflow(targetId);
        setWorkflow(data);
        setError(null);
        return data;
      } catch (err: any) {
        const message = err?.message || '加载故事失败';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [workflowId],
  );

  useEffect(() => {
    if (!workflow && workflowId) {
      fetchWorkflow(workflowId).catch(() => undefined);
    }
  }, [workflow, workflowId, fetchWorkflow]);

  return {
    workflow,
    setWorkflow,
    isLoading,
    error,
    refresh: fetchWorkflow,
  } as const;
}
