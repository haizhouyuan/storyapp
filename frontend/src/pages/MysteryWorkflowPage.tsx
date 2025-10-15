import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import {
  createWorkflow,
  listWorkflows,
  getWorkflow,
  retryWorkflow,
  terminateWorkflow,
  rollbackWorkflow,
} from '../utils/detectiveApi';
import type {
  DetectiveWorkflowRecord,
  WorkflowListItem,
  WorkflowRevision,
} from '@storyapp/shared';
import Button from '../components/Button';

interface WorkflowListProps {
  workflows: WorkflowListItem[];
  onSelect: (id: string) => void;
  selectedId?: string;
  isLoading?: boolean;
}

const WorkflowList: React.FC<WorkflowListProps> = ({ workflows, onSelect, selectedId, isLoading }) => (
  <div className="space-y-2">
    {workflows.map((item) => (
      <button
        key={item._id}
        onClick={() => onSelect(item._id)}
        className={`w-full text-left px-4 py-3 rounded-lg border transition ${
          item._id === selectedId
            ? 'border-child-purple bg-child-purple/10'
            : 'border-child-border hover:border-child-purple/60'
        }`}
        disabled={isLoading}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-child-text">
              {item.topic}
            </h3>
            <p className="text-sm text-child-muted">
              状态：{statusLabel(item.status)} · 最近更新：{formatDateTime(item.updatedAt)}
            </p>
          </div>
          {item.latestRevisionType && (
            <span className="text-xs text-child-muted">
              修订：{revisionLabel(item.latestRevisionType)}
            </span>
          )}
        </div>
      </button>
    ))}
    {workflows.length === 0 && (
      <p className="text-sm text-child-muted text-center py-6">暂无工作流，请先创建一个新任务。</p>
    )}
  </div>
);


const formatDateTime = (value?: string) => {
  if (!value) return '-';
  return new Date(value).toLocaleString();
};

const formatTime = (value?: string) => {
  if (!value) return '';
  return new Date(value).toLocaleTimeString();
};

const statusLabel = (status: string) => {
  switch (status) {
    case 'completed':
      return '已完成';
    case 'running':
      return '执行中';
    case 'failed':
      return '已失败';
    default:
      return '未开始';
  }
};

const revisionLabel = (type?: string) => {
  if (!type) return '未知';
  if (type === 'retry') return '重试';
  if (type === 'rollback') return '回滚';
  return '初始';
};

const StageBadge: React.FC<{ state: { stage: string; status: string; finishedAt?: string } }> = ({ state }) => (
  <span
    className={`inline-flex items-center px-2 py-1 rounded text-xs mr-2 mb-2 ${
      state.status === 'completed'
        ? 'bg-green-100 text-green-600'
        : state.status === 'failed'
        ? 'bg-red-100 text-red-600'
        : state.status === 'running'
        ? 'bg-blue-100 text-blue-600'
        : 'bg-gray-100 text-gray-500'
    }`}
  >
    {state.stage} · {statusLabel(state.status)}
    {state.finishedAt && <span className="ml-1 text-child-muted">{formatTime(state.finishedAt)}</span>}
  </span>
);

const RevisionTimeline: React.FC<{ history?: WorkflowRevision[]; onRollback: (revisionId: string) => void; disabled?: boolean }> = ({ history = [], onRollback, disabled }) => {
  if (history.length === 0) {
    return <p className="text-sm text-child-muted">暂无历史版本。</p>;
  }

  return (
    <ul className="space-y-2">
      {[...history].reverse().map((rev) => (
        <li key={rev.revisionId} className="border border-child-border rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-child-text">{revisionLabel(rev.type)} · {formatDateTime(rev.createdAt)}</p>
              {rev.meta?.note && <p className="text-xs text-child-muted">备注：{rev.meta.note}</p>}
            </div>
            <Button
              size="small"
              variant="secondary"
              onClick={() => onRollback(rev.revisionId)}
              disabled={disabled}
            >
              回滚至此
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
};

const MysteryWorkflowPage: React.FC = () => {
  const [topic, setTopic] = useState('');
  const [list, setList] = useState<WorkflowListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [selectedWorkflow, setSelectedWorkflow] = useState<DetectiveWorkflowRecord | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isLoadingWorkflow, setIsLoadingWorkflow] = useState(false);

  const refreshList = async (selectLatest = false) => {
    setIsLoadingList(true);
    try {
      const result = await listWorkflows({ page: 1, limit: 20 });
      setList(result.items);
      if (selectLatest && result.items.length > 0) {
        handleSelectWorkflow(result.items[0]._id);
      }
    } catch (error: any) {
      toast.error(error?.message || '获取工作流列表失败');
    } finally {
      setIsLoadingList(false);
    }
  };

  const handleSelectWorkflow = async (id: string) => {
    setSelectedId(id);
    setIsLoadingWorkflow(true);
    try {
      const workflow = await getWorkflow(id);
      setSelectedWorkflow(workflow);
    } catch (error: any) {
      toast.error(error?.message || '获取工作流详情失败');
    } finally {
      setIsLoadingWorkflow(false);
    }
  };

  const handleCreate = async () => {
    if (!topic.trim()) {
      toast.error('请输入故事主题');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createWorkflow(topic.trim());
      toast.success('已生成侦探故事工作流');
      setTopic('');
      const workflow = await getWorkflow(result.workflowId);
      setSelectedId(workflow._id);
      setSelectedWorkflow(workflow);
      await refreshList();
    } catch (error: any) {
      toast.error(error?.message || '生成工作流失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRetry = async () => {
    if (!selectedId) return;
    setIsLoadingWorkflow(true);
    try {
      const workflow = await retryWorkflow(selectedId);
      toast.success('已重新执行工作流');
      setSelectedWorkflow(workflow);
      await refreshList();
    } catch (error: any) {
      toast.error(error?.message || '重试失败');
    } finally {
      setIsLoadingWorkflow(false);
    }
  };

  const handleTerminate = async () => {
    if (!selectedId) return;
    const reason = window.prompt('请输入终止原因，可留空');
    if (reason === null) return;
    setIsLoadingWorkflow(true);
    try {
      const workflow = await terminateWorkflow(selectedId, { reason: reason || undefined });
      toast.success('已终止工作流');
      setSelectedWorkflow(workflow);
      await refreshList();
    } catch (error: any) {
      toast.error(error?.message || '终止失败');
    } finally {
      setIsLoadingWorkflow(false);
    }
  };

  const handleRollback = async (revisionId: string) => {
    if (!selectedId) return;
    setIsLoadingWorkflow(true);
    try {
      const workflow = await rollbackWorkflow(selectedId, { revisionId });
      toast.success('已回滚至指定版本');
      setSelectedWorkflow(workflow);
      await refreshList();
    } catch (error: any) {
      toast.error(error?.message || '回滚失败');
    } finally {
      setIsLoadingWorkflow(false);
    }
  };

  useEffect(() => {
    refreshList();
  }, []);

  const validationSummary = useMemo(() => {
    if (!selectedWorkflow?.validation) return null;
    const { summary, metrics } = selectedWorkflow.validation;
    return (
      <div className="mt-4 space-y-2">
        <p className="text-sm text-child-muted">校验结果：通过 {summary?.pass ?? 0} · 警告 {summary?.warn ?? 0} · 失败 {summary?.fail ?? 0}</p>
        {metrics?.redHerringRatio !== undefined && (
          <p className="text-sm text-child-muted">红鲱鱼占比：{(metrics.redHerringRatio * 100).toFixed(1)}%</p>
        )}
      </div>
    );
  }, [selectedWorkflow?.validation]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-child-text">侦探故事工作流</h1>
          <p className="text-child-muted text-sm mt-1">创建、查看并管理 Stage1~4 的侦探故事生成任务。</p>
        </div>
        <Button variant="secondary" onClick={() => refreshList()} disabled={isLoadingList}>
          刷新列表
        </Button>
      </header>

      <section className="bg-white rounded-xl shadow-child-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold text-child-text">创建新工作流</h2>
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="flex-1 px-4 py-2 border border-child-border rounded-lg focus:outline-none focus:ring-2 focus:ring-child-purple"
            placeholder="请输入侦探故事主题"
          />
          <Button onClick={handleCreate} disabled={isSubmitting}>开始生成</Button>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-1 bg-white rounded-xl shadow-child-sm p-6">
          <h2 className="text-lg font-semibold text-child-text mb-4">工作流列表</h2>
          <WorkflowList
            workflows={list}
            onSelect={handleSelectWorkflow}
            selectedId={selectedId}
            isLoading={isLoadingWorkflow}
          />
        </section>

        <section className="lg:col-span-2 bg-white rounded-xl shadow-child-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-child-text">工作流详情</h2>
            <div className="space-x-2">
              <Button variant="secondary" size="small" onClick={handleRetry} disabled={!selectedId || isLoadingWorkflow}>
                重新执行
              </Button>
              <Button variant="warning" size="small" onClick={handleTerminate} disabled={!selectedId || isLoadingWorkflow}>
                终止
              </Button>
            </div>
          </div>

          {!selectedWorkflow ? (
            <p className="text-sm text-child-muted">请选择一个工作流查看详情。</p>
          ) : (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-child-text">主题：{selectedWorkflow.topic}</h3>
                <p className="text-sm text-child-muted">
                  状态：{statusLabel(selectedWorkflow.status)} · 创建于 {formatDateTime(selectedWorkflow.createdAt)}
                </p>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-child-text mb-2">阶段进度</h4>
                <div>
                  {selectedWorkflow.stageStates.map((state) => (
                    <StageBadge key={state.stage} state={state} />
                  ))}
                </div>
              </div>

              {selectedWorkflow.review && (
                <details className="bg-child-gray-50 rounded-lg p-4" open>
                  <summary className="cursor-pointer font-semibold text-child-text">审核结果</summary>
                  <pre className="mt-2 text-xs text-child-muted whitespace-pre-wrap">
                    {JSON.stringify(selectedWorkflow.review, null, 2)}
                  </pre>
                </details>
              )}

              {selectedWorkflow.validation && (
                <details className="bg-child-gray-50 rounded-lg p-4" open>
                  <summary className="cursor-pointer font-semibold text-child-text">校验报告</summary>
                  <pre className="mt-2 text-xs text-child-muted whitespace-pre-wrap">
                    {JSON.stringify(selectedWorkflow.validation, null, 2)}
                  </pre>
                </details>
              )}

              {validationSummary}

              <div>
                <h4 className="text-sm font-semibold text-child-text mb-2">历史版本</h4>
                <RevisionTimeline
                  history={selectedWorkflow.history}
                  onRollback={handleRollback}
                  disabled={isLoadingWorkflow}
                />
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default MysteryWorkflowPage;
