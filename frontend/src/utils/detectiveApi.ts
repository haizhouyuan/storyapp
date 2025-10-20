import type {
  DetectiveWorkflowRecord,
  WorkflowListItem,
  CreateWorkflowResponse,
  RetryWorkflowResponse,
  RollbackWorkflowRequest,
  TerminateWorkflowRequest,
} from '@storyapp/shared';

const RAW_BASE = process.env.REACT_APP_API_URL ? process.env.REACT_APP_API_URL.replace(/\/$/, '') : '';
// If RAW_BASE already ends with '/api', avoid double '/api' when paths also include it
const API_BASE = RAW_BASE;


async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch((API_BASE.endsWith('/api') && path.startsWith('/api')) ? `${API_BASE}${path.replace(/^\/api/, '')}` : `${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    ...init,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const error = new Error(errorBody?.message || response.statusText);
    (error as any).status = response.status;
    (error as any).code = errorBody?.error;
    throw error;
  }

  const data = await response.json().catch(() => ({}));
  return data?.data ?? data;
}

export async function listWorkflows(params: { page?: number; limit?: number } = {}): Promise<{
  items: WorkflowListItem[];
  pagination: { page: number; limit: number; total: number; pages: number };
}> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  return request(`/api/story-workflows${query.toString() ? `?${query}` : ''}`);
}

export async function getWorkflow(id: string): Promise<DetectiveWorkflowRecord> {
  return request(`/api/story-workflows/${id}`);
}

export async function createWorkflow(topic: string, locale?: string): Promise<CreateWorkflowResponse> {
  return request('/api/story-workflows', {
    method: 'POST',
    body: JSON.stringify({ topic, locale }),
  });
}

export async function retryWorkflow(id: string): Promise<RetryWorkflowResponse> {
  return request(`/api/story-workflows/${id}/retry`, { method: 'POST' });
}

export async function terminateWorkflow(id: string, payload: TerminateWorkflowRequest): Promise<DetectiveWorkflowRecord> {
  return request(`/api/story-workflows/${id}/terminate`, {
    method: 'POST',
    body: JSON.stringify(payload ?? {}),
  });
}

export async function rollbackWorkflow(id: string, payload: RollbackWorkflowRequest): Promise<DetectiveWorkflowRecord> {
  return request(`/api/story-workflows/${id}/rollback`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}


// New: Projects & Blueprints API (M1/M2)
export async function createProject(title: string, locale?: string, protagonist?: any, constraints?: any): Promise<{ project: { project_id: string } }> {
  return request('/api/projects', {
    method: 'POST',
    body: JSON.stringify({ title, locale, protagonist, constraints }),
  });
}

export async function planProject(projectId: string, payload: { topic?: string; profile?: string; seed?: string; options?: any }): Promise<{ projectId: string; blueprintId: string; outline: any; schemaMeta?: any }> {
  return request(`/api/projects/${projectId}/plan`, {
    method: 'POST',
    body: JSON.stringify(payload || {}),
  });
}

export async function getBlueprint(blueprintId: string): Promise<{ outline: any }> {
  return request(`/api/blueprints/${blueprintId}`);
}

export async function writeScene(projectId: string, sceneId: string, payload?: { profile?: string; seed?: string; options?: any }): Promise<{ scene_id: string; chapter: any }> {
  return request(`/api/projects/${projectId}/write?scene_id=${encodeURIComponent(sceneId)}`, { method: 'POST', body: JSON.stringify(payload||{}) });
}

export async function editScene(projectId: string, sceneId?: string, chapter?: any, payload?: { profile?: string; seed?: string; options?: any }): Promise<{ scene_id: string; chapter: any }> {
  const qs = sceneId ? `?scene_id=${encodeURIComponent(sceneId)}` : '';
  return request(`/api/projects/${projectId}/edit${qs}`, {
    method: 'POST',
    body: JSON.stringify(chapter ? { chapter, ...(payload||{}) } : (payload||{})),
  });
}

export async function autoFix(projectId: string, payload: { draft?: any; chapter?: any; policy?: { ch1MinClues?: number; minExposures?: number }; updateOutlineExpected?: boolean }): Promise<{ draft: any; outlineUpdated: boolean; changes: any[]; outline?: any; harmonizeMeta?: any }> {
  return request(`/api/projects/${projectId}/autofix`, {
    method: 'POST',
    body: JSON.stringify(payload || {}),
  });
}

export async function compileProject(projectId: string, draft: any, format: 'html+interactive' = 'html+interactive'):
  Promise<{ urls: { html: string; interactive: string; plain: string }; plainText: string }>
{
  return request(`/api/projects/${projectId}/compile?format=${encodeURIComponent(format)}`, {
    method: 'POST',
    body: JSON.stringify({ draft }),
  });
}

export async function compileWorkflow(workflowId: string): Promise<{ urls: { html: string; interactive: string; plain: string }; plainText: string }> {
  return request(`/api/story-workflows/${workflowId}/compile`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}
