import { send, secureEqual, sessionCookie, makeSession, originAllowed } from '../lib/admin-auth.js';

const attempts = new Map();
export default function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Метод не поддерживается.' });
  if (!originAllowed(req)) return send(res, 403, { error: 'Запрос отклонён.' });
  const ip = String(req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const record = attempts.get(ip) || { count: 0, until: now };
  if (record.until > now && record.count >= 5) return send(res, 429, { error: 'Слишком много попыток. Подожди 15 минут и попробуй снова.' });
  if (record.until <= now) { record.count = 0; record.until = now + 15 * 60 * 1000; }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const username = String(body?.username || '');
  const password = String(body?.password || '');
  if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD || !process.env.SESSION_SECRET || !process.env.GITHUB_TOKEN) {
    return send(res, 503, { error: 'Админка ещё не настроена в Vercel. Проверь переменные окружения по инструкции.' });
  }
  if (!secureEqual(username, process.env.ADMIN_USERNAME) || !secureEqual(password, process.env.ADMIN_PASSWORD)) {
    record.count += 1; attempts.set(ip, record);
    return send(res, 401, { error: 'Неверный логин или пароль.' });
  }
  attempts.delete(ip);
  res.setHeader('Set-Cookie', sessionCookie(makeSession(username)));
  return send(res, 200, { ok: true });
}
