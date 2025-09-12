// Story Workflow Validation Engine
// 故事工作流自动化校验引擎

import { 
  Project,
  Miracle,
  Clue,
  Prop,
  TimelineEvent,
  Character,
  Scene,
  Misdirection,
  ValidationResult,
  ValidationViolation,
  ValidationRule,
  DEFAULT_VALIDATION_RULES,
  SenseType
} from '@storyapp/shared';
import { getProjectById } from '../services/workflow/projectService';
import { getMiraclesByProjectId } from '../services/workflow/miracleService';
import { getCluesByProjectId } from '../services/workflow/clueService';
import { getPropsByProjectId } from '../services/workflow/propService';
import { getTimelineByProjectId } from '../services/workflow/timelineService';
import { getCharactersByProjectId } from '../services/workflow/characterService';
import { getScenesByProjectId } from '../services/workflow/sceneService';
import { getMisdirectionsByProjectId } from '../services/workflow/misdirectionService';

class ValidationEngine {
  private project: Project | null = null;
  private miracle: Miracle | null = null;
  private clues: Clue[] = [];
  private props: Prop[] = [];
  private timeline: TimelineEvent[] = [];
  private characters: Character[] = [];
  private scenes: Scene[] = [];
  private misdirections: Misdirection[] = [];

  /**
   * 运行项目的完整验证
   */
  async validateProject(projectId: string, ruleIds?: string[]): Promise<ValidationResult[]> {
    // 加载项目数据
    await this.loadProjectData(projectId);
    
    if (!this.project) {
      throw new Error('项目不存在');
    }

    // 确定要运行的验证规则
    const rulesToRun = ruleIds 
      ? DEFAULT_VALIDATION_RULES.filter(rule => ruleIds.includes(rule.id))
      : DEFAULT_VALIDATION_RULES;

    const results: ValidationResult[] = [];

    // 执行每个验证规则
    for (const rule of rulesToRun) {
      try {
        const result = await this.runValidationRule(rule, projectId);
        results.push(result);
      } catch (error) {
        console.error(`验证规则 ${rule.id} 执行失败:`, error);
        results.push({
          ruleId: rule.id,
          projectId,
          passed: false,
          violations: [{
            elementId: 'validation_engine',
            elementType: 'system',
            description: `验证规则执行失败: ${(error as Error).message}`,
            severity: 'error'
          }],
          runAt: new Date()
        });
      }
    }

    return results;
  }

  /**
   * 加载项目相关数据
   */
  private async loadProjectData(projectId: string): Promise<void> {
    try {
      // 并行加载所有数据
      const [
        project,
        miracles,
        clues,
        props,
        timeline,
        characters,
        scenes,
        misdirections
      ] = await Promise.all([
        getProjectById(projectId),
        getMiraclesByProjectId(projectId),
        getCluesByProjectId(projectId),
        getPropsByProjectId(projectId),
        getTimelineByProjectId(projectId),
        getCharactersByProjectId(projectId),
        getScenesByProjectId(projectId),
        getMisdirectionsByProjectId(projectId)
      ]);

      this.project = project;
      this.miracle = miracles && miracles.length > 0 ? miracles[0] : null;
      this.clues = clues || [];
      this.props = props || [];
      this.timeline = timeline || [];
      this.characters = characters || [];
      this.scenes = scenes || [];
      this.misdirections = misdirections || [];
    } catch (error) {
      console.error('加载项目数据失败:', error);
      throw new Error('无法加载项目数据');
    }
  }

  /**
   * 执行单个验证规则
   */
  private async runValidationRule(rule: ValidationRule, projectId: string): Promise<ValidationResult> {
    const result: ValidationResult = {
      ruleId: rule.id,
      projectId,
      passed: true,
      violations: [],
      runAt: new Date()
    };

    switch (rule.id) {
      case 'fairness_timeline':
        await this.validateFairnessTimeline(result);
        break;
      case 'chekhov_recovery':
        await this.validateChekhovRecovery(result);
        break;
      case 'spatial_consistency':
        await this.validateSpatialConsistency(result);
        break;
      case 'misdirection_strength':
        await this.validateMisdirectionStrength(result);
        break;
      case 'sensory_coverage':
        await this.validateSensoryCoverage(result);
        break;
      case 'miracle_complexity':
        await this.validateMiracleComplexity(result);
        break;
      case 'scene_sensory_elements':
        await this.validateSceneSensoryElements(result);
        break;
      default:
        throw new Error(`未知的验证规则: ${rule.id}`);
    }

    // 计算分数
    result.passed = result.violations.filter(v => v.severity === 'error').length === 0;
    result.score = this.calculateScore(result.violations);

    return result;
  }

  /**
   * 验证公平线索时序
   * 规则：∀结论C，∃线索集合S，使得 S.firstAppearance < C.revealPoint 且 |S| ≥ 2
   */
  private async validateFairnessTimeline(result: ValidationResult): Promise<void> {
    if (!this.miracle) {
      result.violations.push({
        elementId: 'project',
        elementType: 'miracle',
        description: '缺少中心奇迹，无法验证公平性',
        severity: 'error',
        suggestion: '请先完成中心奇迹的设计'
      });
      return;
    }

    // 识别需要验证的结论点
    const conclusions = this.identifyConclusions();
    
    for (const conclusion of conclusions) {
      // 使用新的支持关系或章节关系匹配线索
      const supportingClues = this.findSupportingClues(conclusion);
      const timely = supportingClues.filter(clue => 
        this.parseChapterNumber(clue.first) < this.parseChapterNumber(conclusion.revealPoint)
      );

      if (timely.length < 2) {
        result.violations.push({
          elementId: conclusion.id,
          elementType: 'conclusion',
          description: `结论\"${conclusion.description}\"的支持线索不足 (${timely.length}/2)，总共找到${supportingClues.length}个相关线索`,
          severity: 'error',
          suggestion: '请在结论揭示前添加至少2个支持线索，或更新线索的supports属性'
        });
      }
    }
  }

  // Placeholder implementations for other validation methods
  private async validateChekhovRecovery(result: ValidationResult): Promise<void> {
    // Placeholder implementation
  }

  private async validateSpatialConsistency(result: ValidationResult): Promise<void> {
    // Placeholder implementation
  }

  private async validateMisdirectionStrength(result: ValidationResult): Promise<void> {
    // Placeholder implementation
  }

  private async validateSensoryCoverage(result: ValidationResult): Promise<void> {
    // Placeholder implementation
  }

  private async validateMiracleComplexity(result: ValidationResult): Promise<void> {
    // Placeholder implementation
  }

  private async validateSceneSensoryElements(result: ValidationResult): Promise<void> {
    // Placeholder implementation
  }

  private identifyConclusions(): any[] {
    // Placeholder implementation
    return [];
  }

  private findSupportingClues(conclusion: any): any[] {
    // Placeholder implementation
    return [];
  }

  private parseChapterNumber(chapter: string): number {
    // Placeholder implementation
    return 1;
  }

  private calculateScore(violations: ValidationViolation[]): number {
    // Simple scoring based on violation severity
    const errorWeight = -10;
    const warningWeight = -3;
    const infoWeight = -1;
    
    let score = 100;
    for (const violation of violations) {
      switch (violation.severity) {
        case 'error': score += errorWeight; break;
        case 'warning': score += warningWeight; break;
        case 'info': score += infoWeight; break;
      }
    }
    
    return Math.max(0, score);
  }
}

export default ValidationEngine;