#!/usr/bin/env python3
"""
指标计算器
收集和分析GitHub Actions工作流的性能指标，为监控和改进提供数据支持
"""

import json
import sys
import argparse
import os
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
import statistics
import requests
from dataclasses import dataclass

@dataclass
class WorkflowRun:
    id: int
    name: str
    status: str
    conclusion: str
    created_at: datetime
    updated_at: datetime
    duration_seconds: float
    actor: str
    event: str
    branch: str

class MetricsCalculator:
    def __init__(self, github_token: str, repository: str):
        """
        初始化指标计算器
        """
        self.github_token = github_token
        self.repository = repository
        self.headers = {
            'Authorization': f'token {github_token}',
            'Accept': 'application/vnd.github.v3+json'
        }
        self.base_url = 'https://api.github.com'

        # 关注的工作流名称
        self.autofix_workflows = [
            'Auto Fix on Comment',
            'ClaudeCode Autofix on CI failure',
            'Security Auto-Fix',
            'Enhanced Monitoring Setup'
        ]

    def collect_workflow_metrics(self, days: int = 7) -> List[WorkflowRun]:
        """
        收集指定天数内的工作流执行指标
        """
        since = datetime.utcnow() - timedelta(days=days)
        workflow_runs = []

        try:
            # 获取工作流运行记录
            url = f"{self.base_url}/repos/{self.repository}/actions/runs"
            params = {
                'per_page': 100,
                'page': 1,
                'created': f'>={since.isoformat()}'
            }

            while True:
                response = requests.get(url, headers=self.headers, params=params)
                if response.status_code != 200:
                    print(f"API请求失败: {response.status_code} - {response.text}", file=sys.stderr)
                    break

                data = response.json()
                runs = data.get('workflow_runs', [])

                for run in runs:
                    # 解析时间
                    created_at = datetime.fromisoformat(run['created_at'].replace('Z', '+00:00'))
                    updated_at = datetime.fromisoformat(run['updated_at'].replace('Z', '+00:00'))

                    # 计算持续时间
                    duration = (updated_at - created_at).total_seconds()

                    workflow_run = WorkflowRun(
                        id=run['id'],
                        name=run['name'],
                        status=run['status'],
                        conclusion=run['conclusion'] or 'pending',
                        created_at=created_at,
                        updated_at=updated_at,
                        duration_seconds=duration,
                        actor=run['actor']['login'],
                        event=run['event'],
                        branch=run['head_branch'] or 'unknown'
                    )

                    workflow_runs.append(workflow_run)

                # 检查是否有下一页
                if len(runs) < params['per_page'] or not data.get('workflow_runs'):
                    break

                params['page'] += 1
                if params['page'] > 10:  # 限制最多获取10页，避免API限制
                    break

        except Exception as e:
            print(f"收集工作流指标时出错: {e}", file=sys.stderr)

        return workflow_runs

    def analyze_autofix_performance(self, workflow_runs: List[WorkflowRun]) -> Dict:
        """
        分析AutoFix相关工作流的性能
        """
        # 过滤AutoFix相关的工作流
        autofix_runs = [
            run for run in workflow_runs
            if any(autofix_name in run.name for autofix_name in self.autofix_workflows)
        ]

        analysis = {
            'analysis_timestamp': datetime.utcnow().isoformat(),
            'total_runs': len(autofix_runs),
            'success_metrics': self._calculate_success_metrics(autofix_runs),
            'performance_metrics': self._calculate_performance_metrics(autofix_runs),
            'error_analysis': self._analyze_errors(autofix_runs),
            'workflow_breakdown': self._analyze_by_workflow(autofix_runs),
            'trend_analysis': self._analyze_trends(autofix_runs),
            'recommendations': []
        }

        # 生成建议
        analysis['recommendations'] = self._generate_recommendations(analysis)

        return analysis

    def _calculate_success_metrics(self, runs: List[WorkflowRun]) -> Dict:
        """
        计算成功率指标
        """
        if not runs:
            return {
                'total_attempts': 0,
                'successful_runs': 0,
                'failed_runs': 0,
                'success_rate': 0.0,
                'failure_rate': 0.0
            }

        successful = [r for r in runs if r.conclusion == 'success']
        failed = [r for r in runs if r.conclusion == 'failure']

        total_completed = len([r for r in runs if r.conclusion in ['success', 'failure']])

        return {
            'total_attempts': len(runs),
            'successful_runs': len(successful),
            'failed_runs': len(failed),
            'cancelled_runs': len([r for r in runs if r.conclusion == 'cancelled']),
            'success_rate': len(successful) / total_completed if total_completed > 0 else 0.0,
            'failure_rate': len(failed) / total_completed if total_completed > 0 else 0.0,
            'completion_rate': total_completed / len(runs) if runs else 0.0
        }

    def _calculate_performance_metrics(self, runs: List[WorkflowRun]) -> Dict:
        """
        计算性能指标
        """
        if not runs:
            return {
                'avg_duration_seconds': 0,
                'avg_duration_minutes': 0,
                'duration_percentiles': {},
                'fastest_run': None,
                'slowest_run': None
            }

        durations = [run.duration_seconds for run in runs if run.duration_seconds > 0]

        if not durations:
            return {
                'avg_duration_seconds': 0,
                'avg_duration_minutes': 0,
                'duration_percentiles': {},
                'fastest_run': None,
                'slowest_run': None
            }

        avg_duration = statistics.mean(durations)

        # 计算百分位数
        percentiles = {}
        for p in [50, 75, 90, 95, 99]:
            try:
                percentiles[f'p{p}'] = statistics.quantiles(durations, n=100)[p-1]
            except:
                percentiles[f'p{p}'] = avg_duration

        # 找到最快和最慢的运行
        fastest_run = min(runs, key=lambda r: r.duration_seconds)
        slowest_run = max(runs, key=lambda r: r.duration_seconds)

        return {
            'avg_duration_seconds': avg_duration,
            'avg_duration_minutes': avg_duration / 60,
            'median_duration_seconds': statistics.median(durations),
            'duration_percentiles': percentiles,
            'fastest_run': {
                'id': fastest_run.id,
                'duration_seconds': fastest_run.duration_seconds,
                'name': fastest_run.name
            },
            'slowest_run': {
                'id': slowest_run.id,
                'duration_seconds': slowest_run.duration_seconds,
                'name': slowest_run.name
            },
            'duration_variance': statistics.variance(durations) if len(durations) > 1 else 0
        }

    def _analyze_errors(self, runs: List[WorkflowRun]) -> Dict:
        """
        分析错误模式
        """
        failed_runs = [r for r in runs if r.conclusion == 'failure']

        analysis = {
            'total_failures': len(failed_runs),
            'failure_by_workflow': {},
            'failure_by_event': {},
            'failure_by_actor': {},
            'failure_by_branch': {},
            'failure_patterns': [],
            'mttr': 0.0  # Mean Time To Recovery
        }

        # 按工作流分组分析失败
        for run in failed_runs:
            # 按工作流名称
            workflow_name = run.name
            if workflow_name not in analysis['failure_by_workflow']:
                analysis['failure_by_workflow'][workflow_name] = 0
            analysis['failure_by_workflow'][workflow_name] += 1

            # 按触发事件
            if run.event not in analysis['failure_by_event']:
                analysis['failure_by_event'][run.event] = 0
            analysis['failure_by_event'][run.event] += 1

            # 按执行者
            if run.actor not in analysis['failure_by_actor']:
                analysis['failure_by_actor'][run.actor] = 0
            analysis['failure_by_actor'][run.actor] += 1

            # 按分支
            if run.branch not in analysis['failure_by_branch']:
                analysis['failure_by_branch'][run.branch] = 0
            analysis['failure_by_branch'][run.branch] += 1

        # 识别失败模式
        analysis['failure_patterns'] = self._identify_failure_patterns(failed_runs)

        return analysis

    def _analyze_by_workflow(self, runs: List[WorkflowRun]) -> Dict:
        """
        按工作流类型分析
        """
        workflow_stats = {}

        for run in runs:
            if run.name not in workflow_stats:
                workflow_stats[run.name] = {
                    'total_runs': 0,
                    'successful_runs': 0,
                    'failed_runs': 0,
                    'avg_duration': 0,
                    'durations': []
                }

            stats = workflow_stats[run.name]
            stats['total_runs'] += 1
            stats['durations'].append(run.duration_seconds)

            if run.conclusion == 'success':
                stats['successful_runs'] += 1
            elif run.conclusion == 'failure':
                stats['failed_runs'] += 1

        # 计算平均值和成功率
        for workflow_name, stats in workflow_stats.items():
            if stats['durations']:
                stats['avg_duration'] = statistics.mean(stats['durations'])

            completed_runs = stats['successful_runs'] + stats['failed_runs']
            if completed_runs > 0:
                stats['success_rate'] = stats['successful_runs'] / completed_runs
            else:
                stats['success_rate'] = 0.0

            # 清理原始数据以减少输出大小
            del stats['durations']

        return workflow_stats

    def _analyze_trends(self, runs: List[WorkflowRun]) -> Dict:
        """
        分析趋势
        """
        if len(runs) < 3:
            return {
                'trend_direction': 'insufficient_data',
                'success_rate_trend': 'stable',
                'duration_trend': 'stable',
                'frequency_trend': 'stable'
            }

        # 按时间排序
        sorted_runs = sorted(runs, key=lambda r: r.created_at)

        # 分析成功率趋势
        success_rate_trend = self._calculate_trend(sorted_runs, 'success_rate')

        # 分析持续时间趋势
        duration_trend = self._calculate_trend(sorted_runs, 'duration')

        # 分析执行频率趋势
        frequency_trend = self._calculate_frequency_trend(sorted_runs)

        return {
            'trend_direction': 'improving' if success_rate_trend > 0 else 'declining' if success_rate_trend < 0 else 'stable',
            'success_rate_trend': 'improving' if success_rate_trend > 0.1 else 'declining' if success_rate_trend < -0.1 else 'stable',
            'duration_trend': 'improving' if duration_trend < -60 else 'declining' if duration_trend > 60 else 'stable',
            'frequency_trend': frequency_trend
        }

    def _calculate_trend(self, runs: List[WorkflowRun], metric_type: str) -> float:
        """
        计算趋势斜率
        """
        if len(runs) < 2:
            return 0.0

        if metric_type == 'success_rate':
            # 将运行按时间分组，计算各时间段的成功率
            time_periods = self._group_by_time_periods(runs)
            if len(time_periods) < 2:
                return 0.0

            success_rates = []
            for period_runs in time_periods:
                successful = len([r for r in period_runs if r.conclusion == 'success'])
                total = len([r for r in period_runs if r.conclusion in ['success', 'failure']])
                success_rates.append(successful / total if total > 0 else 0)

            if len(success_rates) < 2:
                return 0.0

            # 简单线性趋势计算
            return success_rates[-1] - success_rates[0]

        elif metric_type == 'duration':
            durations = [r.duration_seconds for r in runs[-10:]]  # 最近10次运行
            if len(durations) < 2:
                return 0.0
            return durations[-1] - durations[0]

        return 0.0

    def _group_by_time_periods(self, runs: List[WorkflowRun], period_hours: int = 24) -> List[List[WorkflowRun]]:
        """
        按时间段分组
        """
        if not runs:
            return []

        sorted_runs = sorted(runs, key=lambda r: r.created_at)
        groups = []
        current_group = []
        current_period_start = sorted_runs[0].created_at

        for run in sorted_runs:
            if (run.created_at - current_period_start).total_seconds() > period_hours * 3600:
                if current_group:
                    groups.append(current_group)
                current_group = [run]
                current_period_start = run.created_at
            else:
                current_group.append(run)

        if current_group:
            groups.append(current_group)

        return groups

    def _calculate_frequency_trend(self, runs: List[WorkflowRun]) -> str:
        """
        计算频率趋势
        """
        if len(runs) < 4:
            return 'stable'

        # 按天分组计算每天的执行次数
        daily_counts = {}
        for run in runs:
            day = run.created_at.date()
            daily_counts[day] = daily_counts.get(day, 0) + 1

        if len(daily_counts) < 2:
            return 'stable'

        counts = list(daily_counts.values())

        # 比较前半段和后半段的平均值
        mid = len(counts) // 2
        early_avg = statistics.mean(counts[:mid])
        recent_avg = statistics.mean(counts[mid:])

        if recent_avg > early_avg * 1.5:
            return 'increasing'
        elif recent_avg < early_avg * 0.67:
            return 'decreasing'
        else:
            return 'stable'

    def _identify_failure_patterns(self, failed_runs: List[WorkflowRun]) -> List[Dict]:
        """
        识别失败模式
        """
        patterns = []

        # 检查连续失败
        consecutive_failures = self._find_consecutive_failures(failed_runs)
        if consecutive_failures > 2:
            patterns.append({
                'type': 'consecutive_failures',
                'count': consecutive_failures,
                'description': f'发现连续{consecutive_failures}次失败，可能存在系统性问题'
            })

        # 检查特定时间段的高失败率
        if len(failed_runs) > 5:
            recent_failures = [r for r in failed_runs if (datetime.utcnow() - r.created_at).days <= 1]
            if len(recent_failures) >= 3:
                patterns.append({
                    'type': 'high_recent_failure_rate',
                    'count': len(recent_failures),
                    'description': f'最近24小时内发生{len(recent_failures)}次失败'
                })

        return patterns

    def _find_consecutive_failures(self, failed_runs: List[WorkflowRun]) -> int:
        """
        查找连续失败次数
        """
        if not failed_runs:
            return 0

        # 按时间排序
        sorted_failures = sorted(failed_runs, key=lambda r: r.created_at, reverse=True)

        consecutive_count = 0
        for run in sorted_failures:
            if run.conclusion == 'failure':
                consecutive_count += 1
            else:
                break

        return consecutive_count

    def _generate_recommendations(self, analysis: Dict) -> List[str]:
        """
        基于分析结果生成改进建议
        """
        recommendations = []

        # 成功率建议
        success_rate = analysis['success_metrics']['success_rate']
        if success_rate < 0.7:
            recommendations.append(f"成功率过低({success_rate:.1%})，建议检查失败原因并优化修复逻辑")
        elif success_rate < 0.85:
            recommendations.append(f"成功率有改进空间({success_rate:.1%})，建议分析常见失败模式")

        # 性能建议
        avg_duration = analysis['performance_metrics']['avg_duration_minutes']
        if avg_duration > 15:
            recommendations.append(f"平均执行时间较长({avg_duration:.1f}分钟)，建议优化工作流性能")

        # 错误模式建议
        failure_patterns = analysis['error_analysis']['failure_patterns']
        for pattern in failure_patterns:
            if pattern['type'] == 'consecutive_failures':
                recommendations.append("检测到连续失败，建议立即调查根本原因")

        # 趋势建议
        trend = analysis['trend_analysis']
        if trend['success_rate_trend'] == 'declining':
            recommendations.append("成功率呈下降趋势，建议加强质量控制")

        if trend['duration_trend'] == 'declining':
            recommendations.append("执行时间呈上升趋势，建议性能优化")

        # 通用建议
        if analysis['total_runs'] < 5:
            recommendations.append("数据样本较少，建议收集更多历史数据以获得更准确的分析")

        return recommendations

    def export_metrics(self, metrics: Dict, output_format: str = 'json') -> str:
        """
        导出指标数据
        """
        if output_format == 'json':
            return json.dumps(metrics, indent=2, ensure_ascii=False, default=str)

        elif output_format == 'summary':
            return self._generate_summary_report(metrics)

        elif output_format == 'csv':
            return self._generate_csv_report(metrics)

        return str(metrics)

    def _generate_summary_report(self, metrics: Dict) -> str:
        """
        生成摘要报告
        """
        lines = [
            "=== AutoFix系统性能报告 ===",
            f"分析时间: {metrics.get('analysis_timestamp', 'unknown')}",
            f"总运行次数: {metrics.get('total_runs', 0)}",
            "",
            "=== 成功率指标 ===",
        ]

        success_metrics = metrics.get('success_metrics', {})
        lines.extend([
            f"成功率: {success_metrics.get('success_rate', 0):.1%}",
            f"失败率: {success_metrics.get('failure_rate', 0):.1%}",
            f"成功次数: {success_metrics.get('successful_runs', 0)}",
            f"失败次数: {success_metrics.get('failed_runs', 0)}",
        ])

        lines.extend([
            "",
            "=== 性能指标 ===",
        ])

        performance_metrics = metrics.get('performance_metrics', {})
        lines.extend([
            f"平均执行时间: {performance_metrics.get('avg_duration_minutes', 0):.1f}分钟",
            f"中位执行时间: {performance_metrics.get('median_duration_seconds', 0)/60:.1f}分钟",
        ])

        # 添加建议
        recommendations = metrics.get('recommendations', [])
        if recommendations:
            lines.extend([
                "",
                "=== 改进建议 ===",
            ])
            for i, rec in enumerate(recommendations, 1):
                lines.append(f"{i}. {rec}")

        return '\n'.join(lines)

    def _generate_csv_report(self, metrics: Dict) -> str:
        """
        生成CSV格式报告
        """
        csv_lines = [
            "Metric,Value,Unit",
            f"Total Runs,{metrics.get('total_runs', 0)},count",
            f"Success Rate,{metrics.get('success_metrics', {}).get('success_rate', 0):.3f},ratio",
            f"Average Duration,{metrics.get('performance_metrics', {}).get('avg_duration_minutes', 0):.2f},minutes",
        ]

        return '\n'.join(csv_lines)

def main():
    parser = argparse.ArgumentParser(description='AutoFix系统指标计算器')
    parser.add_argument('--workflow-id', help='当前工作流ID')
    parser.add_argument('--repository', required=True, help='GitHub仓库 (owner/repo)')
    parser.add_argument('--github-token', required=True, help='GitHub访问token')
    parser.add_argument('--analysis-days', type=int, default=7, help='分析天数范围')
    parser.add_argument('--output-dir', default='.', help='输出目录')
    parser.add_argument('--format', choices=['json', 'summary', 'csv'], default='json', help='输出格式')

    args = parser.parse_args()

    # 创建指标计算器
    calculator = MetricsCalculator(args.github_token, args.repository)

    try:
        # 收集工作流指标
        print(f"收集最近{args.analysis_days}天的工作流指标...", file=sys.stderr)
        workflow_runs = calculator.collect_workflow_metrics(args.analysis_days)
        print(f"收集到{len(workflow_runs)}个工作流运行记录", file=sys.stderr)

        # 分析指标
        print("分析AutoFix性能指标...", file=sys.stderr)
        metrics = calculator.analyze_autofix_performance(workflow_runs)

        # 保存原始数据
        raw_data_file = os.path.join(args.output_dir, 'workflow-metrics.json')
        with open(raw_data_file, 'w', encoding='utf-8') as f:
            raw_data = [
                {
                    'id': run.id,
                    'name': run.name,
                    'status': run.status,
                    'conclusion': run.conclusion,
                    'created_at': run.created_at.isoformat(),
                    'updated_at': run.updated_at.isoformat(),
                    'duration_seconds': run.duration_seconds,
                    'actor': run.actor,
                    'event': run.event,
                    'branch': run.branch
                }
                for run in workflow_runs
            ]
            json.dump(raw_data, f, indent=2)

        # 保存分析结果
        analysis_file = os.path.join(args.output_dir, 'analysis-metrics.json')
        with open(analysis_file, 'w', encoding='utf-8') as f:
            f.write(calculator.export_metrics(metrics, args.format))

        print(f"指标分析完成，结果保存到: {analysis_file}", file=sys.stderr)

        # 输出摘要
        if args.format == 'json':
            print(calculator.export_metrics(metrics, 'summary'))
        else:
            print(calculator.export_metrics(metrics, args.format))

    except Exception as e:
        print(f"指标收集和分析失败: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()