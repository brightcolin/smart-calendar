const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'auth.js'), 'utf8');
const TTL = 55 * 60 * 1000;
const profile = { email: 'test@example.invalid', name: 'Test User' };

function createHarness() {
  const storage = new Map();
  const timers = new Map();
  const requests = [];
  const notices = [];
  const elements = new Map();
  let oauthConfig;
  let loginCount = 0;
  let timerId = 0;
  let denyAccountWrites = false;
  let response = { ok: true, json: async () => profile };
  const google = { accounts: { oauth2: {
    initTokenClient(config) {
      oauthConfig = config;
      return { requestAccessToken: options => requests.push(options) };
    },
    revoke() {},
  } } };
  const context = {
    console, crypto: webcrypto, TextEncoder, TextDecoder,
    btoa: value => Buffer.from(value, 'binary').toString('base64'),
    atob: value => Buffer.from(value, 'base64').toString('binary'),
    navigator: { userAgent: 'test-browser', language: 'zh-CN' },
    screen: { width: 1280, height: 720 },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => {
        if (denyAccountWrites && key === 'sca_accounts') throw new Error('本地存储不可写');
        storage.set(key, String(value));
      },
      removeItem: key => storage.delete(key),
    },
    setTimeout(fn, delay) { timers.set(++timerId, { fn, delay }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    google, window: { google },
    fetch: async () => response,
    document: { getElementById(id) {
      if (!elements.has(id)) elements.set(id, { classList: { add() {}, remove() {} } });
      return elements.get(id);
    } },
    UI: { toast: (message, kind) => notices.push({ message, kind }), closeModal() {} },
    App: { onLogin: async () => { loginCount++; }, showLoginScreen() {} },
  };
  vm.createContext(context);
  vm.runInContext(source + '\nglobalThis.auth = Auth;', context);
  const auth = context.auth;
  auth.initGoogle('test-client-id');
  return {
    auth, storage, timers, requests, notices,
    get loginCount() { return loginCount; },
    respond: data => oauthConfig.callback(data),
    setProfileResponse: value => { response = value; },
    denyAccountWrites: () => { denyAccountWrites = true; },
    async saveAccount(token, tokenAt = Date.now()) {
      await auth.upsertAccount({ ...profile, token, tokenAt });
      storage.set('sca_active', profile.email);
    },
  };
}

test('a saved account without a token enters the app after interactive sign-in', async () => {
  const h = createHarness();
  await h.saveAccount(null);
  assert.equal(await h.auth.init(), false);
  await h.auth.signIn();
  await h.respond({ access_token: 'synthetic-new-token' });
  assert.equal(h.loginCount, 1);
  assert.equal(await h.auth.getActiveToken(), 'synthetic-new-token');
});

test('expired saved tokens require sign-in and do not restore an authenticated screen', async () => {
  const h = createHarness();
  await h.saveAccount('synthetic-expired-token', Date.now() - TTL - 1000);
  assert.equal(await h.auth.init(), false);
  assert.equal(h.timers.size, 0);
  await h.auth.relogin();
  await h.respond({ access_token: 'synthetic-renewed-token' });
  assert.equal(h.loginCount, 1);
});

test('signing in another account refreshes the app instead of suppressing the callback', async () => {
  const h = createHarness();
  await h.saveAccount('synthetic-current-token');
  assert.equal(await h.auth.init(), true);
  h.setProfileResponse({ ok: true, json: async () => ({ email: 'second@example.invalid', name: 'Second' }) });
  await h.auth.signIn();
  await h.respond({ access_token: 'synthetic-second-token' });
  assert.equal(h.loginCount, 1);
  assert.equal((await h.auth.getActiveAccount()).email, 'second@example.invalid');
});

test('background refresh updates the token without restarting the app', async () => {
  const h = createHarness();
  await h.saveAccount('synthetic-current-token', Date.now() - 10 * 60 * 1000);
  assert.equal(await h.auth.init(), true);
  const timer = [...h.timers.values()][0];
  assert.ok(timer.delay > 44 * 60 * 1000 && timer.delay <= 45 * 60 * 1000);
  await timer.fn();
  assert.equal(h.requests.at(-1).prompt, 'none');
  await h.respond({ access_token: 'synthetic-refreshed-token' });
  assert.equal(h.loginCount, 0);
  assert.equal(await h.auth.getActiveToken(), 'synthetic-refreshed-token');
});

test('selecting a saved account that needs authorization enters the app', async () => {
  const h = createHarness();
  await h.saveAccount(null);
  await h.auth.switchAccount(profile.email);
  await h.respond({ access_token: 'synthetic-selected-token' });
  assert.equal(h.loginCount, 1);
});

test('invalid user-info responses cannot overwrite a valid saved account', async () => {
  const h = createHarness();
  await h.saveAccount('synthetic-current-token');
  await h.auth.init();
  h.setProfileResponse({ ok: false, status: 401, json: async () => ({ error: 'invalid token' }) });
  await h.auth.signIn();
  await h.respond({ access_token: 'synthetic-rejected-token' });
  assert.equal(h.loginCount, 0);
  assert.equal((await h.auth.loadAccounts()).length, 1);
  assert.equal(await h.auth.getActiveToken(), 'synthetic-current-token');
  assert.ok(h.notices.some(n => n.kind === 'error'));
});

test('account persistence failures are reported without an unhandled rejection', async () => {
  const h = createHarness();
  await h.saveAccount('synthetic-current-token');
  await h.auth.init();
  h.denyAccountWrites();
  await h.auth.signIn();
  await h.respond({ access_token: 'synthetic-new-token' });
  assert.equal(h.loginCount, 0);
  assert.equal(await h.auth.getActiveToken(), 'synthetic-current-token');
  assert.ok(h.notices.some(n => n.kind === 'error' && n.message.includes('本地存储不可写')));
});
