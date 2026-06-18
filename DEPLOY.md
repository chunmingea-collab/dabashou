# Huzoo 部署指南

---

## 🖥️ 方案一：Windows 局域网部署（办公室内网）

> 📌 **适用场景**：部署到办公室 Windows 电脑，局域网内访问。
> 💰 **成本**：零成本（利用现有电脑）。
> ⏰ **耗时**：约 15-30 分钟。
> ⚠️ **限制**：仅局域网内可访问；仅支持账号密码登录。

### 部署架构

```
办公室其他电脑 → http://192.168.x.x:3000 → Node.js (PM2守护)
```

局域网部署无需 Nginx 和 HTTPS，Node.js 直接监听端口即可。

### 1. 环境准备

#### 1.1 安装 Node.js

1. 在目标 Windows 电脑上打开浏览器访问 https://nodejs.org/
2. 下载 **LTS 版本**（长期支持版，推荐 20.x）
3. 双击安装程序，**全部默认**，一路 Next
4. 安装完成后验证：打开 **命令提示符**（Win+R → `cmd`），输入：
   ```
   node -v
   ```
   显示版本号（如 `v20.x.x`）即安装成功

> 💡 **快捷安装**：如果目标电脑有 winget，在管理员 PowerShell 中执行：
> ```
> winget install OpenJS.NodeJS.LTS
> ```
> 安装后**关闭并重新打开**命令提示符窗口。

#### 1.2 传输项目文件

选择以下任一方式将项目文件传到目标电脑：

**方式 A：U 盘 / 移动硬盘（最简单）**
1. 在开发电脑上，将 `D:\huzoo` 整个文件夹复制到 U 盘
2. 可以删除 `node_modules` 文件夹（减小体积，目标机重新安装）
3. 在目标电脑上，将文件夹复制到 `D:\huzoo`（或任意位置）

**方式 B：局域网共享文件夹**
1. 在开发电脑上，右键 `D:\huzoo` → 属性 → 共享 → 高级共享
2. 勾选"共享此文件夹"，点"权限"添加 Everyone 读取权限
3. 在目标电脑的文件资源管理器地址栏输入 `\\开发电脑IP\huzoo`
4. 复制到目标电脑本地（如 `D:\huzoo`）

**方式 C：scp 命令**
```powershell
# 在开发电脑的 PowerShell 中执行
scp -r D:\huzoo 目标电脑用户名@目标电脑IP:D:\
```

### 2. 一键部署

1. 在目标电脑上打开**命令提示符**（Win+R → `cmd`）
2. 切换到 deploy 目录并运行部署脚本：
   ```
   cd /d D:\huzoo\deploy
   setup-win.bat
   ```

**脚本会自动完成**：
- ✅ 检查 Node.js 环境
- ✅ 安装 PM2 进程管理器（崩溃自动重启）
- ✅ 安装项目依赖
- ✅ 生成 `.env` 配置文件（含随机 JWT 密钥）
- ✅ 配置防火墙（放行 3000 端口）
- ✅ 启动 Huzoo 服务

> 💡 **首次部署建议以管理员身份运行**，以便自动配置防火墙。
> 右键"命令提示符" → "以管理员身份运行"

### 3. 验证访问

部署完成后，打开浏览器访问：

| 位置 | 地址 |
|------|------|
| 目标电脑本机 | http://localhost:3000 |
| 局域网其他电脑 | http://目标电脑IP:3000 |

查看目标电脑 IP：在命令提示符中输入 `ipconfig`，找到 IPv4 地址（如 `192.168.1.100`）。

### 4. 日常维护

#### 更新代码（从开发电脑同步后）

在目标电脑上双击或运行：
```
cd /d D:\huzoo\deploy
update-win.bat
```

#### 停止服务

```
cd /d D:\huzoo\deploy
stop-win.bat
```

或手动执行：
```
pm2 stop huzoo       # 停止
pm2 restart huzoo    # 重启
pm2 delete huzoo     # 彻底移除
```

#### 设置开机自启

Windows 下 PM2 需要用 `pm2-installer` 注册为系统服务：

```
npm install -g pm2-installer
pm2-installer install
pm2 save
pm2 startup
```

（pm2-installer 会把 PM2 注册为 Windows 系统服务，开机自动启动）

#### 查看日志

```
pm2 logs huzoo           # 实时日志
pm2 logs huzoo --err     # 仅错误日志
pm2 status               # 服务状态
```

#### 数据库备份

```
# 备份到项目目录
copy D:\huzoo\server\data.db D:\huzoo-backup\data-%date:~0,10%.db
```

### 5. 常见问题

**局域网其他电脑无法访问**
1. 检查防火墙是否放行 3000 端口（以管理员运行 setup-win.bat 可自动配置）
2. 手动配置：Windows 防火墙 → 高级设置 → 入站规则 → 新建规则 → TCP 3000 → 允许
3. 检查目标电脑 IP 是否正确（`ipconfig`）
4. 尝试先关闭防火墙测试：控制面板 → Windows 防火墙 → 关闭

**服务启动失败**
```
pm2 logs huzoo --err --lines 50
```
常见原因：
- `.env` 文件中 `JWT_SECRET` 缺失（生产环境必须设置）
- 端口 3000 被占用：`netstat -ano | findstr :3000`
- Node.js 版本过低（需要 18+）

---

## 🌐 方案二：阿里云 + 域名 + HTTPS 部署

> 📌 **适用场景**：完全新手，第一次部署网站，已有阿里云域名。
> 💰 **成本**：服务器约 ¥60-99/年（新人价），域名已有，HTTPS 免费，备案免费。
> ⏰ **耗时**：购买 + 部署约 2 小时；备案审核另需 7-20 天。

---

### 📋 总览：5 个阶段

| 阶段 | 任务 | 耗时 |
|------|------|------|
| ① | 购买阿里云服务器 | 30 分钟 |
| ② | 域名备案（备案期间可继续 ③④⑤） | 7-20 天 |
| ③ | DNS 解析配置 | 10 分钟 |
| ④ | 上传代码到服务器 | 30 分钟 |
| ⑤ | 一键部署 + HTTPS | 30 分钟 |

---

### 🛒 阶段 ①：购买阿里云服务器

### 1.1 找到新人特价入口

1. 浏览器访问：https://www.aliyun.com/product/swas
2. 看到 **"轻量应用服务器"**，点 **"立即购买"**
3. 选择 **新人专享套餐**（一个账号只能买一次，必须挑划算的）

### 1.2 选择配置

在购买页面，按以下选择：

```
地域：        华北2（北京） 或 华东1（杭州） 或 华南1（深圳）
              （选离你最近的，国内速度都很快）

镜像：        系统镜像 → Ubuntu → 22.04 LTS 64位    ⚠️ 必须选 Ubuntu
套餐配置：    2核2GB（新人价约 ¥99/年）              ⚠️ 至少 2GB 内存
带宽：        3Mbps 起（够用，浏览网页够快）
数据盘：      不需要（系统盘 60GB 够用）
购买时长：    1 年（最划算）
```

**理由**：
- Ubuntu 是文档最多、最稳的 Linux 系统，新手踩坑最少
- 2GB 内存必须的：Node.js + Nginx + SQLite 至少要 1.5GB
- 不要选 Windows Server（贵 + 不适合 Node）

### 1.3 支付完成

支付后会跳转到**控制台**。等 1-2 分钟，服务器状态变成"运行中"。

### 1.4 记录服务器信息

在 https://swas.console.aliyun.com/ 找到你的服务器，记下：
- **公网 IP**：类似 `47.xx.xx.xx`（下一步要用）
- **用户名**：默认 `root`
- **密码**：购买时设置的，如果忘了点"重置密码"

---

### 🌐 阶段 ②：域名备案

> ⚠️ **国内服务器 + 域名访问 = 必须备案**，这是工信部硬规定。
> ⚠️ 备案期间，服务器不能通过域名访问（只能用 IP）。
> ✅ 但备案和后面的部署可以同步进行，不用干等。

### 2.1 进入备案系统

1. 访问 https://beian.aliyun.com/
2. 用阿里云账号登录
3. 点 **"开始备案"** → **"新增备案"**

### 2.2 填写备案信息（按提示走）

跟着系统走，需要的信息：

```
主办单位：       个人（选"个人"）
姓名/身份证：    你自己的
手机号：         你自己的（要接收验证码）
域名：           biaodunyun.cn
网站名称：       互圈 / Huzoo（建议，避免敏感词）
网站简介：       互助社交平台
服务器：         你刚买的轻量应用服务器（系统会自动带出备案服务号）
```

### 2.3 准备材料

- 身份证正反面照片（手机拍，清晰）
- 手机（接收核验短信）
- 阿里云 App（用于人脸核验，下载安装好）

### 2.4 提交审核流程

```
你提交 → 阿里云初审（1-2 天）→ 工信部短信核验（24 小时内）
       → 工信部终审（3-20 天）→ 备案号下发
```

**关键提醒**：
- 阿里云客服可能会打电话来确认信息，注意接听
- 收到工信部短信后 **必须在 24 小时内** 验证，超时作废
- 备案通过后，邮箱会收到**备案号**（如：京ICP备2024xxxxxx号）

**备案期间可以做的事**：用服务器 IP 直接访问做开发调试（阶段 ④⑤）。

---

### 🔧 阶段 ③：DNS 解析配置

> 这一步让"biaodunyun.cn" 指向你的服务器 IP。
> ⚠️ 这步现在就能做，但**只有备案通过后通过域名访问才不会被阿里云拦截**。

### 3.1 进入域名控制台

1. 访问 https://dc.console.aliyun.com/next/index#/domain/list/all
2. 找到 `biaodunyun.cn`，点 **"解析"**

### 3.2 添加两条解析记录

| 记录类型 | 主机记录 | 记录值 | 说明 |
|---------|---------|--------|------|
| A | `@` | `你的服务器公网IP` | 让 biaodunyun.cn 指向服务器 |
| A | `www` | `你的服务器公网IP` | 让 www.biaodunyun.cn 也指向服务器 |

**操作**：
- 点 **"添加记录"**
- 按上面表格填，记录值填阶段 1.4 记下的公网 IP
- 添加后等 5-10 分钟生效

### 3.3 验证解析

打开命令提示符（Windows 按 Win+R 输入 `cmd`）：

```bash
ping biaodunyun.cn
```

应该看到类似：
```
正在 Ping biaodunyun.cn [47.xx.xx.xx] 具有 32 字节的数据:
```

`[]` 里的 IP 就是你服务器 IP，说明解析成功。

---

### 📤 阶段 ④：上传代码到服务器

### 4.1 连接服务器（用 Windows 自带 SSH）

Windows 10/11 自带 SSH 客户端。打开 **PowerShell** 或 **命令提示符**：

```bash
ssh root@你的服务器IP
```

第一次连接会问 `Are you sure you want to continue connecting`，输入 `yes` 回车。
然后输入密码（输入时屏幕不显示字符，正常）。

成功后你会看到类似：
```
root@hostname:~#
```

说明登录成功。**保持这个窗口开着**。

### 4.2 在服务器上创建项目目录

在 SSH 窗口里执行：

```bash
mkdir -p /var/www/huzoo
```

### 4.3 从本地（你的电脑）上传代码

打开**另一个** PowerShell 窗口（不在 SSH 里），用 `scp` 上传整个项目。

注意：把下面的路径换成你本地的实际项目路径，IP 换成你的服务器 IP。

```bash
# Windows PowerShell
cd D:\huzoo

# 上传项目（除 node_modules、数据库外）
scp -r app.js ads-config.js ads.js index.html style.css CLAUDE.md DEPLOY.md server deploy root@你的服务器IP:/var/www/huzoo/
```

输入服务器密码后开始上传。第一次会传 30-60 秒。

### 4.4 排除大文件

如果想精准控制只传必要文件，可以分开传：

```bash
# 在本地项目根目录执行
scp -r deploy root@你的IP:/var/www/huzoo/
scp app.js ads-config.js ads.js index.html style.css CLAUDE.md DEPLOY.md root@你的IP:/var/www/huzoo/

# server 目录单独传（排除 node_modules）
scp -r server root@你的IP:/var/www/huzoo/
```

> 💡 **提示**：scp 第一次连接会问 yes/no，输 yes。然后输密码。
> 💡 **更快的方法**：把整个项目打 zip 包上传，再在服务器上解压（见附录 A）。

---

### 🚀 阶段 ⑤：一键部署 + HTTPS

### 5.1 SSH 登录服务器

```bash
ssh root@你的服务器IP
```

### 5.2 在阿里云安全组放行端口

> 阿里云默认只放行 22（SSH）端口，需要手动放行 80/443 才能让网站被访问。

1. 浏览器访问：https://swas.console.aliyun.com/
2. 点你的服务器 → **"防火墙"** 标签
3. **添加规则**：
   ```
   应用类型：自定义
   协议：TCP
   端口范围：80,443
   备注：HTTP 和 HTTPS
   ```
4. 保存

### 5.3 一键部署

回到 SSH 窗口，执行（把 `biaodunyun.cn` 换成你的域名）：

```bash
sudo bash /var/www/huzoo/deploy/setup.sh biaodunyun.cn
```

**脚本会自动做这些事**：
1. ✅ 安装 Node.js 20.x LTS
2. ✅ 安装 PM2 进程管理器（守护进程，崩溃自动重启）
3. ✅ 安装 Nginx 反向代理
4. ✅ 生成 `.env` 配置文件（含随机 JWT 密钥）
5. ✅ 启动 Huzoo 服务
6. ✅ 配置 Nginx

### 5.4 验证 HTTP 访问

部署完成后，浏览器访问：
```
http://你的服务器IP
```

应该看到 Huzoo 登录页。**说明 Node 服务正常**。

> ⚠️ 此时通过 IP 能访问，但通过域名访问会被阿里云拦截（"该网站未备案"）。这是正常的，等备案通过后即可正常访问。

### 5.5 申请 HTTPS 证书

> ⚠️ 这一步**必须等备案通过、域名能正常访问**后再做。

执行：
```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d biaodunyun.cn -d www.biaodunyun.cn
```

按提示：
- 输入邮箱（接收证书过期通知）
- 同意服务条款：`Y`
- 接收营销邮件：`N`
- 自动配置 HTTPS：自动完成

完成后访问 `https://biaodunyun.cn`，浏览器地址栏会有 🔒 锁图标。

证书 90 天到期，Certbot 会自动续期（已配置好定时任务）。

---

#### ✅ 部署完成检查清单（方案二）

- [ ] 访问 `https://biaodunyun.cn` 能看到登录页
- [ ] 注册账号能成功
- [ ] 能创建、编辑档案
- [ ] 能搜索档案
- [ ] 浏览器地址栏有 🔒 锁图标
- [ ] `pm2 status` 显示 huzoo 服务 "online"

如果以上全部 ✅，恭喜你，网站上线了！🎉

---

#### 💰 接入广告变现

详见 [README 的广告章节](./ads-config.js)。简版步骤：

1. 等 AdSense 审核通过（要求网站已上线、有真实内容）
2. 编辑 `/var/www/huzoo/ads-config.js`，填入：
   - `ADS_ENABLED: true`
   - `PUBLISHER_ID`: 你的 ca-pub-xxxx
   - `SLOT_TOP` / `SLOT_BOTTOM` / `SLOT_INFEED`: 广告位 ID
3. 同时修改 `/var/www/huzoo/index.html` 的 AdSense script tag 里的 client ID
4. 执行更新：
   ```bash
   sudo bash /var/www/huzoo/deploy/update.sh
   ```

---

#### 🔄 日常维护（方案二）

### 更新代码（本地改完代码后）

```bash
# 1. 本地：上传修改的文件
scp app.js root@你的IP:/var/www/huzoo/

# 2. 服务器：执行更新脚本
ssh root@你的IP
sudo bash /var/www/huzoo/deploy/update.sh
```

### 查看日志

```bash
# 实时查看应用日志
pm2 logs huzoo

# 查看 Nginx 访问日志
tail -f /var/log/nginx/access.log

# 查看最近 100 行错误日志
pm2 logs huzoo --err --lines 100
```

### 重启服务

```bash
pm2 restart huzoo          # 重启 Node 服务
systemctl restart nginx    # 重启 Nginx
```

### 数据库备份

```bash
# 备份到 /var/backups
cp /var/www/huzoo/server/data.db /var/backups/huzoo-$(date +%Y%m%d).db

# 下载到本地（在本地 PowerShell 执行）
scp root@你的IP:/var/backups/huzoo-20250615.db D:\huzoo-backup\
```

建议每周备份一次，或者改造成定时任务（cron）。

---

#### 🆘 故障排查（方案二）

### 访问网站显示"无法访问此网站"

1. 检查服务器状态：阿里云控制台 → 确认服务器"运行中"
2. 检查端口：阿里云防火墙是否放行 80/443
3. 检查 Nginx：SSH 执行 `systemctl status nginx`，看是否 "active (running)"
4. 检查 Node：SSH 执行 `pm2 status`，看 huzoo 是否 "online"

### 访问显示"该网站未备案"

正常。备案审核通过前，通过域名访问都会被拦截。可以用 IP 访问。

### 访问显示 502 Bad Gateway

Node 服务挂了。SSH 执行：
```bash
pm2 logs huzoo --err --lines 50
```
看错误日志，常见原因：
- `.env` 文件没生成或 JWT_SECRET 缺失
- 端口 3000 被占用：`lsof -i:3000`

### 注册/登录返回 500 错误

数据库可能有问题：
```bash
pm2 logs huzoo --lines 20
```
看具体错误。

### HTTPS 证书过期

正常情况 Certbot 会自动续期。如果发现证书过期，手动续：
```bash
certbot renew
systemctl reload nginx
```

---

#### 📎 附录 A：用 zip 打包上传（更快）

如果 scp 传太多文件慢，可以打包上传：

**本地 PowerShell**：
```powershell
cd D:\huzoo

# 用 7-Zip 打包（排除 node_modules、数据库、git）
& "C:\Program Files\7-Zip\7z.exe" a -tzip huzoo.zip app.js ads-config.js ads.js index.html style.css CLAUDE.md DEPLOY.md server deploy -xr!node_modules -xr!*.db -xr!.git

# 上传到服务器
scp huzoo.zip root@你的IP:/var/www/

# 删除本地 zip
del huzoo.zip
```

**服务器 SSH**：
```bash
# 解压
cd /var/www
unzip huzoo.zip -d huzoo
rm huzoo.zip

# 继续执行部署脚本
bash /var/www/huzoo/deploy/setup.sh biaodunyun.cn
```

---

#### 📎 附录 B：常用 SSH 命令速查

| 命令 | 作用 |
|------|------|
| `ssh root@IP` | 登录服务器 |
| `exit` | 退出登录 |
| `ls` | 列出当前目录文件 |
| `ls -la` | 列出所有文件（含隐藏） |
| `cd /var/www/huzoo` | 进入项目目录 |
| `pwd` | 显示当前目录 |
| `cat 文件名` | 查看文件内容 |
| `nano 文件名` | 编辑文件（Ctrl+X 保存退出） |
| `pm2 status` | 查看应用状态 |
| `pm2 logs huzoo` | 查看应用日志 |
| `pm2 restart huzoo` | 重启应用 |
| `systemctl status nginx` | 查看 Nginx 状态 |
| `systemctl restart nginx` | 重启 Nginx |
| `reboot` | 重启服务器（慎用） |
