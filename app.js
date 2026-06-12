/* ===========================================
 *  搭把手 · 前端应用
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
  const res = await fetch(API + path, { ...opts, headers: { ...headers, ...opts.headers } });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
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
const $wechat = document.getElementById('wechat');
const $btnCancel = document.getElementById('btn-cancel');
const $confirmOverlay = document.getElementById('confirm-overlay');
const $confirmText = document.getElementById('confirm-text');
const $confirmCancel = document.getElementById('confirm-cancel');
const $confirmOk = document.getElementById('confirm-ok');

let profiles = [], totalCount = 0, deleteTargetId = null;
let loginMode = 'login';

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
(function handleWxCallback() {
  const hash = window.location.hash.slice(1);
  if (!hash) return;
  const params = new URLSearchParams(hash);
  const token = params.get('token');
  if (token) {
    Auth._setT(token);
    Auth._setUid(params.get('userId'));
    Auth._setNick(decodeURIComponent(params.get('nickname') || ''));
    window.location.hash = '';
    showMainPage();
  }
})();

/* ==================== 页面切换 ==================== */
async function showMainPage() {
  $loginPage.classList.add('hidden');
  $mainPage.classList.remove('hidden');
  $currentUser.textContent = Auth._nick();
  await loadProfiles();
}

$btnLogout.addEventListener('click', () => {
  Auth.clear();
  $mainPage.classList.add('hidden');
  $loginPage.classList.remove('hidden');
  $loginPwd.classList.add('hidden');
  $loginWechat.classList.remove('hidden');
  $searchInput.value = '';
});

(function init() {
  if (Auth.loggedIn) {
    api('/auth/me').then(() => showMainPage()).catch(() => Auth.clear());
  }
})();

/* ==================== 数据加载 ==================== */
async function loadProfiles(q) {
  q = q || '';
  try {
    const result = await api(`/profiles?q=${encodeURIComponent(q)}&size=50`);
    profiles = result.profiles;
    totalCount = result.total;
  } catch (e) {
    profiles = [];
    totalCount = 0;
  }
  render();
}

/* ==================== 渲染 ==================== */
function render() {
  const query = $searchInput.value.trim().toLowerCase();
  $statsBar.textContent = `${totalCount} 人亮了本事${query ? `，匹配 ${profiles.length} 人` : ''}`;

  if (profiles.length === 0 && totalCount === 0) {
    $cardGrid.innerHTML = '';
    $emptyState.classList.remove('hidden');
    return;
  }

  $emptyState.classList.add('hidden');

  if (profiles.length === 0) {
    $cardGrid.innerHTML = '<div class="empty-state"><p>没找到匹配的人</p><p class="empty-sub">试试其他关键词，或者你来第一个填这个领域</p></div>';
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

  document.querySelectorAll('.card-action-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (btn.dataset.action === 'edit') openEditModal(btn.dataset.id);
      if (btn.dataset.action === 'delete') confirmDelete(btn.dataset.id);
    });
  });
}

function he(s) { const d = document.createElement('div'); d.textContent = String(s || ''); return d.innerHTML; }

/* ==================== 搜索 ==================== */
$searchInput.addEventListener('input', () => loadProfiles($searchInput.value.trim()));

document.querySelectorAll('.hot-tag').forEach(tag => {
  tag.addEventListener('click', () => {
    $searchInput.value = tag.dataset.kw;
    loadProfiles(tag.dataset.kw);
  });
});

/* ==================== 弹窗 ==================== */
$fabAdd.addEventListener('click', openAddModal);
$modalClose.addEventListener('click', closeModal);
$btnCancel.addEventListener('click', closeModal);
$modalOverlay.addEventListener('click', (e) => { if (e.target === $modalOverlay) closeModal(); });

function openAddModal() {
  $modalTitle.textContent = '填写互助档案';
  $profileForm.reset();
  $modalOverlay.classList.remove('hidden');
}

function openEditModal(id) {
  const p = profiles.find(p => p.id === id);
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

  if (!offersList.length) { alert('请填写至少一条你能提供的能力或资源'); return; }
  if (!keywordsList.length) { alert('请填写至少一个关键字标签'); return; }

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
  } catch (err) { alert(err.message); }
});

/* ==================== 删除确认 ==================== */
function confirmDelete(id) {
  deleteTargetId = id;
  const p = profiles.find(p => p.id === id);
  $confirmText.textContent = `确定删除「${p ? p.nickname : ''}」的互助档案吗？`;
  $confirmOverlay.classList.remove('hidden');
}

$confirmCancel.addEventListener('click', () => {
  deleteTargetId = null;
  $confirmOverlay.classList.add('hidden');
});

$confirmOk.addEventListener('click', async () => {
  if (!deleteTargetId) return;
  try {
    await api('/profiles/mine', {
      method: 'PUT',
      body: JSON.stringify({ nickname: Auth._nick() || '用户', intro: '', offers: [], keywords: [], needs: [], wechat: '' }),
    });
  } catch (err) { alert(err.message); }
  deleteTargetId = null;
  $confirmOverlay.classList.add('hidden');
  loadProfiles($searchInput.value.trim());
});

$confirmOverlay.addEventListener('click', (e) => {
  if (e.target === $confirmOverlay) { deleteTargetId = null; $confirmOverlay.classList.add('hidden'); }
});
