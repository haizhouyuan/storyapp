#!/usr/bin/env bash
set -euo pipefail

# 配置项
BACKUP_DIR="${BACKUP_DIR:-/home/yuanhaizhou/storyapp-backups/mongo}" 
RETENTION_DAYS="${RETENTION_DAYS:-30}"
MONGO_URI="${MONGO_URI:-mongodb://storyapp_root:StoryAppRoot!234@127.0.0.1:27017/admin}"
NS_INCLUDE="${NS_INCLUDE:-storyapp.*}"

TS=$(date +%Y%m%d-%H%M%S)
DEST="$BACKUP_DIR/$TS"

mkdir -p "$DEST"

echo "[INFO] Running mongodump to $DEST (retain ${RETENTION_DAYS}d)"
if command -v mongodump >/dev/null 2>&1; then
  mongodump \
    --uri="$MONGO_URI" \
    --authenticationDatabase=admin \
    --gzip \
    --archive="$DEST/dump.gz" \
    --nsInclude="$NS_INCLUDE"
else
  echo "[INFO] 'mongodump' not found on host, using docker exec on storyapp-mongo"
  docker exec storyapp-mongo sh -lc \
    "mkdir -p /dump && mongodump --gzip --archive=/dump/dump.gz -u storyapp_root -p StoryAppRoot!234 --authenticationDatabase admin --db storyapp"
  docker cp storyapp-mongo:/dump/dump.gz "$DEST/dump.gz"
  docker exec storyapp-mongo rm -f /dump/dump.gz || true
fi

echo "[INFO] Backup done: $DEST/dump.gz"

echo "[INFO] Retention: deleting backups older than $RETENTION_DAYS days"
find "$BACKUP_DIR" -type f -name 'dump.gz' -mtime +"$RETENTION_DAYS" -print -delete || true

echo "[OK] backup finished"
