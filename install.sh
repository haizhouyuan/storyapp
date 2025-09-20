#!/bin/bash

# 儿童睡前故事App 自动安装脚本
# 适用于 Linux/macOS

set -e  # 出错时退出

echo "🎨 欢迎使用儿童睡前故事App安装程序"
echo "========================================="

# 检查Node.js和npm
echo "🔍 检查系统依赖..."

if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装。请先安装 Node.js (>= 16.0.0)"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "❌ npm 未安装。请先安装 npm"
    exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//')
echo "✅ Node.js 版本: $NODE_VERSION"

NPM_VERSION=$(npm -v)
echo "✅ npm 版本: $NPM_VERSION"

# 安装依赖
echo ""
echo "📦 安装项目依赖..."
echo "这可能需要几分钟时间..."

# 安装根目录依赖
echo "安装根目录依赖..."
npm install

# 安装后端依赖
echo "安装后端依赖..."
cd backend
npm install
cd ..

# 安装前端依赖
echo "安装前端依赖..."
cd frontend
npm install --legacy-peer-deps
cd ..

# 复制环境变量模板
echo ""
echo "⚙️  配置环境变量..."

if [ ! -f "backend/.env" ]; then
    cp backend/.env.example backend/.env
    echo "✅ 已创建 backend/.env"
else
    echo "⚠️  backend/.env 已存在，跳过"
fi

if [ ! -f "frontend/.env" ]; then
    cp frontend/.env.example frontend/.env
    echo "✅ 已创建 frontend/.env"
else
    echo "⚠️  frontend/.env 已存在，跳过"
fi

echo ""
echo "🎉 安装完成！"
echo ""
echo "📋 下一步操作："
echo "1. 配置 Supabase 数据库:"
echo "   - 编辑 backend/.env 文件"
echo "   - 填入你的 Supabase 项目信息"
echo "   - 在 Supabase 中创建 stories 表"
echo ""
echo "2. 启动应用:"
echo "   npm run dev"
echo ""
echo "3. 访问应用:"
echo "   http://localhost:3000"
echo ""
echo "📖 详细说明请查看: docs/SETUP.md"
echo ""
echo "🚀 准备好创作精彩的故事了吗？"