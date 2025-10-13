# StoryApp 端口映射与公网访问指引（NAS）

本文档记录前端 Nginx 容器与后端 API 的端口映射方案，以及路由器端口转发设置与排障方法。

## 目标端口（当前生效）

- HTTP（前端）：外网 `30081` → NAS `30081` → 容器 `80`
- HTTPS（前端）：外网 `30443` → NAS `30443` → 容器 `443`
- 后端 API：由前端 Nginx 反代 `/api` 到宿主机 `127.0.0.1:5001`

说明：为规避运营商对 80/443/8081 等端口的封禁或限流，建议使用较高、非常用端口（8702/8787）。

## 容器映射（在 NAS 上执行）

1. 确认端口空闲：

```bash
ss -ltnp | grep -E ':8702|:8787' || echo '8702/8787 未被占用'
```

若显示被占用（见“排障”小节），请先释放端口再继续。

2. 运行前端 Nginx 容器（当前命令）：

```bash
docker rm -f storyapp-nginx 2>/dev/null || true
docker run -d --name storyapp-nginx \
  --add-host=host.docker.internal:host-gateway \
  -p 30081:80 -p 30443:443 \
  -v "$PWD/frontend/build:/usr/share/nginx/html:ro" \
  -v "$PWD/nginx/conf:/etc/nginx/conf.d:ro" \
  -v "$PWD/nginx/certs:/etc/nginx/certs:ro" \
  nginx:alpine

# 本机就绪探针
curl -fsSI http://127.0.0.1:30081 | head -n 1
curl -fsSI --resolve fnos.dandanbaba.xyz:30443:127.0.0.1 https://fnos.dandanbaba.xyz:30443 | head -n 1
```

## 路由器端口转发（公网访问）

- 外网 `30081` → 内网 `192.168.1.7:30081`（TCP）
- 外网 `30443` → 内网 `192.168.1.7:30443`（TCP）

DNS 记录：`fnos.dandanbaba.xyz` → 公网 IP（DDNS 已设置）

公网验证（外部网络/手机 4G）：

```bash
curl -I http://fnos.dandanbaba.xyz:30081
curl -I https://fnos.dandanbaba.xyz:30443
```

## Nginx 要点（容器内已配置）

- `/service-worker.js` 禁缓存，避免 PWA 版本滞留；静态资源长缓存。
- `server_name` 已包含 `fnos.dandanbaba.xyz`，证书挂载于 `/etc/nginx/certs/aliyun/`。
- `/api/` 反代到 `http://host.docker.internal:5001/api/`。

## 排障指南

1) 端口占用（最常见）

```bash
ss -ltnp | grep -E ':8702|:8787'
lsof -iTCP:8702 -sTCP:LISTEN -Pn
lsof -iTCP:8787 -sTCP:LISTEN -Pn
```

如被进程占用（示例：python），请停止对应服务或改用其他空闲端口；释放后再启动容器映射。

2) 运营商封禁/限流

- 部分家庭宽带会拦截 80/443/8081 等端口；使用高位端口（如 8702/8787）可规避。
- 若高位端口仍不可达，考虑 Cloudflare Tunnel 等免端口方案。

3) NAT 回环与本机测试

- 宿主机本地可用：`http://127.0.0.1:8702`、`https://127.0.0.1:8787`（如证书域名校验失败需 `-k`）。
- 外网/手机访问需走域名和端口：`http(s)://fnos.dandanbaba.xyz:端口`。

## 变更记录

- 2025-10-07：文档初始版本，建议端口 8702/8787；若端口被占用需释放后再映射。
