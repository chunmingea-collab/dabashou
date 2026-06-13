/* ===========================================
 *  Huzoo · 前端应用
 *  对接后端 API，替代 localStorage
 * =========================================== */

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

  const { signal, timeout = 15000, ...restOpts } = opts;
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
  } finally {
    clearTimeout(timeoutId);
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
const $statsBar = document.getElementById('stats-bar');
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

let profiles = [], totalCount = 0, deleteTargetId = null;
let loginMode = (document.querySelector('.login-tab.active') || {}).dataset.tab || 'login';

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

  try {
    let data;
    if (loginMode === 'register') {
      if (!nickname) { showErr('请输入昵称'); return; }
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
  try {
    await loadProfiles();
  } catch (e) {
    showEmpty('加载失败', '请刷新页面重试');
  }
}

$btnLogout.addEventListener('click', () => {
  Auth.clear();
  $mainPage.classList.add('hidden');
  $loginPage.classList.remove('hidden');
  $loginPwd.classList.add('hidden');
  $loginWechat.classList.remove('hidden');
  $searchInput.value = '';
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
})();

/* ==================== 数据加载 ==================== */
async function loadProfiles(q, signal) {
  q = q || '';
  $cardGrid.style.opacity = '0.5';
  try {
    const result = await api(`/profiles?q=${encodeURIComponent(q)}&size=50`, { signal });
    profiles = result.profiles;
    totalCount = result.total;
  } catch (e) {
    if (e.name === 'AbortError') return;
    profiles = [];
    totalCount = 0;
    $statsBar.textContent = '加载失败，请检查网络后重试';
    showEmpty('加载失败', e.message || '请刷新页面后重试');
    return;
  } finally {
    $cardGrid.style.opacity = '';
  }
  render();
}

/* ==================== 渲染 ==================== */
function render() {
  const query = $searchInput.value.trim().toLowerCase();
  $statsBar.textContent = `${totalCount} 人亮了本事${query ? `，匹配 ${profiles.length} 人` : ''}`;

  if (profiles.length === 0 && totalCount === 0) {
    showEmpty('还没人亮出本事', '点右下角 +，第一个来。不丢人。');
    return;
  }

  $emptyState.classList.add('hidden');

  if (profiles.length === 0) {
    showEmpty('没找到匹配的人', '试试其他关键词，或者你来第一个填这个领域');
    return;
  }

  const queryKeywords = query ? query.split(/[,，\s]+/).filter(s => s.length > 0) : [];

  $cardGrid.innerHTML = profiles.map(p => {
    const offers = Array.isArray(p.offers) ? p.offers : [];
    const keywords = Array.isArray(p.keywords) ? p.keywords : [];
    const needs = Array.isArray(p.needs) ? p.needs : [];

    const highlightedKeywords = keywords.map(k => {
      const match = queryKeywords.length > 0 && queryKeywords.some(qk => k.toLowerCase().includes(qk));
      return `<span class="keyword-tag${match ? ' highlight' : ''}">${he(k)}</span>`;
    }).join('');

    const needsHtml = needs.length > 0
      ? `<div class="card-section"><div class="card-section-title">想交换 / 获得</div><ul class="need-list">${needs.map(n => `<li>${he(n)}</li>`).join('')}</ul></div>`
      : '';

    const isMine = p.user_id === Auth._uid();
    const actionBtns = isMine
      ? `<button class="card-action-btn edit-btn" data-action="edit" data-id="${p.id}">&#9998;</button>
         <button class="card-action-btn" data-action="delete" data-id="${p.id}">&times;</button>`
      : '';

    return `<div class="card">
      ${actionBtns ? `<div class="card-actions">${actionBtns}</div>` : ''}
      <div class="card-header"><span class="card-nickname">${he(p.nickname)}</span></div>
      <div class="card-intro">${he(p.intro)}</div>
      <div class="card-section"><div class="card-section-title">我能提供</div><ul class="offer-list">${offers.map(o => `<li>${he(o)}</li>`).join('')}</ul></div>
      ${needsHtml}
      <div class="keyword-tags">${highlightedKeywords}</div>
      <div class="card-wechat"><span class="wechat-label">微信</span><span class="wechat-value">${he(p.wechat)}</span></div>
    </div>`;
  }).join('');
}

function he(s) { const d = document.createElement('div'); d.textContent = String(s || ''); return d.innerHTML; }

/** 统一的空状态展示，复用缓存的子元素引用 */
function showEmpty(title, subtitle) {
  $cardGrid.innerHTML = '';
  $emptyState.classList.remove('hidden');
  if ($emptyTitle) $emptyTitle.textContent = title;
  if ($emptySub) $emptySub.textContent = subtitle;
}

/* 事件委托：卡片操作按钮（编辑/删除） */
$cardGrid.addEventListener('click', (e) => {
  const btn = e.target.closest('.card-action-btn');
  if (!btn) return;
  const action = btn.dataset.action;
  const id = btn.dataset.id;
  if (action === 'edit') openEditModal(id);
  if (action === 'delete') confirmDelete(id);
});

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
    if (!$modalOverlay.classList.contains('hidden')) closeModal();
    if (!$confirmOverlay.classList.contains('hidden')) $confirmCancel.click();
  }
});

function openAddModal() {
  $modalTitle.textContent = '填写互助档案';
  $profileForm.reset();
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
  $modalOverlay.classList.remove('hidden');
}

function closeModal() { $modalOverlay.classList.add('hidden'); }

/* ==================== 提交档案 ==================== */
$profileForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const offersList = $offers.value.split('\n').map(s => s.trim()).filter(s => s);
  const needsList = $needs.value.split('\n').map(s => s.trim()).filter(s => s);
  const keywordsList = $keywords.value.split(/[,，\s]+/).map(s => s.trim()).filter(s => s);

  if (!offersList.length) { $formError.textContent = '请填写至少一条你能提供的能力或资源'; $formError.classList.remove('hidden'); return; }
  if (!keywordsList.length) { $formError.textContent = '请填写至少一个关键字标签'; $formError.classList.remove('hidden'); return; }
  $formError.classList.add('hidden');

  try {
    await api('/profiles/mine', {
      method: 'PUT',
      body: JSON.stringify({
        nickname: $nickname.value.trim(),
        intro: $intro.value.trim(),
        offers: offersList,
        keywords: keywordsList,
        needs: needsList,
        wechat: $wechat.value.trim(),
      }),
    });
    closeModal();
    loadProfiles($searchInput.value.trim());
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
  } catch (err) {
    if (type === 'account') {
      $confirmError.textContent = err.message;
      $confirmError.classList.remove('hidden');
      return;
    }
    alert(err.message);
  }
  deleteTargetId = null;
  $confirmOverlay.classList.add('hidden');
  loadProfiles($searchInput.value.trim());
});

$confirmOverlay.addEventListener('click', (e) => {
  if (e.target === $confirmOverlay) $confirmCancel.click();
});
