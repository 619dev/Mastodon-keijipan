# Mastodon-keijipan
<br>
联邦宇宙频道转发bot
<br>
运行在Cloudflare worker上的serverless版本
<br>
✅ 环境变量配置（Cloudflare Dashboard → Worker → Settings → Variables）
<br>
变量名	用途	类型
<br>
PRIVATE_KEY_PEM	PEM格式私钥	Secret
<br>
PUBLIC_KEY_PEM	PEM格式公钥	Plaintext
<br>
DOMAIN	你的域名（如 keiji.uk）	Plaintext
<br>
ACTOR_NAME 环境变量自定义 @board 的显示名称（默认 “Broadcast Bot”）
<br>
ACTOR_ICON 环境变量设置头像地址（需为 PNG 图片）
<br>
<br>
你可以使用本地工具或 OpenSSL 生成 RSA 密钥对，例如：
<br>
openssl genrsa -out private.pem 2048
<br>
openssl rsa -in private.pem -pubout -out public.pem
<br>
KV 配置
<br>
你需要创建一个绑定名为 FOLLOWERS 的 KV 命名空间。

