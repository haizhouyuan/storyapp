// Miracle Service for Story Workflow
import { Miracle, GenerateMiracleRequest, UpdateMiracleRequest, MiracleNode } from '../../types/workflow';
// Using string ObjectId for temporary build compatibility

// Mock implementation - replace with actual database operations
let mockMiracles: Miracle[] = [];

export async function getMiracleByProjectId(projectId: string): Promise<Miracle | null> {
  return mockMiracles.find(m => m.projectId === projectId) || null;
}

export async function getMiraclesByProjectId(projectId: string): Promise<Miracle[]> {
  return mockMiracles.filter(m => m.projectId === projectId);
}

export async function createMiracle(projectId: string, data: UpdateMiracleRequest): Promise<Miracle> {
  const miracle: Miracle = {
    id: Math.random().toString(36).substr(2, 9), // temporary ID generation
    projectId,
    logline: data.logline,
    chain: data.chain.map((n, i) => ({ id: String(i + 1), ...n })),
    tolerances: data.tolerances,
    replicationNote: data.replicationNote,
    weaknesses: data.weaknesses || [],
    createdAt: new Date(),
    updatedAt: new Date()
  };
  mockMiracles.push(miracle);
  return miracle;
}

export async function updateMiracle(miracleId: string, data: UpdateMiracleRequest): Promise<Miracle> {
  const index = mockMiracles.findIndex(m => m.id === miracleId);
  if (index === -1) {
    throw new Error('Miracle not found');
  }
  
  // Convert UpdateMiracleRequest to partial Miracle update
  const updates: Partial<Miracle> = {
    logline: data.logline,
    chain: data.chain.map((n, i) => ({ id: String(i + 1), ...n })),
    tolerances: data.tolerances,
    replicationNote: data.replicationNote,
    weaknesses: data.weaknesses || [],
    updatedAt: new Date()
  };
  
  mockMiracles[index] = { ...mockMiracles[index], ...updates };
  return mockMiracles[index];
}

export async function deleteMiracle(miracleId: string): Promise<boolean> {
  const index = mockMiracles.findIndex(m => m.id === miracleId);
  if (index === -1) return false;
  
  mockMiracles.splice(index, 1);
  return true;
}

export async function generateMiracleAlternatives(req: GenerateMiracleRequest): Promise<Miracle[]> {
  // 简单占位实现，保证路由/CI可过
  const createAlt = (logline: string): Miracle => ({
    id: Math.random().toString(36).substr(2, 9),
    projectId: 'generated',
    logline,
    chain: [{ id: '1', node: '装置A', type: 'device', connections: ['2'] }, { id: '2', node: '自然力B', type: 'natural', connections: [] }],
    tolerances: '±30min',
    replicationNote: '实验可复现',
    weaknesses: [],
    createdAt: new Date(),
    updatedAt: new Date()
  });
  return [createAlt('方案一'), createAlt('方案二')];
}

export async function validateMiracleLogic(miracle: Miracle) {
  // Placeholder implementation for miracle logic validation
  return {
    valid: true,
    score: 85,
    violations: [],
    suggestions: []
  };
}
