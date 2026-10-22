import { send, sessionCookie } from '../lib/admin-auth.js';
export default function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Метод не поддерживается.' });
  res.setHeader('Set-Cookie', sessionCookie('', 0));
  return send(res, 200, { ok: true });
}
