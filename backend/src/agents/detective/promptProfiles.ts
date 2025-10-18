export type PromptProfileName = 'strict' | 'balanced' | 'creative';

export interface PlannerPolicy {
  enforceDeviceKeywords: string[]; // e.g., ['风道','滑轮','潮汐','共振']
  requireCh1Foreshadow: boolean;
  includeMechanismMilestones: boolean;
}

export interface WriterPolicy {
  sentenceTarget?: number; // average sentence target length
  longSentenceThreshold?: number;
  includeInterrogationInFinal?: boolean; // add Q&A confrontation in chapter 3
  deviceHooksMinCount?: number; // at least N observable hooks appear in text
  chapter1CluesMinCount?: number; // at least N clues labeled in Chapter 1
  maxRedHerringRatio?: number; // limit red herrings against total clues
  dialoguesMin?: number;
  sensoryHooks?: number;
  themeAnchors?: string[];
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
      enforceDeviceKeywords: [],
      requireCh1Foreshadow: true,
      includeMechanismMilestones: true,
    },
    writer: {
      sentenceTarget: 22,
      longSentenceThreshold: 30,
      includeInterrogationInFinal: true,
      deviceHooksMinCount: 2,
      chapter1CluesMinCount: 3,
      maxRedHerringRatio: 0.3,
      dialoguesMin: 6,
      sensoryHooks: 2,
      themeAnchors: [],
    },
    editor: {
      normalizePunctuation: true,
    },
  },
  balanced: {
    name: 'balanced',
    planner: {
      enforceDeviceKeywords: [],
      requireCh1Foreshadow: true,
      includeMechanismMilestones: true,
    },
    writer: {
      sentenceTarget: 24,
      longSentenceThreshold: 32,
      includeInterrogationInFinal: true,
      deviceHooksMinCount: 2,
      chapter1CluesMinCount: 2,
      maxRedHerringRatio: 0.32,
      dialoguesMin: 5,
      sensoryHooks: 2,
      themeAnchors: [],
    },
    editor: {
      normalizePunctuation: true,
    },
  },
  creative: {
    name: 'creative',
    planner: {
      enforceDeviceKeywords: [],
      requireCh1Foreshadow: false,
      includeMechanismMilestones: true,
    },
    writer: {
      sentenceTarget: 26,
      longSentenceThreshold: 36,
      includeInterrogationInFinal: false,
      deviceHooksMinCount: 1,
      chapter1CluesMinCount: 1,
      maxRedHerringRatio: 0.35,
      dialoguesMin: 4,
      sensoryHooks: 1,
      themeAnchors: [],
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
