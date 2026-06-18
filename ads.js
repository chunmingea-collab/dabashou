/* ============================================================
 *  广告渲染逻辑
 *  根据 ADS_CONFIG.ADS_ENABLED 决定是否渲染广告
 *  未启用时：所有广告位隐藏，不影响页面浏览
 * ============================================================ */

const Ads = {
  enabled() {
    return !!(window.ADS_CONFIG && window.ADS_CONFIG.ADS_ENABLED);
  },

  /* 标记位，避免重复注入 */
  _scriptLoaded: false,

  /**
   * 按需注入 AdSense 主脚本（仅 ADS_ENABLED=true 时）
   * 替代原本硬写在 index.html 里的 <script>，未启用时不产生网络请求
   */
  loadScript() {
    if (this._scriptLoaded || !this.enabled()) return;
    const cfg = window.ADS_CONFIG;
    if (!cfg || !cfg.PUBLISHER_ID || cfg.PUBLISHER_ID.startsWith('ca-pub-X')) return;
    const s = document.createElement('script');
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${cfg.PUBLISHER_ID}`;
    document.head.appendChild(s);
    window.adsbygoogle = window.adsbygoogle || [];
    this._scriptLoaded = true;
  },

  /**
   * 初始化/推送到一个广告位（每个 <ins class="adsbygoogle"> 调用一次）
   * AdSense 要求每次新渲染一个 ad unit 都要 push 一次
   */
  push() {
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      /* AdSense 加载失败不应阻塞主流程 */
      console.warn('AdSense push failed:', e);
    }
  },

  /* 初始化页面上已有的固定广告位（顶部、底部）*/
  initFixedSlots() {
    if (!this.enabled()) return;
    /* 先按需注入 AdSense 主脚本 */
    this.loadScript();
    /* 给所有 .ad-slot 加上激活类（CSS 默认隐藏，激活后才显示）*/
    document.querySelectorAll('.ad-slot').forEach(slot => {
      slot.classList.add('ad-active');
      this.push();
    });
  },

  /**
   * 在卡片流中间插入原生 in-feed 广告
   * @param {Array<HTMLElement>} cards - 已渲染的卡片元素数组
   */
  injectInFeedAds(container, totalCards) {
    if (!this.enabled() || !container) return;
    const interval = (window.ADS_CONFIG && window.ADS_CONFIG.INFEED_INTERVAL) || 6;

    /* 找出 container 内的 .card 元素，按间隔在其后插入广告位 */
    const cards = container.querySelectorAll('.card');
    const slotsToInsert = [];

    cards.forEach((card, idx) => {
      /* 每 interval 张卡片后插入一个广告（从第 interval 张开始）*/
      if ((idx + 1) % interval === 0 && idx < cards.length - 1) {
        slotsToInsert.push(card);
      }
    });

    /* 从后往前插入，避免索引错位 */
    slotsToInsert.reverse().forEach((card) => {
      const ad = this.createInFeedAd();
      card.parentNode.insertBefore(ad, card.nextSibling);
      this.push();
    });
  },

  /* 创建单个 in-feed 广告元素 */
  createInFeedAd() {
    const wrapper = document.createElement('div');
    wrapper.className = 'card ad-infeed';
    wrapper.innerHTML = `<ins class="adsbygoogle"
       style="display:block"
       data-ad-client="${window.ADS_CONFIG.PUBLISHER_ID}"
       data-ad-slot="${window.ADS_CONFIG.SLOT_INFEED}"
       data-ad-format="fluid"
       data-ad-layout-key="-fb+5w+4e-db+86"
       data-full-width-responsive="true"></ins>`;
    return wrapper;
  },
};

/* 页面加载完成后初始化固定广告位 */
document.addEventListener('DOMContentLoaded', () => {
  Ads.initFixedSlots();
});
