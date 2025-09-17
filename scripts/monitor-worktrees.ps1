# Worktree Development Progress Monitor
# 多工作树开发进度监控脚本

param(
    [switch]$Detailed,
    [switch]$Watch
)

function Get-WorktreeStatus {
    Write-Host "=== Git Worktree Development Status ===" -ForegroundColor Cyan
    Write-Host "Time: $(Get-Date)" -ForegroundColor Gray
    Write-Host ""

    # 获取所有worktree
    $worktrees = git worktree list --porcelain | Where-Object { $_ -match "^worktree " } | ForEach-Object { $_ -replace "^worktree ", "" }
    
    foreach ($worktreePath in $worktrees) {
        $worktreePath = $worktreePath.Replace('/mnt/d/', 'D:\').Replace('/', '\')
        
        if (Test-Path $worktreePath) {
            Write-Host "📁 Worktree: $worktreePath" -ForegroundColor Yellow
            
            Push-Location $worktreePath
            try {
                # 获取当前分支
                $branch = git branch --show-current
                Write-Host "   🌿 Branch: $branch" -ForegroundColor Green
                
                # 获取最后提交
                $lastCommit = git log -1 --pretty=format:"%h %s (%cr)" 2>$null
                if ($lastCommit) {
                    Write-Host "   📝 Last commit: $lastCommit" -ForegroundColor White
                }
                
                # 检查工作区状态
                $status = git status --porcelain
                if ($status) {
                    $modifiedCount = ($status | Where-Object { $_ -match "^\s*M" }).Count
                    $addedCount = ($status | Where-Object { $_ -match "^\?\?" }).Count
                    $stagedCount = ($status | Where-Object { $_ -match "^[AM]" }).Count
                    
                    Write-Host "   🔄 Changes: $modifiedCount modified, $addedCount untracked, $stagedCount staged" -ForegroundColor Magenta
                    
                    if ($Detailed -and $status.Count -le 10) {
                        $status | ForEach-Object { Write-Host "      $_" -ForegroundColor DarkGray }
                    }
                } else {
                    Write-Host "   ✅ Clean working directory" -ForegroundColor DarkGreen
                }
                
                # 检查运行的进程（简单检测）
                $nodeProcesses = Get-Process node -ErrorAction SilentlyContinue | Where-Object { 
                    $_.MainModule.FileName -like "*$($worktreePath.Replace('\', '/'))*" 
                }
                if ($nodeProcesses) {
                    Write-Host "   🏃 Running processes: $($nodeProcesses.Count) Node.js processes" -ForegroundColor Blue
                }
                
                # 检查最近文件修改
                $recentFiles = Get-ChildItem -Recurse -File | Where-Object { 
                    $_.LastWriteTime -gt (Get-Date).AddHours(-2) -and
                    $_.Name -notlike "*.log" -and
                    $_.Directory.Name -notlike "node_modules"
                } | Sort-Object LastWriteTime -Descending | Select-Object -First 3
                
                if ($recentFiles) {
                    Write-Host "   ⏰ Recent files:" -ForegroundColor Cyan
                    $recentFiles | ForEach-Object {
                        $relPath = $_.FullName.Replace($worktreePath, '').TrimStart('\')
                        Write-Host "      $relPath ($(($_.LastWriteTime).ToString('HH:mm')))" -ForegroundColor DarkCyan
                    }
                }
                
                Write-Host ""
                
            } catch {
                Write-Host "   ❌ Error accessing worktree: $_" -ForegroundColor Red
            } finally {
                Pop-Location
            }
        } else {
            Write-Host "📁 Worktree: $worktreePath (not accessible)" -ForegroundColor DarkRed
        }
    }
    
    # 显示分支关系
    Write-Host "=== Branch Relationships ===" -ForegroundColor Cyan
    git branch -vv | ForEach-Object { 
        if ($_ -match '^\+') {
            Write-Host $_ -ForegroundColor Yellow  # Current in other worktree
        } elseif ($_ -match '^\*') {
            Write-Host $_ -ForegroundColor Green   # Current branch
        } else {
            Write-Host $_ -ForegroundColor White
        }
    }
}

# 主执行逻辑
if ($Watch) {
    Write-Host "Starting worktree monitor (Ctrl+C to stop)..." -ForegroundColor Green
    while ($true) {
        Clear-Host
        Get-WorktreeStatus
        Write-Host "Refreshing in 30 seconds..." -ForegroundColor Gray
        Start-Sleep 30
    }
} else {
    Get-WorktreeStatus
}
