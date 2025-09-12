// Prop Service for Story Workflow
import { Prop } from '../../types/workflow';

// Mock implementation - replace with actual database operations
let mockProps: Prop[] = [];

export async function getPropsByProjectId(projectId: string): Promise<Prop[]> {
  return mockProps.filter(p => p.projectId === projectId);
}

export async function getPropById(propId: string): Promise<Prop | null> {
  return mockProps.find(p => p.id === propId) || null;
}

export async function createProp(prop: Prop): Promise<Prop> {
  mockProps.push(prop);
  return prop;
}

export async function updateProp(propId: string, updates: Partial<Prop>): Promise<Prop | null> {
  const index = mockProps.findIndex(p => p.id === propId);
  if (index === -1) return null;
  
  mockProps[index] = { ...mockProps[index], ...updates, updatedAt: new Date() };
  return mockProps[index];
}

export async function deleteProp(propId: string): Promise<boolean> {
  const index = mockProps.findIndex(p => p.id === propId);
  if (index === -1) return false;
  
  mockProps.splice(index, 1);
  return true;
}
