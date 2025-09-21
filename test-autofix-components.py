#!/usr/bin/env python3
"""
AutoFix组件测试脚本
测试和验证新开发的AutoFix增强组件
"""

import os
import sys
import json
import subprocess
import tempfile
from datetime import datetime
from typing import Dict, List, Optional

class AutoFixComponentTester:
    def __init__(self):
        self.test_results = []
        self.scripts_dir = 'scripts'

    def run_test(self, test_name: str, test_func) -> bool:
        """运行单个测试"""
        print(f"🧪 运行测试: {test_name}")
        try:
            result = test_func()
            self.test_results.append({
                'name': test_name,
                'status': 'PASS' if result else 'FAIL',
                'timestamp': datetime.utcnow().isoformat()
            })
            print(f"✅ {test_name}: {'PASS' if result else 'FAIL'}")
            return result
        except Exception as e:
            self.test_results.append({
                'name': test_name,
                'status': 'ERROR',
                'error': str(e),
                'timestamp': datetime.utcnow().isoformat()
            })
            print(f"❌ {test_name}: ERROR - {e}")
            return False

    def test_error_pattern_analyzer(self) -> bool:
        """测试错误模式分析器"""
        test_error_text = """
Cannot find module 'express'
Property 'name' does not exist on type User
Expected 'success' but received 'failure'
npm audit found 5 vulnerabilities (2 high, 3 moderate)
"""

        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
            f.write(test_error_text)
            temp_file = f.name

        try:
            # 测试单个错误分析
            result = subprocess.run([
                'python3', f'{self.scripts_dir}/error-pattern-analyzer.py',
                '--input', temp_file,
                '--format', 'json'
            ], capture_output=True, text=True)

            if result.returncode != 0:
                print(f"脚本执行失败: {result.stderr}")
                return False

            # 解析结果
            output_data = json.loads(result.stdout)

            # 验证基本结构
            required_fields = ['error_hash', 'analysis', 'matched_patterns']
            for field in required_fields:
                if field not in output_data:
                    print(f"缺少必需字段: {field}")
                    return False

            # 验证分析结果
            analysis = output_data['analysis']
            if analysis['error_type'] == 'unknown':
                print("未能识别错误类型")
                return False

            print(f"识别的错误类型: {analysis['error_type']}")
            print(f"修复策略: {analysis['fix_strategy']}")
            print(f"置信度: {analysis['confidence']:.1%}")

            return True

        finally:
            os.unlink(temp_file)

    def test_fix_strategy_generator(self) -> bool:
        """测试修复策略生成器"""
        # 创建模拟的错误分析结果
        mock_analysis = {
            "error_hash": "test123",
            "analysis": {
                "error_type": "missing_module",
                "category": "compilation",
                "severity": "high",
                "fix_strategy": "install_dependency",
                "confidence": 0.9,
                "auto_fixable": True,
                "risk_level": "low"
            },
            "matched_patterns": [
                {
                    "category": "compilation",
                    "type": "missing_module",
                    "matched_groups": ["express"],
                    "confidence": 0.9
                }
            ]
        }

        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(mock_analysis, f)
            temp_file = f.name

        try:
            result = subprocess.run([
                'python3', f'{self.scripts_dir}/fix-strategy-generator.py',
                '--analysis-file', temp_file,
                '--format', 'json'
            ], capture_output=True, text=True)

            if result.returncode != 0:
                print(f"脚本执行失败: {result.stderr}")
                return False

            # 解析策略结果
            strategy_data = json.loads(result.stdout)

            # 验证策略结构
            required_fields = ['strategy_id', 'fix_plan', 'execution_steps']
            for field in required_fields:
                if field not in strategy_data:
                    print(f"缺少必需字段: {field}")
                    return False

            # 验证执行步骤
            if not strategy_data['execution_steps']:
                print("没有生成执行步骤")
                return False

            print(f"生成策略ID: {strategy_data['strategy_id']}")
            print(f"策略类型: {strategy_data['fix_plan']['strategy_type']}")
            print(f"执行步骤数: {len(strategy_data['execution_steps'])}")

            return True

        finally:
            os.unlink(temp_file)

    def test_security_fix_planner(self) -> bool:
        """测试安全修复规划器"""
        # 创建模拟的漏洞数据
        mock_vulnerabilities = [
            {
                "id": "GHSA-test-1234",
                "severity": "high",
                "via": ["express"],
                "effects": ["@storyapp/backend"],
                "range": ">=4.0.0 <4.18.2"
            },
            {
                "id": "GHSA-test-5678",
                "severity": "moderate",
                "via": ["lodash"],
                "effects": ["@storyapp/frontend"],
                "range": ">=1.0.0 <4.17.21"
            }
        ]

        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(mock_vulnerabilities, f)
            temp_file = f.name

        try:
            result = subprocess.run([
                'python3', f'{self.scripts_dir}/security-fix-planner.py',
                '--vulnerabilities', temp_file,
                '--max-severity', 'moderate',
                '--format', 'json'
            ], capture_output=True, text=True)

            if result.returncode != 0:
                print(f"脚本执行失败: {result.stderr}")
                return False

            # 解析规划结果
            plan_data = json.loads(result.stdout)

            # 验证规划结构
            required_fields = ['total_vulnerabilities', 'recommended_strategy', 'fix_plan']
            for field in required_fields:
                if field not in plan_data:
                    print(f"缺少必需字段: {field}")
                    return False

            # 验证分析正确性
            if plan_data['total_vulnerabilities'] != len(mock_vulnerabilities):
                print("漏洞数量分析错误")
                return False

            print(f"推荐策略: {plan_data['recommended_strategy']}")
            print(f"复杂度评分: {plan_data['fix_complexity_score']:.1f}")
            print(f"风险级别: {plan_data['risk_assessment']['overall_risk']}")

            return True

        finally:
            os.unlink(temp_file)

    def test_workflow_syntax(self) -> bool:
        """测试工作流语法正确性"""
        workflow_files = [
            '.github/workflows/security-autofix.yml',
            '.github/workflows/monitoring-setup.yml'
        ]

        for workflow_file in workflow_files:
            if not os.path.exists(workflow_file):
                print(f"工作流文件不存在: {workflow_file}")
                return False

            # 简单的YAML语法检查
            try:
                import yaml
                with open(workflow_file, 'r') as f:
                    yaml.safe_load(f)
                print(f"✅ {workflow_file} 语法正确")
            except yaml.YAMLError as e:
                print(f"❌ {workflow_file} 语法错误: {e}")
                return False
            except ImportError:
                # 如果没有PyYAML，跳过YAML验证
                print(f"⚠️  跳过 {workflow_file} YAML验证（缺少PyYAML）")

        return True

    def test_config_file_validity(self) -> bool:
        """测试配置文件有效性"""
        config_file = 'config/fix-strategies.yml'

        if not os.path.exists(config_file):
            print(f"配置文件不存在: {config_file}")
            return False

        try:
            import yaml
            with open(config_file, 'r') as f:
                config = yaml.safe_load(f)

            # 验证配置结构
            required_sections = ['fix_strategies', 'error_type_mapping']
            for section in required_sections:
                if section not in config:
                    print(f"配置文件缺少部分: {section}")
                    return False

            # 验证修复策略
            strategies = config['fix_strategies']
            for strategy_name, strategy_config in strategies.items():
                if 'criteria' not in strategy_config:
                    print(f"策略 {strategy_name} 缺少criteria")
                    return False

            print(f"✅ 配置文件验证通过")
            return True

        except yaml.YAMLError as e:
            print(f"❌ 配置文件语法错误: {e}")
            return False
        except ImportError:
            print(f"⚠️  跳过配置文件验证（缺少PyYAML）")
            return True

    def test_script_permissions(self) -> bool:
        """测试脚本权限"""
        script_files = [
            'scripts/error-pattern-analyzer.py',
            'scripts/fix-strategy-generator.py',
            'scripts/security-fix-planner.py',
            'scripts/metrics-calculator.py',
            'scripts/setup-monitoring-dashboard.py'
        ]

        for script_file in script_files:
            if not os.path.exists(script_file):
                print(f"脚本文件不存在: {script_file}")
                return False

            # 检查执行权限
            if not os.access(script_file, os.X_OK):
                print(f"脚本没有执行权限: {script_file}")
                return False

        print("✅ 所有脚本权限正确")
        return True

    def test_integration_flow(self) -> bool:
        """测试组件集成流程"""
        # 创建临时错误日志
        error_log = """
Error: Cannot find module 'nonexistent-package'
TypeError: Property 'invalidProp' does not exist on type 'TestType'
SecurityError: Vulnerability found in lodash@4.17.20
"""

        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
            f.write(error_log)
            error_file = f.name

        try:
            # 步骤1: 错误分析
            print("  步骤1: 错误分析")
            result1 = subprocess.run([
                'python3', f'{self.scripts_dir}/error-pattern-analyzer.py',
                '--input', error_file,
                '--batch',
                '--format', 'json'
            ], capture_output=True, text=True)

            if result1.returncode != 0:
                print(f"错误分析失败: {result1.stderr}")
                return False

            analysis_data = json.loads(result1.stdout)

            # 步骤2: 为每个错误生成修复策略
            print("  步骤2: 策略生成")
            if 'errors' not in analysis_data:
                print("分析结果中没有错误列表")
                return False

            strategies_generated = 0
            for error in analysis_data['errors']:
                with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
                    json.dump(error, f)
                    error_analysis_file = f.name

                try:
                    result2 = subprocess.run([
                        'python3', f'{self.scripts_dir}/fix-strategy-generator.py',
                        '--analysis-file', error_analysis_file,
                        '--format', 'json'
                    ], capture_output=True, text=True)

                    if result2.returncode == 0:
                        strategies_generated += 1

                finally:
                    os.unlink(error_analysis_file)

            print(f"  生成了 {strategies_generated} 个修复策略")

            # 步骤3: 生成整体建议
            print("  步骤3: 整体建议")
            recommendations = analysis_data.get('recommendations', {})
            if recommendations:
                print(f"  立即行动: {len(recommendations.get('immediate_actions', []))}")
                print(f"  后续行动: {len(recommendations.get('follow_up_actions', []))}")

            return strategies_generated > 0

        finally:
            os.unlink(error_file)

    def run_all_tests(self) -> Dict:
        """运行所有测试"""
        print("🚀 开始AutoFix组件测试")
        print("=" * 50)

        tests = [
            ("错误模式分析器", self.test_error_pattern_analyzer),
            ("修复策略生成器", self.test_fix_strategy_generator),
            ("安全修复规划器", self.test_security_fix_planner),
            ("工作流语法检查", self.test_workflow_syntax),
            ("配置文件验证", self.test_config_file_validity),
            ("脚本权限检查", self.test_script_permissions),
            ("集成流程测试", self.test_integration_flow)
        ]

        passed = 0
        total = len(tests)

        for test_name, test_func in tests:
            if self.run_test(test_name, test_func):
                passed += 1
            print()

        # 生成测试报告
        print("=" * 50)
        print("📊 测试结果摘要")
        print(f"总测试数: {total}")
        print(f"通过: {passed}")
        print(f"失败: {total - passed}")
        print(f"通过率: {passed/total:.1%}")

        if passed == total:
            print("🎉 所有测试通过！AutoFix增强组件就绪")
        else:
            print("⚠️  部分测试失败，请检查具体问题")

        return {
            'total_tests': total,
            'passed_tests': passed,
            'failed_tests': total - passed,
            'success_rate': passed / total,
            'test_results': self.test_results
        }

def main():
    """主函数"""
    tester = AutoFixComponentTester()

    # 检查Python版本
    if sys.version_info < (3, 7):
        print("❌ 需要Python 3.7或更高版本")
        sys.exit(1)

    # 检查必要目录
    if not os.path.exists('scripts'):
        print("❌ scripts目录不存在")
        sys.exit(1)

    # 运行测试
    results = tester.run_all_tests()

    # 保存测试报告
    report_file = f"autofix-test-report-{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(report_file, 'w') as f:
        json.dump(results, f, indent=2)

    print(f"\n📄 详细测试报告已保存到: {report_file}")

    # 退出码
    sys.exit(0 if results['success_rate'] == 1.0 else 1)

if __name__ == '__main__':
    main()