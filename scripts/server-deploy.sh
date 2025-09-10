#!/bin/bash

# 儿童故事应用 - 阿里云服务器部署脚本
# 用于在生产服务器上执行部署

echo "🚀 儿童故事应用 - 开始服务器部署流程..."
echo "📍 部署环境: 生产环境"
echo ""

# 检查当前目录
echo "🔍 检查项目结构..."
if [ ! -f "package.json" ]; then
    echo "❌ 错误: 请在项目根目录运行此脚本"
    exit 1
fi

if [ ! -f "deploy.sh" ]; then
    echo "❌ 错误: 未找到部署脚本 deploy.sh"
    exit 1
fi

# 检查git仓库
echo "🔍 检查git配置..."
if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
    echo "❌ 错误: 当前不在git仓库中"
    exit 1
fi

# 检查远程仓库配置
if ! git remote | grep -q "gitee"; then
    echo "❌ 错误: 未配置gitee远程仓库"
    echo "💡 请运行: git remote add gitee https://gitee.com/yuanhaizhou123/storyapp.git"
    exit 1
fi

# 从Gitee拉取最新代码
echo ""
echo "📥 从Gitee拉取最新代码..."
git pull gitee main
PULL_EXIT_CODE=$?

if [ $PULL_EXIT_CODE -ne 0 ]; then
    echo "❌ 拉取代码失败 (退出码: $PULL_EXIT_CODE)"
    echo "💡 提示: 检查网络连接或仓库权限"
    exit 1
fi

echo "✅ 代码拉取成功"

# 检查是否有package.json变更
echo ""
echo "📦 检查依赖变更..."
if git diff --name-only HEAD~1 HEAD | grep -q "package.json\|package-lock.json"; then
    echo "🔄 检测到依赖变更，重新安装依赖..."
    npm run install:all
    if [ $? -ne 0 ]; then
        echo "❌ 依赖安装失败"
        exit 1
    fi
    echo "✅ 依赖安装完成"
else
    echo "📋 无依赖变更，跳过安装"
fi

# 构建生产版本
echo ""
echo "🔨 构建生产版本..."
npm run build
BUILD_EXIT_CODE=$?

if [ $BUILD_EXIT_CODE -ne 0 ]; then
    echo "❌ 构建失败 (退出码: $BUILD_EXIT_CODE)"
    echo "💡 提示: 检查构建错误信息"
    exit 1
fi

echo "✅ 构建完成"

# Docker部署
echo ""
echo "🐳 使用Docker部署应用..."
./deploy.sh --rebuild production
DEPLOY_EXIT_CODE=$?

if [ $DEPLOY_EXIT_CODE -ne 0 ]; then
    echo "❌ Docker部署失败 (退出码: $DEPLOY_EXIT_CODE)"
    exit 1
fi

# 健康检查
echo ""
echo "🏥 等待服务启动并进行健康检查..."
sleep 15

echo ""
echo "📊 检查服务状态..."
./deploy.sh --status

# 最终API健康检查
echo ""
echo "🔬 执行最终API健康检查..."
if curl -f http://localhost:5001/api/health > /dev/null 2>&1; then
    echo "✅ API健康检查通过"
else
    echo "❌ API健康检查失败"
    echo "💡 提示: 查看容器日志: docker-compose logs app"
    exit 1
fi

echo ""
echo "🎉 部署完成！"
echo "🌐 应用地址: http://localhost:5001"
echo "🔧 健康检查: http://localhost:5001/api/health"
echo ""
echo "📋 常用管理命令:"
echo "  查看日志: docker-compose logs -f app"
echo "  服务状态: ./deploy.sh --status"
echo "  重启服务: ./deploy.sh --rebuild production"
echo ""
echo "🚀 儿童故事应用已成功部署到生产环境！"