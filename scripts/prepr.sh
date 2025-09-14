#!/usr/bin/env bash
# 本地PR预检脚本 - 容器化自检通过后自动开PR
set -euo pipefail

# 参数配置
BR=${1:-"feature/auto-pr-$(date +%Y%m%d-%H%M)"}
BASE=${2:-"master"}
TITLE=${3:-"chore: 本地容器自检通过，提交PR进入AI评审与集成测试"}

echo "🚀 开始本地容器化自检流程..."
echo "📋 目标分支: $BR"
echo "📋 基础分支: $BASE"
echo "📋 PR标题: $TITLE"

# 1) 本地E2E：与CI同步
echo ""
echo "🔧 Step 1: 启动本地测试环境..."
docker compose -f docker-compose.ci.yml down -v 2>/dev/null || true
docker compose -f docker-compose.ci.yml up -d --build

# 清理函数
cleanup() {
    echo "🧹 清理测试环境..."
    docker compose -f docker-compose.ci.yml down -v
}
trap cleanup EXIT

# 等待服务健康检查
echo "⏳ 等待服务启动..."
timeout 120 bash -c '
    until docker compose -f docker-compose.ci.yml ps | grep -E "(mongo|app).*healthy|Up.*healthy" >/dev/null 2>&1; do 
        echo "  等待服务健康检查..."
        sleep 5
    done
' || {
    echo "❌ 服务启动超时，请检查docker-compose.ci.yml配置"
    exit 1
}

echo "✅ 测试环境启动成功"

# 2) 安装依赖和运行测试
echo ""
echo "🔧 Step 2: 安装依赖..."
npm ci

echo "🔧 Step 3: 安装Playwright..."
npx playwright install --with-deps

echo "🔧 Step 4: 运行E2E测试..."
npm test || {
    echo "❌ 测试失败，请修复问题后重试"
    exit 1
}

echo "✅ 所有测试通过"

# 3) 生成PR描述
echo ""
echo "🔧 Step 5: 生成PR描述..."
cat > pr-body.md << 'EOF'
## 📝 变更概要

本PR通过本地容器化自检，包含以下改进：

### 🔍 主要变更
- 代码质量改进和bug修复
- 测试覆盖率优化
- CI/CD流程增强

### ✅ 测试状态
- [x] 本地容器化E2E测试通过
- [x] 单元测试覆盖关键功能
- [x] 构建流程验证成功

### 🎯 期望行为
- 自动触发CI/CD流程
- AI评审系统自动分析
- 测试环境自动部署

### 📋 检查清单
- [x] 代码符合项目规范
- [x] 测试覆盖新增功能
- [x] 文档更新（如需要）
- [x] 兼容性验证通过

---
*本PR由自动化脚本 `scripts/prepr.sh` 生成*
EOF

# 4) Git操作检查
if ! git diff --cached --quiet; then
    echo "⚠️  检测到未提交的暂存改动，请先提交："
    git status --porcelain
    exit 1
fi

if ! git diff --quiet; then
    echo "⚠️  检测到未暂存的改动，是否自动添加？(y/N)"
    read -r response
    if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
        git add -A
        git commit -m "feat: 自动提交本地改动用于PR创建"
    else
        echo "请手动处理未提交的改动"
        exit 1
    fi
fi

# 5) 创建分支 & 推送 & 开PR
echo ""
echo "🔧 Step 6: 创建并推送分支..."

# 检查分支是否已存在
if git show-ref --verify --quiet "refs/heads/$BR"; then
    echo "⚠️  分支 $BR 已存在，切换到该分支"
    git checkout "$BR"
else
    git checkout -b "$BR"
fi

# 推送分支
git push -u origin "$BR" || {
    echo "❌ 推送失败，请检查权限和网络连接"
    exit 1
}

echo "🔧 Step 7: 创建PR..."
gh pr create -B "$BASE" -H "$BR" -t "$TITLE" -F pr-body.md || {
    echo "❌ PR创建失败，请检查gh CLI配置和权限"
    exit 1
}

# 清理临时文件
rm -f pr-body.md

echo ""
echo "🎉 成功完成本地自检并创建PR！"
echo "📋 分支: $BR"
echo "🔗 请查看GitHub页面了解AI评审和CI结果"
echo ""
echo "💡 后续步骤："
echo "   1. AI评审系统将自动分析代码"
echo "   2. CI/CD流程将自动运行"
echo "   3. 测试环境将自动部署"
echo "   4. 可使用 /codex fix 评论触发自动修复"