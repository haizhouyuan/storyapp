// Timeline Service for Story Workflow
import { TimelineEvent } from '../../types/workflow';

// Mock implementation - replace with actual database operations
let mockEvents: TimelineEvent[] = [];

export async function getTimelineByProjectId(projectId: string): Promise<TimelineEvent[]> {
  return mockEvents.filter(e => e.projectId === projectId);
}

export async function createTimelineEvent(event: TimelineEvent): Promise<TimelineEvent> {
  mockEvents.push(event);
  return event;
}

export async function updateTimelineEvent(eventId: string, updates: Partial<TimelineEvent>): Promise<TimelineEvent | null> {
  const index = mockEvents.findIndex(e => e.id === eventId);
  if (index === -1) return null;
  
  mockEvents[index] = { ...mockEvents[index], ...updates, updatedAt: new Date() };
  return mockEvents[index];
}

export async function deleteTimelineEvent(eventId: string): Promise<boolean> {
  const index = mockEvents.findIndex(e => e.id === eventId);
  if (index === -1) return false;
  
  mockEvents.splice(index, 1);
  return true;
}
