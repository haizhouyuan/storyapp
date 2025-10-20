/**
 * TTS 长文本测试页面
 * 用于测试故事朗读功能
 */

import React, { useState, useEffect, useCallback } from 'react';
import { StoryAudioPlayer } from '../components/StoryAudioPlayer';
import { useStoryTts } from '../hooks/useStoryTts';
import type { AudioSegment } from '../hooks/useStoryTts';
import {
  fetchIflytekHealth,
  fetchTtsTasks,
  type TtsHealthResponse,
  type TtsTaskRecord,
  type TtsTaskStatus,
  type TtsTaskSummary,
} from '../utils/api';

const SAMPLE_STORY = `## 第一章 神秘的邀请函

小侦探小明收到了一封神秘的邀请函，邀请他参加在海边别墅举行的聚会。邀请函上写着："亲爱的小明，我们诚挚邀请你参加本周末在海滨别墅的特别聚会。会有很多有趣的人和事等着你。"

小明感到十分好奇，决定接受邀请。他收拾好行李，准备前往那座传说中的别墅。

## 第二章 抵达别墅

小明乘坐火车来到海边小镇，又步行了半小时才找到那座别墅。别墅坐落在悬崖边上，周围环绕着茂密的树林，显得格外神秘。

当他按响门铃时，一位管家模样的老人开门迎接。"欢迎，小明先生。主人已经等候多时了。"老人说道。

## 第三章 奇怪的客人

进入别墅大厅，小明发现已经有几位客人在等待。有一位戴着单片眼镜的教授，一位穿着华丽礼服的女士，还有一位看起来很年轻的艺术家。

大家互相介绍后，主人终于出现了。他是一位中年绅士，脸上总是带着神秘的微笑。"欢迎各位光临，今晚将会是一个难忘的夜晚。"

## 第四章 真相大白

随着调查的深入，小明发现这一切都是主人精心设计的一场游戏。他想测试这些聪明人的推理能力。最终，小明凭借敏锐的观察力和缜密的逻辑，成功解开了所有谜题。

主人对小明竖起了大拇指："你真是一位出色的侦探！"`;

const statusStyleMap: Record<TtsTaskStatus, string> = {
  success: 'bg-green-100 text-green-700',
  pending: 'bg-amber-100 text-amber-700',
  error: 'bg-red-100 text-red-700',
};

const TaskCard: React.FC<{ task: TtsTaskRecord }> = ({ task }) => {
  const statusStyle = statusStyleMap[task.status] ?? 'bg-gray-100 text-gray-600';
  const durationLabel =
    typeof task.durationMs === 'number' ? `${Math.round(task.durationMs)} ms` : '—';
  const updatedAt = new Date(task.updatedAt).toLocaleString();

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-600">
      <>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold text-gray-700">
            {task.requestId || task.id}
          </span>
          <span className={`px-2 py-0.5 rounded-full font-semibold capitalize ${statusStyle}`}>
            {task.status}
          </span>
        </div>
        <p>{`耗时：${durationLabel} · 缓存：${task.cached ? '是' : '否'}`}</p>
        {task.providerMetadata?.taskId && (
          <p>{`taskId：${String(task.providerMetadata.taskId)}`}</p>
        )}
        {task.providerMetadata?.sid && (
          <p>{`sid：${String(task.providerMetadata.sid)}`}</p>
        )}
        <p>{`更新时间：${updatedAt}`}</p>
        {task.error && (
          <p className="text-red-600">{`错误：${task.error}`}</p>
        )}
      </>
    </div>
  );
};

export const TtsTestPage: React.FC = () => {
  const { synthesizeStory, error } = useStoryTts();
  const [audioData, setAudioData] = useState<{
    storyId: string;
    totalDuration: number;
    segments: AudioSegment[];
  } | null>(null);

  const [customText, setCustomText] = useState(SAMPLE_STORY);
  const [isLoading, setIsLoading] = useState(false);
  const [healthInfo, setHealthInfo] = useState<TtsHealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TtsTaskRecord[]>([]);
  const [taskSummary, setTaskSummary] = useState<TtsTaskSummary | null>(null);
  const [isDiagnosticsLoading, setIsDiagnosticsLoading] = useState(false);

  const refreshDiagnostics = useCallback(async () => {
    setIsDiagnosticsLoading(true);
    try {
      const [health, taskResult] = await Promise.all([
        fetchIflytekHealth(),
        fetchTtsTasks({ provider: 'iflytek', limit: 5 }),
      ]);
      setHealthInfo(health);
      setHealthError(null);
      setTasks(taskResult.tasks);
      setTaskSummary(taskResult.summary ?? null);
    } catch (err: any) {
      const message = err?.message || '获取 TTS 状态失败';
      setHealthError(message);
    } finally {
      setIsDiagnosticsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshDiagnostics();
  }, [refreshDiagnostics]);

  const handleSynthesize = async () => {
    try {
      setIsLoading(true);
      const result = await synthesizeStory({
        storyId: 'test-story-' + Date.now(),
        fullText: customText,
        voiceId: healthInfo?.capabilities?.defaultVoice || 'iflytek_doudou',
        speed: 1.0,
      });

      setAudioData({
        storyId: result.storyId,
        totalDuration: result.totalDuration,
        segments: result.segments,
      });
      refreshDiagnostics();
    } catch (err) {
      console.error('合成失败:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 mb-8 text-center">
          🎙️ TTS 长文本朗读测试
        </h1>

        <div className="bg-white rounded-2xl shadow-lg p-6 mb-8">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
              🛡️ 朗读引擎状态
            </h2>
            <button
              onClick={refreshDiagnostics}
              disabled={isDiagnosticsLoading}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                isDiagnosticsLoading
                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-md'
              }`}
            >
              {isDiagnosticsLoading ? '刷新中…' : '刷新状态'}
            </button>
          </div>

          {healthError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-600 text-sm">
              ❌ {healthError}
            </div>
          )}

          {healthInfo && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${
                    healthInfo.status === 'ok'
                      ? 'bg-green-100 text-green-700'
                      : healthInfo.status === 'degraded'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-red-100 text-red-700'
                  }`}
                >
                  {`状态：${healthInfo.status === 'ok' ? '正常' : healthInfo.status === 'degraded' ? '降级' : '凭证缺失'}`}
                </span>
                <span className="text-sm text-gray-600">
                  当前 provider：<strong>{healthInfo.provider}</strong>
                </span>
                {healthInfo.capabilities?.defaultVoice && (
                  <span className="text-sm text-gray-600">
                    默认音色：{healthInfo.capabilities.defaultVoice}
                  </span>
                )}
                <span className="text-xs text-gray-400">
                  更新时间：{new Date(healthInfo.timestamp).toLocaleString()}
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl bg-gray-50 border border-gray-100 p-4">
                  <p className="text-sm font-semibold text-gray-700 mb-2">凭证配置</p>
                  <ul className="space-y-1 text-xs text-gray-600">
                    <li>{`APP_ID：${healthInfo.credentials.appId ? '✅' : '⚠️ 未配置'}`}</li>
                    <li>{`API_KEY：${healthInfo.credentials.apiKey ? '✅' : '⚠️ 未配置'}`}</li>
                    <li>{`API_SECRET：${healthInfo.credentials.apiSecret ? '✅' : '⚠️ 未配置'}`}</li>
                  </ul>
                </div>
                <div className="rounded-xl bg-gray-50 border border-gray-100 p-4">
                  <p className="text-sm font-semibold text-gray-700 mb-2">任务统计（近 1 小时）</p>
                  <div className="flex gap-4 text-xs text-gray-600">
                    <div>
                      <p className="font-semibold text-gray-700 text-sm">{taskSummary?.total ?? 0}</p>
                      <p>总任务</p>
                    </div>
                    <div>
                      <p className="font-semibold text-green-600 text-sm">{taskSummary?.success ?? 0}</p>
                      <p>成功</p>
                    </div>
                    <div>
                      <p className="font-semibold text-amber-600 text-sm">{taskSummary?.pending ?? 0}</p>
                      <p>进行中</p>
                    </div>
                    <div>
                      <p className="font-semibold text-red-600 text-sm">{taskSummary?.error ?? 0}</p>
                      <p>失败</p>
                    </div>
                  </div>
                  {taskSummary?.lastError && (
                    <p className="mt-3 text-xs text-red-600">
                      最近失败（{new Date(taskSummary.lastError.updatedAt).toLocaleTimeString()}）：{taskSummary.lastError.error || '未知错误'}
                    </p>
                  )}
                </div>
              </div>

              {healthInfo.warnings && healthInfo.warnings.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
                  {healthInfo.warnings.map((warning) => (
                    <p key={warning}>{`⚠️ ${warning}`}</p>
                  ))}
                </div>
              )}

              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">最新任务</p>
                {tasks.length === 0 ? (
                  <p className="text-xs text-gray-500">暂无任务数据，可尝试生成一次朗读。</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {tasks.map((task) => (
                      <TaskCard key={task.id} task={task} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 文本输入区 */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">故事文本</h2>
          <textarea
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            className="w-full h-64 p-4 border border-gray-300 rounded-lg font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="在这里输入故事文本..."
          />
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-gray-600">
              字数：{customText.length} / 预估时长：
              {Math.ceil(customText.length / 5)} 秒 (≈{' '}
              {Math.ceil(customText.length / 300)} 分钟)
            </p>
            <button
              onClick={handleSynthesize}
              disabled={isLoading || !customText.trim()}
              className={`px-6 py-3 rounded-lg font-semibold text-white shadow-md transition-all ${
                isLoading || !customText.trim()
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 hover:shadow-lg hover:scale-105'
              }`}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <svg
                    className="w-5 h-5 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  合成中...
                </span>
              ) : (
                '🔊 开始朗读'
              )}
            </button>
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-8">
            <p className="text-red-600">❌ {error}</p>
          </div>
        )}

        {/* 播放器 */}
        {audioData && (
          <div className="mb-8">
            <StoryAudioPlayer
              storyId={audioData.storyId}
              segments={audioData.segments}
              totalDuration={audioData.totalDuration}
            />

            {/* 分段信息 */}
            <details className="mt-4 bg-white rounded-lg p-4 shadow">
              <summary className="cursor-pointer font-semibold text-gray-700">
                📊 分段详情 ({audioData.segments.length} 段)
              </summary>
              <div className="mt-4 space-y-2 max-h-96 overflow-y-auto">
                {audioData.segments.map((seg) => (
                  <div
                    key={seg.segmentIndex}
                    className="p-3 bg-gray-50 rounded border border-gray-200"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm">
                        第 {seg.segmentIndex + 1} 段
                        {seg.chapterTitle && ` · ${seg.chapterTitle}`}
                      </span>
                      <span className="text-xs text-gray-500">
                        {seg.duration} 秒
                        {seg.cached && ' · 已缓存'}
                      </span>
                    </div>
                    {seg.error && (
                      <p className="text-xs text-red-600 mt-1">
                        ❌ {seg.error}
                      </p>
                    )}
                    <p className="text-xs text-gray-600 mt-1">
                      位置: {seg.startOffset} - {seg.endOffset}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          </div>
        )}

        {/* 使用说明 */}
        <div className="bg-blue-50 rounded-lg p-6">
          <h3 className="font-semibold text-blue-900 mb-3">📖 使用说明</h3>
          <ul className="space-y-2 text-sm text-blue-800">
            <li>
              ✅ <strong>点击"开始朗读"</strong>：系统会自动分段合成（每段
              ≤1000 字）
            </li>
            <li>
              ✅ <strong>拖动进度条</strong>：立即跳转到目标位置（自动切换分段）
            </li>
            <li>
              ✅ <strong>前进/后退 15 秒</strong>：快速跳转
            </li>
            <li>
              ✅ <strong>章节标记</strong>：使用 <code>## 第X章</code>{' '}
              格式会自动识别章节
            </li>
            <li>
              ✅ <strong>缓存机制</strong>：相同文本会复用缓存，加快响应速度
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default TtsTestPage;
