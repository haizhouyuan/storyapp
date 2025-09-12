// Character Service for Story Workflow
import { Character } from '@storyapp/shared';

// Mock implementation - replace with actual database operations
let mockCharacters: Character[] = [];

export async function getCharactersByProjectId(projectId: string): Promise<Character[]> {
  return mockCharacters.filter(c => c.projectId === projectId);
}

export async function getCharacterById(characterId: string): Promise<Character | null> {
  return mockCharacters.find(c => c.id === characterId) || null;
}

export async function createCharacter(character: Character): Promise<Character> {
  mockCharacters.push(character);
  return character;
}

export async function updateCharacter(characterId: string, updates: Partial<Character>): Promise<Character | null> {
  const index = mockCharacters.findIndex(c => c.id === characterId);
  if (index === -1) return null;
  
  mockCharacters[index] = { ...mockCharacters[index], ...updates, updatedAt: new Date() };
  return mockCharacters[index];
}

export async function deleteCharacter(characterId: string): Promise<boolean> {
  const index = mockCharacters.findIndex(c => c.id === characterId);
  if (index === -1) return false;
  
  mockCharacters.splice(index, 1);
  return true;
}
