# Codex 环境 Node.js 配置方案

## 问题背景

Codex TUI 使用 Landlock 沙箱限制对仓库外文件的访问，导致无法使用系统级或用户级的 Node.js。

## 解决方案：极简 Node 同步

### 1. 同步 Node.js 到仓库（仅保留必需文件）

```bash
# 在宿主终端执行
cd /home/yuanhaizhou/projects/storyapp

# 清理旧的同步内容
rm -rf .tools/node-v22

# 极简同步（仅 117-137MB，包含 node + npm + corepack）
mkdir -p .tools/node-v22 && rsync -a \
  --include 'bin/' \
  --include 'bin/node' \
  --include 'bin/npm' \
  --include 'lib/' \
  --include 'lib/node_modules/' \
  --include 'lib/node_modules/npm/***' \
  --include 'lib/node_modules/corepack/***' \
  --exclude 'lib/node_modules/*' \
  --exclude '*' \
  ~/.nvm/versions/node/v22.19.0/  .tools/node-v22/
```

**优势**：
- ✅ 体积小（约 137MB vs 原始全量拷贝 1GB+）
- ✅ 排除全局安装的包（如 playwright-mcp 等）
- ✅ 包含 Node、npm、corepack 的完整功能

### 2. 创建便捷脚本（推荐）

项目已提供 `scripts/dev/nodehere` 脚本：

```bash
#!/usr/bin/env bash
set -euo pipefail
ROOT="/home/yuanhaizhou/projects/storyapp"
export PATH="$ROOT/.tools/node-v22/bin:$PATH"
exec "$@"
```

**使用示例**：

```bash
# 宿主终端
scripts/dev/nodehere node -v
scripts/dev/nodehere npm -v
scripts/dev/nodehere npm run -w backend type-check

# Codex TUI 内
bash -lc 'scripts/dev/nodehere npm run -w backend type-check'
bash -lc 'scripts/dev/nodehere npm run -w frontend build'
```

### 3. 手动 PATH 注入（不使用脚本时）

```bash
# Codex TUI 内
bash -lc 'export PATH="$PWD/.tools/node-v22/bin:$PATH"; node -v; npm -v'
bash -lc 'export PATH="$PWD/.tools/node-v22/bin:$PATH"; npm run -w backend type-check'
```

## 验证清单

### 宿主环境验证

```bash
cd /home/yuanhaizhou/projects/storyapp

# 检查文件大小
du -sh .tools/node-v22  # 应显示约 137M

# 验证 Node 和 npm
export PATH="$PWD/.tools/node-v22/bin:$PATH"
which node  # /home/yuanhaizhou/projects/storyapp/.tools/node-v22/bin/node
which npm   # /home/yuanhaizhou/projects/storyapp/.tools/node-v22/bin/npm
node -v     # v22.19.0
npm -v      # 10.9.3

# 测试 npm 命令
npm run -w backend type-check  # 应成功执行 TypeScript 类型检查
```

### Codex TUI 验证

```bash
# 在 Codex TUI 内执行
bash -lc 'export PATH="$PWD/.tools/node-v22/bin:$PATH"; which node; node -v'
# 或使用 nodehere 脚本
bash -lc 'scripts/dev/nodehere node -v'
```

## 故障排除

### 问题：`/usr/bin/env: 'node': No such file or directory`

**原因**：npm 的 shebang 是 `#!/usr/bin/env node`，需要 node 在 PATH 中。

**解决**：确保在执行 npm 命令前已设置 PATH：
```bash
export PATH="$PWD/.tools/node-v22/bin:$PATH"
```

### 问题：`No space left on device`

**原因**：完整复制 nvm 版本（包含全局包）体积过大。

**解决**：使用本文档提供的"极简同步"方案，仅同步必需文件。

### 问题：npm-cli.js 不存在

**原因**：rsync 的 `--delete` 参数删除了必需文件。

**解决**：确保使用正确的 rsync 命令（见上方"同步 Node.js"部分）。

## 磁盘空间管理

如果项目分区空间紧张，可将 Node 放到其他分区：

```bash
# 同步到用户目录（假设空间充足）
rsync -a \
  --include 'bin/' --include 'bin/node' --include 'bin/npm' \
  --include 'lib/' --include 'lib/node_modules/' \
  --include 'lib/node_modules/npm/***' --include 'lib/node_modules/corepack/***' \
  --exclude 'lib/node_modules/*' --exclude '*' \
  ~/.nvm/versions/node/v22.19.0/  ~/.tools/node-v22/

# 修改 nodehere 脚本中的 PATH（或在 Codex 中使用绝对路径）
export PATH="/home/yuanhaizhou/.tools/node-v22/bin:$PATH"
```

**注意**：如果 Codex 启用严格沙箱，解析到仓库外的绝对路径可能被拦截。

## 更新记录

- **2025-10-13**：创建极简 Node 同步方案，体积从 1GB+ 降至 137MB
- **验证通过**：宿主环境和 Codex TUI 环境均可正常使用 Node v22.19.0 和 npm 10.9.3
