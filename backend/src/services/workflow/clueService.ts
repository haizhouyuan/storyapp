// Clue Service for Story Workflow
import { Clue } from '../../../shared/types/workflow';

// Mock implementation - replace with actual database operations
let mockClues: Clue[] = [];

export async function getCluesByProjectId(projectId: string): Promise<Clue[]> {
  return mockClues.filter(c => c.projectId === projectId);
}

export async function getClueById(clueId: string): Promise<Clue | null> {
  return mockClues.find(c => c.id === clueId) || null;
}

export async function createClue(clue: Clue): Promise<Clue> {
  mockClues.push(clue);
  return clue;
}

export async function updateClue(clueId: string, updates: Partial<Clue>): Promise<Clue | null> {
  const index = mockClues.findIndex(c => c.id === clueId);
  if (index === -1) return null;
  
  mockClues[index] = { ...mockClues[index], ...updates, updatedAt: new Date() };
  return mockClues[index];
}

export async function deleteClue(clueId: string): Promise<boolean> {
  const index = mockClues.findIndex(c => c.id === clueId);
  if (index === -1) return false;
  
  mockClues.splice(index, 1);
  return true;
}
