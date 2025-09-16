#!/bin/bash

# 儿童故事应用 - 一键双推送脚本
# 将代码同时推送到GitHub和Gitee

echo "🚀 儿童故事应用 - 开始双推送流程..."
echo "📊 当前分支: $(git branch --show-current)"
echo ""

# 检查当前是否在git仓库中
if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
    echo "❌ 错误: 当前不在git仓库中"
    exit 1
fi

# 检查是否有未提交的更改
if ! git diff-index --quiet HEAD --; then
    echo "⚠️ 警告: 检测到未提交的更改"
    echo "请先提交更改后再运行推送脚本"
    git status --short
    exit 1
fi

# 检查远程仓库配置
echo "🔍 检查远程仓库配置..."
if ! git remote | grep -q "origin"; then
    echo "❌ 错误: 未配置origin远程仓库"
    exit 1
fi

if ! git remote | grep -q "gitee"; then
    echo "❌ 错误: 未配置gitee远程仓库"
    exit 1
fi

# 获取当前分支
CURRENT_BRANCH=$(git branch --show-current)

# 推送到GitHub
echo ""
echo "📤 推送到GitHub (origin)..."
git push origin $CURRENT_BRANCH
GITHUB_EXIT_CODE=$?

if [ $GITHUB_EXIT_CODE -eq 0 ]; then
    echo "✅ GitHub推送成功"
else
    echo "❌ GitHub推送失败 (退出码: $GITHUB_EXIT_CODE)"
    echo "💡 提示: 检查网络连接或推送权限"
fi

# 推送到Gitee
echo ""
echo "📤 推送到Gitee..."
git push gitee $CURRENT_BRANCH
GITEE_EXIT_CODE=$?

if [ $GITEE_EXIT_CODE -eq 0 ]; then
    echo "✅ Gitee推送成功"
else
    echo "❌ Gitee推送失败 (退出码: $GITEE_EXIT_CODE)"
    echo "💡 提示: 检查网络连接或推送权限"
fi

# 汇总结果
echo ""
echo "📊 推送结果汇总:"
echo "   GitHub: $( [ $GITHUB_EXIT_CODE -eq 0 ] && echo '✅ 成功' || echo '❌ 失败' )"
echo "   Gitee:  $( [ $GITEE_EXIT_CODE -eq 0 ] && echo '✅ 成功' || echo '❌ 失败' )"

if [ $GITHUB_EXIT_CODE -eq 0 ] && [ $GITEE_EXIT_CODE -eq 0 ]; then
    echo ""
    echo "🎉 双推送完成！代码已同步到所有远程仓库"
    echo "💡 下一步: 登录阿里云服务器执行部署"
else
    echo ""
    echo "⚠️  推送过程中出现错误，请检查后重试"
    exit 1
fi