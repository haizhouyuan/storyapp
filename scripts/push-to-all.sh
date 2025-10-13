#!/usr/bin/env bash
set -euo pipefail

# 儿童故事应用 - Git 推送助手
# 当前只维护 GitHub (origin) 远程

echo "🚀 儿童故事应用 - 开始推送流程..."

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "❌ 错误: 当前不在 git 仓库中"
  exit 1
fi

if ! git diff-index --quiet HEAD --; then
  echo "⚠️ 检测到未提交的更改，请先提交后再执行推送"
  git status --short
  exit 1
fi

if ! git remote | grep -q "^origin$"; then
  echo "❌ 错误: 未配置 origin 远程仓库"
  exit 1
fi

CURRENT_BRANCH="$(git branch --show-current)"
echo "📊 当前分支: ${CURRENT_BRANCH}"

echo ""
echo "📤 推送至 GitHub (origin)..."
if git push origin "$CURRENT_BRANCH"; then
  echo "✅ GitHub 推送成功"
else
  echo "❌ GitHub 推送失败，请检查网络或权限"
  exit 1
fi

echo ""
echo "🎉 推送完成"
