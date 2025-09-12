import { Router, Request, Response } from 'express';
import { 
  Miracle,
  UpdateMiracleRequest,
  GenerateMiracleRequest,
  GenerateMiracleResponse,
  ApiResponse
} from '../../types/workflow';
import { 
  createMiracle,
  getMiracleByProjectId,
  updateMiracle,
  deleteMiracle,
  generateMiracleAlternatives
} from '../../services/workflow/miracleService';
import { validateMiracle } from '../../validation/miracleValidation';
import { authenticate, authorize } from '../../middleware/auth';

const router = Router();

/**
 * POST /api/workflow/projects/:projectId/miracle
 * 创建或更新项目的中心奇迹
 */
router.post('/:projectId/miracle', authenticate, authorize('project:write'), async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId;
    const miracleData: UpdateMiracleRequest = req.body;

    // 输入验证
    const validationResult = validateMiracle(miracleData);
    if (!validationResult.isValid) {
      return res.status(400).json({
        success: false,
        errors: validationResult.errors,
        message: '中心奇迹数据验证失败'
      } as ApiResponse);
    }

    // 检查是否已存在，存在则更新，不存在则创建
    const existingMiracle = await getMiracleByProjectId(projectId);
    let miracle: Miracle;

    if (existingMiracle) {
      miracle = await updateMiracle(existingMiracle.id, miracleData);
    } else {
      miracle = await createMiracle(projectId, miracleData);
    }

    res.json({
      success: true,
      data: miracle,
      message: existingMiracle ? '中心奇迹更新成功' : '中心奇迹创建成功'
    } as ApiResponse<Miracle>);
  } catch (error: any) {
    console.error('处理中心奇迹失败:', error);
    res.status(500).json({
      success: false,
      message: '处理中心奇迹时发生错误',
      errors: [error.message]
    } as ApiResponse);
  }
});

/**
 * GET /api/workflow/projects/:projectId/miracle
 * 获取项目的中心奇迹
 */
router.get('/:projectId/miracle', authenticate, authorize('project:read'), async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId;
    const miracle = await getMiracleByProjectId(projectId);

    if (!miracle) {
      return res.status(404).json({
        success: false,
        message: '该项目尚未设置中心奇迹'
      } as ApiResponse);
    }

    res.json({
      success: true,
      data: miracle,
      message: '获取中心奇迹成功'
    } as ApiResponse<Miracle>);
  } catch (error: any) {
    console.error('获取中心奇迹失败:', error);
    res.status(500).json({
      success: false,
      message: '获取中心奇迹时发生错误',
      errors: [error.message]
    } as ApiResponse);
  }
});

/**
 * PUT /api/workflow/projects/:projectId/miracle
 * 更新项目的中心奇迹
 */
router.put('/:projectId/miracle', authenticate, authorize('project:write'), async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId;
    const miracleData: UpdateMiracleRequest = req.body;

    const existingMiracle = await getMiracleByProjectId(projectId);
    if (!existingMiracle) {
      return res.status(404).json({
        success: false,
        message: '该项目尚未设置中心奇迹'
      } as ApiResponse);
    }

    const miracle = await updateMiracle(existingMiracle.id, miracleData);

    res.json({
      success: true,
      data: miracle,
      message: '中心奇迹更新成功'
    } as ApiResponse<Miracle>);
  } catch (error: any) {
    console.error('更新中心奇迹失败:', error);
    res.status(500).json({
      success: false,
      message: '更新中心奇迹时发生错误',
      errors: [error.message]
    } as ApiResponse);
  }
});

/**
 * DELETE /api/workflow/projects/:projectId/miracle
 * 删除项目的中心奇迹
 */
router.delete('/:projectId/miracle', authenticate, authorize('project:write'), async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId;

    const existingMiracle = await getMiracleByProjectId(projectId);
    if (!existingMiracle) {
      return res.status(404).json({
        success: false,
        message: '该项目尚未设置中心奇迹'
      } as ApiResponse);
    }

    const success = await deleteMiracle(existingMiracle.id);
    if (!success) {
      throw new Error('删除中心奇迹失败');
    }

    res.json({
      success: true,
      message: '中心奇迹删除成功'
    } as ApiResponse);
  } catch (error: any) {
    console.error('删除中心奇迹失败:', error);
    res.status(500).json({
      success: false,
      message: '删除中心奇迹时发生错误',
      errors: [error.message]
    } as ApiResponse);
  }
});

/**
 * POST /api/workflow/ai/generate-miracle
 * 使用AI生成中心奇迹方案
 */
router.post('/ai/generate-miracle', authenticate, async (req: Request, res: Response) => {
  try {
    const generateRequest: GenerateMiracleRequest = req.body;

    if (!generateRequest.genreTags || generateRequest.genreTags.length === 0) {
      return res.status(400).json({
        success: false,
        message: '请提供类型标签'
      } as ApiResponse);
    }

    const alternatives = await generateMiracleAlternatives(generateRequest);

    const response: GenerateMiracleResponse = {
      success: true,
      alternatives,
      message: `生成了 ${alternatives.length} 个中心奇迹方案`
    };

    res.json(response);
  } catch (error: any) {
    console.error('生成中心奇迹失败:', error);
    res.status(500).json({
      success: false,
      message: '生成中心奇迹时发生错误',
      errors: [error.message]
    } as ApiResponse);
  }
});

/**
 * POST /api/workflow/projects/:projectId/miracle/validate
 * 验证中心奇迹的逻辑合理性
 */
router.post('/:projectId/miracle/validate', authenticate, authorize('project:read'), async (req: Request, res: Response) => {
  try {
    const projectId = req.params.projectId;
    
    const miracle = await getMiracleByProjectId(projectId);
    if (!miracle) {
      return res.status(404).json({
        success: false,
        message: '该项目尚未设置中心奇迹'
      } as ApiResponse);
    }

    // 运行中心奇迹的逻辑验证
    const validationResult = await validateMiracleLogic(miracle);

    res.json({
      success: true,
      data: validationResult,
      message: '中心奇迹验证完成'
    } as ApiResponse);
  } catch (error: any) {
    console.error('验证中心奇迹失败:', error);
    res.status(500).json({
      success: false,
      message: '验证中心奇迹时发生错误',
      errors: [error.message]
    } as ApiResponse);
  }
});

// 辅助函数：验证中心奇迹的逻辑
async function validateMiracleLogic(miracle: Miracle) {
  const validations = [];
  
  // 1. 检查传动链长度
  if (miracle.chain.length > 7) {
    validations.push({
      type: 'warning',
      message: `传动链节点过多 (${miracle.chain.length}/7)，建议简化`,
      suggestion: '考虑合并相似节点或引入并行路径'
    });
  }

  // 2. 检查是否包含必要的节点类型
  const nodeTypes = miracle.chain.map(node => node.type);
  const hasNatural = nodeTypes.includes('natural');
  const hasDevice = nodeTypes.includes('device');

  if (!hasNatural) {
    validations.push({
      type: 'error',
      message: '缺少自然力节点',
      suggestion: '添加自然现象作为触发源（如潮汐、风力、重力等）'
    });
  }

  if (!hasDevice) {
    validations.push({
      type: 'error',
      message: '缺少人工装置节点',
      suggestion: '添加机械装置来传递或放大自然力'
    });
  }

  // 3. 检查节点连接的完整性
  const nodeIds = miracle.chain.map(node => node.id);
  const invalidConnections = miracle.chain.filter(node => 
    node.connections.some(connId => !nodeIds.includes(connId))
  );

  if (invalidConnections.length > 0) {
    validations.push({
      type: 'error',
      message: '存在无效的节点连接',
      suggestion: '检查并修复断裂的传动链连接'
    });
  }

  // 4. 检查复现实验描述
  if (!miracle.replicationNote || miracle.replicationNote.length < 20) {
    validations.push({
      type: 'warning',
      message: '复现实验描述过于简单',
      suggestion: '详细描述如何通过实验验证该诡计的可行性'
    });
  }

  return {
    passed: validations.filter(v => v.type === 'error').length === 0,
    score: Math.max(0, 100 - validations.length * 15),
    validations
  };
}

export default router;
