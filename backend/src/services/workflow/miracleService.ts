// Miracle Service for Story Workflow
import { Miracle, UpdateMiracleRequest, GenerateMiracleRequest, MiracleNode } from '../../../shared/types/workflow';
import { ObjectId } from 'mongodb';

// Mock implementation - replace with actual database operations
let mockMiracles: Miracle[] = [];

export async function getMiracleByProjectId(projectId: string): Promise<Miracle | null> {
  return mockMiracles.find(m => m.projectId === projectId) || null;
}

export async function createMiracle(projectId: string, data: UpdateMiracleRequest): Promise<Miracle> {
  const miracle: Miracle = {
    id: new ObjectId().toString(),
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

export async function updateMiracle(miracleId: string, updates: Partial<Miracle>): Promise<Miracle | null> {
  const index = mockMiracles.findIndex(m => m.id === miracleId);
  if (index === -1) return null;
  
  mockMiracles[index] = { ...mockMiracles[index], ...updates, updatedAt: new Date() };
  return mockMiracles[index];
}

export async function deleteMiracle(miracleId: string): Promise<boolean> {
  const index = mockMiracles.findIndex(m => m.id === miracleId);
  if (index === -1) return false;
  
  mockMiracles.splice(index, 1);
  return true;
}

export async function generateMiracleAlternatives(req: GenerateMiracleRequest) {
  // 简单占位实现，保证路由/CI可过
  const alt = (logline: string): { logline: string; chain: MiracleNode[]; tolerances: string; replicationNote: string } => ({
    logline,
    chain: [{ id: '1', node: '装置A', type: 'device', connections: ['2'] }, { id: '2', node: '自然力B', type: 'natural', connections: [] }],
    tolerances: '±30min',
    replicationNote: '实验可复现'
  });
  return [alt('方案一'), alt('方案二')];
}
