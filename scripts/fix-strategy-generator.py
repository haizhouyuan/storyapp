#!/usr/bin/env python3
"""
修复策略生成器
基于错误分析结果生成具体的修复策略和可执行的修复指令
"""

import json
import sys
import argparse
import yaml
from typing import Dict, List, Optional, Tuple
from datetime import datetime
import os

class FixStrategyGenerator:
    def __init__(self, config_path: Optional[str] = None):
        """
        初始化修复策略生成器
        """
        self.config = self._load_config(config_path)
        self.fix_templates = self._load_fix_templates()

    def _load_config(self, config_path: Optional[str]) -> Dict:
        """
        加载配置文件
        """
        default_config = {
            'risk_tolerance': 'medium',  # low, medium, high
            'auto_fix_enabled': True,
            'max_fix_attempts': 3,
            'backup_before_fix': True,
            'test_after_fix': True,
            'rollback_on_failure': True
        }

        if config_path and os.path.exists(config_path):
            try:
                with open(config_path, 'r', encoding='utf-8') as f:
                    config = yaml.safe_load(f)
                    default_config.update(config)
            except Exception as e:
                print(f"警告: 无法加载配置文件 {config_path}: {e}", file=sys.stderr)

        return default_config

    def _load_fix_templates(self) -> Dict:
        """
        加载修复模板
        """
        return {
            'install_dependency': {
                'description': '安装缺失的依赖包',
                'commands': [
                    'npm install {package_name}',
                    'npm install {package_name}@{version}',
                    'yarn add {package_name}'
                ],
                'prerequisites': ['package.json exists'],
                'validation': ['npm ls {package_name}', 'node -e "require(\'{package_name}\')"'],
                'rollback': ['npm uninstall {package_name}'],
                'risk_level': 'low'
            },
            'type_fix': {
                'description': '修复TypeScript类型错误',
                'commands': [
                    'npx tsc --noEmit --skipLibCheck',
                    'npm run type-check'
                ],
                'file_changes': [
                    {
                        'pattern': 'Property \'{property}\' does not exist on type',
                        'fix': 'Add property to interface or use optional chaining'
                    }
                ],
                'prerequisites': ['tsconfig.json exists'],
                'validation': ['npx tsc --noEmit'],
                'risk_level': 'medium'
            },
            'security_update': {
                'description': '更新存在安全漏洞的依赖',
                'commands': [
                    'npm audit fix',
                    'npm audit fix --force',
                    'npm update {package_name}'
                ],
                'prerequisites': ['package-lock.json backup'],
                'validation': ['npm audit --audit-level=moderate'],
                'rollback': ['git checkout package-lock.json', 'npm install'],
                'risk_level': 'low'
            },
            'test_logic_fix': {
                'description': '修复测试逻辑错误',
                'analysis_steps': [
                    'analyze_test_failure',
                    'identify_root_cause',
                    'generate_fix_suggestion'
                ],
                'manual_review_required': True,
                'risk_level': 'high'
            },
            'timeout_fix': {
                'description': '修复测试超时问题',
                'commands': [
                    'increase_timeout_value',
                    'optimize_test_logic',
                    'add_async_wait'
                ],
                'file_patterns': ['**/*.test.js', '**/*.spec.ts'],
                'risk_level': 'low'
            },
            'syntax_fix': {
                'description': '修复语法错误',
                'commands': [
                    'npm run lint -- --fix',
                    'prettier --write {file_path}'
                ],
                'validation': ['npm run lint {file_path}'],
                'risk_level': 'low'
            },
            'file_check': {
                'description': '检查和恢复缺失文件',
                'analysis_steps': [
                    'verify_file_path',
                    'check_git_history',
                    'restore_or_create_file'
                ],
                'risk_level': 'medium'
            }
        }

    def generate_strategy(self, error_analysis: Dict) -> Dict:
        """
        基于错误分析结果生成修复策略
        """
        strategy = {
            'strategy_id': self._generate_strategy_id(error_analysis),
            'timestamp': datetime.utcnow().isoformat(),
            'error_hash': error_analysis.get('error_hash'),
            'fix_plan': {
                'strategy_type': error_analysis['analysis']['fix_strategy'],
                'confidence': error_analysis['analysis']['confidence'],
                'risk_level': error_analysis['analysis']['risk_level'],
                'auto_executable': False,
                'estimated_time': '5-10 minutes',
                'backup_required': self.config['backup_before_fix']
            },
            'execution_steps': [],
            'validation_steps': [],
            'rollback_plan': [],
            'prerequisites': [],
            'warnings': []
        }

        # 获取修复模板
        fix_strategy = error_analysis['analysis']['fix_strategy']
        template = self.fix_templates.get(fix_strategy, {})

        if not template:
            return self._generate_manual_review_strategy(error_analysis)

        # 生成执行步骤
        strategy['execution_steps'] = self._generate_execution_steps(
            error_analysis, template
        )

        # 生成验证步骤
        strategy['validation_steps'] = self._generate_validation_steps(
            error_analysis, template
        )

        # 生成回滚计划
        strategy['rollback_plan'] = self._generate_rollback_plan(
            error_analysis, template
        )

        # 检查前提条件
        strategy['prerequisites'] = self._check_prerequisites(
            error_analysis, template
        )

        # 生成警告信息
        strategy['warnings'] = self._generate_warnings(
            error_analysis, template
        )

        # 判断是否可以自动执行
        strategy['fix_plan']['auto_executable'] = self._is_auto_executable(
            error_analysis, template, strategy
        )

        return strategy

    def _generate_execution_steps(self, error_analysis: Dict, template: Dict) -> List[Dict]:
        """
        生成具体的执行步骤
        """
        steps = []
        error_type = error_analysis['analysis']['error_type']
        matched_patterns = error_analysis.get('matched_patterns', [])

        # 备份步骤
        if self.config['backup_before_fix']:
            steps.append({
                'step': 1,
                'action': 'backup',
                'description': '创建修复前备份',
                'command': 'git stash push -m "Pre-fix backup for {error_hash}"'.format(
                    error_hash=error_analysis.get('error_hash', 'unknown')
                ),
                'required': True
            })

        # 根据错误类型生成具体步骤
        if error_type == 'missing_module':
            package_name = self._extract_package_name(error_analysis)
            if package_name:
                steps.append({
                    'step': len(steps) + 1,
                    'action': 'install_dependency',
                    'description': f'安装缺失的依赖包: {package_name}',
                    'command': f'npm install {package_name}',
                    'required': True
                })

        elif error_type == 'type_error':
            steps.append({
                'step': len(steps) + 1,
                'action': 'type_check',
                'description': '运行TypeScript类型检查',
                'command': 'npx tsc --noEmit --skipLibCheck',
                'required': True
            })

        elif error_type == 'dependency_vulnerability':
            steps.append({
                'step': len(steps) + 1,
                'action': 'security_audit',
                'description': '执行安全漏洞修复',
                'command': 'npm audit fix',
                'required': True
            })

        elif error_type == 'syntax_error':
            steps.append({
                'step': len(steps) + 1,
                'action': 'lint_fix',
                'description': '自动修复代码格式和语法问题',
                'command': 'npm run lint -- --fix',
                'required': True
            })

        # 通用模板命令
        if 'commands' in template:
            for i, cmd in enumerate(template['commands']):
                if not any(step['command'] == cmd for step in steps):
                    steps.append({
                        'step': len(steps) + 1,
                        'action': 'execute_template',
                        'description': f'执行修复命令: {cmd}',
                        'command': cmd,
                        'required': False
                    })

        return steps

    def _generate_validation_steps(self, error_analysis: Dict, template: Dict) -> List[Dict]:
        """
        生成验证步骤
        """
        steps = []

        # 通用验证步骤
        steps.append({
            'step': 1,
            'action': 'build_check',
            'description': '验证构建是否成功',
            'command': 'npm run build',
            'success_criteria': 'exit code 0'
        })

        if self.config['test_after_fix']:
            steps.append({
                'step': 2,
                'action': 'test_check',
                'description': '运行测试验证修复效果',
                'command': 'npm test',
                'success_criteria': 'all tests pass'
            })

        # 模板特定验证
        if 'validation' in template:
            for i, validation_cmd in enumerate(template['validation']):
                steps.append({
                    'step': len(steps) + 1,
                    'action': 'template_validation',
                    'description': f'模板验证: {validation_cmd}',
                    'command': validation_cmd,
                    'success_criteria': 'command succeeds'
                })

        return steps

    def _generate_rollback_plan(self, error_analysis: Dict, template: Dict) -> List[Dict]:
        """
        生成回滚计划
        """
        rollback_steps = []

        if self.config['rollback_on_failure']:
            # 通用回滚步骤
            rollback_steps.append({
                'step': 1,
                'action': 'restore_backup',
                'description': '恢复修复前状态',
                'command': 'git stash pop',
                'condition': 'if backup exists'
            })

            # 模板特定回滚
            if 'rollback' in template:
                for i, rollback_cmd in enumerate(template['rollback']):
                    rollback_steps.append({
                        'step': len(rollback_steps) + 1,
                        'action': 'template_rollback',
                        'description': f'模板回滚: {rollback_cmd}',
                        'command': rollback_cmd,
                        'condition': 'if validation fails'
                    })

        return rollback_steps

    def _check_prerequisites(self, error_analysis: Dict, template: Dict) -> List[Dict]:
        """
        检查前提条件
        """
        prerequisites = []

        # 通用前提条件
        prerequisites.append({
            'condition': 'git_clean_working_tree',
            'description': 'Git工作树应该是干净的',
            'check_command': 'git status --porcelain',
            'required': True
        })

        # 模板特定前提条件
        if 'prerequisites' in template:
            for prereq in template['prerequisites']:
                prerequisites.append({
                    'condition': prereq,
                    'description': f'前提条件: {prereq}',
                    'required': True
                })

        return prerequisites

    def _generate_warnings(self, error_analysis: Dict, template: Dict) -> List[str]:
        """
        生成警告信息
        """
        warnings = []

        # 风险警告
        risk_level = error_analysis['analysis']['risk_level']
        if risk_level == 'high':
            warnings.append("高风险修复：建议人工审查后执行")
        elif risk_level == 'medium':
            warnings.append("中等风险修复：请确保有完整备份")

        # 置信度警告
        confidence = error_analysis['analysis']['confidence']
        if confidence < 0.7:
            warnings.append(f"修复置信度较低 ({confidence:.1%})，建议仔细验证")

        # 模板特定警告
        if template.get('manual_review_required'):
            warnings.append("此类错误需要人工审查，自动修复可能不够准确")

        return warnings

    def _is_auto_executable(self, error_analysis: Dict, template: Dict, strategy: Dict) -> bool:
        """
        判断是否可以自动执行
        """
        # 检查配置
        if not self.config['auto_fix_enabled']:
            return False

        # 检查风险级别
        risk_level = error_analysis['analysis']['risk_level']
        risk_tolerance = self.config['risk_tolerance']

        risk_levels = {'low': 1, 'medium': 2, 'high': 3}
        tolerance_levels = {'low': 1, 'medium': 2, 'high': 3}

        if risk_levels.get(risk_level, 3) > tolerance_levels.get(risk_tolerance, 2):
            return False

        # 检查置信度
        confidence = error_analysis['analysis']['confidence']
        if confidence < 0.8:
            return False

        # 检查是否需要人工审查
        if template.get('manual_review_required'):
            return False

        # 检查前提条件
        if not all(p.get('required', True) for p in strategy['prerequisites']):
            return False

        return True

    def _extract_package_name(self, error_analysis: Dict) -> Optional[str]:
        """
        从错误分析中提取包名
        """
        for pattern in error_analysis.get('matched_patterns', []):
            if pattern['type'] == 'missing_module' and pattern['matched_groups']:
                return pattern['matched_groups'][0]
        return None

    def _generate_strategy_id(self, error_analysis: Dict) -> str:
        """
        生成策略ID
        """
        error_hash = error_analysis.get('error_hash', 'unknown')
        strategy_type = error_analysis['analysis']['fix_strategy']
        timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
        return f"{strategy_type}_{error_hash}_{timestamp}"

    def _generate_manual_review_strategy(self, error_analysis: Dict) -> Dict:
        """
        生成需要人工审查的策略
        """
        return {
            'strategy_id': self._generate_strategy_id(error_analysis),
            'timestamp': datetime.utcnow().isoformat(),
            'error_hash': error_analysis.get('error_hash'),
            'fix_plan': {
                'strategy_type': 'manual_review',
                'confidence': 0.0,
                'risk_level': 'high',
                'auto_executable': False,
                'estimated_time': '30-60 minutes',
                'backup_required': True
            },
            'execution_steps': [{
                'step': 1,
                'action': 'manual_investigation',
                'description': '需要人工调查和修复',
                'command': '# 请人工分析错误并制定修复方案',
                'required': True
            }],
            'validation_steps': [{
                'step': 1,
                'action': 'manual_validation',
                'description': '人工验证修复效果',
                'command': '# 请人工验证修复是否成功',
                'success_criteria': 'manual verification'
            }],
            'rollback_plan': [],
            'prerequisites': [],
            'warnings': [
                '未识别的错误类型，需要人工处理',
                '请仔细分析错误根因后再进行修复'
            ]
        }

    def generate_batch_strategy(self, batch_analysis: Dict) -> Dict:
        """
        为批量错误分析生成整体修复策略
        """
        batch_strategy = {
            'batch_id': f"batch_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}",
            'timestamp': datetime.utcnow().isoformat(),
            'summary': batch_analysis['summary'],
            'execution_plan': {
                'total_errors': batch_analysis['summary']['total_errors'],
                'auto_fixable': batch_analysis['summary']['auto_fixable_errors'],
                'manual_review_required': 0,
                'estimated_total_time': '0 minutes'
            },
            'strategies': [],
            'execution_order': [],
            'global_prerequisites': [],
            'batch_warnings': []
        }

        # 为每个错误生成策略
        auto_fixable_count = 0
        manual_review_count = 0
        total_time_minutes = 0

        for error in batch_analysis['errors']:
            strategy = self.generate_strategy(error)
            batch_strategy['strategies'].append(strategy)

            if strategy['fix_plan']['auto_executable']:
                auto_fixable_count += 1
            else:
                manual_review_count += 1

            # 估算时间（简单解析）
            time_str = strategy['fix_plan']['estimated_time']
            if 'minute' in time_str:
                # 提取数字范围的平均值
                import re
                numbers = re.findall(r'\d+', time_str)
                if numbers:
                    avg_time = sum(int(n) for n in numbers) / len(numbers)
                    total_time_minutes += avg_time

        # 更新执行计划
        batch_strategy['execution_plan'].update({
            'auto_fixable': auto_fixable_count,
            'manual_review_required': manual_review_count,
            'estimated_total_time': f"{int(total_time_minutes)} minutes"
        })

        # 生成执行顺序（按风险级别和依赖关系排序）
        batch_strategy['execution_order'] = self._generate_execution_order(
            batch_strategy['strategies']
        )

        # 全局前提条件
        batch_strategy['global_prerequisites'] = [
            '确保Git工作树干净',
            '备份当前状态',
            '确认有足够的磁盘空间',
            '验证网络连接（用于下载依赖）'
        ]

        # 批量警告
        if manual_review_count > auto_fixable_count:
            batch_strategy['batch_warnings'].append(
                f"大部分错误({manual_review_count}/{batch_analysis['summary']['total_errors']})需要人工处理"
            )

        return batch_strategy

    def _generate_execution_order(self, strategies: List[Dict]) -> List[str]:
        """
        生成执行顺序
        """
        # 按风险级别排序：低风险优先
        risk_order = {'low': 1, 'medium': 2, 'high': 3}

        sorted_strategies = sorted(
            strategies,
            key=lambda s: (
                risk_order.get(s['fix_plan']['risk_level'], 3),
                -s['fix_plan']['confidence'],  # 高置信度优先
                not s['fix_plan']['auto_executable']  # 自动执行优先
            )
        )

        return [s['strategy_id'] for s in sorted_strategies]

    def export_strategy(self, strategy: Dict, output_format: str = 'json') -> str:
        """
        导出修复策略
        """
        if output_format == 'json':
            return json.dumps(strategy, indent=2, ensure_ascii=False)

        elif output_format == 'shell':
            return self._generate_shell_script(strategy)

        elif output_format == 'summary':
            return self._generate_summary_report(strategy)

        return str(strategy)

    def _generate_shell_script(self, strategy: Dict) -> str:
        """
        生成可执行的shell脚本
        """
        script_lines = [
            "#!/bin/bash",
            "# Auto-generated fix strategy script",
            f"# Strategy ID: {strategy['strategy_id']}",
            f"# Generated at: {strategy['timestamp']}",
            "",
            "set -e  # Exit on any error",
            "",
            "echo '=== Starting fix execution ==='",
            ""
        ]

        # 添加执行步骤
        for step in strategy['execution_steps']:
            script_lines.extend([
                f"echo 'Step {step['step']}: {step['description']}'",
                f"{step['command']}",
                "echo 'Step completed successfully'",
                ""
            ])

        # 添加验证步骤
        script_lines.extend([
            "echo '=== Running validation ==='",
            ""
        ])

        for step in strategy['validation_steps']:
            script_lines.extend([
                f"echo 'Validation: {step['description']}'",
                f"{step['command']}",
                ""
            ])

        script_lines.extend([
            "echo '=== Fix execution completed successfully ==='",
            ""
        ])

        return '\n'.join(script_lines)

    def _generate_summary_report(self, strategy: Dict) -> str:
        """
        生成摘要报告
        """
        lines = [
            "=== 修复策略摘要 ===",
            f"策略ID: {strategy['strategy_id']}",
            f"策略类型: {strategy['fix_plan']['strategy_type']}",
            f"风险级别: {strategy['fix_plan']['risk_level']}",
            f"置信度: {strategy['fix_plan']['confidence']:.1%}",
            f"可自动执行: {'是' if strategy['fix_plan']['auto_executable'] else '否'}",
            f"预估时间: {strategy['fix_plan']['estimated_time']}",
            "",
            "=== 执行步骤 ===",
        ]

        for step in strategy['execution_steps']:
            lines.append(f"{step['step']}. {step['description']}")

        if strategy['warnings']:
            lines.extend([
                "",
                "=== 警告信息 ===",
            ])
            for warning in strategy['warnings']:
                lines.append(f"⚠️  {warning}")

        return '\n'.join(lines)

def main():
    parser = argparse.ArgumentParser(description='修复策略生成器')
    parser.add_argument('--analysis-file', '-a', required=True, help='错误分析结果文件')
    parser.add_argument('--config', '-c', help='配置文件路径')
    parser.add_argument('--output', '-o', help='输出文件路径')
    parser.add_argument('--format', choices=['json', 'shell', 'summary'], default='json', help='输出格式')
    parser.add_argument('--batch', action='store_true', help='批量策略生成模式')

    args = parser.parse_args()

    # 读取分析结果
    try:
        with open(args.analysis_file, 'r', encoding='utf-8') as f:
            analysis_results = json.load(f)
    except FileNotFoundError:
        print(f"错误: 找不到分析文件 {args.analysis_file}", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError:
        print(f"错误: 无法解析JSON文件 {args.analysis_file}", file=sys.stderr)
        sys.exit(1)

    # 创建策略生成器
    generator = FixStrategyGenerator(args.config)

    # 生成策略
    if args.batch:
        strategy = generator.generate_batch_strategy(analysis_results)
    else:
        strategy = generator.generate_strategy(analysis_results)

    # 导出结果
    output = generator.export_strategy(strategy, args.format)

    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            f.write(output)
        print(f"修复策略已保存到: {args.output}")
    else:
        print(output)

if __name__ == '__main__':
    main()