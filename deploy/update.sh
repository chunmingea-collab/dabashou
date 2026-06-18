#!/bin/bash
# ============================================================
#  Huzoo 代码更新脚本
#  每次在本地改完代码、上传到服务器后执行
#
#  使用方法：
#    sudo bash /var/www/huzoo/deploy/update.sh
# ============================================================

set -e

GREEN='\033[0;32m'
NC='\033[0m'

PROJECT_DIR="/var/www/huzoo"

echo -e "${GREEN}[$(date +%T)] 重新安装依赖...${NC}"
cd $PROJECT_DIR/server
npm install --production

echo -e "${GREEN}[$(date +%T)] 重启 PM2 服务...${NC}"
pm2 restart huzoo

echo -e "${GREEN}[$(date +%T)] 重启 Nginx...${NC}"
systemctl restart nginx

echo ""
echo -e "${GREEN}✅ 更新完成！${NC}"
echo "服务状态："
pm2 status
echo ""
echo "实时日志：pm2 logs huzoo"
