// Story Project & Blueprint Types (M1)
// 与现有 detective 类型并存，不影响现有 Stage1~4 使用。

export interface StoryProjectConstraints {
  reading_level?: 'early' | 'middle_grade' | 'ya' | string;
  max_words?: number;
  violence_rating?: 'none' | 'low' | 'medium' | 'high' | string;
  mystery_rigor?: 'low' | 'medium' | 'high' | string;
}

export interface StoryProject {
  project_id: string; // ulid/uuid
  title: string;
  locale?: string; // zh-CN, en-US
  protagonist?: { name: string; age?: number };
  constraints?: StoryProjectConstraints;
  blueprint_id?: string;
  draft_id?: string;
  status?: 'INIT' | 'BLUEPRINT_READY' | 'DRAFT_READY' | 'FINAL_READY';
}

// 精简版 Blueprint：与现有 DetectiveOutline 字段对应，便于过渡
export interface StoryBlueprintCastItem {
  id: string;
  name: string;
  role: string; // antagonist | accomplice | red-herring | foil | victim | detective | witness | ...
  motive?: string;
}

export interface StoryBlueprintLocation {
  id: string;
  name: string;
  kind?: string; // vertical | hub | utility | hidden | secret | ...
}

export interface StoryBlueprintClue {
  id: string;
  name: string;
  category?: string; // acoustic | mechanical | forensic | temporal | architecture | ...
  truth?: string;
  appears_in?: string[]; // ["S1","S8"]
}

export interface StoryBlueprintTimelineEvent {
  t: string; // ISO 或相对时刻，如 "19:00"
  event: string;
  loc?: string; // location id
}

export interface StoryBlueprintActBeat {
  scene_id: string; // S1
  type: string; // hook | explore | crime_scene | forensic | system | setback | discovery | tableau | resolution
  purpose: string;
}

export interface StoryBlueprintAct {
  act_no: number; // 1/2/3
  goal: string; // 设谜/调查/揭晓
  beats: StoryBlueprintActBeat[];
}

export interface StoryBlueprintFairnessPolicy {
  min_exposures_per_key_clue?: number;
  must_show_before_reveal?: string[]; // ["K1","K2",...]
  violent_ceiling?: 'none' | 'low' | 'medium' | 'high' | string;
}

export interface StoryBlueprint {
  blueprint_id: string;
  logline?: string;
  theme?: string[];
  setting?: { stage?: string; era?: string; weather?: string };
  central_device?: {
    type?: string;
    science_hooks?: string[];
    impossible_claim?: string;
  };
  cast?: StoryBlueprintCastItem[];
  locations?: StoryBlueprintLocation[];
  clues?: StoryBlueprintClue[];
  timeline?: StoryBlueprintTimelineEvent[];
  acts?: StoryBlueprintAct[];
  fairness_policy?: StoryBlueprintFairnessPolicy;
}

export type { StoryProject as StoryProjectType, StoryBlueprint as StoryBlueprintType };
