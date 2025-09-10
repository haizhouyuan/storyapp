export interface Story {
    id: string;
    title: string;
    content: string;
    created_at: string;
}
export interface StorySegment {
    text: string;
    choices: string[];
    isEnding: boolean;
}
export interface GenerateStoryRequest {
    topic: string;
    currentStory?: string;
    selectedChoice?: string;
    turnIndex?: number;
    maxChoices?: number;
    forceEnding?: boolean;
}
export interface GenerateStoryResponse {
    storySegment: string;
    choices: string[];
    isEnding: boolean;
}
export interface SaveStoryRequest {
    title: string;
    content: string;
    created_at?: string;
}
export interface SaveStoryResponse {
    success: boolean;
    storyId: string;
    message: string;
}
export interface GetStoriesResponse {
    stories: Array<{
        id: string;
        title: string;
        created_at: string;
        preview: string;
    }>;
}
export interface GetStoryResponse {
    id: string;
    title: string;
    content: string;
    created_at: string;
}
export interface StoryPath {
    segment: string;
    choice?: string;
    timestamp: number;
}
export interface StorySession {
    topic: string;
    path: StoryPath[];
    isComplete: boolean;
    startTime: number;
    maxChoices: number;
}
export interface ApiError {
    message: string;
    code?: string;
    status: number;
}
//# sourceMappingURL=types.d.ts.map
