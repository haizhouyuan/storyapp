export type PromptProfileName = 'strict' | 'balanced' | 'creative';

export interface PlannerPolicy {
  enforceDeviceKeywords: string[]; // e.g., ['风道','滑轮','潮汐','共振']
  requireCh1Foreshadow: boolean;
  includeTideOrWindPeakInTimeline: boolean;
}

export interface WriterPolicy {
  sentenceTarget?: number; // average sentence target length
  longSentenceThreshold?: number;
  includeInterrogationInFinal?: boolean; // add Q&A confrontation in chapter 3
  deviceHooksMinCount?: number; // at least N observable hooks appear in text
  chapter1CluesMinCount?: number; // at least N clues labeled in Chapter 1
}

export interface EditorPolicy {
  normalizePunctuation?: boolean;
}

export interface PromptProfile {
  name: PromptProfileName;
  planner: PlannerPolicy;
  writer: WriterPolicy;
  editor: EditorPolicy;
}

export const PROMPT_PROFILES: Record<PromptProfileName, PromptProfile> = {
  strict: {
    name: 'strict',
    planner: {
      enforceDeviceKeywords: ['风道', '滑轮', '潮汐', '共振'],
      requireCh1Foreshadow: true,
      includeTideOrWindPeakInTimeline: true,
    },
    writer: {
      sentenceTarget: 22,
      longSentenceThreshold: 30,
      includeInterrogationInFinal: true,
      deviceHooksMinCount: 2,
      chapter1CluesMinCount: 3,
    },
    editor: {
      normalizePunctuation: true,
    },
  },
  balanced: {
    name: 'balanced',
    planner: {
      enforceDeviceKeywords: ['风道', '潮汐', '共振'],
      requireCh1Foreshadow: true,
      includeTideOrWindPeakInTimeline: true,
    },
    writer: {
      sentenceTarget: 24,
      longSentenceThreshold: 32,
      includeInterrogationInFinal: true,
      deviceHooksMinCount: 2,
      chapter1CluesMinCount: 2,
    },
    editor: {
      normalizePunctuation: true,
    },
  },
  creative: {
    name: 'creative',
    planner: {
      enforceDeviceKeywords: ['风道', '共振'],
      requireCh1Foreshadow: false,
      includeTideOrWindPeakInTimeline: true,
    },
    writer: {
      sentenceTarget: 26,
      longSentenceThreshold: 36,
      includeInterrogationInFinal: false,
      deviceHooksMinCount: 1,
      chapter1CluesMinCount: 1,
    },
    editor: {
      normalizePunctuation: true,
    },
  },
};

export function resolvePromptProfile(name?: string | null): PromptProfile {
  const key = (name || process.env.DETECTIVE_PROMPT_PROFILE || 'balanced') as PromptProfileName;
  return PROMPT_PROFILES[key] ?? PROMPT_PROFILES.balanced;
}
