#!/usr/bin/env python3
"""
监控Dashboard设置脚本
为AutoFix系统生成监控面板配置和可视化数据
"""

import json
import sys
import argparse
import os
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
import statistics

class MonitoringDashboard:
    def __init__(self):
        """
        初始化监控Dashboard生成器
        """
        self.dashboard_config = {
            'title': 'StoryApp AutoFix 监控台',
            'description': 'AutoFix系统性能和健康状况监控',
            'refresh_interval': '30s',
            'time_range': '24h',
            'panels': []
        }

        # 定义颜色主题
        self.colors = {
            'success': '#28a745',
            'warning': '#ffc107',
            'danger': '#dc3545',
            'info': '#17a2b8',
            'primary': '#007bff',
            'secondary': '#6c757d'
        }

        # 定义阈值
        self.thresholds = {
            'success_rate': {
                'good': 0.85,
                'warning': 0.70,
                'critical': 0.50
            },
            'avg_duration_minutes': {
                'good': 5,
                'warning': 10,
                'critical': 15
            },
            'failure_rate': {
                'good': 0.15,
                'warning': 0.30,
                'critical': 0.50
            }
        }

    def generate_dashboard_config(self, analysis_data: Dict) -> Dict:
        """
        基于分析数据生成完整的Dashboard配置
        """
        dashboard = {
            'id': 'autofix-monitoring-dashboard',
            'title': self.dashboard_config['title'],
            'description': self.dashboard_config['description'],
            'generated_at': datetime.utcnow().isoformat(),
            'data_source': analysis_data.get('analysis_timestamp', 'unknown'),
            'panels': []
        }

        # 生成各种面板
        dashboard['panels'].extend(self._generate_overview_panels(analysis_data))
        dashboard['panels'].extend(self._generate_performance_panels(analysis_data))
        dashboard['panels'].extend(self._generate_error_analysis_panels(analysis_data))
        dashboard['panels'].extend(self._generate_trend_panels(analysis_data))
        dashboard['panels'].extend(self._generate_workflow_breakdown_panels(analysis_data))

        return dashboard

    def _generate_overview_panels(self, analysis_data: Dict) -> List[Dict]:
        """
        生成概览面板
        """
        panels = []

        success_metrics = analysis_data.get('success_metrics', {})
        performance_metrics = analysis_data.get('performance_metrics', {})

        # 总体成功率面板
        success_rate = success_metrics.get('success_rate', 0)
        panels.append({
            'id': 'overall-success-rate',
            'type': 'stat',
            'title': '总体成功率',
            'description': 'AutoFix系统整体修复成功率',
            'value': f"{success_rate:.1%}",
            'color': self._get_threshold_color('success_rate', success_rate),
            'trend': self._get_trend_indicator(analysis_data, 'success_rate'),
            'targets': [
                {
                    'metric': 'success_rate',
                    'value': success_rate,
                    'format': 'percent'
                }
            ],
            'thresholds': [
                {'color': self.colors['danger'], 'value': self.thresholds['success_rate']['critical']},
                {'color': self.colors['warning'], 'value': self.thresholds['success_rate']['warning']},
                {'color': self.colors['success'], 'value': self.thresholds['success_rate']['good']}
            ]
        })

        # 平均修复时间面板
        avg_duration = performance_metrics.get('avg_duration_minutes', 0)
        panels.append({
            'id': 'avg-fix-time',
            'type': 'stat',
            'title': '平均修复时间',
            'description': '从触发到完成的平均时间',
            'value': f"{avg_duration:.1f}min",
            'color': self._get_threshold_color('avg_duration_minutes', avg_duration),
            'trend': self._get_trend_indicator(analysis_data, 'duration'),
            'targets': [
                {
                    'metric': 'avg_duration_minutes',
                    'value': avg_duration,
                    'format': 'minutes'
                }
            ]
        })

        # 总运行次数面板
        total_runs = analysis_data.get('total_runs', 0)
        panels.append({
            'id': 'total-runs',
            'type': 'stat',
            'title': '总运行次数',
            'description': '分析期间内的总执行次数',
            'value': str(total_runs),
            'color': self.colors['info'],
            'targets': [
                {
                    'metric': 'total_runs',
                    'value': total_runs,
                    'format': 'number'
                }
            ]
        })

        # 失败率面板
        failure_rate = success_metrics.get('failure_rate', 0)
        panels.append({
            'id': 'failure-rate',
            'type': 'stat',
            'title': '失败率',
            'description': '修复失败的比例',
            'value': f"{failure_rate:.1%}",
            'color': self._get_inverse_threshold_color('failure_rate', failure_rate),
            'targets': [
                {
                    'metric': 'failure_rate',
                    'value': failure_rate,
                    'format': 'percent'
                }
            ]
        })

        return panels

    def _generate_performance_panels(self, analysis_data: Dict) -> List[Dict]:
        """
        生成性能分析面板
        """
        panels = []
        performance_metrics = analysis_data.get('performance_metrics', {})

        # 执行时间分布面板
        percentiles = performance_metrics.get('duration_percentiles', {})
        if percentiles:
            panels.append({
                'id': 'duration-percentiles',
                'type': 'gauge',
                'title': '执行时间分布',
                'description': '不同百分位数的执行时间',
                'data': [
                    {'name': 'P50', 'value': percentiles.get('p50', 0) / 60, 'unit': 'min'},
                    {'name': 'P75', 'value': percentiles.get('p75', 0) / 60, 'unit': 'min'},
                    {'name': 'P90', 'value': percentiles.get('p90', 0) / 60, 'unit': 'min'},
                    {'name': 'P95', 'value': percentiles.get('p95', 0) / 60, 'unit': 'min'}
                ],
                'max_value': 20,  # 20分钟最大值
                'thresholds': [
                    {'color': self.colors['success'], 'value': 0},
                    {'color': self.colors['warning'], 'value': 10},
                    {'color': self.colors['danger'], 'value': 15}
                ]
            })

        # 最快/最慢运行面板
        fastest_run = performance_metrics.get('fastest_run')
        slowest_run = performance_metrics.get('slowest_run')

        if fastest_run and slowest_run:
            panels.append({
                'id': 'speed-comparison',
                'type': 'table',
                'title': '速度对比',
                'description': '最快和最慢的运行记录',
                'columns': ['类型', '工作流', '耗时', '运行ID'],
                'data': [
                    [
                        '最快',
                        fastest_run.get('name', 'Unknown'),
                        f"{fastest_run.get('duration_seconds', 0)/60:.1f}min",
                        fastest_run.get('id', 'N/A')
                    ],
                    [
                        '最慢',
                        slowest_run.get('name', 'Unknown'),
                        f"{slowest_run.get('duration_seconds', 0)/60:.1f}min",
                        slowest_run.get('id', 'N/A')
                    ]
                ]
            })

        return panels

    def _generate_error_analysis_panels(self, analysis_data: Dict) -> List[Dict]:
        """
        生成错误分析面板
        """
        panels = []
        error_analysis = analysis_data.get('error_analysis', {})

        # 错误分布饼图
        failure_by_workflow = error_analysis.get('failure_by_workflow', {})
        if failure_by_workflow:
            panels.append({
                'id': 'error-distribution',
                'type': 'pie',
                'title': '错误分布',
                'description': '按工作流类型的错误分布',
                'data': [
                    {'name': workflow, 'value': count, 'color': self._get_workflow_color(workflow)}
                    for workflow, count in failure_by_workflow.items()
                ]
            })

        # 失败模式分析
        failure_patterns = error_analysis.get('failure_patterns', [])
        if failure_patterns:
            panels.append({
                'id': 'failure-patterns',
                'type': 'alert',
                'title': '失败模式分析',
                'description': '检测到的异常模式',
                'alerts': [
                    {
                        'type': self._get_pattern_severity(pattern['type']),
                        'message': pattern['description'],
                        'count': pattern.get('count', 1)
                    }
                    for pattern in failure_patterns
                ]
            })

        # 错误触发源分析
        failure_by_event = error_analysis.get('failure_by_event', {})
        failure_by_actor = error_analysis.get('failure_by_actor', {})

        if failure_by_event or failure_by_actor:
            panels.append({
                'id': 'error-sources',
                'type': 'bar',
                'title': '错误来源分析',
                'description': '按触发事件和执行者的错误分布',
                'data': {
                    'events': [
                        {'name': event, 'value': count}
                        for event, count in failure_by_event.items()
                    ],
                    'actors': [
                        {'name': actor, 'value': count}
                        for actor, count in failure_by_actor.items()
                    ]
                }
            })

        return panels

    def _generate_trend_panels(self, analysis_data: Dict) -> List[Dict]:
        """
        生成趋势分析面板
        """
        panels = []
        trend_analysis = analysis_data.get('trend_analysis', {})

        # 趋势概览面板
        panels.append({
            'id': 'trend-overview',
            'type': 'trend',
            'title': '趋势分析',
            'description': '系统各项指标的变化趋势',
            'trends': [
                {
                    'name': '成功率趋势',
                    'direction': trend_analysis.get('success_rate_trend', 'stable'),
                    'color': self._get_trend_color(trend_analysis.get('success_rate_trend', 'stable'))
                },
                {
                    'name': '执行时间趋势',
                    'direction': trend_analysis.get('duration_trend', 'stable'),
                    'color': self._get_trend_color(trend_analysis.get('duration_trend', 'stable'))
                },
                {
                    'name': '执行频率趋势',
                    'direction': trend_analysis.get('frequency_trend', 'stable'),
                    'color': self._get_trend_color(trend_analysis.get('frequency_trend', 'stable'))
                }
            ]
        })

        return panels

    def _generate_workflow_breakdown_panels(self, analysis_data: Dict) -> List[Dict]:
        """
        生成工作流分解面板
        """
        panels = []
        workflow_breakdown = analysis_data.get('workflow_breakdown', {})

        if not workflow_breakdown:
            return panels

        # 工作流性能对比表
        table_data = []
        for workflow_name, stats in workflow_breakdown.items():
            table_data.append([
                workflow_name,
                stats.get('total_runs', 0),
                f"{stats.get('success_rate', 0):.1%}",
                f"{stats.get('avg_duration', 0)/60:.1f}min",
                stats.get('failed_runs', 0)
            ])

        panels.append({
            'id': 'workflow-performance',
            'type': 'table',
            'title': '工作流性能对比',
            'description': '各工作流的详细性能指标',
            'columns': ['工作流', '总运行', '成功率', '平均时间', '失败次数'],
            'data': table_data,
            'sortable': True,
            'searchable': True
        })

        # 工作流成功率对比图
        success_rate_data = [
            {
                'name': workflow_name,
                'value': stats.get('success_rate', 0),
                'total_runs': stats.get('total_runs', 0)
            }
            for workflow_name, stats in workflow_breakdown.items()
        ]

        panels.append({
            'id': 'workflow-success-rates',
            'type': 'bar',
            'title': '工作流成功率对比',
            'description': '各工作流的成功率横向对比',
            'data': success_rate_data,
            'y_axis': {'max': 1.0, 'format': 'percent'},
            'colors': [
                self._get_threshold_color('success_rate', item['value'])
                for item in success_rate_data
            ]
        })

        return panels

    def _get_threshold_color(self, metric: str, value: float) -> str:
        """
        根据阈值获取颜色
        """
        thresholds = self.thresholds.get(metric, {})

        if metric == 'avg_duration_minutes':
            # 时间越短越好（相反逻辑）
            if value <= thresholds.get('good', 5):
                return self.colors['success']
            elif value <= thresholds.get('warning', 10):
                return self.colors['warning']
            else:
                return self.colors['danger']
        else:
            # 数值越高越好（正常逻辑）
            if value >= thresholds.get('good', 0.85):
                return self.colors['success']
            elif value >= thresholds.get('warning', 0.70):
                return self.colors['warning']
            else:
                return self.colors['danger']

    def _get_inverse_threshold_color(self, metric: str, value: float) -> str:
        """
        获取反向阈值颜色（失败率等，越低越好）
        """
        thresholds = self.thresholds.get(metric, {})

        if value <= thresholds.get('good', 0.15):
            return self.colors['success']
        elif value <= thresholds.get('warning', 0.30):
            return self.colors['warning']
        else:
            return self.colors['danger']

    def _get_trend_indicator(self, analysis_data: Dict, metric: str) -> str:
        """
        获取趋势指示器
        """
        trend_analysis = analysis_data.get('trend_analysis', {})

        if metric == 'success_rate':
            trend = trend_analysis.get('success_rate_trend', 'stable')
        elif metric == 'duration':
            trend = trend_analysis.get('duration_trend', 'stable')
        else:
            trend = 'stable'

        trend_icons = {
            'improving': '↗️',
            'declining': '↘️',
            'stable': '→',
            'increasing': '↗️',
            'decreasing': '↘️'
        }

        return trend_icons.get(trend, '→')

    def _get_trend_color(self, trend: str) -> str:
        """
        获取趋势颜色
        """
        if trend in ['improving', 'decreasing']:  # decreasing对于错误率是好事
            return self.colors['success']
        elif trend in ['declining', 'increasing']:  # increasing对于错误率是坏事
            return self.colors['danger']
        else:
            return self.colors['info']

    def _get_workflow_color(self, workflow_name: str) -> str:
        """
        为不同工作流分配颜色
        """
        color_map = {
            'Auto Fix on Comment': self.colors['primary'],
            'ClaudeCode Autofix on CI failure': self.colors['info'],
            'Security Auto-Fix': self.colors['warning'],
            'Enhanced Monitoring Setup': self.colors['secondary']
        }

        return color_map.get(workflow_name, self.colors['primary'])

    def _get_pattern_severity(self, pattern_type: str) -> str:
        """
        获取失败模式的严重程度
        """
        severity_map = {
            'consecutive_failures': 'danger',
            'high_recent_failure_rate': 'warning',
            'timeout_errors': 'warning',
            'dependency_issues': 'info'
        }

        return severity_map.get(pattern_type, 'info')

    def generate_widgets_config(self, analysis_data: Dict) -> Dict:
        """
        生成小部件配置（用于嵌入其他系统）
        """
        success_metrics = analysis_data.get('success_metrics', {})
        performance_metrics = analysis_data.get('performance_metrics', {})

        widgets = {
            'summary_widget': {
                'type': 'summary',
                'data': {
                    'success_rate': success_metrics.get('success_rate', 0),
                    'avg_duration': performance_metrics.get('avg_duration_minutes', 0),
                    'total_runs': analysis_data.get('total_runs', 0),
                    'trend': analysis_data.get('trend_analysis', {}).get('trend_direction', 'stable')
                }
            },
            'health_widget': {
                'type': 'health_indicator',
                'data': {
                    'status': self._calculate_health_status(analysis_data),
                    'last_updated': datetime.utcnow().isoformat(),
                    'metrics_count': len(analysis_data.get('success_metrics', {}))
                }
            },
            'alert_widget': {
                'type': 'alerts',
                'data': {
                    'active_alerts': self._generate_active_alerts(analysis_data),
                    'alert_count': len(analysis_data.get('error_analysis', {}).get('failure_patterns', []))
                }
            }
        }

        return widgets

    def _calculate_health_status(self, analysis_data: Dict) -> str:
        """
        计算系统健康状态
        """
        success_rate = analysis_data.get('success_metrics', {}).get('success_rate', 0)
        avg_duration = analysis_data.get('performance_metrics', {}).get('avg_duration_minutes', 0)
        failure_patterns = analysis_data.get('error_analysis', {}).get('failure_patterns', [])

        # 健康评分计算
        health_score = 0

        # 成功率权重 50%
        if success_rate >= 0.9:
            health_score += 50
        elif success_rate >= 0.8:
            health_score += 40
        elif success_rate >= 0.7:
            health_score += 30
        else:
            health_score += 10

        # 性能权重 30%
        if avg_duration <= 5:
            health_score += 30
        elif avg_duration <= 10:
            health_score += 20
        elif avg_duration <= 15:
            health_score += 10

        # 错误模式权重 20%
        if not failure_patterns:
            health_score += 20
        elif len(failure_patterns) <= 1:
            health_score += 10

        # 确定状态
        if health_score >= 80:
            return 'healthy'
        elif health_score >= 60:
            return 'warning'
        else:
            return 'critical'

    def _generate_active_alerts(self, analysis_data: Dict) -> List[Dict]:
        """
        生成活跃告警
        """
        alerts = []

        success_rate = analysis_data.get('success_metrics', {}).get('success_rate', 0)
        if success_rate < 0.7:
            alerts.append({
                'type': 'critical',
                'message': f'成功率过低: {success_rate:.1%}',
                'timestamp': datetime.utcnow().isoformat()
            })

        avg_duration = analysis_data.get('performance_metrics', {}).get('avg_duration_minutes', 0)
        if avg_duration > 15:
            alerts.append({
                'type': 'warning',
                'message': f'平均执行时间过长: {avg_duration:.1f}分钟',
                'timestamp': datetime.utcnow().isoformat()
            })

        failure_patterns = analysis_data.get('error_analysis', {}).get('failure_patterns', [])
        for pattern in failure_patterns:
            if pattern['type'] == 'consecutive_failures':
                alerts.append({
                    'type': 'critical',
                    'message': pattern['description'],
                    'timestamp': datetime.utcnow().isoformat()
                })

        return alerts

    def export_dashboard_config(self, config: Dict, output_format: str = 'json') -> str:
        """
        导出Dashboard配置
        """
        if output_format == 'json':
            return json.dumps(config, indent=2, ensure_ascii=False)

        elif output_format == 'grafana':
            return self._convert_to_grafana_format(config)

        elif output_format == 'html':
            return self._generate_html_dashboard(config)

        return str(config)

    def _convert_to_grafana_format(self, config: Dict) -> str:
        """
        转换为Grafana格式
        """
        grafana_dashboard = {
            'dashboard': {
                'id': None,
                'title': config['title'],
                'description': config['description'],
                'tags': ['autofix', 'monitoring', 'storyapp'],
                'timezone': 'browser',
                'panels': [],
                'time': {
                    'from': 'now-24h',
                    'to': 'now'
                },
                'refresh': '30s'
            }
        }

        # 转换面板格式
        for i, panel in enumerate(config.get('panels', [])):
            grafana_panel = {
                'id': i + 1,
                'title': panel['title'],
                'type': self._map_panel_type_to_grafana(panel['type']),
                'gridPos': {
                    'h': 8,
                    'w': 12,
                    'x': (i % 2) * 12,
                    'y': (i // 2) * 8
                }
            }
            grafana_dashboard['dashboard']['panels'].append(grafana_panel)

        return json.dumps(grafana_dashboard, indent=2)

    def _map_panel_type_to_grafana(self, panel_type: str) -> str:
        """
        映射面板类型到Grafana格式
        """
        type_mapping = {
            'stat': 'stat',
            'gauge': 'gauge',
            'table': 'table',
            'pie': 'piechart',
            'bar': 'barchart',
            'trend': 'timeseries',
            'alert': 'alertlist'
        }

        return type_mapping.get(panel_type, 'stat')

    def _generate_html_dashboard(self, config: Dict) -> str:
        """
        生成HTML格式的Dashboard
        """
        html_template = f"""
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{config['title']}</title>
    <style>
        body {{ font-family: Arial, sans-serif; margin: 20px; background-color: #f5f5f5; }}
        .dashboard {{ max-width: 1200px; margin: 0 auto; }}
        .header {{ text-align: center; margin-bottom: 30px; }}
        .panels {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }}
        .panel {{ background: white; border-radius: 8px; padding: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }}
        .panel-title {{ font-size: 18px; font-weight: bold; margin-bottom: 10px; }}
        .panel-description {{ color: #666; margin-bottom: 15px; }}
        .stat-value {{ font-size: 36px; font-weight: bold; text-align: center; }}
        .timestamp {{ text-align: center; color: #999; margin-top: 20px; }}
    </style>
</head>
<body>
    <div class="dashboard">
        <div class="header">
            <h1>{config['title']}</h1>
            <p>{config.get('description', '')}</p>
        </div>
        <div class="panels">
            {"".join(self._generate_html_panel(panel) for panel in config.get('panels', []))}
        </div>
        <div class="timestamp">
            生成时间: {config.get('generated_at', datetime.utcnow().isoformat())}
        </div>
    </div>
</body>
</html>
        """

        return html_template

    def _generate_html_panel(self, panel: Dict) -> str:
        """
        生成HTML面板
        """
        panel_html = f"""
        <div class="panel">
            <div class="panel-title">{panel['title']}</div>
            <div class="panel-description">{panel.get('description', '')}</div>
        """

        if panel['type'] == 'stat':
            color = panel.get('color', '#007bff')
            panel_html += f"""
            <div class="stat-value" style="color: {color};">
                {panel.get('value', 'N/A')}
            </div>
            """

        elif panel['type'] == 'table':
            columns = panel.get('columns', [])
            data = panel.get('data', [])

            panel_html += "<table style='width: 100%; border-collapse: collapse;'>"
            panel_html += "<tr>" + "".join(f"<th style='border: 1px solid #ddd; padding: 8px;'>{col}</th>" for col in columns) + "</tr>"

            for row in data:
                panel_html += "<tr>" + "".join(f"<td style='border: 1px solid #ddd; padding: 8px;'>{cell}</td>" for cell in row) + "</tr>"

            panel_html += "</table>"

        panel_html += "</div>"
        return panel_html

def main():
    parser = argparse.ArgumentParser(description='监控Dashboard设置脚本')
    parser.add_argument('--analysis-report', '-a', required=True, help='分析报告JSON文件路径')
    parser.add_argument('--output-dir', '-o', default='.', help='输出目录')
    parser.add_argument('--format', choices=['json', 'grafana', 'html'], default='json', help='输出格式')
    parser.add_argument('--include-widgets', action='store_true', help='包含小部件配置')

    args = parser.parse_args()

    try:
        # 读取分析报告
        with open(args.analysis_report, 'r', encoding='utf-8') as f:
            analysis_data = json.load(f)

        # 创建Dashboard生成器
        dashboard = MonitoringDashboard()

        # 生成Dashboard配置
        dashboard_config = dashboard.generate_dashboard_config(analysis_data)

        # 保存主配置
        output_file = os.path.join(args.output_dir, f'dashboard-config.{args.format}')
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(dashboard.export_dashboard_config(dashboard_config, args.format))

        print(f"Dashboard配置已生成: {output_file}")

        # 生成小部件配置（如果需要）
        if args.include_widgets:
            widgets_config = dashboard.generate_widgets_config(analysis_data)
            widgets_file = os.path.join(args.output_dir, 'widgets-config.json')
            with open(widgets_file, 'w', encoding='utf-8') as f:
                json.dump(widgets_config, f, indent=2, ensure_ascii=False)
            print(f"小部件配置已生成: {widgets_file}")

        # 生成健康状态摘要
        health_status = dashboard._calculate_health_status(analysis_data)
        print(f"系统健康状态: {health_status}")

        # 显示关键指标
        success_rate = analysis_data.get('success_metrics', {}).get('success_rate', 0)
        avg_duration = analysis_data.get('performance_metrics', {}).get('avg_duration_minutes', 0)
        total_runs = analysis_data.get('total_runs', 0)

        print(f"关键指标 - 成功率: {success_rate:.1%}, 平均时间: {avg_duration:.1f}min, 总运行: {total_runs}")

    except FileNotFoundError:
        print(f"错误: 找不到分析报告文件 {args.analysis_report}", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError:
        print(f"错误: 无法解析JSON文件 {args.analysis_report}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"生成Dashboard配置时出错: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()