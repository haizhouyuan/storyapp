# MongoDB 安全资产目录

本目录用于存放 MongoDB 副本集运行所需的 TLS 证书、密钥文件与初始化脚本。

- `init/`：`docker-entrypoint-initdb.d` 挂载目录，负责初始化副本集、创建用户。
- `keyfile/`：存放副本集内部认证用 `mongo-keyfile`（不会提交到 Git）。
- `tls/`：存放自签或真实证书（`server.pem`、`ca.pem` 等）。
- `backups/`：备份输出默认目录，可通过 `docker-compose` 备份服务共享。

> ⚠️ 证书和密钥不应纳入版本控制。已在 `.gitignore` 中忽略，可通过脚本生成。

## 快速生成本地 TLS 与 keyFile

```bash
# 生成自签 CA、server.pem、client.pem 以及 mongo-keyfile
./scripts/mongo/setup-local-secrets.sh
```

生成后可直接运行 `docker compose up -d mongo-primary mongo-secondary mongo-arbiter` 启动安全副本集。
