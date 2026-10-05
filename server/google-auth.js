import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const SESSION_COOKIE = '__Host-notaku-session';
const FLOW_COOKIE = '__Host-notaku-google-flow';
const SESSION_SECONDS = 30 * 86400;
const FLOW_SECONDS = 600;
const SCOPE = 'openid email profile https://www.googleapis.com/auth/drive.file';
const digest = (value) => createHash('sha256').update(value).digest('base64url');

function config() {
  const origins = (process.env.APP_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const key = Buffer.from(process.env.SESSION_ENCRYPTION_KEY || '', 'base64');
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || key.length !== 32 || !redisUrl || !redisToken || !origins.length) return null;
  if (origins.some((origin) => !origin.startsWith('https://') || new URL(origin).origin !== origin)) return null;
  if (!redisUrl.startsWith('https://')) return null;
  return { origins, key, redisUrl, redisToken, clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET };
}

function seal(value, key, purpose) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(purpose));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}

function unseal(value, key, purpose) {
  const bytes = Buffer.from(value, 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
  decipher.setAAD(Buffer.from(purpose));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'));
}

function cookie(req, name) {
  return String(req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(name + '='))?.slice(name.length + 1) || '';
}

function setCookie(res, name, value, maxAge) {
  const existing = res.getHeader('Set-Cookie') || [];
  res.setHeader('Set-Cookie', [...(Array.isArray(existing) ? existing : [existing]), `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`]);
}

function json(res, status, value) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(value));
}

function redirect(res, location) {
  res.statusCode = 303;
  res.setHeader('Location', location);
  res.end();
}

async function redis(cfg, command) {
  const response = await fetch(cfg.redisUrl, {
    method: 'POST', headers: { Authorization: `Bearer ${cfg.redisToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command), signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('storage_unavailable');
  const result = await response.json();
  if (result.error) throw new Error('storage_unavailable');
  return result.result;
}

function sessionKey(id, origin) { return `notaku:google:${digest(origin + ':' + id)}`; }
function validId(value) { return /^[A-Za-z0-9_-]{43}$/.test(value); }

async function readSession(req, cfg, origin) {
  const id = cookie(req, SESSION_COOKIE);
  if (!validId(id)) return null;
  const key = sessionKey(id, origin);
  const encrypted = await redis(cfg, ['GET', key]);
  if (!encrypted) return null;
  try {
    const data = unseal(encrypted, cfg.key, 'session:' + origin);
    if (data.expiresAt <= Date.now()) return null;
    return { id, key, data };
  } catch { return null; }
}

async function tokenRequest(cfg, values) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, ...values }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) {
    const error = new Error(data.error === 'invalid_grant' ? 'authorization_required' : 'google_unavailable');
    throw error;
  }
  return data;
}

export default async function googleAuth(req, res) {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Vary', 'Cookie, Origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  let cfg;
  try { cfg = config(); } catch { cfg = null; }
  const url = new URL(req.url, 'https://localhost');
  const action = url.searchParams.get('action') || 'status';
  if (!cfg) return json(res, action === 'status' ? 200 : 503, { configured: false, error: 'backend_not_configured' });
  // Accept only explicitly configured production hosts; never trust a supplied redirect URI.
  const origin = `https://${req.headers.host}`;
  if (!cfg.origins.includes(origin)) return json(res, 403, { error: 'origin_not_allowed' });
  const method = req.method || 'GET';
  if (action === 'status' && method === 'GET') return json(res, 200, { configured: true });
  const callbackUri = `${origin}/api/google?action=callback`;
  const returnUri = (result) => `${origin}/?google=${result}#/settings/autobackup`;
  try {
    if (action === 'start' && method === 'GET') {
      if (req.headers['sec-fetch-site'] === 'cross-site') return json(res, 403, { error: 'cross_site_request' });
      const state = randomBytes(32).toString('base64url');
      const verifier = randomBytes(32).toString('base64url');
      const expectedEmail = (url.searchParams.get('email') || '').trim().toLowerCase();
      if (expectedEmail.length > 254) return json(res, 400, { error: 'invalid_account' });
      const flow = { state, verifier, expectedEmail, expiresAt: Date.now() + FLOW_SECONDS * 1000 };
      // Redis makes the OAuth state one-use, in addition to binding it to this browser.
      await redis(cfg, ['SET', `notaku:oauth:${digest(state)}`, origin, 'EX', FLOW_SECONDS, 'NX']);
      setCookie(res, FLOW_COOKIE, seal(flow, cfg.key, 'flow:' + origin), FLOW_SECONDS);
      const params = new URLSearchParams({ client_id: cfg.clientId, redirect_uri: callbackUri, response_type: 'code',
        scope: SCOPE, access_type: 'offline', prompt: 'consent', state,
        code_challenge: digest(verifier), code_challenge_method: 'S256',
        ...(expectedEmail ? { login_hint: expectedEmail } : {}),
      });
      return redirect(res, 'https://accounts.google.com/o/oauth2/v2/auth?' + params);
    }
    if (action === 'callback' && method === 'GET') {
      let flow;
      try { flow = unseal(cookie(req, FLOW_COOKIE), cfg.key, 'flow:' + origin); } catch { return redirect(res, returnUri('invalid_state')); }
      setCookie(res, FLOW_COOKIE, '', 0);
      if (flow.expiresAt <= Date.now() || flow.state !== url.searchParams.get('state')) return redirect(res, returnUri('invalid_state'));
      const storedOrigin = await redis(cfg, ['GETDEL', `notaku:oauth:${digest(flow.state)}`]);
      if (storedOrigin !== origin) return redirect(res, returnUri('invalid_state'));
      if (url.searchParams.has('error')) return redirect(res, returnUri('cancelled'));
      const code = url.searchParams.get('code');
      if (!code || code.length > 8192) return redirect(res, returnUri('invalid_state'));
      const tokens = await tokenRequest(cfg, { code, grant_type: 'authorization_code', redirect_uri: callbackUri, code_verifier: flow.verifier });
      if (!String(tokens.scope || '').split(' ').includes('https://www.googleapis.com/auth/drive.file')) return redirect(res, returnUri('consent_required'));
      const identityResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.timeout(10000),
      });
      if (!identityResponse.ok) return redirect(res, returnUri('identity_failed'));
      const identity = await identityResponse.json();
      if (!identity.sub || !identity.email || identity.email_verified !== true) return redirect(res, returnUri('identity_failed'));
      if (flow.expectedEmail && flow.expectedEmail !== identity.email.toLowerCase()) return redirect(res, returnUri('wrong_account'));
      if (!tokens.refresh_token) return redirect(res, returnUri('consent_required'));
      const id = randomBytes(32).toString('base64url');
      const data = { sub: identity.sub, email: identity.email, refreshToken: tokens.refresh_token,
        accessToken: tokens.access_token, tokenExpiresAt: Date.now() + Number(tokens.expires_in || 3600) * 1000,
        expiresAt: Date.now() + SESSION_SECONDS * 1000 };
      await redis(cfg, ['SET', sessionKey(id, origin), seal(data, cfg.key, 'session:' + origin), 'EX', SESSION_SECONDS, 'NX']);
      const oldId = cookie(req, SESSION_COOKIE);
      if (validId(oldId)) await redis(cfg, ['DEL', sessionKey(oldId, origin)]);
      setCookie(res, SESSION_COOKIE, id, SESSION_SECONDS);
      return redirect(res, returnUri('connected'));
    }
    if (action !== 'session' && action !== 'disconnect') return json(res, 404, { error: 'not_found' });
    if (method !== 'POST') { res.setHeader('Allow', 'POST'); return json(res, 405, { error: 'method_not_allowed' }); }
    if (req.headers.origin !== origin || req.headers['sec-fetch-site'] === 'cross-site') return json(res, 403, { error: 'cross_site_request' });
    if (action === 'disconnect') {
      const id = cookie(req, SESSION_COOKIE);
      if (validId(id)) await redis(cfg, ['DEL', sessionKey(id, origin)]);
      setCookie(res, SESSION_COOKIE, '', 0);
      return json(res, 200, { disconnected: true });
    }
    const session = await readSession(req, cfg, origin);
    if (!session) { setCookie(res, SESSION_COOKIE, '', 0); return json(res, 401, { error: 'authorization_required' }); }
    const data = session.data;
    if (data.tokenExpiresAt <= Date.now() + 60000 || url.searchParams.get('refresh') === '1') {
      let tokens;
      try { tokens = await tokenRequest(cfg, { grant_type: 'refresh_token', refresh_token: data.refreshToken }); }
      catch (error) {
        if (error.message !== 'authorization_required') throw error;
        await redis(cfg, ['DEL', session.key]);
        setCookie(res, SESSION_COOKIE, '', 0);
        return json(res, 401, { error: 'authorization_required' });
      }
      data.accessToken = tokens.access_token;
      data.refreshToken = tokens.refresh_token || data.refreshToken;
      data.tokenExpiresAt = Date.now() + Number(tokens.expires_in || 3600) * 1000;
    }
    data.expiresAt = Date.now() + SESSION_SECONDS * 1000;
    const saved = await redis(cfg, ['SET', session.key, seal(data, cfg.key, 'session:' + origin), 'EX', SESSION_SECONDS, 'XX']);
    if (saved !== 'OK') return json(res, 401, { error: 'authorization_required' });
    setCookie(res, SESSION_COOKIE, session.id, SESSION_SECONDS);
    return json(res, 200, { email: data.email, accessToken: data.accessToken, expiresAt: data.tokenExpiresAt });
  } catch {
    // Never put OAuth codes, provider error bodies, cookies, or tokens in logs/responses.
    if (action === 'callback') return redirect(res, returnUri('unavailable'));
    return json(res, 503, { error: 'service_unavailable' });
  }
}
