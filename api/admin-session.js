import { send, verifySession } from '../lib/admin-auth.js';
export default function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'Метод не поддерживается.' });
  const session = verifySession(req);
  return send(res, 200, { authenticated: Boolean(session) });
}
