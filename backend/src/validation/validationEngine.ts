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
} from '../../../shared/types/workflow';
import { getProjectById } from '../../services/workflow/projectService';
import { getMiracleByProjectId } from '../../services/workflow/miracleService';
import { getCluesByProjectId } from '../../services/workflow/clueService';
import { getPropsByProjectId } from '../../services/workflow/propService';
import { getTimelineByProjectId } from '../../services/workflow/timelineService';
import { getCharactersByProjectId } from '../../services/workflow/characterService';
import { getScenesByProjectId } from '../../services/workflow/sceneService';
import { getMisdirectionsByProjectId } from '../../services/workflow/misdirectionService';

export class ValidationEngine {
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
        miracle,
        clues,
        props,
        timeline,
        characters,
        scenes,
        misdirections
      ] = await Promise.all([
        getProjectById(projectId),
        getMiracleByProjectId(projectId),
        getCluesByProjectId(projectId),
        getPropsByProjectId(projectId),
        getTimelineByProjectId(projectId),
        getCharactersByProjectId(projectId),
        getScenesByProjectId(projectId),
        getMisdirectionsByProjectId(projectId)
      ]);

      this.project = project;
      this.miracle = miracle;
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

      // 检查线索出现时间是否合理（不能太晚）
      const lateClues = timely.filter(clue => {
        const clueChapter = this.parseChapterNumber(clue.first);
        const conclusionChapter = this.parseChapterNumber(conclusion.revealPoint);
        return (conclusionChapter - clueChapter) < 2; // 至少提前2章出现
      });

      if (lateClues.length > 0) {
        result.violations.push({
          elementId: conclusion.id,
          elementType: 'conclusion',
          description: `结论\"${conclusion.description}\"的部分线索出现过晚，读者推理时间不足`,
          severity: 'warning',
          suggestion: '建议将关键线索提前至少2章出现'
        });
      }
    }
  }

  /**
   * 验证Chekhov回收
   * 规则：∀prop，引入→起效→回收 均存在
   */
  private async validateChekhovRecovery(result: ValidationResult): Promise<void> {
    for (const prop of this.props) {
      const violations = [];

      if (!prop.chekhov.introduce || prop.chekhov.introduce.trim() === '') {
        violations.push('缺少引入位置');
      }

      if (!prop.chekhov.fire || prop.chekhov.fire.trim() === '') {
        violations.push('缺少起效位置');
      }

      if (!prop.chekhov.recover || prop.chekhov.recover.trim() === '') {
        violations.push('缺少回收位置');
      }

      if (violations.length > 0) {
        // 缺少回收位置是严重错误，其他是警告
        const severity = violations.includes('缺少回收位置') ? 'error' : 'warning';
        result.violations.push({
          elementId: prop.id,
          elementType: 'prop',
          description: `道具\"${prop.name}\"的Chekhov循环不完整: ${violations.join('、')}`,
          severity,
          suggestion: '请补充完整的引入→起效→回收流程'
        });
      }

      // 检查时序逻辑
      if (prop.chekhov.introduce && prop.chekhov.fire && prop.chekhov.recover) {
        const introduceChapter = this.parseChapterNumber(prop.chekhov.introduce);
        const fireChapter = this.parseChapterNumber(prop.chekhov.fire);
        const recoverChapter = this.parseChapterNumber(prop.chekhov.recover);

        if (introduceChapter >= fireChapter) {
          result.violations.push({
            elementId: prop.id,
            elementType: 'prop',
            description: `道具"${prop.name}"的引入时间晚于或等于起效时间`,
            severity: 'error',
            suggestion: '引入必须在起效之前'
          });
        }

        if (fireChapter > recoverChapter) {
          result.violations.push({
            elementId: prop.id,
            elementType: 'prop',
            description: `道具"${prop.name}"的起效时间晚于回收时间`,
            severity: 'error',
            suggestion: '起效必须在回收之前或同时'
          });
        }
      }
    }
  }

  /**
   * 验证时空一致性
   * 规则：同一角色在t1~t2间的移动距离 ≤ 空间图允许的最短路径
   */
  private async validateSpatialConsistency(result: ValidationResult): Promise<void> {
    for (const character of this.characters) {
      const events = character.timeline.sort((a, b) => 
        this.parseTime(a.time) - this.parseTime(b.time)
      );

      for (let i = 1; i < events.length; i++) {
        const prevEvent = events[i - 1];
        const currentEvent = events[i];
        
        if (prevEvent.location === currentEvent.location) {
          continue; // 同一地点，无需验证
        }

        const timeDiff = this.parseTime(currentEvent.time) - this.parseTime(prevEvent.time);
        const requiredTravelTime = this.calculateTravelTime(prevEvent.location, currentEvent.location);

        if (timeDiff < requiredTravelTime) {
          result.violations.push({
            elementId: character.id,
            elementType: 'character',
            description: `角色"${character.name}"在${prevEvent.time}-${currentEvent.time}间从"${prevEvent.location}"到"${currentEvent.location}"的移动时间不足`,
            severity: 'error',
            suggestion: `需要至少${requiredTravelTime}分钟移动时间，但只有${timeDiff}分钟`
          });
        }
      }
    }
  }

  /**
   * 验证误导强度
   * 规则：误导占比不超过40%且有反证场景
   */
  private async validateMisdirectionStrength(result: ValidationResult): Promise<void> {
    if (this.clues.length === 0) {
      return; // 没有线索，无需验证误导
    }

    const misdirectionRatio = this.misdirections.length / this.clues.length;
    
    if (misdirectionRatio > 0.4) {
      result.violations.push({
        elementId: 'project',
        elementType: 'misdirection',
        description: `误导强度过高 (${(misdirectionRatio * 100).toFixed(1)}% > 40%)`,
        severity: 'warning',
        suggestion: '减少误导线索或增加真实线索以平衡误导强度'
      });
    }

    // 检查每个误导是否有反证场景
    for (const misdirection of this.misdirections) {
      if (!misdirection.counterEvidence || misdirection.counterEvidence.length === 0) {
        result.violations.push({
          elementId: misdirection.id,
          elementType: 'misdirection',
          description: `误导"${misdirection.description}"缺少反证场景`,
          severity: 'warning',
          suggestion: '为每个误导添加反证场景以确保公平性'
        });
      }
    }
  }

  /**
   * 验证感官覆盖度
   * 规则：五感型线索占总线索60%以上
   */
  private async validateSensoryCoverage(result: ValidationResult): Promise<void> {
    if (this.clues.length === 0) {
      return;
    }

    // 使用归一化后的感官类型
    const normalizedClues = this.clues.map(clue => ({
      ...clue,
      senses: clue.senses.map(sense => this.normalizeSenseType(sense))
    }));

    const sensoryClues = normalizedClues.filter(clue => 
      clue.senses.some(sense => sense !== 'intellect')
    );

    const coverageRatio = sensoryClues.length / normalizedClues.length;

    if (coverageRatio < 0.6) {
      result.violations.push({
        elementId: 'project',
        elementType: 'clue',
        description: `感官线索覆盖度不足 (${(coverageRatio * 100).toFixed(1)}% < 60%)`,
        severity: 'info',
        suggestion: '增加更多涉及五感的线索以提高读者的沉浸感'
      });
    }

    // 检查各种感官的分布
    const senseDistribution: Record<SenseType, number> = {
      sight: 0,
      sound: 0,
      touch: 0,
      smell: 0,
      taste: 0,
      intellect: 0
    };

    for (const clue of normalizedClues) {
      for (const sense of clue.senses) {
        if (sense in senseDistribution) {
          senseDistribution[sense as SenseType]++;
        }
      }
    }

    // 视觉线索过多的警告
    if (senseDistribution.sight / normalizedClues.length > 0.7) {
      result.violations.push({
        elementId: 'project',
        elementType: 'clue',
        description: '视觉线索占比过高，缺乏感官多样性',
        severity: 'info',
        suggestion: '增加听觉、触觉、嗅觉等其他感官线索'
      });
    }

    // 缺失的感官类型
    const missingSenses = Object.entries(senseDistribution)
      .filter(([sense, count]) => sense !== 'intellect' && count === 0)
      .map(([sense]) => sense);

    if (missingSenses.length > 2) {
      result.violations.push({
        elementId: 'project',
        elementType: 'clue',
        description: `缺少多种感官类型的线索: ${missingSenses.join('、')}`,
        severity: 'info',
        suggestion: '尝试为故事添加更多感官维度的线索'
      });
    }
  }
  
  /**
   * 验证奇迹复杂度
   * 规则：奇迹链节点数>7时需要冗余说明
   */
  private async validateMiracleComplexity(result: ValidationResult): Promise<void> {
    if (!this.miracle) {
      return; // 没有奇迹时不验证
    }
    
    const chainLength = this.miracle.chain.length;
    
    if (chainLength > 7) {
      // 检查是否有冗余说明
      const hasRedundancyNote = this.miracle.tolerances && 
        this.miracle.tolerances.trim().length > 0;
      
      if (!hasRedundancyNote) {
        result.violations.push({
          elementId: this.miracle.id,
          elementType: 'miracle',
          description: `中心奇迹复杂度过高 (链节点数: ${chainLength} > 7)，缺少容差说明`,
          severity: 'warning',
          suggestion: '请在容差说明中添加冗余机制和容错空间的说明'
        });
      }
      
      // 检查是否有复现实验说明
      const hasReplicationNote = this.miracle.replicationNote && 
        this.miracle.replicationNote.trim().length > 0;
      
      if (!hasReplicationNote) {
        result.violations.push({
          elementId: this.miracle.id,
          elementType: 'miracle',
          description: `复杂奇迹缺少复现实验说明`,
          severity: 'warning',
          suggestion: '请添加复现实验说明，证明奇迹的可行性'
        });
      }
      
      // 检查弱点列表
      if (!this.miracle.weaknesses || this.miracle.weaknesses.length === 0) {
        result.violations.push({
          elementId: this.miracle.id,
          elementType: 'miracle',
          description: `复杂奇迹缺少弱点分析`,
          severity: 'info',
          suggestion: '请列出奇迹的潜在弱点和风险点'
        });
      }
    }
    
    // 检查过于简单的情况
    if (chainLength < 3) {
      result.violations.push({
        elementId: this.miracle.id,
        elementType: 'miracle',
        description: `中心奇迹过于简单 (链节点数: ${chainLength} < 3)`,
        severity: 'info',
        suggestion: '考虑增加更多的中间环节以提高谜题的复杂性'
      });
    }
  }
  
  /**
   * 验证场景感官要素
   * 规则：每个场景都应该包含适当的感官覆盖
   */
  private async validateSceneSensoryElements(result: ValidationResult): Promise<void> {
    if (this.scenes.length === 0) {
      return;
    }
    
    for (const scene of this.scenes) {
      const senseElements = scene.senseElements || {};
      const elementCount = Object.values(senseElements).filter(element => 
        element && element.trim().length > 0
      ).length;
      
      // 检查感官覆盖度
      if (elementCount < 2) {
        result.violations.push({
          elementId: scene.id,
          elementType: 'scene',
          description: `场景「${scene.title}」的感官要素不足 (${elementCount}/5)`,
          severity: 'info',
          suggestion: '请为场景添加更多的视觉、听觉、触觉、嗅觉或味觉描述'
        });
      }
      
      // 检查重要场景的感官要求
      const isImportantScene = scene.purpose.includes('揭示') || 
                              scene.purpose.includes('复盘') || 
                              scene.importance > 8;
      
      if (isImportantScene && elementCount < 3) {
        result.violations.push({
          elementId: scene.id,
          elementType: 'scene',
          description: `重要场景「${scene.title}」的感官覆盖不足`,
          severity: 'warning',
          suggestion: '重要场景应该具备更丰富的感官体验，建议至少包含3种感官要素'
        });
      }
      
      // 检查是否过度依赖视觉
      const hasOnlyVisual = senseElements.sight && 
                           !senseElements.sound && 
                           !senseElements.touch && 
                           !senseElements.smell && 
                           !senseElements.taste;
      
      if (hasOnlyVisual && elementCount === 1) {
        result.violations.push({
          elementId: scene.id,
          elementType: 'scene',
          description: `场景「${scene.title}」过度依赖视觉描述`,
          severity: 'info',
          suggestion: '试试添加一些非视觉的感官细节来增强场景的沉浸感'
        });
      }
    }
  }

  // ========== 辅助方法 ==========

  /**
   * 识别需要验证的结论点
   */
  private identifyConclusions() {
    const conclusions = [];
    
    // 从中心奇迹中提取结论点
    if (this.miracle) {
      conclusions.push({
        id: `miracle_${this.miracle.id}`,
        description: this.miracle.logline,
        revealPoint: '复盘', // 中心奇迹通常在复盘章揭示
        type: 'miracle' as const,
        importance: 10
      });
    }

    // 从场景中提取其他结论点
    for (const scene of this.scenes) {
      if (scene.purpose.includes('揭示') || scene.purpose.includes('复盘')) {
        conclusions.push({
          id: `scene_${scene.id}`,
          description: scene.title,
          revealPoint: `Ch${scene.chapterNumber}`,
          type: 'revelation' as const,
          importance: 7
        });
      }
    }

    return conclusions;
  }
  
  /**
   * 找到支持指定结论的线索
   */
  private findSupportingClues(conclusion: any) {
    // 方法1: 使用显式的supports关系
    let supportingClues = this.clues.filter(clue => 
      clue.supports && clue.supports.includes(conclusion.id)
    );
    
    // 方法2: 如果没有显式关系，使用章节关系和关键词匹配
    if (supportingClues.length === 0) {
      const conclusionChapter = this.parseChapterNumber(conclusion.revealPoint);
      
      supportingClues = this.clues.filter(clue => {
        const clueChapter = this.parseChapterNumber(clue.first);
        
        // 基本时间关系：线索必须在结论前出现
        if (clueChapter >= conclusionChapter) {
          return false;
        }
        
        // 关键词匹配：检查线索是否与结论相关
        if (conclusion.type === 'miracle' && this.miracle) {
          // 对于中心奇迹，检查线索是否涉及奇迹的关键词
          const miracleKeywords = this.miracle.logline.toLowerCase().split(/\s+/);
          const clueText = (clue.desc + ' ' + clue.truth + ' ' + clue.surface).toLowerCase();
          
          return miracleKeywords.some(keyword => 
            keyword.length > 2 && clueText.includes(keyword)
          );
        }
        
        // 对于其他类型的结论，使用更宽松的匹配
        const conclusionText = conclusion.description.toLowerCase();
        const clueText = (clue.desc + ' ' + clue.truth + ' ' + clue.surface).toLowerCase();
        
        return conclusionText.split('').some((char, index) => 
          char.length > 0 && clueText.includes(char) && 
          conclusionText.length > 2
        );
      });
    }
    
    return supportingClues;
  }
  
  /**
   * 归一化感官类型，将中英文感官名称统一转换
   */
  private normalizeSenseType(senseInput: string): SenseType {
    const sense = senseInput.toLowerCase().trim();
    
    // 中英文对照表
    const senseMapping: Record<string, SenseType> = {
      // 视觉
      'sight': 'sight',
      '视觉': 'sight',
      '看': 'sight',
      '眼': 'sight',
      '目': 'sight',
      'visual': 'sight',
      'see': 'sight',
      'vision': 'sight',
      
      // 听觉
      'sound': 'sound',
      '听觉': 'sound',
      '声音': 'sound',
      '听': 'sound',
      '耳': 'sound',
      'audio': 'sound',
      'hear': 'sound',
      'hearing': 'sound',
      
      // 触觉
      'touch': 'touch',
      '触觉': 'touch',
      '触摸': 'touch',
      '手': 'touch',
      'feel': 'touch',
      'tactile': 'touch',
      
      // 嗅觉
      'smell': 'smell',
      '嗅觉': 'smell',
      '气味': 'smell',
      '鼻': 'smell',
      'scent': 'smell',
      'odor': 'smell',
      'olfactory': 'smell',
      
      // 味觉
      'taste': 'taste',
      '味觉': 'taste',
      '发吃': 'taste',
      '舌': 'taste',
      'flavor': 'taste',
      'gustatory': 'taste',
      
      // 推理/智力
      'intellect': 'intellect',
      '推理': 'intellect',
      '智力': 'intellect',
      '思考': 'intellect',
      '逻辑': 'intellect',
      'logic': 'intellect',
      'reasoning': 'intellect',
      'mental': 'intellect'
    };
    
    return senseMapping[sense] || 'sight'; // 默认为视觉
  }

  /**
   * 解析章节编号
   * 支持标准格式（Ch1, Ch2）和特殊格式（复盘、尾声等）
   */
  private parseChapterNumber(chapterRef: string): number {
    // 标准章节格式
    const standardMatch = chapterRef.match(/Ch?(\d+)/i);
    if (standardMatch) {
      return parseInt(standardMatch[1]);
    }
    
    // 特殊章节标识
    const specialChapters: Record<string, number> = {
      '复盘': 99,     // 复盘章通常在最后
      '尾声': 100,    // 尾声在复盘之后
      '符录': 101,    // 附录在最后
      '后记': 102,    // 后记
      '序章': -1,     // 序章在最前面
      'prologue': -1,
      'epilogue': 100,
      'appendix': 101,
      'afterword': 102,
      '复盘章': 99
    };
    
    for (const [key, value] of Object.entries(specialChapters)) {
      if (chapterRef.toLowerCase().includes(key.toLowerCase())) {
        return value;
      }
    }
    
    // 如果都不匹配，返回0
    return 0;
  }

  /**
   * 解析时间（HH:MM格式转换为分钟）
   */
  private parseTime(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * 计算两地点间的移动时间（分钟）
   * 这里应该基于空间图计算最短路径，目前使用简化逻辑
   */
  private calculateTravelTime(fromLocation: string, toLocation: string): number {
    // 简化实现：不同楼层5分钟，同楼层不同房间2分钟
    if (fromLocation.includes('楼') && toLocation.includes('楼')) {
      if (fromLocation.split('楼')[0] !== toLocation.split('楼')[0]) {
        return 5; // 不同楼层
      }
    }
    return 2; // 同楼层或其他情况
  }

  /**
   * 根据违规计算分数
   */
  private calculateScore(violations: ValidationViolation[]): number {
    let score = 100;
    
    for (const violation of violations) {
      switch (violation.severity) {
        case 'error':
          score -= 20;
          break;
        case 'warning':
          score -= 10;
          break;
        case 'info':
          score -= 5;
          break;
      }
    }

    return Math.max(0, score);
  }
}

export default ValidationEngine;
