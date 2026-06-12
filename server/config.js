/*
 *  搭把手 - 配置文件
 *
 *  微信登录需要：
 *  1. 前往 https://open.weixin.qq.com 注册并认证开发者账号
 *  2. 创建网站应用，获取 AppID 和 AppSecret
 *  3. 在"授权回调域"中填写你的域名
 *  4. 将下列值填入，重启服务即可启用微信登录
 *
 *  在此之前，系统使用用户名+密码注册登录。
 */

module.exports = {
  /* 服务端口 */
  port: process.env.PORT || 3000,

  /* 数据库路径（容器中挂载到 /data 持久化） */
  dbPath: process.env.DB_PATH || undefined,

  /* JWT 密钥 - 上线务必换成随机字符串 */
  jwtSecret: process.env.JWT_SECRET || 'dabashou_jwt_secret_change_me_in_production',

  /* 微信开放平台 - 填写后自动启用微信扫码登录 */
  wechat: {
    enabled: process.env.WECHAT_APPID ? true : false,
    appId: process.env.WECHAT_APPID || '',
    appSecret: process.env.WECHAT_SECRET || '',
    redirectUri: (process.env.BASE_URL || 'http://localhost:3000') + '/api/auth/wechat/callback',
  },
};
