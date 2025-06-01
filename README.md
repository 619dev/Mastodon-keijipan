# Mastodon-keijipan
**联邦宇宙频道转发bot**
**运行在Cloudflare worker上的serverless版本**
**✅ 环境变量配置（Cloudflare Dashboard → Worker → Settings → Variables）**
**变量名	用途	类型**
**PRIVATE_KEY_PEM	PEM格式私钥	Secret**
**PUBLIC_KEY_PEM	PEM格式公钥	Plaintext**
**DOMAIN	你的域名（如 keiji.uk）	Plaintext**
**ACTOR_NAME 环境变量自定义 @board 的显示名称（默认 “Broadcast Bot”）**
**ACTOR_ICON 环境变量设置头像地址（需为 PNG 图片）**

**你可以使用本地工具或 OpenSSL 生成 RSA 密钥对，例如：**
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem

**KV 配置**
**你需要创建一个绑定名为 FOLLOWERS 的 KV 命名空间。**

