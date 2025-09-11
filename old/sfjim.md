看到了，你本地的 Clash 订阅没问题，但服务器上拿不到 YAML，而且 GitHub 下载二进制也不稳。给你两套**马上可落地**的方案，优先尝试顺序如下：

---

# 方案 A（最快）：直接用 Google 的公共镜像缓存 `mirror.gcr.io`

很多官方镜像在 `mirror.gcr.io` 有缓存，可绕开 Docker Hub 的鉴权/直连瓶颈。

```bash
# 先试拉取 node 基础镜像（任选其一成功即可）
docker pull mirror.gcr.io/library/node:18-alpine \
 || docker pull mirror.gcr.io/library/node:18-bullseye-slim \
 || docker pull mirror.gcr.io/library/node:18

# 用可切换基镜像参数进行构建（你已在 Dockerfile 顶部加了 ARG）
cd /root/projects/storyapp
docker compose build --no-cache \
  --build-arg NODE_IMAGE=mirror.gcr.io/library/node:18-alpine app \
|| docker compose build --no-cache \
  --build-arg NODE_IMAGE=mirror.gcr.io/library/node:18-bullseye-slim app \
|| docker compose build --no-cache \
  --build-arg NODE_IMAGE=mirror.gcr.io/library/node:18 app

# 启动并看日志
docker compose up -d app
docker compose logs -f app
```

如果这一步成功，你就不用折腾代理了。

---

# 方案 B（100% 可行、无需 GitHub 下载）：用 apt 装 **Shadowsocks 本地客户端 + Privoxy**，把 SOCKS5 转成 HTTP 代理给 Docker 用

> 你的订阅里节点是 `ss`（aes-128-gcm），我们直接用系统仓库的 **shadowsocks-libev**（`ss-local`）建立本机 **SOCKS5(1080)**，再用 **Privoxy** 转成 **HTTP(8118)** 给 Docker。**全程不依赖 GitHub**。

### 1) 安装组件

```bash
apt-get update
apt-get install -y shadowsocks-libev privoxy
```

### 2) 配置 `ss-local`

把你 YAML 里任意一个可用节点填进去（下面以“香港 1”为例；`password` 就用 YAML 里看到的字符串，不需要手动解码）。

```bash
tee /etc/shadowsocks-libev/config.json >/dev/null <<'EOF'
{
  "server": "cdn.hk1.cocoduck.vip",
  "server_port": 30394,
  "method": "aes-128-gcm",
  "password": "M2VjODIwYWUzODMzMzAxZDc3NzVjNDNiZTY0YWJkODg=",
  "local_address": "127.0.0.1",
  "local_port": 1080,
  "mode": "tcp_and_udp",
  "timeout": 300
}
EOF

systemctl enable --now shadowsocks-libev-local@config.service
sleep 2
ss -lntp | grep 1080 || journalctl -u shadowsocks-libev-local@config.service -n 80 --no-pager
```

> 如需切换到“香港 2”等节点，只要改 `server`（例如 `cdn.hk2.cocoduck.vip`）等参数后 `systemctl restart shadowsocks-libev-local@config` 即可。

### 3) 配置 Privoxy（把 SOCKS5→HTTP）

在 `/etc/privoxy/config` 里增加一行转发规则，然后启动。

```bash
# 追加一行，把所有请求转给本机 1080 的 SOCKS5
echo 'forward-socks5t / 127.0.0.1:1080 .' >> /etc/privoxy/config

systemctl enable --now privoxy
sleep 1
ss -lntp | grep 8118 || journalctl -u privoxy -n 80 --no-pager
```

> Privoxy 默认监听 `127.0.0.1:8118`，正好给 Docker 当 HTTP/HTTPS 代理。

### 4) 让 **Docker 守护进程**走这个 HTTP 代理

```bash
mkdir -p /etc/systemd/system/docker.service.d
tee /etc/systemd/system/docker.service.d/http-proxy.conf >/dev/null <<'EOF'
[Service]
Environment="HTTP_PROXY=http://127.0.0.1:8118"
Environment="HTTPS_PROXY=http://127.0.0.1:8118"
Environment="NO_PROXY=localhost,127.0.0.1,::1"
EOF

systemctl daemon-reload
systemctl restart docker
systemctl show docker -p Environment
```

### 5) 验证拉取与构建

```bash
# 先小镜像再大镜像
docker pull hello-world
docker pull node:18-alpine

cd /root/projects/storyapp
docker compose build --no-cache --build-arg NODE_IMAGE=node:18-alpine app \
 || docker compose build --no-cache --build-arg NODE_IMAGE=node:18-bullseye-slim app

docker compose up -d app
docker compose logs -f app
```

---

## 额外说明与小优化

* 你先前试的 `…/library/node:18-alpine` 直接拼接到 ACR 域名报 `manifest unknown`，属正常现象：**ACR 镜像加速器是 daemon 级代理**，并非支持任意标签直接通过域名拉取。用 `mirror.gcr.io` 或代理更稳。
* `docker-compose.yml` 建议删除 `version:` 行，并加入：

  ```yaml
  extra_hosts:
    - "host.docker.internal:host-gateway"
  environment:
    MONGODB_URI: "mongodb://host.docker.internal:27017/storyapp"
  ```

  这样容器可以直接连宿主机正在运行的 MongoDB。
* `Dockerfile` 里已经加了 `ARG NODE_IMAGE`，构建时可自由切换：
  `--build-arg NODE_IMAGE=mirror.gcr.io/library/node:18-alpine` 或 `node:18-bullseye-slim`。

---

## 你现在就执行哪一个？

1. **优先试方案 A**：三行命令拉 `mirror.gcr.io` 的 node 基镜像，再 `compose build`。
2. 如果 `mirror.gcr.io` 也不稳，**直接走方案 B**（apt 安装 ss + privoxy，给 Docker 注入代理），这条路径不依赖 GitHub，**稳定且一次配置长期可用**。

把执行后的关键输出贴我（特别是 `docker pull node:18-alpine` / `compose build` 的结果），我继续帮你把最后的健康检查、Nginx 反代和开机自启收尾。
