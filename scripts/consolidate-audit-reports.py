#!/usr/bin/env python3
"""
合并多个npm audit报告
"""
import json
import os
import sys

def consolidate_reports():
    """合并audit报告"""
    reports = ['root-audit.json', 'backend-audit.json', 'frontend-audit.json']
    consolidated = {
        'vulnerabilities': {},
        'metadata': {
            'totalDependencies': 0,
            'vulnerabilities': {'total': 0, 'critical': 0, 'high': 0, 'moderate': 0, 'low': 0}
        },
        'advisories': {}
    }

    for report_file in reports:
        file_path = f'security-reports/{report_file}'
        if os.path.exists(file_path):
            try:
                with open(file_path, 'r') as f:
                    data = json.load(f)

                if 'vulnerabilities' in data:
                    consolidated['vulnerabilities'].update(data['vulnerabilities'])

                if 'advisories' in data:
                    consolidated['advisories'].update(data['advisories'])

                if 'metadata' in data and 'vulnerabilities' in data['metadata']:
                    meta = data['metadata']['vulnerabilities']
                    for severity in ['total', 'critical', 'high', 'moderate', 'low']:
                        if severity in meta:
                            consolidated['metadata']['vulnerabilities'][severity] += meta[severity]

            except Exception as e:
                print(f'Error processing {report_file}: {e}')

    # 保存合并后的报告
    with open('security-reports/consolidated-audit.json', 'w') as f:
        json.dump(consolidated, f, indent=2)

    # 输出统计信息
    print(f'Total vulnerabilities: {consolidated["metadata"]["vulnerabilities"]["total"]}')
    print(f'Critical: {consolidated["metadata"]["vulnerabilities"]["critical"]}')
    print(f'High: {consolidated["metadata"]["vulnerabilities"]["high"]}')
    print(f'Moderate: {consolidated["metadata"]["vulnerabilities"]["moderate"]}')

    return consolidated["metadata"]["vulnerabilities"]["total"]

def extract_vulnerabilities():
    """提取漏洞详情"""
    with open('security-reports/consolidated-audit.json', 'r') as f:
        data = json.load(f)

    vulnerabilities = []
    for vuln_id, vuln_data in data.get('vulnerabilities', {}).items():
        vulnerabilities.append({
            'id': vuln_id,
            'severity': vuln_data.get('severity', 'unknown'),
            'via': vuln_data.get('via', []),
            'effects': vuln_data.get('effects', []),
            'range': vuln_data.get('range', ''),
            'nodes': vuln_data.get('nodes', [])
        })

    with open('security-reports/vulnerabilities.json', 'w') as f:
        json.dump(vulnerabilities, f, indent=2)

    return len(vulnerabilities)

if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'extract':
        extract_vulnerabilities()
    else:
        consolidate_reports()