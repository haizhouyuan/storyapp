import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  PointsPageShell,
  PointsSection,
  PointsBadge,
} from '../components/points';
import Button from '../components/Button';
import LoadingSpinner from '../components/LoadingSpinner';
import { StoryAudioPlayer } from '../components/StoryAudioPlayer';
import type { DetectiveWorkflowRecord, DetectiveChapter, ValidationRuleResult, WorkflowEvent } from '@storyapp/shared';
import { useDetectiveWorkflow } from '../hooks/useDetectiveWorkflow';
import { useStoryTts, type StoryTtsBatchResponse } from '../hooks/useStoryTts';
import { stripClueTags, resolveChapterTitle, draftToMarkdown } from '../utils/storyFormatting';
import { compileWorkflow, retryWorkflow } from '../utils/detectiveApi';
import {
  ClockIcon,
  ArrowUturnLeftIcon,
  SparklesIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  SpeakerWaveIcon,
  ArrowPathIcon,
  MoonIcon,
  SunIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';
import WorkflowTimelineDrawer from '../components/WorkflowTimelineDrawer';

interface LocationState {
  workflow?: DetectiveWorkflowRecord;
  openTimeline?: boolean;
}

type TtsContext =
  | { mode: 'none' }
  | { mode: 'full' }
  | { mode: 'chapter'; chapterIndex: number };

const DEFAULT_TTS_VOICE =
  process.env.REACT_APP_TTS_VOICE_ID || process.env.REACT_APP_TTS_VOICE || 'iflytek_yeting';
const DEFAULT_TTS_SPEED = Number(process.env.REACT_APP_TTS_SPEED ?? '1');

function statusColor(status: ValidationRuleResult['status']): string {
  switch (status) {
    case 'pass':
      return 'bg-green-100 text-green-700';
    case 'warn':
      return 'bg-amber-100 text-amber-700';
    default:
      return 'bg-red-100 text-red-700';
  }
}

export default function StoryReaderPage() {
  const { workflowId } = useParams<{ workflowId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as LocationState | undefined;
  const initialWorkflow = locationState?.workflow;
  const { workflow, isLoading, error, refresh } = useDetectiveWorkflow(workflowId, initialWorkflow);
  const timelineWorkflowId = workflow?._id || workflowId || undefined;
  const defaultTimelineOpen = locationState?.openTimeline ?? Boolean(timelineWorkflowId);

  const [isNightMode, setIsNightMode] = useState(false);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [audioData, setAudioData] = useState<StoryTtsBatchResponse | null>(null);
  const [ttsHint, setTtsHint] = useState('');
  const [ttsContext, setTtsContext] = useState<TtsContext>({ mode: 'none' });
  const [isCompiling, setIsCompiling] = useState(false);
  const [compileResult, setCompileResult] = useState<{ urls: { html: string; interactive: string; plain: string }; plainText: string } | null>(null);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [isTimelineOpen, setIsTimelineOpen] = useState(defaultTimelineOpen);
  const [isRetryingStage, setIsRetryingStage] = useState(false);

  const { synthesizeStory, status: ttsStatus, error: ttsError } = useStoryTts({
    defaultVoiceId: DEFAULT_TTS_VOICE,
    defaultSpeed: DEFAULT_TTS_SPEED,
  });

  useEffect(() => {
    if (error) {
      toast.error(error);
    }
  }, [error]);

  useEffect(() => {
    if (ttsError) {
      toast.error(ttsError);
    }
  }, [ttsError]);

  useEffect(() => {
    setIsTimelineOpen(defaultTimelineOpen);
  }, [defaultTimelineOpen]);

  const chapters: DetectiveChapter[] = useMemo(
    () => workflow?.storyDraft?.chapters ?? [],
    [workflow?.storyDraft?.chapters],
  );

  const storyMarkdown = useMemo(() => draftToMarkdown(workflow?.storyDraft), [workflow?.storyDraft]);
  const validationSummary = workflow?.validation?.summary;
  const validationResults = workflow?.validation?.results ?? [];
  const timeline = workflow?.outline?.timeline ?? [];
  const characters = workflow?.outline?.characters ?? [];
  const clues = workflow?.outline?.clueMatrix ?? [];

  const goHome = () => navigate('/');
  const gotoBuilder = () => navigate('/builder');

  const storyTitle = workflow?.topic || '侦探故事';
  const hasError = Boolean(error) && !workflow;
  const isSynthesizing = ttsStatus === 'loading';

  const progressPercent = useMemo(() => {
    if (!chapters.length) return 0;
    return Math.min(100, Math.round(((currentChapterIndex + 1) / chapters.length) * 100));
  }, [chapters.length, currentChapterIndex]);

  const sectionTone = isNightMode ? 'bg-slate-900/80 border-white/10 text-slate-100' : undefined;
  const hasFailedStage = useMemo(() => {
    return (workflow?.stageStates ?? []).some((stage) => stage.status === 'failed');
  }, [workflow?.stageStates]);
  const pageShellClass = useMemo(() => {
    const classes: string[] = [];
    if (isNightMode) {
      classes.push('bg-slate-950 text-slate-100 transition-colors duration-300');
    }
    if (isTimelineOpen) {
      classes.push('md:pr-[340px]');
    }
    return classes.join(' ');
  }, [isNightMode, isTimelineOpen]);
  const pageContainerClass = isNightMode ? 'text-slate-100' : undefined;

  const observeChapters = useCallback(() => {
    if (!chapters.length) return () => {};

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const indexAttr = entry.target.getAttribute('data-index');
            if (indexAttr) {
              setCurrentChapterIndex(Number(indexAttr));
            }
          }
        });
      },
      {
        rootMargin: '-40% 0px -40% 0px',
        threshold: [0.25, 0.5, 0.75],
      },
    );

    document
      .querySelectorAll<HTMLElement>('[data-reader-chapter="true"]')
      .forEach((node) => observer.observe(node));

    return () => observer.disconnect();
  }, [chapters.length]);

  useEffect(() => observeChapters(), [observeChapters]);

  const handleScrollToChapter = useCallback((index: number) => {
    const element = document.querySelector<HTMLElement>(`[data-reader-chapter="true"][data-index="${index}"]`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const handleSynthesizeStory = async () => {
    if (!timelineWorkflowId) {
      toast.error('故事 ID 缺失，无法生成朗读音频');
      return;
    }
    if (!storyMarkdown.trim()) {
      toast.error('尚无可朗读的正文内容');
      return;
    }

    try {
      setTtsContext({ mode: 'full' });
      setTtsHint('正在合成整篇朗读，预计耗时 20-40 秒…');
      const result = await synthesizeStory({
        storyId: timelineWorkflowId || `story-${Date.now()}`,
        fullText: storyMarkdown,
        chapterMarkers: chapters.map((chapter, index) => resolveChapterTitle(index, chapter)),
        voiceId: DEFAULT_TTS_VOICE,
        speed: DEFAULT_TTS_SPEED,
      });
      setAudioData(result);
      if (result.successCount === result.totalSegments) {
        setTtsHint('朗读音频已就绪，可开始播放。');
        toast.success('整篇朗读已生成');
      } else {
        setTtsHint('部分段落合成失败，可稍后重试。');
        toast.error('部分朗读片段生成失败');
      }
    } catch (err: any) {
      const message = err?.message || '朗读合成失败';
      setTtsHint('');
      toast.error(message);
    }
  };

  const handleSynthesizeChapter = async (index: number, chapter: DetectiveChapter) => {
    const text = stripClueTags(chapter?.content);
    if (!text) {
      toast.error('本章暂无可朗读内容');
      return;
    }
    try {
      setTtsContext({ mode: 'chapter', chapterIndex: index });
      setTtsHint(`正在合成第 ${index + 1} 章朗读…`);
      const result = await synthesizeStory({
        storyId: `${timelineWorkflowId || 'story'}-chapter-${index}`,
        fullText: text,
        chapterMarkers: [resolveChapterTitle(index, chapter)],
        voiceId: DEFAULT_TTS_VOICE,
        speed: DEFAULT_TTS_SPEED,
      });
      setAudioData(result);
      if (result.successCount === result.totalSegments) {
        setTtsHint(`第 ${index + 1} 章朗读已生成。`);
        toast.success(`第 ${index + 1} 章朗读已生成`);
      } else {
        setTtsHint('本章朗读部分失败，可稍后重试。');
        toast.error('本章朗读生成不完整');
      }
    } catch (err: any) {
      const message = err?.message || '朗读合成失败';
      setTtsHint('');
      toast.error(message);
    }
  };

  const handleClearAudio = () => {
    setAudioData(null);
    setTtsHint('');
    setTtsContext({ mode: 'none' });
  };

  const cachedSegments = audioData ? audioData.segments.filter((segment) => segment.cached).length : 0;

  const playbackTitle = useMemo(() => {
    if (ttsContext.mode === 'chapter' && typeof ttsContext.chapterIndex === 'number') {
      return `第${ttsContext.chapterIndex + 1}章 ${resolveChapterTitle(ttsContext.chapterIndex, chapters[ttsContext.chapterIndex])}`;
    }
    if (ttsContext.mode === 'full') {
      return storyTitle;
    }
    return '';
  }, [chapters, storyTitle, ttsContext]);

  const handleCompile = async () => {
    if (!timelineWorkflowId) {
      toast.error('当前故事无法导出（缺少 ID）');
      return;
    }
    setIsCompiling(true);
    setCompileError(null);
    try {
      const outputs = await compileWorkflow(timelineWorkflowId);
      setCompileResult(outputs);
      toast.success('已生成故事导出文件');
    } catch (err: any) {
      const message = err?.message || '导出失败';
      setCompileError(message);
      toast.error(message);
    } finally {
      setIsCompiling(false);
    }
  };

  const handleRetryFailedStage = useCallback(async () => {
    if (!timelineWorkflowId) {
      toast.error('当前故事无法重试（缺少 ID）');
      return;
    }
    try {
      setIsRetryingStage(true);
      const response = await retryWorkflow(timelineWorkflowId);
      const nextWorkflowId = response?.workflowId ?? timelineWorkflowId;
      toast.success('已重新触发故事生成流程');
      navigate(`/story/${nextWorkflowId}`, {
        replace: true,
        state: { openTimeline: true },
      });
    } catch (err: any) {
      const message = err?.message || '重试失败，请稍后再试';
      toast.error(message);
    } finally {
      setIsRetryingStage(false);
    }
  }, [timelineWorkflowId, navigate]);

  const handleDrawerTtsSuccess = useCallback(
    (_event: WorkflowEvent) => {
      if (audioData) return;
      setTtsHint('后台朗读任务已完成，可点击“朗读整篇”重新获取音频。');
      toast.success('朗读任务已完成，可点击“朗读整篇”获取音频。');
    },
    [audioData],
  );

  const sectionActions = (
    <Button
      variant="ghost"
      size="small"
      onClick={() => setIsNightMode((prev) => !prev)}
    >
      {isNightMode ? (
        <span className="flex items-center gap-1"><SunIcon className="h-4 w-4" /> 退出夜间</span>
      ) : (
        <span className="flex items-center gap-1"><MoonIcon className="h-4 w-4" /> 夜间模式</span>
      )}
    </Button>
  );

  return (
    <>
      <WorkflowTimelineDrawer
        workflowId={timelineWorkflowId}
        storyTitle={storyTitle}
        initialOpen={defaultTimelineOpen}
        onOpenChange={setIsTimelineOpen}
        onScrollToChapter={handleScrollToChapter}
        onRequestExport={handleCompile}
        onRequestReadFull={handleSynthesizeStory}
        onRetryFailedStage={handleRetryFailedStage}
        onManualRefresh={refresh}
        isExporting={isCompiling}
        isSynthesizing={isSynthesizing}
        hasFailedStage={hasFailedStage}
        isRetryingStage={isRetryingStage}
        isTtsReady={Boolean(audioData)}
        onTtsEventSuccess={handleDrawerTtsSuccess}
      />
      <PointsPageShell
        maxWidth="3xl"
        className={pageShellClass || undefined}
        containerClassName={pageContainerClass}
      topBar={(
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-points-primary">
            <SparklesIcon className="h-5 w-5" />
            <span className="font-semibold">故事阅读</span>
          </div>
          <div className="flex gap-2">
            {sectionActions}
            <Button variant="ghost" size="small" onClick={goHome}>
              <ArrowUturnLeftIcon className="mr-1 h-4 w-4" />
              返回首页
            </Button>
            <Button variant="ghost" size="small" onClick={gotoBuilder}>
              高级模式
            </Button>
          </div>
        </div>
      )}
    >
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-32 text-points-text-muted">
          <LoadingSpinner size="medium" />
          <p className="mt-4">故事生成较复杂，正在加载校验完成的版本…</p>
        </div>
      ) : hasError ? (
        <PointsSection layout="card" className={sectionTone + ' text-center'}>
          <ExclamationTriangleIcon className="mx-auto mb-3 h-8 w-8 text-red-500" />
          <p className="text-points-text-muted">{error}</p>
          <div className="mt-4">
            <Button variant="primary" onClick={goHome}>
              返回首页
            </Button>
          </div>
        </PointsSection>
      ) : (
        <div className="space-y-6">
          <PointsSection layout="card" className={sectionTone}
            actions={(
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  size="small"
                  onClick={handleCompile}
                  disabled={isCompiling}
                >
                  {isCompiling ? (
                    <span className="flex items-center gap-2"><LoadingSpinner size="small" /> 正在导出…</span>
                  ) : (
                    <span className="flex items-center gap-2"><ArrowDownTrayIcon className="h-4 w-4" /> 导出故事</span>
                  )}
                </Button>
              </div>
            )}
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <h1 className="text-3xl font-bold text-points-text">{storyTitle}</h1>
                <p className="mt-2 text-sm text-points-text-muted">
                  故事由 4 个阶段生成完成，已自动嵌入线索与公平性校验。
                </p>
              </div>
              {validationSummary && (
                <div className="rounded-2xl bg-points-bg px-4 py-3 text-sm text-points-text-muted">
                  <span className="font-semibold text-points-primary">校验统计：</span>
                  <span className="ml-2">Pass {validationSummary.pass}</span>
                  <span className="ml-2">Warn {validationSummary.warn}</span>
                  <span className="ml-2">Fail {validationSummary.fail}</span>
                </div>
              )}
            </div>
            <div className="mt-4">
              <div className="h-2 w-full overflow-hidden rounded-full bg-points-border/50">
                <div
                  className="h-full rounded-full bg-points-primary transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-points-text-muted">
                阅读进度：第 {Math.min(currentChapterIndex + 1, chapters.length)} / {chapters.length} 章（{progressPercent}%）
              </p>
            </div>
            {compileResult && (
              <div className="mt-4 space-y-2 text-xs text-points-text-muted">
                <p>导出完成，可下载：</p>
                <div className="flex flex-wrap gap-3">
                  <a className="text-points-primary underline" href={compileResult.urls.plain} target="_blank" rel="noreferrer">纯文本</a>
                  <a className="text-points-primary underline" href={compileResult.urls.html} target="_blank" rel="noreferrer">HTML 预览</a>
                  <a className="text-points-primary underline" href={compileResult.urls.interactive} target="_blank" rel="noreferrer">互动包 JSON</a>
                </div>
              </div>
            )}
            {compileError && (
              <p className="mt-2 text-xs text-red-500">{compileError}</p>
            )}
          </PointsSection>

          <PointsSection title="语音朗读" layout="card" className={sectionTone}
            actions={(
              <Button
                variant="primary"
                size="small"
                onClick={handleSynthesizeStory}
                disabled={isSynthesizing || !storyMarkdown.trim()}
              >
                {isSynthesizing && ttsContext.mode === 'full' ? (
                  <span className="flex items-center gap-2"><LoadingSpinner size="small" /> 正在生成朗读音频…</span>
                ) : (
                  <span className="flex items-center gap-2"><SpeakerWaveIcon className="h-4 w-4" /> 朗读整篇</span>
                )}
              </Button>
            )}
          >
            {ttsHint && <p className="text-xs text-points-text-muted">{ttsHint}</p>}
            {audioData && (
              <div className="mt-4 space-y-3">
                {playbackTitle && <p className="text-sm text-points-text-muted">当前朗读：{playbackTitle}</p>}
                <StoryAudioPlayer
                  storyId={audioData.storyId}
                  segments={audioData.segments}
                  totalDuration={audioData.totalDuration}
                />
                <div className="flex flex-wrap items-center gap-2 text-xs text-points-text-muted">
                  <span>分段数：{audioData.totalSegments}</span>
                  <span>缓存命中：{cachedSegments}/{audioData.totalSegments}</span>
                  <Button variant="ghost" size="small" onClick={handleClearAudio}>
                    <ArrowPathIcon className="mr-1 h-4 w-4" /> 清空朗读结果
                  </Button>
                </div>
                {audioData.segments.some((segment) => segment.error) && (
                  <div className="rounded-xl bg-red-50 px-4 py-3 text-xs text-red-600">
                    部分段落合成失败：
                    {audioData.segments.filter((segment) => segment.error).map((segment) => (
                      <div key={segment.segmentIndex}>
                        第 {segment.segmentIndex + 1} 段 {segment.chapterTitle ? `· ${segment.chapterTitle}` : ''} — {segment.error}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </PointsSection>

          {chapters.length > 0 && (
            <PointsSection title="章节目录" layout="card" className={sectionTone}>
              <div className="flex flex-wrap gap-2">
                {chapters.map((chapter, index) => (
                  <button
                    key={chapter.title || index}
                    type="button"
                    onClick={() => handleScrollToChapter(index)}
                    className={`rounded-full border px-3 py-1 text-sm transition ${index === currentChapterIndex ? 'border-points-primary bg-points-primary/10 text-points-primary' : 'border-points-border text-points-text-muted hover:border-points-primary hover:text-points-primary'}`}
                  >
                    {index + 1}. {resolveChapterTitle(index, chapter)}
                  </button>
                ))}
              </div>
            </PointsSection>
          )}

          {timeline.length > 0 && (
            <PointsSection title="时间线" layout="card" className={sectionTone}>
              <div className="space-y-3">
                {timeline.map((event, index) => (
                  <div key={`${event.time}-${index}`} className="flex items-start gap-3 rounded-2xl bg-points-bg px-4 py-3">
                    <ClockIcon className="mt-1 h-4 w-4 text-points-primary" />
                    <div>
                      <p className="text-sm font-semibold text-points-text">{event.time}</p>
                      <p className="text-sm text-points-text-muted">{event.event}</p>
                    </div>
                  </div>
                ))}
              </div>
            </PointsSection>
          )}

          {characters.length > 0 && (
            <PointsSection title="主要人物" layout="card" className={sectionTone}>
              <div className="grid gap-3 md:grid-cols-2">
                {characters.map((character, index) => (
                  <div key={`${character.name}-${index}`} className="rounded-2xl bg-points-bg px-4 py-3">
                    <p className="text-sm font-semibold text-points-text">{character.name}</p>
                    <p className="text-xs text-points-text-muted">角色：{character.role || '未知'}</p>
                    {character.motive && (
                      <p className="mt-2 text-xs text-points-text-muted">动机：{character.motive}</p>
                    )}
                  </div>
                ))}
              </div>
            </PointsSection>
          )}

          {clues.length > 0 && (
            <PointsSection title="线索一览" layout="card" className={sectionTone}>
              <div className="space-y-3">
                {clues.map((clue, index) => (
                  <div key={`${clue.clue}-${index}`} className="rounded-2xl bg-points-bg px-4 py-3">
                    <p className="text-sm font-semibold text-points-text">{clue.clue}</p>
                    {clue.surfaceMeaning && (
                      <p className="text-xs text-points-text-muted">表面信息：{clue.surfaceMeaning}</p>
                    )}
                    {clue.realMeaning && (
                      <p className="text-xs text-points-text-muted">真实指向：{clue.realMeaning}</p>
                    )}
                  </div>
                ))}
              </div>
            </PointsSection>
          )}

          {validationResults.length > 0 && (
            <PointsSection title="校验结果" layout="card" className={sectionTone}>
              <div className="flex flex-wrap gap-2">
                {validationResults.map((result) => (
                  <span
                    key={result.ruleId}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${statusColor(result.status)}`}
                  >
                    {result.ruleId}
                  </span>
                ))}
              </div>
            </PointsSection>
          )}

          <PointsSection title="故事正文" layout="card" className={sectionTone}>
            <div className="space-y-8">
              {chapters.length === 0 ? (
                <p className="text-sm text-points-text-muted">暂无章节内容。</p>
              ) : (
                chapters.map((chapter, index) => (
                  <article
                    key={index}
                    data-reader-chapter="true"
                    data-index={index}
                    className="scroll-mt-24"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <h2 className="text-2xl font-semibold text-points-text">
                        第{index + 1}章 {resolveChapterTitle(index, chapter)}
                      </h2>
                      <Button
                        variant="ghost"
                        size="small"
                        onClick={() => handleSynthesizeChapter(index, chapter)}
                        disabled={isSynthesizing && ttsContext.mode === 'chapter' && ttsContext.chapterIndex === index}
                      >
                        {(isSynthesizing && ttsContext.mode === 'chapter' && ttsContext.chapterIndex === index) ? (
                          <span className="flex items-center gap-2"><LoadingSpinner size="small" /> 合成本章…</span>
                        ) : (
                          <span className="flex items-center gap-2"><SpeakerWaveIcon className="h-4 w-4" /> 朗读本章</span>
                        )}
                      </Button>
                    </div>
                    <p className="mt-2 whitespace-pre-line text-base leading-7 text-points-text">
                      {stripClueTags(chapter?.content)}
                    </p>
                  </article>
                ))
              )}
            </div>
          </PointsSection>

          <PointsSection layout="card" className={sectionTone}>
            <div className="flex flex-wrap gap-3 text-sm text-points-text-muted">
              <PointsBadge variant="success" icon={<CheckCircleIcon className="h-4 w-4" />}>
                故事生成完成
              </PointsBadge>
              <PointsBadge>
                {chapters.length} 个章节
              </PointsBadge>
              {workflow?.validation && (
                <PointsBadge>
                  校验规则 {workflow.validation.results.length} 项
                </PointsBadge>
              )}
              {audioData && (
                <PointsBadge>
                  朗读分段 {audioData.totalSegments}（缓存 {cachedSegments}）
                </PointsBadge>
              )}
            </div>
          </PointsSection>
        </div>
      )}
      </PointsPageShell>
    </>
  );
}
