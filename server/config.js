const jwtSecret = process.env.JWT_SECRET || 'dabashou_jwt_secret_change_me_in_production';

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('致命错误: 生产环境下必须设置 JWT_SECRET 环境变量');
  process.exit(1);
}
if (!process.env.JWT_SECRET && process.env.NODE_ENV !== 'production') {
  console.warn('⚠ 警告: 使用默认 JWT_SECRET，上线前请务必更换');
}

module.exports = {
  /* 服务端口 */
  port: process.env.PORT || 3000,

  /* 数据库路径（容器中挂载到 /data 持久化） */
  dbPath: process.env.DB_PATH || undefined,

  /* JWT 密钥 */
  jwtSecret,

  /* 允许的跨域来源 */
  origin: process.env.BASE_URL || process.env.ORIGIN || 'http://localhost:3000',

  /* 微信开放平台 - 填写后自动启用微信扫码登录 */
  wechat: {
    enabled: process.env.WECHAT_APPID ? true : false,
    appId: process.env.WECHAT_APPID || '',
    appSecret: process.env.WECHAT_SECRET || '',
    redirectUri: (process.env.BASE_URL || 'http://localhost:3000') + '/api/auth/wechat/callback',
  },
};
