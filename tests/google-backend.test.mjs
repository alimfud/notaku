import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../server/google-auth.js';

function fixture(t) {
  const env = { APP_ORIGINS: 'https://nota.example', GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret',
    SESSION_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'), UPSTASH_REDIS_REST_URL: 'https://redis.example', UPSTASH_REDIS_REST_TOKEN: 'test-redis' };
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  t.after(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  const records = new Map();
  let refreshes = 0;
  let identityEmail = 'owner@example.com';
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url === 'https://redis.example') {
      const [command, key, value, ...args] = JSON.parse(options.body);
      let result = null;
      if (command === 'GET') result = records.get(key) || null;
      if (command === 'GETDEL') { result = records.get(key) || null; records.delete(key); }
      if (command === 'DEL') result = records.delete(key) ? 1 : 0;
      if (command === 'SET' && !(args.includes('XX') && !records.has(key)) && !(args.includes('NX') && records.has(key))) { records.set(key, value); result = 'OK'; }
      return Response.json({ result });
    }
    if (url === 'https://oauth2.googleapis.com/token') {
      const body = options.body;
      assert.equal(body.get('client_secret'), 'test-secret');
      if (body.get('grant_type') === 'refresh_token') {
        assert.equal(body.get('refresh_token'), 'private-refresh-token');
        refreshes++;
        return Response.json({ access_token: 'renewed-access', expires_in: 3600 });
      }
      assert.ok(body.get('code_verifier'));
      return Response.json({ access_token: 'initial-access', refresh_token: 'private-refresh-token', expires_in: 3600,
        scope: 'openid email profile https://www.googleapis.com/auth/drive.file' });
    }
    if (url === 'https://openidconnect.googleapis.com/v1/userinfo') return Response.json({ sub: 'subject', email: identityEmail, email_verified: true });
    throw new Error('Unexpected external request');
  });
  async function request(action, { method = 'GET', cookie = '', origin = 'https://nota.example', extra = '' } = {}) {
    const headers = {};
    const res = { statusCode: 200, setHeader(name, value) { headers[name] = value; }, getHeader(name) { return headers[name]; }, end(body = '') { this.body = body; } };
    await handler({ method, url: `/api/google?action=${action}${extra}`, headers: { host: 'nota.example', origin, cookie } }, res);
    return { status: res.statusCode, headers, body: res.body, json: () => JSON.parse(res.body) };
  }
  async function login(expected = '') {
    const start = await request('start', { extra: expected ? `&email=${encodeURIComponent(expected)}` : '' });
    const state = new URL(start.headers.Location).searchParams.get('state');
    const flow = start.headers['Set-Cookie'][0].split(';')[0];
    const callback = await request('callback', { cookie: flow, extra: `&code=test-code&state=${state}` });
    const sessionCookie = callback.headers['Set-Cookie'].find((value) => value.startsWith('__Host-notaku-session='))?.split(';')[0];
    return { callback, sessionCookie, flow, state };
  }
  return { request, login, records, get refreshes() { return refreshes; }, setIdentity(email) { identityEmail = email; } };
}

test('cookie restores the session, encrypted storage protects tokens, and expired access refreshes server-side', async (t) => {
  const f = fixture(t);
  const { callback, sessionCookie } = await f.login();
  assert.equal(callback.status, 303);
  assert.match(callback.headers.Location, /google=connected/);
  assert.match(callback.headers['Set-Cookie'].join(' '), /HttpOnly; Secure; SameSite=Lax/);
  assert.ok([...f.records.values()].every((value) => !value.includes('private-refresh-token')));
  const restored = await f.request('session', { method: 'POST', cookie: sessionCookie });
  assert.equal(restored.json().accessToken, 'initial-access');
  assert.ok(!restored.body.includes('private-refresh-token'));
  assert.equal(restored.headers['Cache-Control'], 'no-store, private');
  const refreshed = await f.request('session', { method: 'POST', cookie: sessionCookie, extra: '&refresh=1' });
  assert.equal(refreshed.json().accessToken, 'renewed-access');
  assert.equal(f.refreshes, 1);
});

test('cross-origin calls, missing sessions, and OAuth state replay are rejected', async (t) => {
  const f = fixture(t);
  const login = await f.login();
  assert.equal((await f.request('session', { method: 'POST', cookie: login.sessionCookie, origin: 'https://other.example' })).status, 403);
  assert.equal((await f.request('session', { method: 'POST' })).status, 401);
  assert.equal((await f.request('session')).status, 405);
  const replay = await f.request('callback', { cookie: login.flow, extra: `&code=test-code&state=${login.state}` });
  assert.match(replay.headers.Location, /invalid_state/);
});

test('disconnect invalidates the server record and old cookies cannot restore it', async (t) => {
  const f = fixture(t);
  const { sessionCookie } = await f.login();
  assert.equal((await f.request('disconnect', { method: 'POST', cookie: sessionCookie })).status, 200);
  assert.equal((await f.request('session', { method: 'POST', cookie: sessionCookie })).status, 401);
});

test('login refuses another Google account when renewing an existing account', async (t) => {
  const f = fixture(t);
  f.setIdentity('other@example.com');
  const { callback, sessionCookie } = await f.login('owner@example.com');
  assert.match(callback.headers.Location, /wrong_account/);
  assert.equal(sessionCookie, undefined);
  assert.equal([...f.records.keys()].filter((key) => key.startsWith('notaku:google:')).length, 0);
});
