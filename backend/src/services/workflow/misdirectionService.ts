// Misdirection Service for Story Workflow
import { Misdirection } from '../../../shared/types/workflow';

// Mock implementation - replace with actual database operations
let mockMisdirections: Misdirection[] = [];

export async function getMisdirectionsByProjectId(projectId: string): Promise<Misdirection[]> {
  return mockMisdirections.filter(m => m.projectId === projectId);
}

export async function getMisdirectionById(misdirectionId: string): Promise<Misdirection | null> {
  return mockMisdirections.find(m => m.id === misdirectionId) || null;
}

export async function createMisdirection(misdirection: Misdirection): Promise<Misdirection> {
  mockMisdirections.push(misdirection);
  return misdirection;
}

export async function updateMisdirection(misdirectionId: string, updates: Partial<Misdirection>): Promise<Misdirection | null> {
  const index = mockMisdirections.findIndex(m => m.id === misdirectionId);
  if (index === -1) return null;
  
  mockMisdirections[index] = { ...mockMisdirections[index], ...updates, updatedAt: new Date() };
  return mockMisdirections[index];
}

export async function deleteMisdirection(misdirectionId: string): Promise<boolean> {
  const index = mockMisdirections.findIndex(m => m.id === misdirectionId);
  if (index === -1) return false;
  
  mockMisdirections.splice(index, 1);
  return true;
}
