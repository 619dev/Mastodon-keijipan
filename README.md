# Mastodon-keijipan

> 🌌 **联邦宇宙频道转发 Bot**  
> 运行在 Cloudflare Worker 上的 Serverless 版本

---

## ✨ 项目简介

Mastodon-keijipan 是一个专为联邦宇宙（Fediverse）设计的频道转发机器人，基于 Cloudflare Worker 实现，无需服务器即可部署。支持环境变量配置和 KV 存储，轻松实现消息转发与管理。

---

## 🚀 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/619dev/Mastodon-keijipan.git
cd Mastodon-keijipan
```

### 2. 生成 RSA 密钥对

你可以使用本地工具或 OpenSSL 生成 RSA 密钥对：

```bash
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem
```

### 3. 配置环境变量

在 Cloudflare Dashboard → Worker → Settings → Variables 中添加以下变量：

| 变量名                             | 用途                                    | 类型      |
|------------------------------------|-----------------------------------------|-----------|
| `PRIVATE_KEY_PEM`                  | PEM 格式私钥                            | Secret    |
| `PUBLIC_KEY_PEM`                   | PEM 格式公钥                            | Plaintext |
| `DOMAIN`                           | 你的域名（如 keiji.uk）                 | Plaintext |
| `ACTOR_NAME`                       | @board 的显示名称（默认 "Broadcast Bot"） | Plaintext |
| `ACTOR_ICON`                       | 头像地址（PNG 图片）                    | Plaintext |
| `MAX_BROADCAST_PER_ID_PER_DAY`     | 每个消息ID每天最多广播次数（如10或20）   | Plaintext |

### 4. 配置 KV 命名空间

创建并绑定以下 KV 命名空间到 Worker：

- `FOLLOWERS`：管理关注者
- `BROADCAST_IDS`：记录已处理/已广播的消息ID及每日次数

在 `wrangler.toml` 中示例：

```toml
[[kv_namespaces]]
binding = "FOLLOWERS"
id = "<your-followers-namespace-id>"

[[kv_namespaces]]
binding = "BROADCAST_IDS"
id = "<your-broadcast-ids-namespace-id>"
```

---

## ⚙️ 主要功能

- 🌐 支持联邦宇宙频道消息转发
- ☁️ 完全 Serverless，部署简单
- 🔐 支持自定义密钥与域名
- 🖼️ 支持自定义头像与显示名称
- 🗂️ KV 存储管理关注者
- 🛡️ **防止重复广播**：每条消息ID只处理一次，已处理ID自动记录，防止多实例重复广播
- 🔄 **重试机制**：消息投递失败自动重试，确保可靠性
- ⏳ **每日广播次数限制**：每个消息ID每天最多广播N次（可通过环境变量配置）

---

## 📁 项目结构

```
.
├── worker.js      # Cloudflare Worker 主逻辑
└── README.md      # 项目说明文档
```

---

## 📝 参考命令

**生成密钥对：**
```bash
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem
```

---

## 🧑‍💻 贡献

欢迎 Issue 和 PR！如有建议或问题，欢迎提交。

---

## 📄 License

MIT

--- 
