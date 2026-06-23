---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: 40275e2c0f9525ca811f7efaf0bed2b7_640261f56efc11f1aefd5254006c9bbf
    ReservedCode1: S+nvyBhZrpzC6fiaZ8Oot2q6YhHBMFooDFwJaD89cu/u0Cay3zl9dKNuczxb+TC4qrc9uJdOdr3dFubgZSjLiGBpNJpB0WnEoX9vOKUfkDXNJZHYXdPHGj7nuu9jqkABQOVpaM/FKaITVJ2F7xjGA7y8ebsR1d1kvkJt9OuSY7hmzbQ2y2FIT0fvfnU=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: 40275e2c0f9525ca811f7efaf0bed2b7_640261f56efc11f1aefd5254006c9bbf
    ReservedCode2: S+nvyBhZrpzC6fiaZ8Oot2q6YhHBMFooDFwJaD89cu/u0Cay3zl9dKNuczxb+TC4qrc9uJdOdr3dFubgZSjLiGBpNJpB0WnEoX9vOKUfkDXNJZHYXdPHGj7nuu9jqkABQOVpaM/FKaITVJ2F7xjGA7y8ebsR1d1kvkJt9OuSY7hmzbQ2y2FIT0fvfnU=
---

# Huzoo 项目 Fly.io 部署教程

> 适用对象：非技术人员  
> 预计耗时：首次约 15 分钟  
> 费用：Fly.io 提供免费额度（每月 3 个共享 CPU 虚拟机 + 3GB 存储），个人项目完全够用。

---

## 前置准备

- 一台能上网的电脑（Windows / Mac / Linux 均可）
- 项目代码已在本地（当前目录）

---

## 第一步：安装 Fly CLI

打开终端（Windows 用 PowerShell，Mac 用终端），粘贴执行：

**Windows (PowerShell)**：
```powershell
iwr https://fly.io/install.ps1 -useb | iex
```

**Mac / Linux**：
```bash
curl -L https://fly.io/install.sh | sh
```

安装完成后**关闭并重新打开终端**，让命令生效。

---

## 第二步：注册 / 登录 Fly.io

在终端中输入：

```bash
flyctl auth signup
```

按提示输入姓名和邮箱完成注册。如果已有账号，直接登录：

```bash
flyctl auth login
```

> 注册不需要绑定信用卡。免费额度足以运行本项目。

---

## 第三步：创建应用（一键启动）

在项目根目录（`D:\huzoo`）下执行：

```bash
fly launch
```

由于项目已包含 `fly.toml`，Fly 会自动识别配置。交互过程中：

- 是否调整设置？→ 直接回车（用默认）
- 是否立即部署？→ 先选 No，我们还要创建数据库存储卷

---

## 第四步：创建持久化存储卷

SQLite 数据库需要持久化保存，创建一个 1GB 的存储卷：

```bash
fly volumes create huzoo_data --size 1
```

> 这个卷挂载到容器的 `/data` 目录，数据库文件 `data.db` 会保存在这里，即使容器重启数据也不会丢失。

---

## 第五步：设置环境变量

### 5.1 生成 JWT 密钥

JWT_SECRET 用于用户登录认证的签名，需要随机生成一个强密码：

```bash
openssl rand -hex 32
```

终端会输出一串类似 `a1b2c3d4e5f6...` 的 64 位随机字符串，**复制保存好**。

### 5.2 设置环境变量

```bash
fly secrets set JWT_SECRET=你刚才复制的随机字符串 NODE_ENV=production
```

> `fly secrets set` 设置的变量是加密存储的，比普通环境变量更安全。

---

## 第六步：部署

```bash
fly deploy
```

等待 3-5 分钟，构建和部署完成。成功后终端会显示应用地址，类似 `https://huzoo.fly.dev`。

---

## 第七步：获取域名和 HTTPS

部署完成后，Fly.io 自动提供：

- 免费域名：`https://huzoo.fly.dev`
- HTTPS 证书：自动配置，无需额外操作

如需绑定自己的域名，执行：

```bash
fly certs create your-domain.com
```

然后在域名服务商处将域名 CNAME 指向 `huzoo.fly.dev`。

---

## 第八步：配置 BASE_URL 环境变量

部署后，将应用地址设置为 BASE_URL，让前端知道自己的访问地址：

```bash
fly secrets set BASE_URL=https://huzoo.fly.dev
```

然后重新部署一次让变量生效：

```bash
fly deploy
```

> 之后如果绑定自定义域名，把 BASE_URL 改成你的域名即可。

---

## 后续操作

### 更新代码后重新部署

本地改完代码后，在项目根目录执行：

```bash
fly deploy
```

Fly 会检测变更、重新构建镜像并滚动更新，通常 2-3 分钟完成，服务不中断。

### 查看应用日志

```bash
fly logs
```

实时查看日志，排查问题必备。

### 查看应用状态

```bash
fly status
```

查看当前应用运行状态、实例数量和资源使用情况。

### SSH 进入容器

```bash
fly ssh console
```

如果需要进入服务器操作数据库或调试。

### 查看数据库

```bash
fly ssh console -C "sqlite3 /data/data.db .tables"
```

列出所有数据表，确认数据库正常运行。

---

## 常见问题

### Q：免费额度够用吗？
A：Fly.io 免费额度包含每月 3 个共享 CPU 虚拟机 + 3GB 存储。本项目配置 256MB 内存 + 1GB 存储，完全在免费范围内。

### Q：数据会丢吗？
A：不会。数据库存储在 `huzoo_data` 持久卷中，即使容器重启、重新部署，数据都会保留。

### Q：部署失败怎么办？
A：执行 `fly logs` 查看错误原因，通常为环境变量缺失或端口配置问题。

---

## 费用说明

| 项目 | 用量 | 免费额度 | 是否免费 |
|------|------|----------|----------|
| 虚拟机 | 1 台 (256MB) | 3 台 | ✅ 免费 |
| 存储 | 1GB | 3GB | ✅ 免费 |
| 带宽 | 个人项目 | 100GB/月 | ✅ 免费 |
| **总计** | | | **$0/月** |
*（内容由AI生成，仅供参考）*
