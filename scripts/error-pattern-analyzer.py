#!/usr/bin/env python3
"""
智能错误模式分析器
用于分析构建、测试和部署过程中的错误，识别错误类型和推荐修复策略
"""

import re
import json
import sys
import argparse
from typing import Dict, List, Optional, Tuple
from datetime import datetime
import hashlib

class ErrorPatternAnalyzer:
    def __init__(self):
        self.patterns = {
            'compilation': [
                {
                    'pattern': r"Cannot find module ['\"](.+?)['\"]",
                    'type': 'missing_module',
                    'severity': 'high',
                    'fix_strategy': 'install_dependency',
                    'confidence': 0.9
                },
                {
                    'pattern': r"Property ['\"](.+?)['\"] does not exist on type ['\"](.+?)['\"]",
                    'type': 'type_error',
                    'severity': 'medium',
                    'fix_strategy': 'type_fix',
                    'confidence': 0.85
                },
                {
                    'pattern': r"Type ['\"](.+?)['\"] is not assignable to type ['\"](.+?)['\"]",
                    'type': 'type_mismatch',
                    'severity': 'medium',
                    'fix_strategy': 'type_cast',
                    'confidence': 0.8
                },
                {
                    'pattern': r"Argument of type ['\"](.+?)['\"] is not assignable",
                    'type': 'argument_type_error',
                    'severity': 'medium',
                    'fix_strategy': 'argument_fix',
                    'confidence': 0.8
                }
            ],
            'test_failure': [
                {
                    'pattern': r"Expected (.+?) but received (.+)",
                    'type': 'assertion_failure',
                    'severity': 'high',
                    'fix_strategy': 'test_logic_fix',
                    'confidence': 0.7
                },
                {
                    'pattern': r"Test timeout exceeded",
                    'type': 'timeout',
                    'severity': 'medium',
                    'fix_strategy': 'timeout_fix',
                    'confidence': 0.9
                },
                {
                    'pattern': r"Mock function (.+?) not called",
                    'type': 'mock_error',
                    'severity': 'medium',
                    'fix_strategy': 'mock_fix',
                    'confidence': 0.85
                },
                {
                    'pattern': r"Cannot read propert(y|ies) of (undefined|null)",
                    'type': 'null_reference',
                    'severity': 'high',
                    'fix_strategy': 'null_check',
                    'confidence': 0.9
                }
            ],
            'security': [
                {
                    'pattern': r"Vulnerability found in (.+?)@(.+)",
                    'type': 'dependency_vulnerability',
                    'severity': 'critical',
                    'fix_strategy': 'security_update',
                    'confidence': 0.95
                },
                {
                    'pattern': r"High severity issue in (.+)",
                    'type': 'high_severity_vuln',
                    'severity': 'high',
                    'fix_strategy': 'security_patch',
                    'confidence': 0.9
                },
                {
                    'pattern': r"Prototype pollution.*vulnerable",
                    'type': 'prototype_pollution',
                    'severity': 'critical',
                    'fix_strategy': 'security_update',
                    'confidence': 0.95
                }
            ],
            'build': [
                {
                    'pattern': r"ENOENT.*no such file or directory",
                    'type': 'missing_file',
                    'severity': 'high',
                    'fix_strategy': 'file_check',
                    'confidence': 0.9
                },
                {
                    'pattern': r"Module build failed.*Loader",
                    'type': 'loader_error',
                    'severity': 'medium',
                    'fix_strategy': 'webpack_config',
                    'confidence': 0.8
                },
                {
                    'pattern': r"out of memory",
                    'type': 'memory_error',
                    'severity': 'high',
                    'fix_strategy': 'memory_optimization',
                    'confidence': 0.85
                }
            ],
            'lint': [
                {
                    'pattern': r"(.+) is not defined",
                    'type': 'undefined_variable',
                    'severity': 'medium',
                    'fix_strategy': 'define_variable',
                    'confidence': 0.9
                },
                {
                    'pattern': r"Unexpected token",
                    'type': 'syntax_error',
                    'severity': 'high',
                    'fix_strategy': 'syntax_fix',
                    'confidence': 0.95
                }
            ]
        }

        # 修复策略详细说明
        self.fix_strategies = {
            'install_dependency': {
                'description': '安装缺失的依赖包',
                'actions': ['npm install <package>', 'yarn add <package>'],
                'auto_fixable': True,
                'risk_level': 'low'
            },
            'type_fix': {
                'description': '修复TypeScript类型错误',
                'actions': ['添加类型定义', '修正类型注解', '更新接口定义'],
                'auto_fixable': True,
                'risk_level': 'low'
            },
            'type_cast': {
                'description': '修复类型转换问题',
                'actions': ['添加类型断言', '使用类型转换', '修正泛型参数'],
                'auto_fixable': True,
                'risk_level': 'medium'
            },
            'security_update': {
                'description': '更新存在安全漏洞的依赖',
                'actions': ['npm audit fix', '手动更新版本', '替换安全依赖'],
                'auto_fixable': True,
                'risk_level': 'low'
            },
            'test_logic_fix': {
                'description': '修复测试逻辑错误',
                'actions': ['检查测试期望值', '更新测试数据', '修正断言逻辑'],
                'auto_fixable': False,
                'risk_level': 'high'
            },
            'timeout_fix': {
                'description': '修复测试超时问题',
                'actions': ['增加超时时间', '优化测试逻辑', '使用异步等待'],
                'auto_fixable': True,
                'risk_level': 'low'
            }
        }

    def analyze_error(self, error_text: str, context: Optional[Dict] = None) -> Dict:
        """
        分析单个错误文本，返回详细的分析结果
        """
        result = {
            'error_hash': self._generate_error_hash(error_text),
            'timestamp': datetime.utcnow().isoformat(),
            'error_text': error_text[:500],  # 限制错误文本长度
            'analysis': {
                'error_type': 'unknown',
                'category': 'unknown',
                'severity': 'medium',
                'fix_strategy': 'manual_review',
                'confidence': 0.0,
                'auto_fixable': False,
                'risk_level': 'medium'
            },
            'matched_patterns': [],
            'recommendations': [],
            'context': context or {}
        }

        best_match = None
        highest_confidence = 0.0

        # 遍历所有错误模式进行匹配
        for category, patterns in self.patterns.items():
            for pattern_info in patterns:
                match = re.search(pattern_info['pattern'], error_text, re.IGNORECASE | re.MULTILINE)
                if match:
                    matched_pattern = {
                        'category': category,
                        'pattern': pattern_info['pattern'],
                        'type': pattern_info['type'],
                        'matched_groups': match.groups(),
                        'confidence': pattern_info['confidence']
                    }
                    result['matched_patterns'].append(matched_pattern)

                    # 选择置信度最高的匹配
                    if pattern_info['confidence'] > highest_confidence:
                        highest_confidence = pattern_info['confidence']
                        best_match = pattern_info
                        result['analysis']['category'] = category

        # 应用最佳匹配结果
        if best_match:
            result['analysis'].update({
                'error_type': best_match['type'],
                'severity': best_match['severity'],
                'fix_strategy': best_match['fix_strategy'],
                'confidence': best_match['confidence'],
                'auto_fixable': self.fix_strategies.get(best_match['fix_strategy'], {}).get('auto_fixable', False),
                'risk_level': self.fix_strategies.get(best_match['fix_strategy'], {}).get('risk_level', 'medium')
            })

            # 生成修复建议
            strategy_info = self.fix_strategies.get(best_match['fix_strategy'], {})
            if strategy_info:
                result['recommendations'] = [
                    {
                        'strategy': best_match['fix_strategy'],
                        'description': strategy_info['description'],
                        'actions': strategy_info['actions'],
                        'auto_fixable': strategy_info['auto_fixable'],
                        'risk_level': strategy_info['risk_level']
                    }
                ]

        return result

    def analyze_batch(self, error_logs: List[str], context: Optional[Dict] = None) -> Dict:
        """
        批量分析多个错误日志
        """
        results = {
            'summary': {
                'total_errors': len(error_logs),
                'analyzed_errors': 0,
                'auto_fixable_errors': 0,
                'high_priority_errors': 0,
                'categories': {},
                'fix_strategies': {}
            },
            'errors': [],
            'recommendations': {
                'immediate_actions': [],
                'follow_up_actions': [],
                'preventive_measures': []
            }
        }

        for i, error_log in enumerate(error_logs):
            if not error_log.strip():
                continue

            analysis = self.analyze_error(error_log, context)
            results['errors'].append(analysis)
            results['summary']['analyzed_errors'] += 1

            # 统计信息
            category = analysis['analysis']['category']
            fix_strategy = analysis['analysis']['fix_strategy']

            results['summary']['categories'][category] = results['summary']['categories'].get(category, 0) + 1
            results['summary']['fix_strategies'][fix_strategy] = results['summary']['fix_strategies'].get(fix_strategy, 0) + 1

            if analysis['analysis']['auto_fixable']:
                results['summary']['auto_fixable_errors'] += 1

            if analysis['analysis']['severity'] in ['high', 'critical']:
                results['summary']['high_priority_errors'] += 1

        # 生成整体建议
        results['recommendations'] = self._generate_batch_recommendations(results)

        return results

    def _generate_batch_recommendations(self, analysis_results: Dict) -> Dict:
        """
        基于批量分析结果生成整体建议
        """
        recommendations = {
            'immediate_actions': [],
            'follow_up_actions': [],
            'preventive_measures': []
        }

        # 立即行动建议
        auto_fixable_count = analysis_results['summary']['auto_fixable_errors']
        if auto_fixable_count > 0:
            recommendations['immediate_actions'].append(
                f"有 {auto_fixable_count} 个错误可以自动修复，建议立即执行自动修复流程"
            )

        high_priority_count = analysis_results['summary']['high_priority_errors']
        if high_priority_count > 0:
            recommendations['immediate_actions'].append(
                f"发现 {high_priority_count} 个高优先级错误，需要优先处理"
            )

        # 后续行动建议
        categories = analysis_results['summary']['categories']
        if categories.get('security', 0) > 0:
            recommendations['follow_up_actions'].append(
                "检测到安全相关问题，建议进行全面的安全审计"
            )

        if categories.get('test_failure', 0) > 3:
            recommendations['follow_up_actions'].append(
                "测试失败较多，建议检查测试环境和测试数据的一致性"
            )

        # 预防措施建议
        recommendations['preventive_measures'].extend([
            "定期更新依赖包以避免安全漏洞",
            "加强代码审查流程以减少类型错误",
            "改进测试数据管理以提高测试稳定性"
        ])

        return recommendations

    def _generate_error_hash(self, error_text: str) -> str:
        """
        为错误文本生成唯一哈希值，用于去重和追踪
        """
        # 移除时间戳、路径等变化的部分，保留核心错误信息
        normalized_text = re.sub(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}', '', error_text)
        normalized_text = re.sub(r'/[^\s]+/', '/path/', normalized_text)
        normalized_text = re.sub(r'line \d+', 'line X', normalized_text)

        return hashlib.md5(normalized_text.encode()).hexdigest()[:12]

    def export_analysis(self, analysis_results: Dict, output_format: str = 'json') -> str:
        """
        导出分析结果
        """
        if output_format == 'json':
            return json.dumps(analysis_results, indent=2, ensure_ascii=False)

        elif output_format == 'summary':
            summary = analysis_results['summary']
            output = []
            output.append("=== 错误分析摘要 ===")
            output.append(f"总错误数: {summary['total_errors']}")
            output.append(f"已分析: {summary['analyzed_errors']}")
            output.append(f"可自动修复: {summary['auto_fixable_errors']}")
            output.append(f"高优先级: {summary['high_priority_errors']}")

            output.append("\n=== 错误类别分布 ===")
            for category, count in summary['categories'].items():
                output.append(f"{category}: {count}")

            output.append("\n=== 修复策略分布 ===")
            for strategy, count in summary['fix_strategies'].items():
                output.append(f"{strategy}: {count}")

            return '\n'.join(output)

        return str(analysis_results)

def main():
    parser = argparse.ArgumentParser(description='智能错误模式分析器')
    parser.add_argument('--input', '-i', help='输入错误日志文件或错误文本')
    parser.add_argument('--error-type', help='指定错误类型进行分析')
    parser.add_argument('--context', help='上下文信息JSON字符串')
    parser.add_argument('--output', '-o', help='输出文件路径')
    parser.add_argument('--format', choices=['json', 'summary'], default='json', help='输出格式')
    parser.add_argument('--batch', action='store_true', help='批量分析模式')

    args = parser.parse_args()

    analyzer = ErrorPatternAnalyzer()

    # 解析上下文信息
    context = None
    if args.context:
        try:
            context = json.loads(args.context)
        except json.JSONDecodeError:
            print("警告: 无法解析上下文JSON，将忽略", file=sys.stderr)

    # 读取输入
    if args.input:
        try:
            with open(args.input, 'r', encoding='utf-8') as f:
                input_text = f.read()
        except FileNotFoundError:
            # 如果不是文件，则当作直接的错误文本处理
            input_text = args.input
    else:
        # 从stdin读取
        input_text = sys.stdin.read()

    # 执行分析
    if args.batch:
        # 按行分割进行批量分析
        error_logs = [line.strip() for line in input_text.split('\n') if line.strip()]
        results = analyzer.analyze_batch(error_logs, context)
    else:
        # 单个错误分析
        results = analyzer.analyze_error(input_text, context)

    # 导出结果
    output = analyzer.export_analysis(results, args.format)

    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            f.write(output)
        print(f"分析结果已保存到: {args.output}")
    else:
        print(output)

if __name__ == '__main__':
    main()