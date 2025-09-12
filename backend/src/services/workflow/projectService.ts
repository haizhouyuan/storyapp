// Project Service for Story Workflow
import { Project, SearchQuery, ProjectMetrics, Dashboard } from '../../../shared/types/workflow';

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

export async function getProjects(userId: string, query: SearchQuery): Promise<{ projects: Project[]; total: number }> {
  const list = mockProjects.filter(
    p => p.ownerId === userId || p.collaborators?.some(c => c.userId === userId)
  );
  const sorted = list.sort((a, b) => +b.updatedAt - +a.updatedAt);
  const page = Math.max(1, query.page || 1);
  const limit = Math.min(query.limit || 20, 100);
  const start = (page - 1) * limit;
  return { projects: sorted.slice(start, start + limit), total: sorted.length };
}

export async function getProjectDashboard(projectId: string): Promise<Dashboard> {
  const p = mockProjects.find(x => x.id === projectId);
  if (!p) throw new Error('项目不存在');
  return {
    projectId,
    overview: { stage: p.status, completion: 50, health: 'good', lastActivity: new Date() },
    stageStatus: { [p.status]: { status: 'in_progress', completion: 50, issues: 0 } } as any,
    recentActivity: [], upcomingTasks: [], criticalIssues: []
  };
}

export async function getProjectMetrics(projectId: string): Promise<ProjectMetrics> {
  return {
    projectId, generatedAt: new Date(),
    fairnessScore: 80, senseIndexScore: 72, misdirectionStrength: 35, chekhovRecoveryRate: 60,
    totalClues: 12, sensoryClues: 8, totalProps: 5, recoveredProps: 3,
    totalMisdirections: 4, resolvedMisdirections: 2,
    logicConsistency: 78, readabilityIndex: 82, structuralIntegrity: 75,
    pacingWave: [], tensionCurve: [], informationDensity: []
  };
}
