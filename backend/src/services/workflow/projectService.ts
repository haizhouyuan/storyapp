// Project Service for Story Workflow
import { Project } from '../../../shared/types/workflow';

// Mock implementation - replace with actual database operations
let mockProjects: Project[] = [];

export async function getProjectById(projectId: string): Promise<Project | null> {
  return mockProjects.find(p => p.id === projectId) || null;
}

export async function createProject(project: Project): Promise<Project> {
  mockProjects.push(project);
  return project;
}

export async function updateProject(projectId: string, updates: Partial<Project>): Promise<Project | null> {
  const index = mockProjects.findIndex(p => p.id === projectId);
  if (index === -1) return null;
  
  mockProjects[index] = { ...mockProjects[index], ...updates, updatedAt: new Date() };
  return mockProjects[index];
}

export async function deleteProject(projectId: string): Promise<boolean> {
  const index = mockProjects.findIndex(p => p.id === projectId);
  if (index === -1) return false;
  
  mockProjects.splice(index, 1);
  return true;
}

export async function getProjectsByUser(userId: string): Promise<Project[]> {
  return mockProjects.filter(p => 
    p.ownerId === userId || 
    p.collaborators.some(c => c.userId === userId)
  );
}
