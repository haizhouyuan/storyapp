# MongoDB 运维手册（副本集快速上线）

本文档汇总 StoryApp 生产环境 MongoDB 副本集的部署、备份、迁移与监控实践，配合 `docker-compose.yml` 与脚本即可快速完成上线验证。

## 1. 拓扑与组件

- **副本集**：`mongo-primary`（高优先级主节点） + `mongo-secondary`（只读备援） + `mongo-arbiter`（仲裁维持选主）
- **安全**：
  - TLS（`config/mongo/tls`）
  - 副本集 keyFile（`config/mongo/keyfile`）
  - root / app / backup 3 类账户
- **备份服务**：`mongo-backup` 容器，默认 24 小时执行一次 `mongodump`

## 2. 前置准备

```bash
# 生成自签 TLS 证书与 keyFile（首次执行）
./scripts/mongo/setup-local-secrets.sh

# 如需重新生成，脚本会提示是否覆盖
```

脚本输出：
- `config/mongo/tls/ca.pem`、`server.pem`、`client.pem`
- `config/mongo/keyfile/mongo-keyfile`

> 这些文件已通过 `.gitignore` 忽略，请妥善保管并进行权限控制（建议 400/600）。

## 3. 启动与最小验证

```bash
# 启动副本集与备份服务
MONGO_ROOT_USER=storyapp_root \
MONGO_ROOT_PASS=StoryAppRoot!234 \
docker compose up -d mongo-primary mongo-secondary mongo-arbiter mongo-backup

# 检查节点角色与健康状态
MONGO_ROOT_USER=storyapp_root \
MONGO_ROOT_PASS=StoryAppRoot!234 \
docker compose exec mongo-primary \
  mongosh --tls --tlsCAFile /etc/mongo-tls/ca.pem \
  -u "$MONGO_ROOT_USER" -p "$MONGO_ROOT_PASS" --authenticationDatabase admin \
  --eval "rs.status().members.map(m => ({ name: m.name, state: m.stateStr, health: m.health, lastHeartbeat: m.lastHeartbeat }))"

# 验证应用层连接（需 app 已启动）
curl -fsS http://localhost:5001/api/health
```

若需仅在本地验证，可把 `mongo-backup` 服务排除，或通过 `docker compose up -d mongo-primary mongo-secondary mongo-arbiter` 启动核心节点。

## 4. 备份与恢复

### 4.1 自动备份

- 默认间隔：`MONGO_BACKUP_INTERVAL_SECONDS=86400`（可在 `.env` 中调整）
- 输出路径：`config/mongo/backups` → 容器挂载为 `/backups`
- 备份用户角色：`backup` + `read`

查看结果：
```bash
docker compose logs -f mongo-backup        # 实时日志
docker compose exec mongo-backup ls /backups
```

### 4.2 手动备份

```bash
BACKUP_DIR=./config/mongo/backups/manual-$(date +%Y%m%d-%H%M%S)
mkdir -p "$BACKUP_DIR"
MONGO_BACKUP_USER=storyapp_backup \
MONGO_BACKUP_PASS=StoryAppBackup!234 \
mongodump \
  --host localhost:5001 \
  --db storyapp \
  --username "$MONGO_BACKUP_USER" \
  --password "$MONGO_BACKUP_PASS" \
  --authenticationDatabase admin \
  --tls --tlsCAFile ./config/mongo/tls/ca.pem \
  --gzip --out "$BACKUP_DIR"
```

### 4.3 恢复流程

1. 停止应用读写（或切换至维护模式）。
2. 将备份文件放入容器 `mongo-primary` 可访问路径。
3. 执行 `mongorestore`：
   ```bash
   docker compose exec mongo-primary \
     mongorestore --drop --gzip \
     --username storyapp_root --password StoryAppRoot!234 \
     --authenticationDatabase admin \
     --tls --tlsCAFile /etc/mongo-tls/ca.pem \
     /path/to/backup
   ```
4. 重建索引（运行应用自动执行 `initializeDatabase`）。
5. 重新开启对外流量。

## 5. 数据迁移指引（单节点 → 副本集）

1. 在旧实例上执行 `mongodump`（建议本地压缩备份）。
2. 在新环境运行 `scripts/mongo/setup-local-secrets.sh` 生成安全资产。
3. 启动新的副本集容器。
4. 使用 `mongorestore --drop` 将旧数据导入 `mongo-primary`。
5. 重新部署应用，更新 `.env` 中的 `MONGODB_URI`、TLS 相关路径。
6. 验证：
   - `rs.status()` 无错误
   - `curl /api/health` 返回 success
   - 后台 Appsmith 仪表盘数据正常

## 6. 监控与巡检指标

| 指标/命令 | 说明 | 建议频率 |
|-----------|------|----------|
| `rs.status()` | 副本集成员角色、延迟、健康 | 常规巡检/故障排查 |
| `db.serverStatus().opcounters` | 每秒读写量，评估负载 | 日常监控 |
| `db.stats()`、`db.collection.stats()` | 数据量、索引大小 | 每日/周 |
| `db.currentOp()` | 慢查询与阻塞分析 | 异常时 |
| `db.serverStatus().connections` | 连接池占用情况 | 随监控 |
| `db.serverStatus().wiredTiger.cache` | 内存使用情况 | 随监控 |
| `rs.printReplicationInfo()` | oplog 大小与最新时间 | 每日 |
| `rs.printSlaveReplicationInfo()` | 复制延迟 | 每日 |

> Appsmith 后台可通过 REST 数据源调用上述命令，并结合 `mongo-backup` 日志实现备份告警。

## 7. 最小验证步骤（本地 / Staging）

1. `./scripts/mongo/setup-local-secrets.sh`
2. `docker compose up -d mongo-primary mongo-secondary mongo-arbiter`
3. `docker compose exec mongo-primary mongosh ... --eval "rs.status().ok"`
4. `docker compose up -d app && curl http://localhost:5001/api/health`
5. `docker compose exec mongo-backup /scripts/backup.sh`（可选：立即生成一次备份）
6. `docker compose exec mongo-primary mongosh ... --eval "db.getSiblingDB('storyapp').getCollection('story_logs').stats().count"`

满足以上步骤即完成最小化验收，可在 staging 环境进一步结合 Playwright E2E 验证。

## 8. 故障恢复建议

- **主节点不可用**：等待副本集自动选举；若迟迟未选举，可手动 `rs.stepDown()` 或检查仲裁节点。
- **数据库连接失败**：
  - 检查 TLS 证书是否到期/路径是否正确
  - 查看 `mongo-primary` 日志中是否存在 `Unauthorized` / `AuthenticationFailed`
  - 后端日志若出现 `server selection error`，需确认各节点是否处于 `PRIMARY/SECONDARY` 状态
- **备份失败**：
  - 查看 `mongo-backup` 日志；多为凭据或 TLS 路径错误
  - 手动运行 `/scripts/backup.sh` 验证

---

> 如需扩容或增加隐藏节点，可复制 `mongo-secondary` 配置并调整 `rs.add()`；若要启用外部监控（Prometheus 等），请同步更新 Appsmith 数据源的 TLS 证书路径。
