// Scene Service for Story Workflow
import { Scene } from '../../types/workflow';

// Mock implementation - replace with actual database operations
let mockScenes: Scene[] = [];

export async function getScenesByProjectId(projectId: string): Promise<Scene[]> {
  return mockScenes.filter(s => s.projectId === projectId);
}

export async function getSceneById(sceneId: string): Promise<Scene | null> {
  return mockScenes.find(s => s.id === sceneId) || null;
}

export async function createScene(scene: Scene): Promise<Scene> {
  mockScenes.push(scene);
  return scene;
}

export async function updateScene(sceneId: string, updates: Partial<Scene>): Promise<Scene | null> {
  const index = mockScenes.findIndex(s => s.id === sceneId);
  if (index === -1) return null;
  
  mockScenes[index] = { ...mockScenes[index], ...updates, updatedAt: new Date() };
  return mockScenes[index];
}

export async function deleteScene(sceneId: string): Promise<boolean> {
  const index = mockScenes.findIndex(s => s.id === sceneId);
  if (index === -1) return false;
  
  mockScenes.splice(index, 1);
  return true;
}
