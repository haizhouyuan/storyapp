import { Router, Request, Response } from 'express';
import { 
  Project,
  CreateProjectRequest,
  CreateProjectResponse,
  WorkflowStage,
  WORKFLOW_STAGES,
  ApiResponse,
  PaginatedResponse,
  SearchQuery
} from '../../../shared/types/workflow';
import { 
  createProject,
  getProjectById,
  getProjects,
  updateProject,
  deleteProject,
  getProjectDashboard,
  getProjectMetrics
} from '../../services/workflow/projectService';
import { validateCreateProject } from '../../validation/projectValidation';
import { authenticate, authorize } from '../../middleware/auth';

const router = Router();

/**
 * POST /api/workflow/projects
 * 创建新的故事创作项目
 */
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const createRequest: CreateProjectRequest = req.body;

    // 输入验证
    const validationResult = validateCreateProject(createRequest);
    if (!validationResult.isValid) {
      return res.status(400).json({
        success: false,
        errors: validationResult.errors,
        message: '项目创建数据验证失败'
      } as ApiResponse);
    }

    // 创建项目
    const project = await createProject({
      ...createRequest,
      ownerId: req.user.id
    });

    const response: CreateProjectResponse = {
      success: true,
      project,
      message: '项目创建成功'
    };

    res.status(201).json(response);
  } catch (error: any) {
    console.error('创建项目失败:', error);
    res.status(500).json({
      success: false,
      message: '创建项目时发生错误',
      errors: [error.message]
    } as ApiResponse);
  }
});

/**
 * GET /api/workflow/projects
 * 获取项目列表（支持分页和搜索）
 */
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const query: SearchQuery = {
      q: req.query.q as string,
      filters: req.query.filters ? JSON.parse(req.query.filters as string) : {},
      sort: req.query.sort as string || 'updatedAt',
      order: (req.query.order as 'asc' | 'desc') || 'desc',
      page: parseInt(req.query.page as string) || 1,
      limit: Math.min(parseInt(req.query.limit as string) || 20, 100)
    };

    const result = await getProjects(req.user.id, query);

    const response: PaginatedResponse<Project> = {
      items: result.projects,
      total: result.total,
      page: query.page!,
      limit: query.limit!,
      hasMore: result.total > query.page! * query.limit!
    };

    res.json({
      success: true,
      data: response,
      message: `找到 ${result.total} 个项目`
    } as ApiResponse<PaginatedResponse<Project>>);
  } catch (error: any) {
    console.error('获取项目列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取项目列表时发生错误',
      errors: [error.message]
    } as ApiResponse);
  }
});

/**
 * GET /api/workflow/projects/:id
 * 获取单个项目详情
 */
router.get('/:id', authenticate, authorize('project:read'), async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id;
    const project = await getProjectById(projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: '项目不存在'
      } as ApiResponse);
    }

    res.json({
      success: true,
      data: project,
      message: '获取项目详情成功'
    } as ApiResponse<Project>);
  } catch (error: any) {
    console.error('获取项目详情失败:', error);
    res.status(500).json({
      success: false,
      message: '获取项目详情时发生错误',
      errors: [error.message]
    } as ApiResponse);
  }
});

/**
 * PUT /api/workflow/projects/:id
 * 更新项目信息
 */
router.put('/:id', authenticate, authorize('project:write'), async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id;
    const updateData = req.body;

    const project = await updateProject(projectId, updateData);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: '项目不存在'
      } as ApiResponse);
    }

    res.json({
      success: true,
      data: project,
      message: '项目更新成功'
    } as ApiResponse<Project>);
  } catch (error: any) {
    console.error('更新项目失败:', error);
    res.status(500).json({
      success: false,
      message: '更新项目时发生错误',
      errors: [error.message]
    } as ApiResponse);
  }
});

/**
 * DELETE /api/workflow/projects/:id
 * 删除项目
 */
router.delete('/:id', authenticate, authorize('project:delete'), async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id;
    const success = await deleteProject(projectId);

    if (!success) {
      return res.status(404).json({
        success: false,
        message: '项目不存在'
      } as ApiResponse);
    }

    res.json({
      success: true,
      message: '项目删除成功'
    } as ApiResponse);
  } catch (error: any) {
    console.error('删除项目失败:', error);
    res.status(500).json({
      success: false,
      message: '删除项目时发生错误',
      errors: [error.message]
    } as ApiResponse);
  }
});

/**
 * POST /api/workflow/projects/:id/stages/:stage
 * 推进项目到下一个阶段
 */
router.post('/:id/stages/:stage', authenticate, authorize('project:write'), async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id;
    const stage = req.params.stage as WorkflowStage;
    const stageData = req.body;

    if (!WORKFLOW_STAGES[stage]) {
      return res.status(400).json({
        success: false,
        message: '无效的工作流阶段'
      } as ApiResponse);
    }

    // 根据不同阶段处理不同的数据
    const result = await advanceProjectStage(projectId, stage, stageData);

    res.json({
      success: true,
      data: result,
      message: `项目已推进到${WORKFLOW_STAGES[stage]}阶段`
    } as ApiResponse);
  } catch (error: any) {
    console.error('推进项目阶段失败:', error);
    res.status(500).json({
      success: false,
      message: '推进项目阶段时发生错误',
      errors: [error.message]
    } as ApiResponse);
  }
});

/**
 * GET /api/workflow/projects/:id/dashboard
 * 获取项目仪表盘数据
 */
router.get('/:id/dashboard', authenticate, authorize('project:read'), async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id;
    const dashboard = await getProjectDashboard(projectId);

    res.json({
      success: true,
      data: dashboard,
      message: '获取项目仪表盘成功'
    } as ApiResponse);
  } catch (error: any) {
    console.error('获取项目仪表盘失败:', error);
    res.status(500).json({
      success: false,
      message: '获取项目仪表盘时发生错误',
      errors: [error.message]
    } as ApiResponse);
  }
});

/**
 * GET /api/workflow/projects/:id/metrics
 * 获取项目指标数据
 */
router.get('/:id/metrics', authenticate, authorize('project:read'), async (req: Request, res: Response) => {
  try {
    const projectId = req.params.id;
    const metrics = await getProjectMetrics(projectId);

    res.json({
      success: true,
      data: metrics,
      message: '获取项目指标成功'
    } as ApiResponse);
  } catch (error: any) {
    console.error('获取项目指标失败:', error);
    res.status(500).json({
      success: false,
      message: '获取项目指标时发生错误',
      errors: [error.message]
    } as ApiResponse);
  }
});

// 辅助函数：推进项目阶段
async function advanceProjectStage(projectId: string, stage: WorkflowStage, stageData: any) {
  // 这里将根据不同的阶段调用不同的服务
  // 例如：如果是 center_miracle 阶段，则调用 miracleService
  // 如果是 clue_matrix 阶段，则调用 clueService 等
  
  switch (stage) {
    case 'project_init':
      // 项目立项阶段的处理逻辑
      break;
    case 'center_miracle':
      // 中心奇迹阶段的处理逻辑
      break;
    case 'chekhov_list':
      // 道具清单阶段的处理逻辑
      break;
    // ... 其他阶段
    default:
      throw new Error(`未实现的工作流阶段: ${stage}`);
  }
}

export default router;
