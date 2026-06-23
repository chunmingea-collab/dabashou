/* ===========================================
 *  Huzoo · 前端应用
 *  对接后端 API，替代 localStorage
 * =========================================== */

/* API 基础地址：前后端同源部署（同一台服务器），直接走 /api */
const API = '/api';

/* ==================== 认证管理 ==================== */
const Auth = {
  _t() { return localStorage.getItem('ds_token') || ''; },
  _setT(v) { localStorage.setItem('ds_token', v); },
  _uid() { return localStorage.getItem('ds_userId') || ''; },
  _setUid(v) { localStorage.setItem('ds_userId', v); },
  _nick() { return localStorage.getItem('ds_nickname') || ''; },
  _setNick(v) { localStorage.setItem('ds_nickname', v); },
  clear() { ['ds_token','ds_userId','ds_nickname'].forEach(k => localStorage.removeItem(k)); },
  get loggedIn() { return !!this._t(); },
};

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const t = Auth._t();
  if (t) headers['Authorization'] = 'Bearer ' + t;

  const { signal, timeout = 15000, retries = 1, ...restOpts } = opts;

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    if (signal) signal.addEventListener('abort', () => controller.abort());

    try {
      const res = await fetch(API + path, {
        signal: controller.signal,
        ...restOpts,
        headers: { ...headers, ...restOpts.headers },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '请求失败');
      return data;
    } catch (err) {
      lastError = err;
      /* 只对真正的网络错误重试（fetch 层面抛出的 TypeError/AbortError）。
         HTTP 4xx/5xx 响应已经通过 !res.ok 转为 Error，不重试。
         指数退避：200ms, 400ms... */
      const isNetworkError = err instanceof TypeError;
      const isAbort = err.name === 'AbortError';
      if (attempt < retries && isNetworkError && !isAbort) {
        await new Promise(r => setTimeout(r, 200 * Math.pow(2, attempt)));
        continue;
      }
      throw lastError;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/* ==================== DOM 引用 ==================== */
const $loginPage = document.getElementById('login-page');
const $mainPage = document.getElementById('main-page');
const $loginWechat = document.getElementById('login-wechat');
const $loginPwd = document.getElementById('login-pwd');
const $qrBox = document.getElementById('qr-box');
const $qrStatus = document.getElementById('qr-status');
const $loginForm = document.getElementById('login-form');
const $loginError = document.getElementById('login-error');
const $loginTabBtns = document.querySelectorAll('.login-tab');
const $btnLoginText = document.getElementById('btn-login-text');
const $nicknameField = document.getElementById('login-nickname');
const $loginUsername = document.getElementById('login-username');
const $loginPassword = document.getElementById('login-password');
const $currentUser = document.getElementById('current-user');
const $btnLogout = document.getElementById('btn-logout');
const $searchInput = document.getElementById('search-input');
const $cardGrid = document.getElementById('card-grid');
const $emptyState = document.getElementById('empty-state');
const $fabAdd = document.getElementById('fab-add');
const $modalOverlay = document.getElementById('modal-overlay');
const $modalTitle = document.getElementById('modal-title');
const $modalClose = document.getElementById('modal-close');
const $profileForm = document.getElementById('profile-form');
const $nickname = document.getElementById('nickname');
const $intro = document.getElementById('intro');
const $offers = document.getElementById('offers');
const $keywords = document.getElementById('keywords');
const $needs = document.getElementById('needs');
const $formError = document.getElementById('form-error');
const $wechat = document.getElementById('wechat');
const $city = document.getElementById('city');
const $btnCancel = document.getElementById('btn-cancel');
const $confirmOverlay = document.getElementById('confirm-overlay');
const $confirmText = document.getElementById('confirm-text');
const $confirmCancel = document.getElementById('confirm-cancel');
const $confirmOk = document.getElementById('confirm-ok');
const $confirmType = document.getElementById('confirm-type');
const $confirmPassword = document.getElementById('confirm-password');
const $confirmError = document.getElementById('confirm-error');
/* 空状态子元素引用，缓存避免每次 render 重复 querySelector */
const $emptyTitle = $emptyState.querySelector('p');
const $emptySub = $emptyState.querySelector('.empty-sub');
/* 骨架屏与加载更多 */
const $skeletonGrid = document.getElementById('skeleton-grid');
const $loadMore = document.getElementById('load-more');
const $btnLoadMore = document.getElementById('btn-load-more');
/* 排序、收藏、统计 */
const $sortTabs = document.querySelectorAll('.sort-tab');
const $btnFavorites = document.getElementById('btn-favorites');
const $statsBar = document.getElementById('stats-bar');
const $statsPanel = document.getElementById('stats-panel');
const $topOffers = document.getElementById('top-offers');
const $topKeywords = document.getElementById('top-keywords');
const $trendChart = document.getElementById('trend-chart');
/* 消息系统 */
const $btnMessages = document.getElementById('btn-messages');
const $msgBadge = document.getElementById('msg-badge');
const $msgOverlay = document.getElementById('msg-overlay');
const $msgClose = document.getElementById('msg-close');
const $msgTitle = document.getElementById('msg-title');
const $msgThreads = document.getElementById('msg-threads');
const $msgThreadsEmpty = document.getElementById('msg-threads-empty');
const $msgChat = document.getElementById('msg-chat');
const $msgChatHeader = document.getElementById('msg-chat-header');
const $msgChatBody = document.getElementById('msg-chat-body');
const $msgChatForm = document.getElementById('msg-chat-form');
const $msgInput = document.getElementById('msg-input');
const $msgChatPlaceholder = document.getElementById('msg-chat-placeholder');
/* 详情弹窗 */
const $detailOverlay = document.getElementById('detail-overlay');
const $detailClose = document.getElementById('detail-close');
const $detailTitle = document.getElementById('detail-title');
const $detailBody = document.getElementById('detail-body');
/* 发私信弹窗 */
const $dmOverlay = document.getElementById('dm-overlay');
const $dmCancel = document.getElementById('dm-cancel');
const $dmOk = document.getElementById('dm-ok');
const $dmToName = document.getElementById('dm-to-name');
const $dmInput = document.getElementById('dm-input');
const $dmError = document.getElementById('dm-error');
/* Toast 容器 */
const $toastContainer = document.getElementById('toast-container');

/* ==================== 全局状态 ==================== */
const PAGE_SIZE = 20;
let profiles = [], totalCount = 0, deleteTargetId = null;
let loginMode = (document.querySelector('.login-tab.active') || {}).dataset.tab || 'login';
let currentPage = 1;        /* 当前已加载页码 */
let hasMore = false;        /* 是否还有更多 */
let isLoadingMore = false;  /* 是否正在加载下一页（防重入）*/
let currentSort = 'latest'; /* 当前排序方式：latest | popular */
let viewMode = 'all';       /* 视图模式：all（全部）| favorites（我的收藏）*/
let currentCityFilter = ''; /* 当前城市筛选 */
/* 消息系统状态 */
let currentThreadUserId = null; /* 当前打开的会话对方 ID */
let msgUnreadTimer = null;      /* 未读数轮询定时器 */
/* 发私信状态 */
let dmTargetId = null, dmTargetName = '';
/* 详情弹窗当前档案 */
let detailProfile = null;

/* ==================== 登录切换 ==================== */
document.getElementById('btn-switch-pwd').addEventListener('click', () => {
  $loginWechat.classList.add('hidden');
  $loginPwd.classList.remove('hidden');
});

document.getElementById('btn-switch-wechat').addEventListener('click', () => {
  $loginPwd.classList.add('hidden');
  $loginWechat.classList.remove('hidden');
});

$loginTabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    $loginTabBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loginMode = btn.dataset.tab;
    $btnLoginText.textContent = loginMode === 'login' ? '登录' : '注册';
    $nicknameField.classList.toggle('hidden', loginMode === 'login');
    $nicknameField.required = loginMode === 'register';
    $loginError.classList.add('hidden');
  });
});

/* 微信扫码 */
$qrBox.addEventListener('click', async () => {
  try {
    $qrStatus.textContent = '正在获取登录链接...';
    const { url } = await api('/auth/wechat/url');
    if (url) window.location.href = url;
  } catch (e) {
    $qrStatus.textContent = e.message || '微信登录未启用';
  }
});

/* 账号密码登录/注册 */
$loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = $loginUsername.value.trim();
  const password = $loginPassword.value;
  const nickname = $nicknameField.value.trim();

  $loginError.classList.add('hidden');

  /* 前端输入校验 */
  if (!username) { showErr('请输入用户名'); return; }
  if (username.length < 3 || username.length > 20) { showErr('用户名需 3-20 个字符'); return; }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) { showErr('用户名只能包含字母、数字和下划线'); return; }
  if (!password) { showErr('请输入密码'); return; }
  if (password.length < 6 || password.length > 50) { showErr('密码需 6-50 个字符'); return; }
  if (loginMode === 'register') {
    if (!nickname) { showErr('请输入昵称'); return; }
    if (nickname.length < 2 || nickname.length > 20) { showErr('昵称需 2-20 个字符'); return; }
  }

  try {
    let data;
    if (loginMode === 'register') {
      data = await api('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, password, nickname }),
      });
    } else {
      data = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
    }
    Auth._setT(data.token);
    Auth._setUid(data.userId);
    Auth._setNick(data.nickname);
    showMainPage();
  } catch (err) {
    showErr(err.message);
  }
});

function showErr(msg) {
  $loginError.textContent = msg;
  $loginError.classList.remove('hidden');
}

/* 微信回调 */
(async function handleWxCallback() {
  const hash = window.location.hash.slice(1);
  if (!hash) return;
  const params = new URLSearchParams(hash);
  const token = params.get('token');
  if (token) {
    Auth._setT(token);
    Auth._setUid(params.get('userId'));
    Auth._setNick(decodeURIComponent(params.get('nickname') || ''));
    window.location.hash = '';
    /* 用 /auth/me 校验 token 有效性，防止恶意注入 */
    try {
      await api('/auth/me');
      showMainPage();
    } catch {
      Auth.clear();
      window.location.reload();
    }
  }
})();

/* ==================== 页面切换 ==================== */
async function showMainPage() {
  $loginPage.classList.add('hidden');
  $mainPage.classList.remove('hidden');
  $currentUser.textContent = Auth._nick();
  startUnreadPolling();
  try {
    await loadProfiles();
  } catch (e) {
    showEmpty('加载失败', '请刷新页面重试');
  }
}

$btnLogout.addEventListener('click', () => {
  Auth.clear();
  stopUnreadPolling();
  $mainPage.classList.add('hidden');
  $loginPage.classList.remove('hidden');
  $loginPwd.classList.add('hidden');
  $loginWechat.classList.remove('hidden');
  $searchInput.value = '';
  /* 重置视图状态 */
  viewMode = 'all';
  currentSort = 'latest';
  currentCityFilter = '';
  $btnFavorites.classList.remove('active');
  $msgBadge.classList.add('hidden');
  $sortTabs.forEach(t => t.classList.toggle('active', t.dataset.sort === 'latest'));
  /* 收起统计面板 */
  $statsPanel.classList.add('hidden');
});

document.getElementById('btn-delete-account').addEventListener('click', confirmDeleteAccount);

(async function init() {
  if (Auth.loggedIn) {
    try {
      await api('/auth/me');
      await showMainPage();
    } catch {
      Auth.clear();
    }
  }

  /* ====== 趣味元素 ====== */

  /* 随机彩蛋文案 */
  const eggQuotes = [
    { text: '💡 对了，如果有人帮了你，请你也去帮帮别人。互圈就是这么转起来的。', type: 'egg-default' },
    { text: '🤝 你知道吗？百分之九十九的人都愿意帮忙，只是不知道怎么开口。', type: 'egg-default' },
    { text: '🌟 最成功的交易不是谁赚了便宜，而是双方都觉得爽。互圈信条第三条。', type: 'egg-warm' },
    { text: '🎯 这里没有"老师"，只有"我能"和"我要"。平等交换，谁也不欠谁。', type: 'egg-default' },
    { text: '🔥 勇敢亮出你的本事。你以为是小事，在别人眼里可能是雪中送炭。', type: 'egg-success' },
    { text: '💬 发个私信只需要三秒钟。错过一个对的人可能需要更久。', type: 'egg-default' },
    { text: '🪴 互圈不是人情交易，是资源互惠。你帮的人不一定帮你，但总有人会帮你。', type: 'egg-success' },
    { text: '👀 你现在看到的人，可能是下一个和你一起搞事的人。别光看，动手。', type: 'egg-warm' },
  ];
  /* 仅首次访问（最近 3 小时）触发彩蛋 */
  const lastEggTime = localStorage.getItem('hu_last_egg');
  if (!lastEggTime || Date.now() - Number(lastEggTime) > 3 * 60 * 60 * 1000) {
    setTimeout(() => {
      const egg = eggQuotes[Math.floor(Math.random() * eggQuotes.length)];
      const $egg = document.getElementById('easter-egg');
      if ($egg) {
        $egg.textContent = egg.text;
        $egg.className = `easter-egg ${egg.type}`;
        $egg.classList.remove('hidden');
        localStorage.setItem('hu_last_egg', Date.now());
        /* 5 秒后自动消失 */
        setTimeout(() => { $egg.classList.add('hidden'); }, 6000);
        /* 点击关闭 */
        $egg.addEventListener('click', () => { $egg.classList.add('hidden'); }, { once: true });
      }
    }, 1500);
  }

  /* 网络状态监听：断线重连后自动刷新数据 */
  window.addEventListener('online', () => {
    if (Auth.loggedIn) {
      toast('网络已恢复', 'success');
      loadProfiles($searchInput.value.trim());
    }
  });
  window.addEventListener('offline', () => {
    toast('网络已断开', 'error');
  });
  /* 全局未捕获错误上报（静默处理，避免白屏）*/
  window.addEventListener('error', (e) => {
    console.warn('前端运行时错误:', e.message);
  });
})();

/* ==================== 数据加载 ==================== */
/**
 * 加载档案列表
 * @param {string} q - 搜索关键词
 * @param {AbortSignal} signal - 取消信号
 * @param {object} opts - { append: 是否追加到现有列表（加载更多） }
 */
async function loadProfiles(q, signal, opts = {}) {
  const append = !!opts.append;
  q = q || '';
  /* 追加前已渲染的卡片数，用于 render 时只追加新增部分 */
  const prevLength = append ? profiles.length : 0;

  if (append) {
    if (isLoadingMore || !hasMore) return;
    isLoadingMore = true;
    $btnLoadMore.disabled = true;
    $btnLoadMore.textContent = '加载中...';
  } else {
    /* 首次/搜索：显示骨架屏，重置分页 */
    showSkeleton(true);
    $loadMore.classList.add('hidden');
    currentPage = 1;
  }

  try {
    /* 根据视图模式选择接口：收藏列表走 /favorites，普通列表走 / */
    const base = viewMode === 'favorites' ? '/profiles/favorites' : '/profiles';
    const cityParam = currentCityFilter ? `&city=${encodeURIComponent(currentCityFilter)}` : '';
    const result = await api(`${base}?q=${encodeURIComponent(q)}&page=${currentPage}&size=${PAGE_SIZE}&sort=${currentSort}${cityParam}`, { signal });
    if (append) {
      profiles = profiles.concat(result.profiles);
    } else {
      profiles = result.profiles;
    }
    totalCount = result.total;
    hasMore = profiles.length < totalCount;
  } catch (e) {
    if (e.name === 'AbortError') return;
    if (append) {
      /* 加载更多失败：回滚页码，保留已加载的数据 */
      currentPage -= 1;
      isLoadingMore = false;
      $btnLoadMore.disabled = false;
      $btnLoadMore.textContent = '加载更多';
      $statsBar.textContent = '加载失败，请重试';
      return;
    }
    profiles = [];
    totalCount = 0;
    $statsBar.textContent = '加载失败，请检查网络后重试';
    showEmpty('加载失败', e.message || '请刷新页面后重试');
    return;
  } finally {
    if (!append) showSkeleton(false);
  }
  render(append, prevLength);
}

/* 加载更多：页码 +1 后请求 */
function loadMore() {
  if (!hasMore || isLoadingMore) return;
  currentPage += 1;
  loadProfiles($searchInput.value.trim(), null, { append: true });
}

$btnLoadMore.addEventListener('click', loadMore);

/* 骨架屏显隐 */
function showSkeleton(show) {
  if (show) {
    $cardGrid.innerHTML = '';
    $emptyState.classList.add('hidden');
    $skeletonGrid.classList.remove('hidden');
  } else {
    $skeletonGrid.classList.add('hidden');
  }
}

/* ==================== 渲染 ==================== */
/**
 * 渲染卡片列表
 * @param {boolean} append - true=仅追加新卡片；false=整体重渲染
 * @param {number} prevLength - append 时表示追加前已渲染的卡片数
 */
function render(append, prevLength = 0) {
  const query = $searchInput.value.trim().toLowerCase();
  /* 统计栏文案：区分全部视图和收藏视图 */
  if (viewMode === 'favorites') {
    $statsBar.textContent = `共收藏 ${totalCount} 人${query ? `，匹配 ${profiles.length} 人` : ''}`;
  } else {
    $statsBar.textContent = `${totalCount} 人亮了本事${query ? `，匹配 ${profiles.length} 人` : ''}`;
  }

  if (profiles.length === 0 && totalCount === 0) {
    $loadMore.classList.add('hidden');
    if (viewMode === 'favorites') {
      showEmpty('还没有收藏', '点击卡片左上角的 ☆ 收藏感兴趣的人');
    } else {
      showEmpty('还没人亮出本事', '点右下角 +，第一个来。不丢人。');
    }
    return;
  }
  if (profiles.length === 0) {
    $loadMore.classList.add('hidden');
    showEmpty('没找到匹配的人', '试试其他关键词，或者你来第一个填这个领域');
    return;
  }

  $emptyState.classList.add('hidden');

  const queryKeywords = query ? query.split(/[,，\s]+/).filter(s => s.length > 0) : [];
  /* 追加时只渲染 prevLength 之后的新卡片，避免全量重绘 */
  const slice = append ? profiles.slice(prevLength) : profiles;
  const html = slice.map(p => renderCard(p, queryKeywords)).join('');

  if (append) {
    $cardGrid.insertAdjacentHTML('beforeend', html);
  } else {
    $cardGrid.innerHTML = html;
    /* 卡片流广告仅在整体渲染时注入，避免追加时重复 */
    if (window.Ads) window.Ads.injectInFeedAds($cardGrid, profiles.length);
  }

  /* 控制加载更多按钮的显隐 */
  $loadMore.classList.toggle('hidden', !hasMore);
}

/* 渲染单张卡片，返回 HTML 字符串 */
function renderCard(p, queryKeywords) {
  const offers = Array.isArray(p.offers) ? p.offers : [];
  const keywords = Array.isArray(p.keywords) ? p.keywords : [];
  const needs = Array.isArray(p.needs) ? p.needs : [];

  const highlightedKeywords = keywords.map(k => {
    const match = queryKeywords.length > 0 && queryKeywords.some(qk => k.toLowerCase().includes(qk));
    return `<span class="keyword-tag${match ? ' highlight' : ''}">${he(k)}</span>`;
  }).join('');

  /* 只展示前 3 条 offer，点开详情看全部 */
  const offersPreview = offers.slice(0, 3);
  const offersMore = offers.length > 3 ? `<li class="offer-more">…还有 ${offers.length - 3} 条</li>` : '';

  const isMine = p.user_id === Auth._uid();
  const actionBtns = isMine
    ? `<button class="card-action-btn edit-btn" data-action="edit" data-id="${p.id}" title="编辑">&#9998;</button>
       <button class="card-action-btn" data-action="delete" data-id="${p.id}" title="删除">&times;</button>`
    : '';

  /* 收藏按钮（非自己的卡片才显示）*/
  const favBtn = (!isMine && Auth.loggedIn)
    ? `<button class="fav-btn${p.is_favorited ? ' active' : ''}" data-action="favorite" data-id="${p.id}" title="${p.is_favorited ? '取消收藏' : '收藏'}">${p.is_favorited ? '★' : '☆'}</button>`
    : '';

  /* 私信按钮 */
  const dmBtn = (!isMine && Auth.loggedIn)
    ? `<button class="card-dm-btn" data-action="dm" data-id="${p.user_id}" data-name="${he(p.nickname)}" title="发私信">私信</button>`
    : '';

  /* 城市标签 */
  const cityTag = p.city ? `<span class="card-city" data-city="${he(p.city)}" title="点击筛选同城">${he(p.city)}</span>` : '';

  return `<div class="card" data-profile-id="${p.id}" role="button" tabindex="0" aria-label="查看${he(p.nickname)}的详情">
    ${favBtn}
    ${actionBtns ? `<div class="card-actions">${actionBtns}</div>` : ''}
    <div class="card-header">
      <span class="card-nickname">${he(p.nickname)}</span>
      ${cityTag}
    </div>
    <div class="card-intro">${he(p.intro)}</div>
    <div class="card-section">
      <div class="card-section-title">我能提供</div>
      <ul class="offer-list">
        ${offersPreview.map(o => `<li>${he(o)}</li>`).join('')}
        ${offersMore}
      </ul>
    </div>
    <div class="keyword-tags">${highlightedKeywords}</div>
    <div class="card-footer">
      <div class="card-wechat"><span class="wechat-label">微信</span><span class="wechat-value${p.wechat === '登录后可见' ? ' wechat-locked' : ''}">${he(p.wechat)}</span></div>
      ${dmBtn}
    </div>
  </div>`;
}

function he(s) { const d = document.createElement('div'); d.textContent = String(s || ''); return d.innerHTML; }

/** 统一的空状态展示，复用缓存的子元素引用 */
function showEmpty(title, subtitle) {
  $cardGrid.innerHTML = '';
  $emptyState.classList.remove('hidden');
  if ($emptyTitle) $emptyTitle.textContent = title;
  if ($emptySub) $emptySub.textContent = subtitle;
}

/* 事件委托：卡片操作按钮（编辑/删除/收藏/私信/城市筛选/详情） */
$cardGrid.addEventListener('click', async (e) => {
  /* 收藏按钮 */
  const favBtn = e.target.closest('.fav-btn');
  if (favBtn) {
    e.stopPropagation();
    await toggleFavorite(favBtn);
    return;
  }
  /* 私信按钮 */
  const dmBtn = e.target.closest('.card-dm-btn');
  if (dmBtn) {
    e.stopPropagation();
    openDm(dmBtn.dataset.id, dmBtn.dataset.name);
    return;
  }
  /* 城市标签筛选 */
  const cityTag = e.target.closest('.card-city');
  if (cityTag) {
    e.stopPropagation();
    const c = cityTag.dataset.city;
    setCityFilter(c);
    return;
  }
  /* 编辑/删除按钮 */
  const actionBtn = e.target.closest('.card-action-btn');
  if (actionBtn) {
    e.stopPropagation();
    const action = actionBtn.dataset.action;
    const id = actionBtn.dataset.id;
    if (action === 'edit') openEditModal(id);
    if (action === 'delete') confirmDelete(id);
    return;
  }
  /* 点击卡片主体 → 详情弹窗 */
  const card = e.target.closest('.card[data-profile-id]');
  if (card) {
    const pid = card.dataset.profileId;
    const p = profiles.find(x => x.id === pid);
    if (p) openDetailModal(p);
  }
});

/* 切换收藏状态 */
async function toggleFavorite(btn) {
  const id = btn.dataset.id;
  const wasFavorited = btn.classList.contains('active');
  /* 乐观更新：先改 UI，失败再回滚 */
  btn.classList.toggle('active');
  btn.textContent = wasFavorited ? '☆' : '★';
  btn.title = wasFavorited ? '收藏' : '取消收藏';
  /* 同步本地 profiles 数据 */
  const p = profiles.find(x => x.id === id);
  if (p) p.is_favorited = !wasFavorited;

  try {
    if (wasFavorited) {
      await api(`/profiles/${id}/favorite`, { method: 'DELETE' });
      toast('已取消收藏', 'info');
    } else {
      await api(`/profiles/${id}/favorite`, { method: 'POST' });
      toast('⭐ 收藏成功！对方不会知道的，放心', 'success');
    }
    /* 收藏视图下取消收藏：从列表移除该卡片 */
    if (viewMode === 'favorites' && wasFavorited) {
      const cardEl = btn.closest('.card');
      if (cardEl) cardEl.remove();
      profiles = profiles.filter(x => x.id !== id);
      totalCount = Math.max(totalCount - 1, 0);
      $statsBar.textContent = `共收藏 ${totalCount} 人`;
      if (profiles.length === 0) {
        showEmpty('还没有收藏', '点击卡片左上角的 ☆ 收藏感兴趣的人');
      }
    }
  } catch (err) {
    /* 回滚 */
    btn.classList.toggle('active');
    btn.textContent = wasFavorited ? '★' : '☆';
    btn.title = wasFavorited ? '取消收藏' : '收藏';
    if (p) p.is_favorited = wasFavorited;
  }
}

/* ==================== 收藏列表视图 ==================== */
$btnFavorites.addEventListener('click', () => {
  if (viewMode === 'favorites') {
    /* 已在收藏视图，切回全部 */
    viewMode = 'all';
    $btnFavorites.classList.remove('active');
    $searchInput.value = '';
    loadProfiles('');
  } else {
    viewMode = 'favorites';
    $btnFavorites.classList.add('active');
    $searchInput.value = '';
    loadProfiles('');
  }
});

/* ==================== 排序切换 ==================== */
$sortTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const sort = tab.dataset.sort;
    if (sort === currentSort) return;
    $sortTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentSort = sort;
    /* 切换排序时重置列表 */
    $searchInput.value = '';
    loadProfiles('');
  });
});

/* ==================== 统计面板 ==================== */
/* 点击统计栏展开/收起统计面板 */
$statsBar.addEventListener('click', () => {
  $statsPanel.classList.toggle('hidden');
  /* 首次展开时加载统计数据 */
  if (!$statsPanel.classList.contains('hidden') && !$topOffers.innerHTML) {
    loadStats();
  }
});

async function loadStats() {
  try {
    const data = await api('/profiles/stats');
    renderStats(data);
  } catch (e) {
    /* 统计加载失败不影响主功能 */
  }
}

function renderStats(data) {
  /* 热门能力 TOP10 */
  $topOffers.innerHTML = data.topOffers && data.topOffers.length > 0
    ? data.topOffers.map(o => `<span class="tag-cloud-item">${he(o.name)}<span class="count">${o.count}</span></span>`).join('')
    : '<span class="tag-cloud-item" style="color:var(--color-text-faint);background:none;border:none">还没有人亮出本事 —— 你来当第一个 ✌</span>';

  /* 热门关键词 TOP10 */
  $topKeywords.innerHTML = data.topKeywords && data.topKeywords.length > 0
    ? data.topKeywords.map(k => `<span class="tag-cloud-item">${he(k.name)}<span class="count">${k.count}</span></span>`).join('')
    : '<span class="tag-cloud-item" style="color:var(--color-text-faint);background:none;border:none">标签要靠大家填出来，加油 🔖</span>';

  /* 近 7 天新增趋势柱状图 */
  const maxCount = Math.max(...(data.recentTrend || []).map(d => d.count), 1);
  $trendChart.innerHTML = (data.recentTrend || []).map(d => {
    const heightPct = Math.round((d.count / maxCount) * 100);
    return `<div class="trend-bar-wrap">
      <span class="trend-bar-count">${d.count}</span>
      <div class="trend-bar" style="height:${heightPct}%"></div>
      <span class="trend-bar-label">${d.date}</span>
    </div>`;
  }).join('');
}

/* ==================== 搜索 ==================== */
let searchAbortController = null;
let searchDebounceTimer = null;

/* 点击搜索图标聚焦输入框 */
document.querySelector('.search-icon').addEventListener('click', () => $searchInput.focus());

$searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounceTimer);
  if (searchAbortController) searchAbortController.abort();
  searchDebounceTimer = setTimeout(() => {
    searchAbortController = new AbortController();
    loadProfiles($searchInput.value.trim(), searchAbortController.signal);
  }, 300);
});

document.querySelectorAll('.hot-tag').forEach(tag => {
  tag.addEventListener('click', () => {
    $searchInput.value = tag.dataset.kw;
    if (searchAbortController) searchAbortController.abort();
    searchAbortController = new AbortController();
    loadProfiles(tag.dataset.kw, searchAbortController.signal);
  });
});

/* ==================== 弹窗 ==================== */
$fabAdd.addEventListener('click', openAddModal);
$modalClose.addEventListener('click', closeModal);
$btnCancel.addEventListener('click', closeModal);
$modalOverlay.addEventListener('click', (e) => { if (e.target === $modalOverlay) closeModal(); });
/* Escape 关闭弹窗 */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!$msgOverlay.classList.contains('hidden')) { closeMsgPanel(); return; }
    if (!$detailOverlay.classList.contains('hidden')) { closeDetailModal(); return; }
    if (!$dmOverlay.classList.contains('hidden')) { $dmCancel.click(); return; }
    if (!$modalOverlay.classList.contains('hidden')) closeModal();
    if (!$confirmOverlay.classList.contains('hidden')) $confirmCancel.click();
  }
});

function openAddModal() {
  $modalTitle.textContent = '填写互助档案';
  $profileForm.reset();
  if ($city) $city.value = '';
  $modalOverlay.classList.remove('hidden');
}

function openEditModal(id) {
  const p = profiles.find(p => String(p.id) === String(id));
  if (!p) return;
  $modalTitle.textContent = '编辑互助档案';
  $nickname.value = p.nickname;
  $intro.value = p.intro || '';
  $offers.value = (Array.isArray(p.offers) ? p.offers : []).join('\n');
  $keywords.value = (Array.isArray(p.keywords) ? p.keywords : []).join('、');
  $needs.value = (Array.isArray(p.needs) ? p.needs : []).join('\n');
  $wechat.value = p.wechat || '';
  if ($city) $city.value = p.city || '';
  $modalOverlay.classList.remove('hidden');
}

function closeModal() { $modalOverlay.classList.add('hidden'); }

/* ==================== 提交档案 ==================== */
$profileForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const nickname = $nickname.value.trim();
  const intro = $intro.value.trim();
  const offersList = $offers.value.split('\n').map(s => s.trim()).filter(s => s);
  const needsList = $needs.value.split('\n').map(s => s.trim()).filter(s => s);
  const keywordsList = $keywords.value.split(/[,，\s]+/).map(s => s.trim()).filter(s => s);
  const wechat = ($wechat ? $wechat.value.trim() : '').slice(0, 50);

  /* 前端输入校验 */
  if (!nickname) { $formError.textContent = '请填写昵称'; $formError.classList.remove('hidden'); return; }
  if (nickname.length < 2 || nickname.length > 20) { $formError.textContent = '昵称需 2-20 个字符'; $formError.classList.remove('hidden'); return; }
  if (intro.length > 200) { $formError.textContent = '个人介绍最多 200 字'; $formError.classList.remove('hidden'); return; }
  if (!offersList.length) { $formError.textContent = '请填写至少一条你能提供的能力或资源'; $formError.classList.remove('hidden'); return; }
  if (offersList.length > 10) { $formError.textContent = '能力最多填 10 条'; $formError.classList.remove('hidden'); return; }
  if (!keywordsList.length) { $formError.textContent = '请填写至少一个关键字标签'; $formError.classList.remove('hidden'); return; }
  if (keywordsList.length > 10) { $formError.textContent = '关键字最多填 10 个'; $formError.classList.remove('hidden'); return; }
  $formError.classList.add('hidden');

  try {
    await api('/profiles/mine', {
      method: 'PUT',
      body: JSON.stringify({
        nickname,
        intro,
        offers: offersList,
        keywords: keywordsList,
        needs: needsList,
        wechat,
        city: $city ? $city.value.trim() : '',
      }),
    });
    closeModal();
    loadProfiles($searchInput.value.trim());
    /* 趣味反馈：首次填写 vs 编辑 */
    const hasEdited = localStorage.getItem('hu_has_profile');
    if (!hasEdited) {
      toast('🔥 档案已发布！现在别人可以搜到你啦', 'success');
      localStorage.setItem('hu_has_profile', '1');
    } else {
      const funMessages = [
        '档案已更新 🚀',
        '已刷新，准备接受匹配 ✨',
        '更新成功！保持档案新鲜度 +1%',
        '搞定。新 offer 已上架 📦',
      ];
      toast(funMessages[Math.floor(Math.random() * funMessages.length)], 'success');
    }
  } catch (err) { $formError.textContent = err.message; $formError.classList.remove('hidden'); }
});

/* ==================== 删除确认 ==================== */
function confirmDelete(id) {
  deleteTargetId = id;
  $confirmType.value = 'profile';
  $confirmPassword.classList.add('hidden');
  $confirmError.classList.add('hidden');
  const p = profiles.find(p => p.id === id);
  $confirmText.textContent = `确定删除「${p ? p.nickname : ''}」的互助档案吗？`;
  $confirmOk.textContent = '确认删除';
  $confirmOverlay.classList.remove('hidden');
}

function confirmDeleteAccount() {
  $confirmType.value = 'account';
  $confirmPassword.classList.remove('hidden');
  $confirmPassword.value = '';
  $confirmError.classList.add('hidden');
  $confirmText.textContent = '确定要注销账户吗？你的所有数据将被永久删除，无法恢复。';
  $confirmOk.textContent = '确认注销';
  $confirmOverlay.classList.remove('hidden');
}

$confirmCancel.addEventListener('click', () => {
  deleteTargetId = null;
  $confirmOverlay.classList.add('hidden');
});

$confirmOk.addEventListener('click', async () => {
  const type = $confirmType.value;

  try {
    if (type === 'account') {
      const password = $confirmPassword.value;
      await api('/auth/me', { method: 'DELETE', body: JSON.stringify({ password }) });
      Auth.clear();
      location.reload();
      return;
    }
    if (!deleteTargetId) return;
    await api('/profiles/mine', { method: 'DELETE' });
    toast('档案已删除', 'success');
  } catch (err) {
    if (type === 'account') {
      $confirmError.textContent = err.message;
      $confirmError.classList.remove('hidden');
      return;
    }
    toast(err.message, 'error');
  }
  deleteTargetId = null;
  $confirmOverlay.classList.add('hidden');
  loadProfiles($searchInput.value.trim());
});

$confirmOverlay.addEventListener('click', (e) => {
  if (e.target === $confirmOverlay) $confirmCancel.click();
});

/* ==================== Toast 通知 ==================== */
/**
 * 显示 Toast 通知
 * @param {string} message - 通知内容
 * @param {'success'|'error'|'info'} type - 通知类型，影响左侧边框颜色
 */
function toast(message, type = 'info') {
  if (!$toastContainer) return;
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `
    <span class="toast-msg">${message}</span>
    <button class="toast-close" aria-label="关闭">&times;</button>
  `;
  $toastContainer.appendChild(el);
  /* 触发进入动画 */
  requestAnimationFrame(() => el.classList.add('show'));
  /* 点击关闭 */
  el.querySelector('.toast-close').addEventListener('click', () => dismissToast(el));
  /* 3 秒自动消失 */
  const timer = setTimeout(() => dismissToast(el), 3000);
  el.dataset.timer = timer;

  /* 最多 3 个，超出移除最旧 */
  const toasts = $toastContainer.querySelectorAll('.toast');
  if (toasts.length > 3) dismissToast(toasts[0]);
}

function dismissToast(el) {
  const timer = el.dataset.timer;
  if (timer) clearTimeout(timer);
  el.classList.remove('show');
  el.addEventListener('transitionend', () => el.remove(), { once: true });
}

/* 替换 alert -> toast */
function showAlert(message) {
  toast(message, 'error');
}

/* ==================== 城市筛选 ==================== */
function setCityFilter(city) {
  if (currentCityFilter === city) {
    /* 再次点击同城市 → 取消筛选 */
    currentCityFilter = '';
  } else {
    currentCityFilter = city;
    toast(`已筛选：${city}`, 'info');
  }
  $searchInput.value = '';
  loadProfiles('');
  /* 更新城市筛选指示器 */
  updateCityIndicator();
}

function updateCityIndicator() {
  let indicator = document.getElementById('city-filter-indicator');
  if (!currentCityFilter) {
    if (indicator) indicator.remove();
    return;
  }
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'city-filter-indicator';
    indicator.className = 'city-filter-indicator';
    const sortBar = document.querySelector('.sort-bar');
    sortBar.insertAdjacentElement('afterbegin', indicator);
  }
  indicator.innerHTML = `<span>城市：${he(currentCityFilter)}</span><button onclick="setCityFilter('')">✕</button>`;
}

/* ==================== 档案详情弹窗 ==================== */
function openDetailModal(p) {
  detailProfile = p;
  $detailTitle.textContent = `${p.nickname} 的互助档案`;
  const offers = Array.isArray(p.offers) ? p.offers : [];
  const needs = Array.isArray(p.needs) ? p.needs : [];
  const keywords = Array.isArray(p.keywords) ? p.keywords : [];
  const isMine = p.user_id === Auth._uid();

  const dmHtml = (!isMine && Auth.loggedIn)
    ? `<button class="btn-dm-detail" onclick="openDm('${p.user_id}', '${he(p.nickname).replace(/'/g, "\\'")}')">✉ 发私信</button>`
    : '';

  const favHtml = (!isMine && Auth.loggedIn)
    ? `<button class="btn-fav-detail${p.is_favorited ? ' active' : ''}" id="detail-fav-btn" onclick="toggleFavoriteById('${p.id}', this)">${p.is_favorited ? '★ 已收藏' : '☆ 收藏'}</button>`
    : '';

  $detailBody.innerHTML = `
    <div class="detail-meta">
      ${p.city ? `<span class="detail-city">📍 ${he(p.city)}</span>` : ''}
      <span class="detail-intro">${he(p.intro)}</span>
    </div>
    <div class="detail-section">
      <div class="detail-section-title">我能提供</div>
      <ul class="offer-list">${offers.map(o => `<li>${he(o)}</li>`).join('')}</ul>
    </div>
    ${needs.length > 0 ? `
    <div class="detail-section">
      <div class="detail-section-title">想交换 / 获得</div>
      <ul class="need-list">${needs.map(n => `<li>${he(n)}</li>`).join('')}</ul>
    </div>` : ''}
    <div class="detail-keywords">
      ${keywords.map(k => `<span class="keyword-tag">${he(k)}</span>`).join('')}
    </div>
    <div class="detail-wechat">
      <span class="wechat-label">微信</span>
      <span class="wechat-value${p.wechat === '登录后可见' ? ' wechat-locked' : ''}">${he(p.wechat)}</span>
    </div>
    <div class="detail-actions">
      ${favHtml}
      ${dmHtml}
    </div>
  `;
  $detailOverlay.classList.remove('hidden');
}

function closeDetailModal() {
  $detailOverlay.classList.add('hidden');
  detailProfile = null;
}

/* 详情弹窗里的收藏按钮 */
async function toggleFavoriteById(id, btn) {
  const wasFavorited = btn.classList.contains('active');
  btn.classList.toggle('active');
  btn.textContent = wasFavorited ? '☆ 收藏' : '★ 已收藏';
  const p = profiles.find(x => x.id === id);
  if (p) p.is_favorited = !wasFavorited;
  /* 同步更新卡片上的收藏按钮 */
  const cardFavBtn = $cardGrid.querySelector(`.fav-btn[data-id="${id}"]`);
  if (cardFavBtn) {
    cardFavBtn.classList.toggle('active', !wasFavorited);
    cardFavBtn.textContent = !wasFavorited ? '★' : '☆';
  }
  try {
    if (wasFavorited) {
      await api(`/profiles/${id}/favorite`, { method: 'DELETE' });
      toast('已取消收藏', 'info');
    } else {
      await api(`/profiles/${id}/favorite`, { method: 'POST' });
      toast('⭐ 收藏成功！对方不会知道的，放心', 'success');
    }
  } catch {
    btn.classList.toggle('active');
    btn.textContent = wasFavorited ? '★ 已收藏' : '☆ 收藏';
    if (p) p.is_favorited = wasFavorited;
  }
}

$detailClose.addEventListener('click', closeDetailModal);
$detailOverlay.addEventListener('click', (e) => { if (e.target === $detailOverlay) closeDetailModal(); });

/* ==================== 发私信弹窗 ==================== */
function openDm(targetId, targetName) {
  if (!Auth.loggedIn) { toast('请先登录', 'error'); return; }
  dmTargetId = targetId;
  dmTargetName = targetName;
  $dmToName.textContent = `发私信给：${targetName}`;
  $dmInput.value = '';
  $dmError.classList.add('hidden');
  $dmOverlay.classList.remove('hidden');
  setTimeout(() => $dmInput.focus(), 100);
}

$dmCancel.addEventListener('click', () => {
  $dmOverlay.classList.add('hidden');
  dmTargetId = null;
});

$dmOk.addEventListener('click', async () => {
  const body = $dmInput.value.trim();
  if (!body) { $dmError.textContent = '请输入消息内容'; $dmError.classList.remove('hidden'); return; }
  $dmOk.disabled = true;
  $dmError.classList.add('hidden');
  try {
    await api('/messages', { method: 'POST', body: JSON.stringify({ receiver_id: dmTargetId, body }) });
    $dmOverlay.classList.add('hidden');
    dmTargetId = null;
    toast('📨 私信已发送，等待对方回复', 'success');
  } catch (err) {
    $dmError.textContent = err.message;
    $dmError.classList.remove('hidden');
  } finally {
    $dmOk.disabled = false;
  }
});

$dmOverlay.addEventListener('click', (e) => {
  if (e.target === $dmOverlay) $dmCancel.click();
});

/* ==================== 消息系统 ==================== */
let currentThread = null; /* { userId, nickname } */

$btnMessages.addEventListener('click', openMsgPanel);
$msgClose.addEventListener('click', closeMsgPanel);
$msgOverlay.addEventListener('click', (e) => { if (e.target === $msgOverlay) closeMsgPanel(); });

function openMsgPanel() {
  $msgOverlay.classList.remove('hidden');
  $msgChat.classList.add('hidden');
  $msgChatPlaceholder.classList.remove('hidden');
  currentThread = null;
  loadThreads();
}

function closeMsgPanel() {
  $msgOverlay.classList.add('hidden');
  currentThread = null;
}

async function loadThreads() {
  try {
    const data = await api('/messages/threads');
    renderThreads(data.threads || []);
  } catch {
    $msgThreads.innerHTML = '<div class="msg-load-err">加载失败</div>';
  }
}

function renderThreads(threads) {
  if (threads.length === 0) {
    $msgThreadsEmpty.classList.remove('hidden');
    /* 清空旧的列表项（保留 empty 元素）*/
    Array.from($msgThreads.children).forEach(el => {
      if (el !== $msgThreadsEmpty) el.remove();
    });
    return;
  }
  $msgThreadsEmpty.classList.add('hidden');
  const existingItems = new Set();
  threads.forEach(t => {
    existingItems.add(t.other_id);
    let item = $msgThreads.querySelector(`.thread-item[data-uid="${t.other_id}"]`);
    if (!item) {
      item = document.createElement('div');
      item.className = 'thread-item';
      item.dataset.uid = t.other_id;
      item.addEventListener('click', () => openThread(t.other_id, t.other_nickname));
      $msgThreads.appendChild(item);
    }
    const unreadBadge = t.unread_count > 0 ? `<span class="thread-unread">${t.unread_count}</span>` : '';
    item.classList.toggle('active', currentThread && currentThread.userId === t.other_id);
    item.innerHTML = `
      <div class="thread-nick">${he(t.other_nickname)}${unreadBadge}</div>
      <div class="thread-last">${he(t.last_body || '')}</div>
    `;
  });
  /* 移除已不在列表中的 thread-item */
  Array.from($msgThreads.querySelectorAll('.thread-item')).forEach(el => {
    if (!existingItems.has(el.dataset.uid)) el.remove();
  });
}

async function openThread(userId, nickname) {
  currentThread = { userId, nickname };
  $msgChatPlaceholder.classList.add('hidden');
  $msgChat.classList.remove('hidden');
  $msgChatHeader.textContent = `与 ${nickname} 的对话`;
  $msgChatBody.innerHTML = '<div class="msg-loading">加载中...</div>';
  /* 激活对应 thread-item */
  $msgThreads.querySelectorAll('.thread-item').forEach(el => {
    el.classList.toggle('active', el.dataset.uid === userId);
  });
  await loadChatMessages(userId);
  $msgInput.focus();
}

async function loadChatMessages(userId) {
  try {
    const data = await api(`/messages/thread/${userId}`);
    renderChatMessages(data.messages || []);
    /* 刷新未读数 */
    fetchUnreadCount();
    /* 刷新会话列表（已读标记更新）*/
    loadThreads();
  } catch {
    $msgChatBody.innerHTML = '<div class="msg-load-err">加载失败</div>';
  }
}

function renderChatMessages(msgs) {
  if (msgs.length === 0) {
    $msgChatBody.innerHTML = '<div class="msg-empty-chat">还没有消息，说点什么破冰吧 💬</div>';
    return;
  }
  $msgChatBody.innerHTML = msgs.map(m => {
    const isMine = m.sender_id === Auth._uid();
    const time = new Date(m.created_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return `<div class="msg-bubble-wrap ${isMine ? 'mine' : 'theirs'}">
      <div class="msg-bubble">${he(m.body)}</div>
      <div class="msg-time">${time}</div>
    </div>`;
  }).join('');
  /* 滚到底部 */
  $msgChatBody.scrollTop = $msgChatBody.scrollHeight;
}

$msgChatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = $msgInput.value.trim();
  if (!body) { toast('消息不能为空', 'error'); return; }
  if (body.length > 500) { toast('消息最多 500 字', 'error'); return; }
  if (!currentThread) return;
  const submitBtn = $msgChatForm.querySelector('.btn-send');
  submitBtn.disabled = true;
  try {
    await api('/messages', { method: 'POST', body: JSON.stringify({ receiver_id: currentThread.userId, body }) });
    $msgInput.value = '';
    await loadChatMessages(currentThread.userId);
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    submitBtn.disabled = false;
    $msgInput.focus();
  }
});

/* 发私信弹窗也能直接跳到消息系统 */
async function fetchUnreadCount() {
  if (!Auth.loggedIn) return;
  try {
    const { count } = await api('/messages/unread');
    if (count > 0) {
      $msgBadge.textContent = count > 99 ? '99+' : count;
      $msgBadge.classList.remove('hidden');
    } else {
      $msgBadge.classList.add('hidden');
    }
  } catch { /* 静默失败 */ }
}

function startUnreadPolling() {
  fetchUnreadCount();
  msgUnreadTimer = setInterval(fetchUnreadCount, 30000); /* 每 30 秒轮询 */
}

function stopUnreadPolling() {
  if (msgUnreadTimer) { clearInterval(msgUnreadTimer); msgUnreadTimer = null; }
}
