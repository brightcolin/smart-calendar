/* ═══════════════════════════════════════════════════
   auth.js — Multi-account management + AES-GCM encryption
   Sensitive data (tokens, keys) encrypted with device key
   stored in localStorage. No PIN required — device lock
   provides the security boundary.
═══════════════════════════════════════════════════ */

const Auth = (() => {
  // ── Config (set by app.js after load) ──
  let GOOGLE_CLIENT_ID = '';

  // ── Runtime ──
  let tokenClient = null;
  let activeAccountId = null;  // email used as ID
  let tokenRefreshTimer = null;
  const TOKEN_TTL = 55 * 60 * 1000;

  // ── Storage keys ──
  const ACCOUNTS_KEY = 'sca_accounts';   // encrypted account list
  const ACTIVE_KEY   = 'sca_active';     // active account email (plain)
  const DS_KEY       = 'sca_dskey';      // encrypted DeepSeek key

  /* ══ Encryption helpers (Web Crypto AES-GCM) ══
     Key is derived from a device fingerprint so data
     is tied to this browser/device without user input.
  */
  async function getDeviceKey() {
    const fp = navigator.userAgent + screen.width + screen.height + navigator.language;
    const enc = new TextEncoder();
    const raw = await crypto.subtle.importKey('raw', enc.encode(fp), { name:'PBKDF2' }, false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name:'PBKDF2', salt: enc.encode('sca-salt-v1'), iterations: 100000, hash:'SHA-256' },
      raw,
      { name:'AES-GCM', length:256 },
      false,
      ['encrypt','decrypt']
    );
  }

  async function encrypt(plaintext) {
    const key = await getDeviceKey();
    const iv  = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const ct  = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, key, enc.encode(plaintext));
    const buf = new Uint8Array(12 + ct.byteLength);
    buf.set(iv); buf.set(new Uint8Array(ct), 12);
    return btoa(String.fromCharCode(...buf));
  }

  async function decrypt(b64) {
    try {
      const key = await getDeviceKey();
      const buf = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const iv  = buf.slice(0, 12);
      const ct  = buf.slice(12);
      const pt  = await crypto.subtle.decrypt({ name:'AES-GCM', iv }, key, ct);
      return new TextDecoder().decode(pt);
    } catch(e) { return null; }
  }

  /* ══ Account storage ══ */
  async function loadAccounts() {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    if (!raw) return [];
    const json = await decrypt(raw);
    if (!json) return [];
    try { return JSON.parse(json); } catch(e) { return []; }
  }

  async function saveAccounts(accounts) {
    const json = JSON.stringify(accounts);
    const enc  = await encrypt(json);
    localStorage.setItem(ACCOUNTS_KEY, enc);
  }

  async function getAccount(email) {
    const accounts = await loadAccounts();
    return accounts.find(a => a.email === email) || null;
  }

  async function upsertAccount(account) {
    const accounts = await loadAccounts();
    const idx = accounts.findIndex(a => a.email === account.email);
    if (idx >= 0) accounts[idx] = { ...accounts[idx], ...account };
    else accounts.push(account);
    await saveAccounts(accounts);
  }

  async function removeAccount(email) {
    let accounts = await loadAccounts();
    accounts = accounts.filter(a => a.email !== email);
    await saveAccounts(accounts);
    if (activeAccountId === email) {
      activeAccountId = accounts[0]?.email || null;
      localStorage.setItem(ACTIVE_KEY, activeAccountId || '');
    }
  }

  /* ══ DeepSeek key ══ */
  async function saveDeepSeekKey(key) {
    if (!key) return;
    localStorage.setItem(DS_KEY, await encrypt(key));
  }
  async function loadDeepSeekKey() {
    const raw = localStorage.getItem(DS_KEY);
    if (!raw) return '';
    return (await decrypt(raw)) || '';
  }
  async function clearDeepSeekKey() {
    localStorage.removeItem(DS_KEY);
  }

  /* ══ Token refresh scheduling ══ */
  function scheduleRefresh(email) {
    if (tokenRefreshTimer) clearTimeout(tokenRefreshTimer);
    tokenRefreshTimer = setTimeout(() => {
      document.getElementById('tokenWarn').classList.add('visible');
    }, TOKEN_TTL);
  }
  function clearRefresh() {
    if (tokenRefreshTimer) clearTimeout(tokenRefreshTimer);
    tokenRefreshTimer = null;
  }

  /* ══ Init Google OAuth ══ */
  function initGoogle(clientId) {
    GOOGLE_CLIENT_ID = clientId;
    if (!window.google) { setTimeout(() => initGoogle(clientId), 300); return; }
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
      callback: async (resp) => {
        if (resp.error) { UI.toast('登录失败：' + resp.error, 'error'); return; }
        await onTokenReceived(resp.access_token);
      }
    });
  }

  async function onTokenReceived(token) {
    // Fetch user info
    let userInfo;
    try {
      const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: 'Bearer ' + token }
      });
      userInfo = await r.json();
    } catch(e) { UI.toast('获取用户信息失败', 'error'); return; }

    const account = {
      email:   userInfo.email,
      name:    userInfo.name,
      picture: userInfo.picture,
      token:   token,
      tokenAt: Date.now()
    };
    await upsertAccount(account);
    activeAccountId = account.email;
    localStorage.setItem(ACTIVE_KEY, account.email);

    document.getElementById('tokenWarn').classList.remove('visible');
    scheduleRefresh(account.email);

    UI.toast('登录成功：' + account.name, 'success');
    await App.onLogin();
  }

  /* ══ Public API ══ */
  async function signIn() {
    if (!tokenClient) { UI.toast('正在初始化，请稍候', 'info'); return; }
    tokenClient.requestAccessToken();
  }

  async function signOutCurrent(removeAccount_ = false) {
    const account = await getActiveAccount();
    if (account?.token) {
      try { google.accounts.oauth2.revoke(account.token, () => {}); } catch(e) {}
    }
    if (removeAccount_ && account) {
      await removeAccount(account.email);
      UI.toast('账号已移除', 'success');
    } else {
      // Just clear token but keep account info
      if (account) {
        account.token = null;
        await upsertAccount(account);
      }
      UI.toast('已退出登录', 'success');
    }
    clearRefresh();
    // Try switching to another account
    const accounts = await loadAccounts();
    const next = accounts.find(a => a.token && a.email !== activeAccountId);
    if (next) {
      activeAccountId = next.email;
      localStorage.setItem(ACTIVE_KEY, next.email);
      await App.onLogin();
      UI.toast('已切换到：' + next.name, 'info');
    } else {
      activeAccountId = null;
      localStorage.setItem(ACTIVE_KEY, '');
      App.showLoginScreen();
    }
    UI.closeModal('accountModal');
  }

  async function switchAccount(email) {
    const account = await getAccount(email);
    if (!account) return;
    if (!account.token) {
      // Need to re-login for this account
      activeAccountId = email;
      localStorage.setItem(ACTIVE_KEY, email);
      UI.toast('该账号需要重新登录', 'info');
      signIn();
      return;
    }
    activeAccountId = email;
    localStorage.setItem(ACTIVE_KEY, email);
    UI.closeModal('accountModal');
    UI.toast('已切换到：' + account.name, 'success');
    await App.onLogin();
  }

  async function relogin() {
    signIn();
  }

  async function getActiveAccount() {
    if (!activeAccountId) return null;
    return await getAccount(activeAccountId);
  }

  async function getActiveToken() {
    const account = await getActiveAccount();
    return account?.token || null;
  }

  async function init() {
    // Restore active account
    const saved = localStorage.getItem(ACTIVE_KEY);
    if (saved) {
      activeAccountId = saved;
      const account = await getAccount(saved);
      if (account?.token) {
        scheduleRefresh(saved);
        return true; // has session
      }
    }
    return false; // no valid session
  }

  return {
    initGoogle, signIn, signOutCurrent, switchAccount, relogin,
    getActiveAccount, getActiveToken, getAccount,
    loadAccounts, removeAccount, upsertAccount,
    saveDeepSeekKey, loadDeepSeekKey, clearDeepSeekKey,
    init,
  };
})();
