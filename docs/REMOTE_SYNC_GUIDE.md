# 远程同步与多分支管理建议

为了避免在仓库内复制整份代码库（如 `storyapp-worktrees` 目录）造成的冗余，建议使用 Git 原生能力保持远程同步：

1. **常规同步**
   - `git remote -v` 查看远程别名（本仓库默认仅 `origin`）。
   - `git fetch --all --prune` 同步所有远程分支并清理已删除的远端引用。
   - `git pull --ff-only` 在当前分支快进更新，避免产生额外合并提交。

2. **多分支并行开发**
   - 使用 `git worktree` 管理多个工作区，而不是复制整个仓库：
     ```bash
     git worktree add ../storyapp-feature feat/new-feature
     git worktree list
     ```
   - 完成后可移除：`git worktree remove ../storyapp-feature`。

3. **远程推送约定**
   - 先运行 `git status` 确认工作区清洁，再执行：
     ```bash
     git push origin <branch>
     ```
   - 如需为不同环境保留多个远程，可在 `.git/config` 中额外配置；默认情况下仅维护 `origin`。

4. **临时调试/自动化输出**
   - 本次清理后，`storyapp-worktrees/` 相关目录已删除并纳入 `.gitignore`。
   - 若需要保存调试快照，请使用 `git worktree` 或创建独立分支，而不要在仓库内复制整份文件树。

遵循以上流程即可确保远程仓库始终与本地一致，同时保持仓库体积精简。
