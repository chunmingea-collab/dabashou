# 搭把手 · Clawcloud 部署指南

## 前置条件

1. GitHub 账号（注册 ≥ 180 天）
2. Docker Hub 账号：[https://hub.docker.com](https://hub.docker.com)

## 第一步：构建并推送 Docker 镜像

```bash
# 进入项目目录
cd D:\搭把手

# 构建镜像（替换为你的 Docker Hub 用户名）
docker build -t 你的用户名/dabashou:latest .

# 推送镜像
docker push 你的用户名/dabashou:latest
```

> 如未安装 Docker，从 [https://www.docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop) 下载。

## 第二步：在 Clawcloud 部署

1. 打开 [https://run.claw.cloud](https://run.claw.cloud)，用 GitHub 登录
2. 点击 **App Launchpad** → **Create App**

### 基础配置

| 项目 | 填写 |
|------|------|
| 应用名称 | dabashou |
| 镜像来源 | Public |
| 镜像名称 | `你的用户名/dabashou:latest` |
| 部署模式 | Fixed Instance |
| CPU | 0.1 Core |
| 内存 | 256 MiB（better-sqlite3 运行最低要求）|

### 网络配置

| 项目 | 填写 |
|------|------|
| 端口 | 3000 |
| 公网访问 | 开启 |

### 高级配置 → 环境变量

| 变量名 | 值 | 说明 |
|--------|-----|------|
| PORT | 3000 | 服务端口 |
| JWT_SECRET | （随机长字符串） | JWT 签名密钥，务必修改 |
| DB_PATH | /data/data.db | 数据库存储路径 |
| BASE_URL | （部署后获得的公网地址） | 例如 `https://abcd123.clawcloudrun.com` |
| WECHAT_APPID | （可选） | 微信开放平台 AppID |
| WECHAT_SECRET | （可选） | 微信开放平台 AppSecret |

### 高级配置 → 本地存储卷

| 项目 | 填写 |
|------|------|
| 挂载路径 | /data |

> 这一步**至关重要**：SQLite 数据库文件存于 `/data/data.db`，不挂载的话每次重启数据都会丢失。

3. 点击 **Create / Deploy**，等待部署完成
4. 在 App 详情页 → Network 下找到公网地址，访问即可

## 验证部署

访问公网地址，应出现登录/注册页面。

## 常见问题

**Q: 微信登录不可用？**  
先去 [open.weixin.qq.com](https://open.weixin.qq.com) 注册网站应用，获取 AppID/Secret，填入环境变量后重新部署。在这之前使用账号密码注册登录即可。

**Q: 数据丢失？**  
检查是否挂载了本地存储卷到 `/data`。

**Q: 端口 3000 不通？**  
Clawcloud 开启公网访问后，平台会自动分配域名 + HTTPS，不需要额外配置 Nginx。
