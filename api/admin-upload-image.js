import { send, verifySession, originAllowed, githubPut } from '../lib/admin-auth.js';

function slugify(value) {
  const map = { а:'a', б:'b', в:'v', г:'g', д:'d', е:'e', ё:'e', ж:'zh', з:'z', и:'i', й:'y', к:'k', л:'l', м:'m', н:'n', о:'o', п:'p', р:'r', с:'s', т:'t', у:'u', ф:'f', х:'h', ц:'ts', ч:'ch', ш:'sh', щ:'shch', ъ:'', ы:'y', ь:'', э:'e', ю:'yu', я:'ya' };
  return value.toLowerCase().split('').map(c => map[c] ?? c).join('').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'image';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Метод не поддерживается.' });
  if (!originAllowed(req)) return send(res, 403, { error: 'Запрос отклонён.' });
  if (!verifySession(req)) return send(res, 401, { error: 'Сессия завершилась. Войди заново.' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || typeof body.name !== 'string' || typeof body.data !== 'string') return send(res, 400, { error: 'Не удалось прочитать изображение.' });
  const match = body.data.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return send(res, 400, { error: 'Поддерживаются JPG, PNG, WEBP и GIF.' });
  const raw = Buffer.from(match[2], 'base64');
  if (!raw.length || raw.length > 3 * 1024 * 1024) return send(res, 413, { error: 'Изображение должно быть не больше 3 МБ.' });
  const ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' })[match[1]];
  const filename = `${Date.now()}-${slugify(body.name.replace(/\.[^.]+$/, ''))}.${ext}`;
  const path = `/assets/images/blog/${filename}`;
  try {
    await githubPut(`public/assets/images/blog/${filename}`, raw.toString('base64'), `Добавить изображение в статью: ${filename}`, true);
    return send(res, 200, { ok: true, path });
  } catch (error) {
    return send(res, 502, { error: error.message || 'Не удалось загрузить изображение.' });
  }
}
