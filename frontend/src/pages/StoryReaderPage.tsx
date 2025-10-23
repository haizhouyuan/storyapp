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
import type {
  DetectiveWorkflowRecord,
  DetectiveChapter,
  DetectiveRevisionNote,
  DetectiveRevisionNoteCategory,
  DetectiveStoryAudioAsset,
  WorkflowEvent,
} from '@storyapp/shared';
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

type TtsContext = { mode: 'none' } | { mode: 'full' };

const DEFAULT_TTS_VOICE =
  process.env.REACT_APP_TTS_VOICE_ID || process.env.REACT_APP_TTS_VOICE || 'iflytek_yeting';
const DEFAULT_TTS_SPEED = Number(process.env.REACT_APP_TTS_SPEED ?? '1');

const CLUE_HIGHLIGHT_CLASS = 'rounded bg-emerald-100 px-1 text-emerald-800 shadow-inner';
const RED_HERRING_HIGHLIGHT_CLASS = 'rounded bg-amber-100 px-1 text-amber-800 shadow-inner';
const CRITICAL_VALIDATION_RULES = new Set(['timeline-from-text', 'chapter-time-tags', 'motive-foreshadowing']);
const REVISION_NOTE_CATEGORY_VALUES: DetectiveRevisionNoteCategory[] = ['model', 'system', 'validation', 'manual'];
const REVISION_NOTE_CATEGORY_META: Record<DetectiveRevisionNoteCategory, { label: string; badgeClass: string }> = {
  model: { label: '模型修订', badgeClass: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200' },
  system: { label: '系统自动', badgeClass: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200' },
  validation: { label: '校验处理', badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' },
  manual: { label: '人工备注', badgeClass: 'bg-slate-200 text-slate-700 dark:bg-slate-800/60 dark:text-slate-100' },
};
const REVISION_NOTE_SOURCE_LABELS: Record<string, string> = {
  'model-output': '模型输出',
  'auto-continuity': '连续性自动补写',
  'continuity-post-enforce': '连续性复核',
  'validation-must-fix': 'Must Fix 处理',
  'validation-warning': '警告核查',
};
const REVISION_STAGE_LABELS: Record<string, string> = {
  stage2_writing: 'Stage2 写作',
  stage3_review: 'Stage3 审阅',
  stage4_revision: 'Stage4 修订',
  stage5_validation: 'Stage5 校验',
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function buildHighlightedContent(chapter: DetectiveChapter): React.ReactNode[] {
  const text = stripClueTags(chapter?.content);
  if (!text) {
    return [<React.Fragment key="empty">（本章暂无正文）</React.Fragment>];
  }

  const phraseMap = new Map<string, { type: 'clue' | 'redHerring' }>();
  (chapter.cluesEmbedded || []).forEach((phrase) => {
    if (!phrase) return;
    phraseMap.set(phrase, { type: 'clue' });
  });
  (chapter.redHerringsEmbedded || []).forEach((phrase) => {
    if (!phrase) return;
    if (!phraseMap.has(phrase)) {
      phraseMap.set(phrase, { type: 'redHerring' });
    }
  });

  if (phraseMap.size === 0) {
    return [text];
  }

  const sortedPhrases = Array.from(phraseMap.keys()).sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`(${sortedPhrases.map(escapeRegExp).join('|')})`, 'g');
  const segments = text.split(pattern);

  return segments.map((segment, index) => {
    const meta = phraseMap.get(segment);
    if (!meta) {
      return <React.Fragment key={`seg-${index}`}>{segment}</React.Fragment>;
    }
    const className = meta.type === 'clue' ? CLUE_HIGHLIGHT_CLASS : RED_HERRING_HIGHLIGHT_CLASS;
    const dataAttr = meta.type === 'clue' ? 'clue-highlight' : 'red-herring-highlight';
    return (
      <span key={`seg-${index}`} className={className} data-testid={dataAttr}>
        {segment}
      </span>
    );
  });
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
  const [hasManuallyClearedAudio, setHasManuallyClearedAudio] = useState(false);

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

  useEffect(() => {
    setHasManuallyClearedAudio(false);
    setAudioData(null);
    setTtsContext({ mode: 'none' });
    setTtsHint('');
  }, [workflowId]);

  const chapters: DetectiveChapter[] = useMemo(
    () => workflow?.storyDraft?.chapters ?? [],
    [workflow?.storyDraft?.chapters],
  );

  const storyMarkdown = useMemo(() => draftToMarkdown(workflow?.storyDraft), [workflow?.storyDraft]);
  const validationSummary = workflow?.validation?.summary;
  const validationResults = useMemo(
    () => workflow?.validation?.results ?? [],
    [workflow?.validation?.results],
  );
  const timeline = workflow?.outline?.timeline ?? [];
  const characters = workflow?.outline?.characters ?? [];
  const clues = workflow?.outline?.clueMatrix ?? [];
  const ttsAssets: DetectiveStoryAudioAsset[] = useMemo(() => {
    const rawAssets = workflow?.storyDraft?.ttsAssets;
    return Array.isArray(rawAssets) ? rawAssets : [];
  }, [workflow?.storyDraft?.ttsAssets]);
  const latestReadyAsset = useMemo<DetectiveStoryAudioAsset | undefined>(() => {
    return ttsAssets.find((asset) => asset.status === 'ready' && Array.isArray(asset.segments) && asset.segments.length > 0);
  }, [ttsAssets]);
  const revisionNotes = useMemo<DetectiveRevisionNote[]>(() => {
    const raw = workflow?.storyDraft?.revisionNotes;
    if (!raw) return [];
    const array: unknown[] = Array.isArray(raw) ? raw : [raw];
    const resolveCategory = (value: unknown): DetectiveRevisionNoteCategory => {
      if (typeof value === 'string' && REVISION_NOTE_CATEGORY_VALUES.includes(value as DetectiveRevisionNoteCategory)) {
        return value as DetectiveRevisionNoteCategory;
      }
      return 'model';
    };
    const notes: DetectiveRevisionNote[] = [];
    array.forEach((item) => {
      if (typeof item === 'string') {
        const message = item.trim();
        if (!message) return;
        notes.push({ message, category: 'model' });
        return;
      }
      if (!item || typeof item !== 'object') {
        return;
      }
      const obj: any = item;
      const rawMessage: string =
        typeof obj.message === 'string'
          ? obj.message
          : typeof obj.detail === 'string'
          ? obj.detail
          : '';
      const message = String(rawMessage).trim();
      if (!message) {
        return;
      }
      const note: DetectiveRevisionNote = {
        message,
        category: resolveCategory(obj.category),
        stage: typeof obj.stage === 'string' ? obj.stage : undefined,
        source: typeof obj.source === 'string' ? obj.source : undefined,
        relatedRuleId:
          typeof obj.relatedRuleId === 'string'
            ? obj.relatedRuleId
            : typeof obj.ruleId === 'string'
            ? obj.ruleId
            : undefined,
        chapter:
          typeof obj.chapter === 'string'
            ? obj.chapter
            : typeof obj.chapterRef === 'string'
            ? obj.chapterRef
            : undefined,
        createdAt: typeof obj.createdAt === 'string' ? obj.createdAt : undefined,
        id: typeof obj.id === 'string' ? obj.id : undefined,
      };
      notes.push(note);
    });
    return notes;
  }, [workflow?.storyDraft?.revisionNotes]);
  const continuityNotes = workflow?.storyDraft?.continuityNotes ?? [];
  const validationBuckets = useMemo(() => {
    const fails = validationResults.filter((result) => result.status === 'fail');
    const warns = validationResults.filter((result) => result.status === 'warn');
    const passes = validationResults.filter((result) => result.status === 'pass');
    return { fails, warns, passes };
  }, [validationResults]);
  const criticalValidationWarns = useMemo(
    () => validationBuckets.warns.filter((result) => CRITICAL_VALIDATION_RULES.has(result.ruleId)),
    [validationBuckets.warns],
  );
  const hasValidationWarns = validationBuckets.warns.length > 0;
  const hasValidationFails = validationBuckets.fails.length > 0;
  const hasCriticalValidationWarns = criticalValidationWarns.length > 0;

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
    if (hasValidationFails) {
      setTtsHint('请先修复校验失败项后再尝试朗读生成。');
      toast.error('故事校验存在未解决的失败项，无法生成朗读音频');
      return;
    }
    if (hasValidationWarns) {
      setTtsHint('校验仍有警告，请完成修订后再生成朗读音频。');
      toast.error('校验仍有警告，请完成修订后再尝试朗读');
      return;
    }

    try {
      setHasManuallyClearedAudio(false);
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
      setHasManuallyClearedAudio(false);
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

  const handleClearAudio = () => {
    setAudioData(null);
    setTtsHint('');
    setTtsContext({ mode: 'none' });
    setHasManuallyClearedAudio(true);
  };

  const cachedSegments = audioData ? audioData.segments.filter((segment) => segment.cached).length : 0;

  const playbackTitle = useMemo(() => {
    if (ttsContext.mode === 'full') {
      return storyTitle;
    }
    return '';
  }, [chapters, storyTitle, ttsContext]);

  useEffect(() => {
    if (!latestReadyAsset) {
      return;
    }
    if (isSynthesizing) {
      return;
    }
    if (hasManuallyClearedAudio) {
      return;
    }
    if (
      audioData &&
      audioData.storyId === latestReadyAsset.storyId &&
      audioData.totalSegments === latestReadyAsset.segments.length
    ) {
      return;
    }
    const totalDuration = Number.isFinite(latestReadyAsset.totalDuration)
      ? (latestReadyAsset.totalDuration as number)
      : latestReadyAsset.segments.reduce((sum, segment) => sum + (segment.duration || 0), 0);
    const successCount = latestReadyAsset.segments.filter((segment) => !segment.error).length;
    const restoredAudio: StoryTtsBatchResponse = {
      success: true,
      status: 'ready',
      storyId: latestReadyAsset.storyId,
      totalSegments: latestReadyAsset.segments.length,
      successCount,
      totalDuration,
      segments: latestReadyAsset.segments,
    };
    setAudioData(restoredAudio);
    setTtsContext({ mode: 'full' });
    setTtsHint('朗读音频已生成，可直接播放。');
  }, [audioData, hasManuallyClearedAudio, isSynthesizing, latestReadyAsset]);

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
        stageStates={workflow?.stageStates}
        workflowStatus={workflow?.status}
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
                  故事由 5 个阶段生成完成（含自动修订与公平性校验），已自动嵌入线索提示。
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
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-points-text">{clue.clue}</p>
                      {clue.isRedHerring && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                          红鲱鱼
                        </span>
                      )}
                    </div>
                    {clue.surfaceMeaning && (
                      <p className="text-xs text-points-text-muted">表面信息：{clue.surfaceMeaning}</p>
                    )}
                    {clue.realMeaning && (
                      <p className="text-xs text-points-text-muted">真实指向：{clue.realMeaning}</p>
                    )}
                    {clue.explicitForeshadowChapters && clue.explicitForeshadowChapters.length > 0 && (
                      <p className="text-xs text-points-text-muted">
                        铺垫章节：{clue.explicitForeshadowChapters.join('、')}
                      </p>
                    )}
                    {typeof clue.appearsAtAct === 'number' && (
                      <p className="text-xs text-points-text-muted">首次出现幕次：Act {clue.appearsAtAct}</p>
                    )}
                  </div>
                ))}
              </div>
            </PointsSection>
          )}

          {revisionNotes.length > 0 && (
            <PointsSection
              title="修订说明"
              layout="card"
              className={`${sectionTone ?? ''} ${
                hasValidationWarns
                  ? 'border border-amber-400/70 bg-amber-50 text-amber-900 dark:border-amber-300 dark:bg-amber-900/30 dark:text-amber-100'
                  : ''
              }`.trim()}
            >
              {hasValidationWarns && (
                <div className="mb-3 rounded-xl bg-amber-100 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
                  ⚠️ 校验仍有 {validationBuckets.warns.length} 项警告
                  {hasCriticalValidationWarns && (
                    <>
                      ，其中重点修复：
                      {criticalValidationWarns
                        .map((warn) => {
                          const detail =
                            Array.isArray(warn.details) && warn.details.length > 0
                              ? warn.details[0]?.message
                              : warn.ruleId;
                          return detail || warn.ruleId;
                        })
                        .join('；')}
                    </>
                  )}
                  。请根据提示继续修订并重新运行生成流程。
                </div>
              )}
              <ul
                className={`space-y-2 text-xs ${
                  hasValidationWarns ? 'text-amber-900 dark:text-amber-100' : 'text-points-text-muted'
                }`}
              >
                {revisionNotes.map((note, index) => {
                  const key = note.id ?? `${note.category}-${index}`;
                  const categoryMeta = REVISION_NOTE_CATEGORY_META[note.category] ?? REVISION_NOTE_CATEGORY_META.model;
                  const stageLabel = note.stage ? REVISION_STAGE_LABELS[note.stage] ?? note.stage : undefined;
                  const sourceLabel = note.source ? REVISION_NOTE_SOURCE_LABELS[note.source] ?? note.source : undefined;
                  return (
                    <li
                      key={`revision-note-${key}`}
                      className="rounded-xl border border-points-border/60 bg-white/80 px-3 py-2 shadow-sm dark:border-white/20 dark:bg-slate-900/40"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium">
                        <span className={`rounded-full px-2 py-0.5 ${categoryMeta.badgeClass}`}>{categoryMeta.label}</span>
                        {stageLabel && (
                          <span className="text-points-text-muted dark:text-slate-200">阶段：{stageLabel}</span>
                        )}
                        {note.relatedRuleId && (
                          <span className="text-points-text-muted dark:text-slate-200">规则：{note.relatedRuleId}</span>
                        )}
                        {note.chapter && (
                          <span className="text-points-text-muted dark:text-slate-200">章节：{note.chapter}</span>
                        )}
                        {sourceLabel && (
                          <span className="text-points-text-muted dark:text-slate-200">来源：{sourceLabel}</span>
                        )}
                      </div>
                      <p
                        className={`mt-1 text-[13px] leading-5 ${
                          hasValidationWarns
                            ? 'text-amber-900 dark:text-amber-100'
                            : 'text-points-text-muted dark:text-slate-200'
                        }`}
                      >
                        {note.message}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </PointsSection>
          )}

          {continuityNotes.length > 0 && (
            <PointsSection title="连续性提醒" layout="card" className={sectionTone}>
              <ul className="list-disc space-y-1 pl-5 text-xs text-points-text-muted">
                {continuityNotes.map((note, index) => (
                  <li key={`continuity-note-${index}`}>{note}</li>
                ))}
              </ul>
            </PointsSection>
          )}

          {validationResults.length > 0 && (
            <PointsSection title="校验提醒" layout="card" className={sectionTone}>
              {validationBuckets.fails.length === 0 && validationBuckets.warns.length === 0 ? (
                <p className="text-sm text-points-text-muted">所有校验规则均已通过，无需额外处理。</p>
              ) : (
                <div className="space-y-3">
                  {[...validationBuckets.fails, ...validationBuckets.warns].map((result) => {
                    const detailMessages =
                      Array.isArray(result.details) && result.details.length > 0
                        ? result.details.map((detail, idx) => (
                            <li key={`${result.ruleId}-detail-${idx}`} className="leading-5">{detail.message}</li>
                          ))
                        : null;
                    const isCriticalWarn = result.status === 'warn' && CRITICAL_VALIDATION_RULES.has(result.ruleId);
                    const badgeLabel = result.status === 'fail' ? '需修复' : isCriticalWarn ? '必须修复' : '需关注';
                    const badgeClass =
                      result.status === 'fail'
                        ? 'bg-rose-100 text-rose-700'
                        : isCriticalWarn
                        ? 'bg-amber-200 text-amber-900'
                        : 'bg-amber-100 text-amber-700';
                    return (
                      <div
                        key={result.ruleId}
                        className={`rounded-2xl border px-4 py-3 ${
                          isCriticalWarn
                            ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-200 dark:bg-amber-900/40 dark:text-amber-100'
                            : 'border-points-border'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badgeClass}`}>
                            {badgeLabel}
                          </span>
                          <span className="text-xs text-points-text-muted">{result.ruleId}</span>
                        </div>
                        {detailMessages ? (
                          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-points-text-muted">
                            {detailMessages}
                          </ul>
                        ) : (
                          <p className="mt-2 text-xs text-points-text-muted">校验器未提供具体说明。</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {validationBuckets.passes.length > 0 && (
                <p className="mt-3 text-xs text-points-text-muted">
                  另有 {validationBuckets.passes.length} 项规则已通过。
                </p>
              )}
            </PointsSection>
          )}

          <PointsSection title="故事正文" layout="card" className={sectionTone}>
            <div className="space-y-8">
              {chapters.length === 0 ? (
                <p className="text-sm text-points-text-muted">暂无章节内容。</p>
              ) : (
                chapters.map((chapter, index) => {
                  const highlightedContent = buildHighlightedContent(chapter);
                  const uniqueClues = Array.from(new Set((chapter.cluesEmbedded || []).filter(Boolean)));
                  const uniqueHerrings = Array.from(new Set((chapter.redHerringsEmbedded || []).filter(Boolean)));
                  return (
                    <article
                      key={index}
                      data-reader-chapter="true"
                      data-index={index}
                      className="scroll-mt-24"
                    >
                      <h2 className="text-2xl font-semibold text-points-text">
                        第{index + 1}章 {resolveChapterTitle(index, chapter)}
                      </h2>
                      <p className="mt-2 whitespace-pre-line text-base leading-7 text-points-text">
                        {highlightedContent}
                      </p>
                      {(uniqueClues.length > 0 || uniqueHerrings.length > 0) && (
                        <div className="mt-3 flex flex-wrap gap-2 text-xs">
                          {uniqueClues.map((clue) => (
                            <span key={`clue-${clue}`} className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
                              线索：{clue}
                            </span>
                          ))}
                          {uniqueHerrings.map((red) => (
                            <span key={`red-${red}`} className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">
                              误导：{red}
                            </span>
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })
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
