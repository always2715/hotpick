import crypto from 'crypto';

const COOKIE_NAME = 'stellate_admin_session';
const SESSION_MAX_AGE = 60 * 60 * 12;

function getSecret() {
  return String(process.env.SESSION_SECRET || '').trim();
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function sign(payload) {
  const secret = getSecret();
  if (!secret) return '';
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function parseCookies(req) {
  const header = String(req?.headers?.cookie || '');
  return header.split(';').reduce((out, pair) => {
    const index = pair.indexOf('=');
    if (index < 0) return out;
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
    return out;
  }, {});
}

export function adminAuthConfigured() {
  return Boolean(String(process.env.ADMIN_PASSWORD || '').trim() && getSecret());
}

export function verifyAdminPassword(password) {
  const expected = String(process.env.ADMIN_PASSWORD || '');
  if (!expected || !password) return false;
  return safeEqual(password, expected);
}

export function createAdminToken() {
  if (!adminAuthConfigured()) return '';
  const payload = base64url(JSON.stringify({
    role: 'admin',
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
    nonce: crypto.randomBytes(12).toString('hex'),
  }));
  return `${payload}.${sign(payload)}`;
}

export function verifyAdminToken(token) {
  if (!adminAuthConfigured() || !token) return false;
  const [payload, signature] = String(token).split('.');
  if (!payload || !signature || !safeEqual(signature, sign(payload))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.role === 'admin' && Number(data.exp || 0) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function isAdminRequest(req) {
  return verifyAdminToken(parseCookies(req)[COOKIE_NAME]);
}

export function isInternalRequest(req) {
  const expected = String(process.env.CRON_SECRET || '');
  const provided = String(req?.headers?.authorization || '');
  return Boolean(expected && provided && safeEqual(provided, `Bearer ${expected}`));
}

export function requireAdmin(req, res) {
  if (!adminAuthConfigured()) {
    res.status(503).json({ error: '관리자 인증 환경변수가 설정되지 않았습니다.' });
    return false;
  }
  if (!isAdminRequest(req)) {
    res.status(401).json({ error: '관리자 로그인이 필요합니다.' });
    return false;
  }
  return true;
}

export function requireAdminOrInternal(req, res) {
  if (isInternalRequest(req)) return true;
  return requireAdmin(req, res);
}

export function setAdminSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MAX_AGE}${secure}`);
}

export function clearAdminSessionCookie(res) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`);
}
