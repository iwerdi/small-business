import crypto from 'node:crypto';

export function send(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').setHeader('Cache-Control', 'no-store').end(JSON.stringify(body));
}

export function secureEqual(a, b) {
  const left = Buffer.from(String(a ?? ''));
  const right = Buffer.from(String(b ?? ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function sessionCookie(value, maxAge = 60 * 60 * 8) {
  return `gp_admin=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

export function makeSession(username) {
  const payload = Buffer.from(JSON.stringify({ u: username, exp: Date.now() + 8 * 60 * 60 * 1000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', process.env.SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifySession(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/(?:^|;\s*)gp_admin=([^;]+)/);
  if (!match || !process.env.SESSION_SECRET) return null;
  const [payload, signature] = match[1].split('.');
  if (!payload || !signature) return null;
  const expected = crypto.createHmac('sha256', process.env.SESSION_SECRET).update(payload).digest('base64url');
  if (!secureEqual(signature, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.u || !data.exp || data.exp < Date.now()) return null;
    return data;
  } catch { return null; }
}

export function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const host = req.headers.host;
  try { return new URL(origin).host === host; } catch { return false; }
}

export async function githubPut(path, content, message, isBase64 = false) {
  const owner = process.env.GITHUB_OWNER || 'iwerdi';
  const repo = process.env.GITHUB_REPO || 'small-business';
  const branch = process.env.GITHUB_BRANCH || 'main';
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('На сервере не задан GITHUB_TOKEN.');
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'Garage-Pro-Admin',
    },
    body: JSON.stringify({ message, content: isBase64 ? content : Buffer.from(content, 'utf8').toString('base64'), branch }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 409 || response.status === 422) throw new Error(`GitHub не принял файл (${response.status}). Возможно, статья с таким адресом уже существует.`);
    if (response.status === 401 || response.status === 403) throw new Error('GitHub отклонил токен. Проверь GITHUB_TOKEN и права Contents: Read and write.');
    throw new Error(`GitHub вернул ошибку ${response.status}: ${data.message || 'не удалось сохранить файл'}`);
  }
  return data;
}
