/* ============================================================
 *  PM2 进程管理配置
 *  让 Node 服务在后台持续运行，崩溃自动重启
 *
 *  使用方法：
 *    cd /var/www/huzoo/server
 *    pm2 start ecosystem.config.js
 *    pm2 save           # 保存当前进程列表
 *    pm2 startup        # 设置开机自启（按提示执行返回的命令）
 * ============================================================ */

require('dotenv').config();

module.exports = {
  apps: [{
    name: 'huzoo',
    script: 'server.js',
    cwd: __dirname,
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: process.env.NODE_ENV || 'production',
      PORT: process.env.PORT || 3000,
      JWT_SECRET: process.env.JWT_SECRET,
      BASE_URL: process.env.BASE_URL,
      RATE_LIMIT: process.env.RATE_LIMIT || 'true',
    },
    /* 日志输出位置 */
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    merge_logs: true,
    time: true,
  }],
};
