import { Router } from 'express';
import { getDatabase } from '../config/database';
import { COLLECTIONS } from '../config/mongodb';
import { createLogger } from '../config/logger';

const router = Router();
const logger = createLogger('routes:blueprints');

// GET /api/blueprints/:blueprintId - 获取蓝图（DetectiveOutline）
router.get('/:blueprintId', async (req, res) => {
  const { blueprintId } = req.params as { blueprintId: string };
  try {
    const db = getDatabase();
    const bp = await db.collection(COLLECTIONS.STORY_BLUEPRINTS).findOne({ blueprintId });
    if (!bp) {
      return res.status(404).json({ success: false, error: 'blueprint_not_found' });
    }
    return res.json({ success: true, blueprintId, outline: bp.outline, blueprint: bp.blueprint });
  } catch (err: any) {
    logger.error({ err, blueprintId }, '获取蓝图失败');
    return res.status(500).json({ success: false, error: 'internal_error', message: String(err?.message || err) });
  }
});

export default router;
