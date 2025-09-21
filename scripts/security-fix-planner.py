#!/usr/bin/env python3
"""
安全修复规划器
分析安全漏洞并生成详细的修复计划，支持不同严重级别的修复策略
"""

import json
import sys
import argparse
from typing import Dict, List, Optional, Tuple
from datetime import datetime
import re

class SecurityFixPlanner:
    def __init__(self):
        """
        初始化安全修复规划器
        """
        self.severity_weights = {
            'critical': 10,
            'high': 8,
            'moderate': 5,
            'low': 2,
            'info': 1
        }

        self.fix_strategies = {
            'auto_fix': {
                'description': '自动修复 - 风险低，影响小的漏洞',
                'criteria': {
                    'max_severity': 'moderate',
                    'max_major_version_changes': 2,
                    'allow_breaking_changes': False
                },
                'actions': ['npm audit fix', 'selective dependency updates']
            },
            'selective_fix': {
                'description': '选择性修复 - 仅修复高危和严重漏洞',
                'criteria': {
                    'min_severity': 'high',
                    'max_major_version_changes': 5,
                    'allow_breaking_changes': True
                },
                'actions': ['npm audit fix --audit-level=high', 'manual version updates']
            },
            'manual_review': {
                'description': '人工审查 - 复杂情况需要人工判断',
                'criteria': {
                    'complex_dependencies': True,
                    'major_framework_updates': True,
                    'custom_patches_required': True
                },
                'actions': ['detailed analysis', 'custom fixes', 'comprehensive testing']
            }
        }

        # 关键依赖包列表（需要特别小心处理）
        self.critical_packages = {
            'react', 'react-dom', 'vue', 'angular', 'express', 'koa',
            'webpack', 'typescript', 'jest', 'mocha', 'eslint',
            '@types/node', '@types/react', 'next', 'nuxt'
        }

        # 已知的安全问题模式
        self.vulnerability_patterns = {
            'prototype_pollution': {
                'keywords': ['prototype pollution', 'proto', '__proto__'],
                'severity_boost': 2,
                'fix_complexity': 'high'
            },
            'code_injection': {
                'keywords': ['code injection', 'remote code execution', 'rce'],
                'severity_boost': 3,
                'fix_complexity': 'critical'
            },
            'xss': {
                'keywords': ['cross-site scripting', 'xss', 'script injection'],
                'severity_boost': 1,
                'fix_complexity': 'medium'
            },
            'path_traversal': {
                'keywords': ['path traversal', 'directory traversal', '../'],
                'severity_boost': 2,
                'fix_complexity': 'high'
            },
            'dos': {
                'keywords': ['denial of service', 'dos', 'resource exhaustion'],
                'severity_boost': 1,
                'fix_complexity': 'low'
            }
        }

    def analyze_vulnerabilities(self, vulnerabilities: List[Dict], consolidated_audit: Optional[Dict] = None) -> Dict:
        """
        分析漏洞列表并生成修复计划
        """
        analysis = {
            'timestamp': datetime.utcnow().isoformat(),
            'total_vulnerabilities': len(vulnerabilities),
            'severity_distribution': {},
            'affected_packages': {},
            'fix_complexity_score': 0.0,
            'recommended_strategy': 'manual_review',
            'critical_issues': [],
            'fix_plan': {
                'immediate_actions': [],
                'follow_up_actions': [],
                'monitoring_actions': []
            },
            'risk_assessment': {
                'overall_risk': 'medium',
                'business_impact': 'medium',
                'fix_urgency': 'medium'
            }
        }

        if not vulnerabilities:
            analysis['recommended_strategy'] = 'no_action'
            analysis['risk_assessment']['overall_risk'] = 'low'
            return analysis

        # 分析漏洞分布
        for vuln in vulnerabilities:
            severity = vuln.get('severity', 'unknown')
            analysis['severity_distribution'][severity] = \
                analysis['severity_distribution'].get(severity, 0) + 1

            # 分析受影响的包
            self._analyze_affected_packages(vuln, analysis, consolidated_audit)

            # 检查关键问题
            if self._is_critical_vulnerability(vuln):
                analysis['critical_issues'].append(vuln)

        # 计算修复复杂度
        analysis['fix_complexity_score'] = self._calculate_fix_complexity(vulnerabilities, analysis)

        # 确定推荐策略
        analysis['recommended_strategy'] = self._determine_fix_strategy(analysis)

        # 生成修复计划
        analysis['fix_plan'] = self._generate_fix_plan(analysis, vulnerabilities)

        # 评估风险
        analysis['risk_assessment'] = self._assess_risk(analysis)

        return analysis

    def _analyze_affected_packages(self, vuln: Dict, analysis: Dict, consolidated_audit: Optional[Dict]):
        """
        分析受影响的包
        """
        # 从漏洞数据中提取包信息
        affected_packages = set()

        # 从via字段提取包名
        via = vuln.get('via', [])
        for item in via:
            if isinstance(item, str):
                affected_packages.add(item)
            elif isinstance(item, dict) and 'source' in item:
                affected_packages.add(item['source'])

        # 从effects字段提取包名
        effects = vuln.get('effects', [])
        for effect in effects:
            if isinstance(effect, str):
                affected_packages.add(effect)

        # 从nodes字段提取包名
        nodes = vuln.get('nodes', [])
        for node in nodes:
            if isinstance(node, str):
                # 提取包名（去掉版本号）
                package_name = re.split(r'[@\s]', node)[0]
                if package_name:
                    affected_packages.add(package_name)

        # 更新分析结果
        for pkg in affected_packages:
            if pkg in analysis['affected_packages']:
                analysis['affected_packages'][pkg]['count'] += 1
                analysis['affected_packages'][pkg]['severities'].add(vuln.get('severity', 'unknown'))
            else:
                analysis['affected_packages'][pkg] = {
                    'count': 1,
                    'severities': {vuln.get('severity', 'unknown')},
                    'is_critical': pkg in self.critical_packages,
                    'vulnerability_types': set()
                }

            # 分析漏洞类型
            vuln_text = str(vuln).lower()
            for pattern_name, pattern_info in self.vulnerability_patterns.items():
                if any(keyword in vuln_text for keyword in pattern_info['keywords']):
                    analysis['affected_packages'][pkg]['vulnerability_types'].add(pattern_name)

    def _is_critical_vulnerability(self, vuln: Dict) -> bool:
        """
        判断是否为关键漏洞
        """
        severity = vuln.get('severity', '').lower()
        if severity in ['critical', 'high']:
            return True

        # 检查是否涉及关键包
        vuln_text = str(vuln).lower()
        for pkg in self.critical_packages:
            if pkg in vuln_text:
                return True

        # 检查关键漏洞模式
        for pattern_name, pattern_info in self.vulnerability_patterns.items():
            if pattern_info['fix_complexity'] in ['critical', 'high']:
                if any(keyword in vuln_text for keyword in pattern_info['keywords']):
                    return True

        return False

    def _calculate_fix_complexity(self, vulnerabilities: List[Dict], analysis: Dict) -> float:
        """
        计算修复复杂度评分 (0-10, 10为最复杂)
        """
        complexity_score = 0.0

        # 基于漏洞数量
        vuln_count = len(vulnerabilities)
        complexity_score += min(vuln_count * 0.2, 3.0)

        # 基于严重程度分布
        for severity, count in analysis['severity_distribution'].items():
            weight = self.severity_weights.get(severity, 1)
            complexity_score += count * weight * 0.1

        # 基于受影响包的复杂度
        for pkg_name, pkg_info in analysis['affected_packages'].items():
            if pkg_info['is_critical']:
                complexity_score += 1.5

            # 多个严重级别的漏洞增加复杂度
            if len(pkg_info['severities']) > 1:
                complexity_score += 0.5

            # 特殊漏洞类型增加复杂度
            for vuln_type in pkg_info['vulnerability_types']:
                pattern_info = self.vulnerability_patterns.get(vuln_type, {})
                if pattern_info.get('fix_complexity') == 'critical':
                    complexity_score += 2.0
                elif pattern_info.get('fix_complexity') == 'high':
                    complexity_score += 1.0

        return min(complexity_score, 10.0)

    def _determine_fix_strategy(self, analysis: Dict) -> str:
        """
        根据分析结果确定修复策略
        """
        complexity_score = analysis['fix_complexity_score']
        critical_issues_count = len(analysis['critical_issues'])

        # 检查是否有严重或关键级别的漏洞
        has_critical = analysis['severity_distribution'].get('critical', 0) > 0
        has_high = analysis['severity_distribution'].get('high', 0) > 0

        # 检查是否涉及关键包
        has_critical_packages = any(
            pkg_info['is_critical'] for pkg_info in analysis['affected_packages'].values()
        )

        # 决策逻辑
        if complexity_score >= 8.0 or critical_issues_count >= 3:
            return 'manual_review'

        elif has_critical or (has_high and has_critical_packages):
            if complexity_score <= 5.0:
                return 'selective_fix'
            else:
                return 'manual_review'

        elif complexity_score <= 3.0 and not has_critical_packages:
            return 'auto_fix'

        elif has_high or complexity_score <= 6.0:
            return 'selective_fix'

        else:
            return 'manual_review'

    def _generate_fix_plan(self, analysis: Dict, vulnerabilities: List[Dict]) -> Dict:
        """
        生成详细的修复计划
        """
        strategy = analysis['recommended_strategy']
        strategy_info = self.fix_strategies.get(strategy, {})

        plan = {
            'immediate_actions': [],
            'follow_up_actions': [],
            'monitoring_actions': []
        }

        # 立即行动
        if strategy == 'auto_fix':
            plan['immediate_actions'] = [
                '执行 npm audit fix 进行自动修复',
                '验证构建和测试是否通过',
                '检查功能完整性'
            ]

        elif strategy == 'selective_fix':
            plan['immediate_actions'] = [
                '执行 npm audit fix --audit-level=high 修复高危漏洞',
                '手动检查关键依赖的版本变更',
                '在测试环境验证修复效果',
                '运行完整测试套件'
            ]

        elif strategy == 'manual_review':
            plan['immediate_actions'] = [
                '详细分析每个漏洞的影响范围',
                '制定分阶段修复计划',
                '在隔离环境测试修复方案',
                '准备回滚计划'
            ]

        # 后续行动
        plan['follow_up_actions'] = [
            '更新安全扫描基线',
            '完善依赖管理策略',
            '加强代码审查流程',
            '定期进行安全培训'
        ]

        # 监控行动
        plan['monitoring_actions'] = [
            '监控应用性能指标',
            '检查错误日志和异常',
            '验证安全修复效果',
            '跟踪新的安全公告'
        ]

        # 为关键问题添加特殊处理
        for critical_vuln in analysis['critical_issues']:
            severity = critical_vuln.get('severity', '')
            if severity == 'critical':
                plan['immediate_actions'].insert(0,
                    f"🚨 优先处理严重漏洞: {critical_vuln.get('id', 'unknown')}")

        return plan

    def _assess_risk(self, analysis: Dict) -> Dict:
        """
        评估整体风险
        """
        complexity_score = analysis['fix_complexity_score']
        critical_count = analysis['severity_distribution'].get('critical', 0)
        high_count = analysis['severity_distribution'].get('high', 0)

        # 风险级别评估
        if critical_count > 0 or complexity_score >= 8.0:
            overall_risk = 'high'
            fix_urgency = 'immediate'
        elif high_count > 2 or complexity_score >= 6.0:
            overall_risk = 'medium'
            fix_urgency = 'high'
        elif analysis['total_vulnerabilities'] > 10:
            overall_risk = 'medium'
            fix_urgency = 'medium'
        else:
            overall_risk = 'low'
            fix_urgency = 'low'

        # 业务影响评估
        has_critical_packages = any(
            pkg_info['is_critical'] for pkg_info in analysis['affected_packages'].values()
        )

        if has_critical_packages and critical_count > 0:
            business_impact = 'high'
        elif has_critical_packages or high_count > 0:
            business_impact = 'medium'
        else:
            business_impact = 'low'

        return {
            'overall_risk': overall_risk,
            'business_impact': business_impact,
            'fix_urgency': fix_urgency,
            'risk_factors': self._identify_risk_factors(analysis)
        }

    def _identify_risk_factors(self, analysis: Dict) -> List[str]:
        """
        识别风险因素
        """
        risk_factors = []

        # 漏洞相关风险
        critical_count = analysis['severity_distribution'].get('critical', 0)
        if critical_count > 0:
            risk_factors.append(f"{critical_count} 个严重级别漏洞")

        high_count = analysis['severity_distribution'].get('high', 0)
        if high_count > 3:
            risk_factors.append(f"大量高危漏洞 ({high_count} 个)")

        # 包相关风险
        critical_packages = [
            pkg for pkg, info in analysis['affected_packages'].items()
            if info['is_critical']
        ]
        if critical_packages:
            risk_factors.append(f"涉及关键包: {', '.join(critical_packages[:3])}")

        # 复杂度相关风险
        if analysis['fix_complexity_score'] >= 7.0:
            risk_factors.append("修复复杂度很高")

        # 漏洞类型相关风险
        critical_vuln_types = set()
        for pkg_info in analysis['affected_packages'].values():
            critical_vuln_types.update(pkg_info['vulnerability_types'])

        for vuln_type in critical_vuln_types:
            pattern_info = self.vulnerability_patterns.get(vuln_type, {})
            if pattern_info.get('fix_complexity') in ['critical', 'high']:
                risk_factors.append(f"发现{vuln_type.replace('_', ' ')}类型漏洞")

        return risk_factors

    def generate_fix_plan(self, vulnerabilities_file: str, max_severity: str = 'moderate',
                         consolidated_audit_file: Optional[str] = None) -> Dict:
        """
        从文件读取漏洞信息并生成修复计划
        """
        try:
            with open(vulnerabilities_file, 'r', encoding='utf-8') as f:
                vulnerabilities = json.load(f)
        except FileNotFoundError:
            return {'error': f'Vulnerabilities file not found: {vulnerabilities_file}'}
        except json.JSONDecodeError:
            return {'error': f'Invalid JSON in vulnerabilities file: {vulnerabilities_file}'}

        # 读取合并的审计报告（如果提供）
        consolidated_audit = None
        if consolidated_audit_file:
            try:
                with open(consolidated_audit_file, 'r', encoding='utf-8') as f:
                    consolidated_audit = json.load(f)
            except Exception as e:
                print(f"Warning: Could not load consolidated audit file: {e}", file=sys.stderr)

        # 根据严重级别过滤漏洞
        severity_levels = ['low', 'moderate', 'high', 'critical']
        max_level_index = severity_levels.index(max_severity) if max_severity in severity_levels else 1

        filtered_vulnerabilities = [
            vuln for vuln in vulnerabilities
            if vuln.get('severity', 'low') in severity_levels[max_level_index:]
        ]

        # 分析漏洞
        analysis = self.analyze_vulnerabilities(filtered_vulnerabilities, consolidated_audit)

        # 添加元数据
        analysis['filter_criteria'] = {
            'max_severity': max_severity,
            'original_count': len(vulnerabilities),
            'filtered_count': len(filtered_vulnerabilities)
        }

        # 添加策略信息
        strategy = analysis['recommended_strategy']
        if strategy in self.fix_strategies:
            analysis['strategy_details'] = self.fix_strategies[strategy]

        return analysis

    def export_plan(self, plan: Dict, output_format: str = 'json') -> str:
        """
        导出修复计划
        """
        if output_format == 'json':
            # 转换set为list以支持JSON序列化
            plan_copy = self._convert_sets_to_lists(plan)
            return json.dumps(plan_copy, indent=2, ensure_ascii=False)

        elif output_format == 'summary':
            return self._generate_summary_report(plan)

        elif output_format == 'actionable':
            return self._generate_actionable_report(plan)

        return str(plan)

    def _convert_sets_to_lists(self, data):
        """
        递归转换字典中的set为list，以支持JSON序列化
        """
        if isinstance(data, dict):
            return {key: self._convert_sets_to_lists(value) for key, value in data.items()}
        elif isinstance(data, list):
            return [self._convert_sets_to_lists(item) for item in data]
        elif isinstance(data, set):
            return list(data)
        else:
            return data

    def _generate_summary_report(self, plan: Dict) -> str:
        """
        生成摘要报告
        """
        lines = [
            "=== 安全修复计划摘要 ===",
            f"生成时间: {plan.get('timestamp', 'unknown')}",
            f"漏洞总数: {plan.get('total_vulnerabilities', 0)}",
            f"推荐策略: {plan.get('recommended_strategy', 'unknown')}",
            f"修复复杂度: {plan.get('fix_complexity_score', 0):.1f}/10",
            "",
            "=== 严重程度分布 ===",
        ]

        for severity, count in plan.get('severity_distribution', {}).items():
            lines.append(f"{severity}: {count}")

        lines.extend([
            "",
            "=== 风险评估 ===",
            f"整体风险: {plan.get('risk_assessment', {}).get('overall_risk', 'unknown')}",
            f"业务影响: {plan.get('risk_assessment', {}).get('business_impact', 'unknown')}",
            f"修复紧急程度: {plan.get('risk_assessment', {}).get('fix_urgency', 'unknown')}"
        ])

        risk_factors = plan.get('risk_assessment', {}).get('risk_factors', [])
        if risk_factors:
            lines.extend([
                "",
                "=== 主要风险因素 ===",
            ])
            for factor in risk_factors:
                lines.append(f"• {factor}")

        lines.extend([
            "",
            "=== 立即行动建议 ===",
        ])
        for action in plan.get('fix_plan', {}).get('immediate_actions', []):
            lines.append(f"• {action}")

        return '\n'.join(lines)

    def _generate_actionable_report(self, plan: Dict) -> str:
        """
        生成可执行的行动报告
        """
        strategy = plan.get('recommended_strategy', 'manual_review')

        lines = [
            f"#!/bin/bash",
            f"# 安全修复执行计划",
            f"# 策略: {strategy}",
            f"# 生成时间: {plan.get('timestamp', 'unknown')}",
            f"",
            f"set -e",
            f"",
            f"echo '=== 开始安全修复 ==='",
            f"echo '策略: {strategy}'",
            f"echo '漏洞数量: {plan.get('total_vulnerabilities', 0)}'",
            f"",
        ]

        # 根据策略生成具体命令
        if strategy == 'auto_fix':
            lines.extend([
                "echo '执行自动修复...'",
                "npm audit fix",
                "",
                "echo '验证修复结果...'",
                "npm audit --audit-level=moderate",
                "",
                "echo '运行测试...'",
                "npm test",
            ])

        elif strategy == 'selective_fix':
            lines.extend([
                "echo '执行选择性修复...'",
                "npm audit fix --audit-level=high",
                "",
                "echo '验证关键依赖...'",
                "npm ls --depth=0",
                "",
                "echo '运行完整测试...'",
                "npm run test:full",
            ])

        elif strategy == 'manual_review':
            lines.extend([
                "echo '需要人工审查，请执行以下步骤:'",
                "echo '1. 查看详细的漏洞报告'",
                "echo '2. 分析每个漏洞的影响'",
                "echo '3. 制定具体的修复方案'",
                "echo '4. 在测试环境验证修复'",
                "",
                "# 生成详细报告",
                "npm audit --json > security-audit-$(date +%Y%m%d).json",
                "echo '审计报告已保存'",
            ])

        lines.extend([
            "",
            "echo '=== 修复完成 ==='",
        ])

        return '\n'.join(lines)

def main():
    parser = argparse.ArgumentParser(description='安全修复规划器')
    parser.add_argument('--vulnerabilities', '-v', required=True, help='漏洞信息JSON文件')
    parser.add_argument('--max-severity', choices=['low', 'moderate', 'high', 'critical'],
                       default='moderate', help='修复的最大严重级别')
    parser.add_argument('--consolidated-audit', help='合并的审计报告文件')
    parser.add_argument('--output', '-o', help='输出文件路径')
    parser.add_argument('--format', choices=['json', 'summary', 'actionable'],
                       default='json', help='输出格式')

    args = parser.parse_args()

    # 创建修复规划器
    planner = SecurityFixPlanner()

    # 生成修复计划
    plan = planner.generate_fix_plan(
        args.vulnerabilities,
        args.max_severity,
        args.consolidated_audit
    )

    # 检查是否有错误
    if 'error' in plan:
        print(f"错误: {plan['error']}", file=sys.stderr)
        sys.exit(1)

    # 导出结果
    output = planner.export_plan(plan, args.format)

    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            f.write(output)
        print(f"修复计划已保存到: {args.output}")
    else:
        print(output)

if __name__ == '__main__':
    main()