/* ============================================================
 *  广告配置（部署上线后只需改这一个文件）
 * ============================================================
 *
 *  申请 Google AdSense：
 *    1. 访问 https://www.google.com/adsense/start/
 *    2. 填写你的网站地址（部署后的 HTTPS 域名）
 *    3. 在网站 <head> 加 AdSense 代码（已在 index.html 中占位）
 *    4. 等待审核（通常几天到 2 周，需要网站有真实内容）
 *    5. 审核通过后，把下面的 ID 全部替换为你的真实 ID
 *
 *  启用步骤（一次完成）：
 *    - ADS_ENABLED  → true
 *    - PUBLISHER_ID → 你的 ca-pub-xxxxxxxxxxxxxxxx
 *    - SLOT_TOP / SLOT_BOTTOM / SLOT_INFEED → 对应广告位的 slot ID
 *      （在 AdSense 后台 → 广告 → 按广告单元 → 创建「展示广告」获取）
 *
 *  在没有真实 ID 前，ADS_ENABLED 保持 false，前端不渲染广告，正常浏览。
 * ============================================================ */

window.ADS_CONFIG = {
  /* 总开关：true 时才加载广告；上线+审核通过后改 true */
  ADS_ENABLED: false,

  /* AdSense 发布商 ID（格式 ca-pub-XXXXXXXXXXXXXXXX）*/
  PUBLISHER_ID: 'ca-pub-XXXXXXXXXXXXXXXX',

  /* 各广告位 slot ID（数字串，从 AdSense 后台复制）*/
  SLOT_TOP:    '1111111111',   // 顶部横幅
  SLOT_BOTTOM: '2222222222',   // 底部横幅
  SLOT_INFEED: '3333333333',   // 卡片流中间的原生广告

  /* 卡片流中每 N 张卡片插入一次 in-feed 广告 */
  INFEED_INTERVAL: 6,
};
