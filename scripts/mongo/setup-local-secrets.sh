#!/usr/bin/env bash
#
# 生成本地 MongoDB 副本集所需的 TLS 证书与 keyFile。
# 用于快速在开发/测试环境模拟生产安全配置。
#
# 默认输出至 config/mongo/tls 与 config/mongo/keyfile，可通过环境变量覆盖：
#   TLS_OUTPUT_DIR
#   KEYFILE_OUTPUT_DIR
#   REPLICA_HOSTS (逗号分隔，用于证书 SAN)
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
TLS_OUTPUT_DIR="${TLS_OUTPUT_DIR:-$ROOT_DIR/config/mongo/tls}"
KEYFILE_OUTPUT_DIR="${KEYFILE_OUTPUT_DIR:-$ROOT_DIR/config/mongo/keyfile}"
REPLICA_HOSTS="${REPLICA_HOSTS:-mongo-primary,mongo-secondary,mongo-arbiter,localhost}" 
CA_SUBJECT="${CA_SUBJECT:-/CN=StoryApp Mongo Local CA}" 
SERVER_SUBJECT="${SERVER_SUBJECT:-/CN=storyapp-mongo}" 
KEYFILE_NAME="${KEYFILE_NAME:-mongo-keyfile}" 

mkdir -p "$TLS_OUTPUT_DIR" "$KEYFILE_OUTPUT_DIR"

CA_KEY="$TLS_OUTPUT_DIR/ca.key"
CA_CERT="$TLS_OUTPUT_DIR/ca.pem"
SERVER_KEY="$TLS_OUTPUT_DIR/server.key"
SERVER_CERT="$TLS_OUTPUT_DIR/server.crt"
SERVER_PEM="$TLS_OUTPUT_DIR/server.pem"
CLIENT_KEY="$TLS_OUTPUT_DIR/client.key"
CLIENT_CERT="$TLS_OUTPUT_DIR/client.crt"
CLIENT_PEM="$TLS_OUTPUT_DIR/client.pem"
KEYFILE_PATH="$KEYFILE_OUTPUT_DIR/$KEYFILE_NAME"

if [[ -f "$SERVER_PEM" ]]; then
  read -r -p "检测到已有证书文件，是否覆盖? [y/N] " confirm
  if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "已取消操作"
    exit 0
  fi
fi

echo "➡️ 生成 CA 私钥与证书"
openssl genrsa -out "$CA_KEY" 4096 >/dev/null 2>&1
openssl req -x509 -new -nodes -key "$CA_KEY" -sha256 -days 3650 \
  -out "$CA_CERT" -subj "$CA_SUBJECT" >/dev/null 2>&1

SAN_CONFIG="$(mktemp)"
trap 'rm -f "$SAN_CONFIG"' EXIT
{
  echo "[ req ]"
  echo "distinguished_name = req_distinguished_name"
  echo "req_extensions = v3_req"
  echo "prompt = no"
  echo "[ req_distinguished_name ]"
  echo "CN = ${SERVER_SUBJECT#*/CN=}"
  echo "[ v3_req ]"
  echo "subjectAltName = @alt_names"
  echo "[ alt_names ]"
  IFS=',' read -ra HOST_ITEMS <<<"$REPLICA_HOSTS"
  idx=1
  for host in "${HOST_ITEMS[@]}"; do
    host_trimmed="$(echo "$host" | xargs)"
    echo "DNS.$idx = $host_trimmed"
    idx=$((idx+1))
  done
} > "$SAN_CONFIG"

echo "➡️ 生成服务端证书"
openssl genrsa -out "$SERVER_KEY" 4096 >/dev/null 2>&1
openssl req -new -key "$SERVER_KEY" -out "$TLS_OUTPUT_DIR/server.csr" -config "$SAN_CONFIG" >/dev/null 2>&1
openssl x509 -req -in "$TLS_OUTPUT_DIR/server.csr" -CA "$CA_CERT" -CAkey "$CA_KEY" -CAcreateserial \
  -out "$SERVER_CERT" -days 825 -sha256 -extensions v3_req -extfile "$SAN_CONFIG" >/dev/null 2>&1
cat "$SERVER_KEY" "$SERVER_CERT" > "$SERVER_PEM"
rm -f "$TLS_OUTPUT_DIR/server.csr"

chmod 600 "$SERVER_KEY" "$SERVER_CERT" "$SERVER_PEM"
chmod 644 "$CA_CERT"

if [[ ! -f "$CLIENT_PEM" ]]; then
  echo "➡️ 生成客户端证书 (可选)"
  openssl genrsa -out "$CLIENT_KEY" 4096 >/dev/null 2>&1
  openssl req -new -key "$CLIENT_KEY" -out "$TLS_OUTPUT_DIR/client.csr" -subj "/CN=storyapp-client" >/dev/null 2>&1
  openssl x509 -req -in "$TLS_OUTPUT_DIR/client.csr" -CA "$CA_CERT" -CAkey "$CA_KEY" -CAcreateserial \
    -out "$CLIENT_CERT" -days 825 -sha256 >/dev/null 2>&1
  cat "$CLIENT_KEY" "$CLIENT_CERT" > "$CLIENT_PEM"
  rm -f "$TLS_OUTPUT_DIR/client.csr"
  chmod 600 "$CLIENT_KEY" "$CLIENT_CERT" "$CLIENT_PEM"
fi

echo "➡️ 生成副本集 keyFile"
openssl rand -base64 756 > "$KEYFILE_PATH"
chmod 400 "$KEYFILE_PATH"

cat <<SUMMARY
✅ 生成完成：
  - CA:          $CA_CERT
  - Server PEM:  $SERVER_PEM
  - Client PEM:  $CLIENT_PEM (可选)
  - KeyFile:     $KEYFILE_PATH

请在 docker-compose.yml 中挂载上述文件。
SUMMARY
