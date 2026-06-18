#!/bin/bash
# ============================================================
#  Huzoo 一键部署脚本（在服务器上执行）
#
#  前置条件：
#    1. 已购买阿里云服务器（Ubuntu 22.04 LTS）
#    2. 已通过 SSH 登录服务器
#    3. 已把项目代码上传到 /var/www/huzoo
#
#  使用方法：
#    sudo bash /var/www/huzoo/deploy/setup.sh yourdomain.com
#
#  这个脚本会：
#    - 安装 Node.js 20.x LTS
#    - 安装 PM2 进程管理器
#    - 安装 Nginx 反向代理
#    - 安装 Certbot（申请 HTTPS 证书）
#    - 启动 Huzoo 服务
#    - 配置 HTTPS（需要域名已解析到本服务器）
# ============================================================

set -e

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_step() {
    echo -e "${GREEN}[$(date +%T)] $1...${NC}"
}

print_warn() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# 检查 root 权限
if [ "$EUID" -ne 0 ]; then
    echo "请用 sudo 运行：sudo bash $0 yourdomain.com"
    exit 1
fi

# 检查域名参数
DOMAIN=$1
if [ -z "$DOMAIN" ]; then
    echo "用法：sudo bash $0 yourdomain.com"
    echo "示例：sudo bash $0 biaodunyun.cn"
    exit 1
fi

PROJECT_DIR="/var/www/huzoo"
if [ ! -d "$PROJECT_DIR/server" ]; then
    echo "错误：项目目录不存在：$PROJECT_DIR/server"
    echo "请先把代码上传到 $PROJECT_DIR"
    exit 1
fi

print_step "步骤 1/7：更新系统包"
apt update -y

print_step "步骤 2/7：安装 Node.js 20.x LTS"
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
fi
echo "Node 版本：$(node -v)"

print_step "步骤 3/7：安装 PM2 进程管理器"
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
fi
echo "PM2 版本：$(pm2 -v)"

print_step "步骤 4/7：安装项目依赖"
cd $PROJECT_DIR/server
npm install --production

print_step "步骤 5/7：配置生产环境变量"
# 生成一个随机的 JWT_SECRET（如果还没设置）
if [ ! -f /var/www/huzoo/server/.env ]; then
    JWT_SECRET=$(openssl rand -hex 32)
    cat > /var/www/huzoo/server/.env << EOF
NODE_ENV=production
PORT=3000
JWT_SECRET=$JWT_SECRET
BASE_URL=https://$DOMAIN
RATE_LIMIT=true
EOF
    print_warn "已自动生成 .env 文件，请妥善保管 JWT_SECRET"
fi

print_step "步骤 6/7：启动 PM2 进程"
mkdir -p $PROJECT_DIR/server/logs
pm2 delete huzoo 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save

# 设置开机自启
print_warn "PM2 设置开机自启 - 请按提示执行返回的命令"
pm2 startup systemd

print_step "步骤 7/7：安装 Nginx + 配置反向代理"
if ! command -v nginx &> /dev/null; then
    apt install -y nginx
fi

# 复制 Nginx 配置
NGINX_CONF="/etc/nginx/sites-available/huzoo.conf"
cp $PROJECT_DIR/deploy/nginx.conf $NGINX_CONF
sed -i "s/yourdomain.com/$DOMAIN/g" $NGINX_CONF

# 启用站点
ln -sf $NGINX_CONF /etc/nginx/sites-enabled/huzoo.conf
rm -f /etc/nginx/sites-enabled/default

# 测试配置
nginx -t

# 重启 Nginx
systemctl restart nginx
systemctl enable nginx

echo ""
echo -e "${GREEN}==================================================${NC}"
echo -e "${GREEN}✅ 部署完成！${NC}"
echo -e "${GREEN}==================================================${NC}"
echo ""
echo "现在你可以访问：http://$DOMAIN"
echo ""
print_warn "下一步：申请 HTTPS 证书"
echo "执行以下命令（确保域名已解析到本服务器）："
echo ""
echo "  sudo apt install -y certbot python3-certbot-nginx"
echo "  sudo certbot --nginx -d $DOMAIN"
echo ""
echo "Certbot 会自动配置 HTTPS 并设置证书自动续期。"
echo ""
echo "常用命令："
echo "  pm2 status              # 查看服务状态"
echo "  pm2 logs huzoo          # 查看实时日志"
echo "  pm2 restart huzoo       # 重启服务"
echo "  sudo systemctl restart nginx  # 重启 Nginx"
