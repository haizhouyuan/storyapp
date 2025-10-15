import { deriveWorkflowStatus } from '../src/models/DetectiveWorkflow';
import type { WorkflowStageState } from '@storyapp/shared';

describe('deriveWorkflowStatus', () => {
  it('returns pending when no stages', () => {
    expect(deriveWorkflowStatus([])).toBe('pending');
  });

  it('returns failed when any stage failed', () => {
    const states: WorkflowStageState[] = [
      { stage: 'stage1', status: 'completed' },
      { stage: 'stage2', status: 'failed' },
    ];
    expect(deriveWorkflowStatus(states)).toBe('failed');
  });

  it('returns completed when all completed', () => {
    const states: WorkflowStageState[] = [
      { stage: 'stage1', status: 'completed' },
      { stage: 'stage2', status: 'completed' },
    ];
    expect(deriveWorkflowStatus(states)).toBe('completed');
  });

  it('returns running when any running', () => {
    const states: WorkflowStageState[] = [
      { stage: 'stage1', status: 'completed' },
      { stage: 'stage2', status: 'running' },
      { stage: 'stage3', status: 'pending' },
    ];
    expect(deriveWorkflowStatus(states)).toBe('running');
  });
});
