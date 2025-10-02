#!/usr/bin/env bash
# MongoDB 备份脚本，供 docker-compose 中的 mongo-backup 服务或手动执行。
# 要求以下环境变量：
#   MONGO_URI_BASE      -> 例如 "mongo-primary:27017"
#   MONGO_BACKUP_USER
#   MONGO_BACKUP_PASS
#   MONGO_AUTH_DB       -> 默认为 admin
#   MONGO_DATABASE      -> 备份数据库名称
#   BACKUP_PATH         -> 备份输出目录，默认为 /backups
#   RETENTION_DAYS      -> 保留天数，默认 7 天
#   TLS_CA_FILE         -> 如果开启 TLS，传入 CA 路径
#   TLS_PEM_FILE        -> 如需双向TLS，可传入客户端证书
#
set -euo pipefail

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
# shellcheck disable=SC2155
BACKUP_PATH="${BACKUP_PATH:-/backups}"
MONGO_URI_BASE="${MONGO_URI_BASE:-mongo-primary:27017}"
MONGO_DATABASE="${MONGO_DATABASE:-storyapp}"
MONGO_AUTH_DB="${MONGO_AUTH_DB:-admin}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
EXPORT_DIR="$BACKUP_PATH/$TIMESTAMP"

mkdir -p "$EXPORT_DIR"

ARGS=("--host" "$MONGO_URI_BASE" "--username" "${MONGO_BACKUP_USER}" "--password" "${MONGO_BACKUP_PASS}" "--authenticationDatabase" "$MONGO_AUTH_DB" "--db" "$MONGO_DATABASE" "--gzip" "--out" "$EXPORT_DIR")

if [[ -n "${TLS_CA_FILE:-}" ]]; then
  if mongodump --help 2>&1 | grep -q -- "--tlsCAFile"; then
    ARGS+=("--tls" "--tlsCAFile" "$TLS_CA_FILE")
    TLS_CERT_FLAG="--tlsCertificateKeyFile"
  else
    ARGS+=("--ssl" "--sslCAFile" "$TLS_CA_FILE")
    TLS_CERT_FLAG="--sslPEMKeyFile"
  fi

  if [[ -n "${TLS_PEM_FILE:-}" ]]; then
    ARGS+=("${TLS_CERT_FLAG}" "$TLS_PEM_FILE")
  fi
elif [[ -n "${TLS_PEM_FILE:-}" ]]; then
  # 如果仅指定客户端证书，则启用 TLS/SSL 并信任默认 CA
  if mongodump --help 2>&1 | grep -q -- "--tlsCertificateKeyFile"; then
    ARGS+=("--tls" "--tlsCertificateKeyFile" "$TLS_PEM_FILE")
  else
    ARGS+=("--ssl" "--sslPEMKeyFile" "$TLS_PEM_FILE")
  fi
fi

echo "[mongo-backup] 开始备份: $TIMESTAMP"
if ! mongodump "${ARGS[@]}"; then
  echo "[mongo-backup] 备份失败"
  rm -rf "$EXPORT_DIR"
  exit 1
fi

echo "[mongo-backup] 完成备份 => $EXPORT_DIR"

if [[ "$RETENTION_DAYS" != "-1" ]]; then
  echo "[mongo-backup] 清理超过 ${RETENTION_DAYS} 天的旧备份"
  find "$BACKUP_PATH" -maxdepth 1 -type d -name '20*' -mtime +"$RETENTION_DAYS" -exec rm -rf {} +
fi
