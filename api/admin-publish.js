import { send, verifySession, originAllowed, githubPut } from '../lib/admin-auth.js';

function clean(value, max = 500) { return String(value ?? '').trim().slice(0, max); }
function slugify(value) {
  const map = { а:'a', б:'b', в:'v', г:'g', д:'d', е:'e', ё:'e', ж:'zh', з:'z', и:'i', й:'y', к:'k', л:'l', м:'m', н:'n', о:'o', п:'p', р:'r', с:'s', т:'t', у:'u', ф:'f', х:'h', ц:'ts', ч:'ch', ш:'sh', щ:'shch', ъ:'', ы:'y', ь:'', э:'e', ю:'yu', я:'ya' };
  return value.toLowerCase().split('').map(c => map[c] ?? c).join('').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'statya';
}
function yamlString(s) { return JSON.stringify(String(s)); }
function escapeMarkdown(s) { return String(s).replace(/\r\n?/g, '\n').trim(); }
function sanitizeBodyHtml(input) {
  let html = String(input ?? '').trim();
  html = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|iframe|object|embed|form|svg|math|video|audio)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '').replace(/<(script|style|iframe|object|embed|form|svg|math|video|audio)\b[^>]*\/?\s*>/gi, '');
  html = html.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '').replace(/\s+(srcdoc|contenteditable|formaction)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  html = html.replace(/(href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi, '$1="#"');
  html = html.replace(/<img\b([^>]*?)src=("|')((?!\/assets\/images\/blog\/)[^"']*)\2([^>]*)>/gi, '<img$1$4>');
  return html;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Метод не поддерживается.' });
  if (!originAllowed(req)) return send(res, 403, { error: 'Запрос отклонён.' });
  if (!verifySession(req)) return send(res, 401, { error: 'Сессия завершилась. Войди заново.' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || typeof body !== 'object') return send(res, 400, { error: 'Не удалось прочитать статью.' });
  const title = clean(body.title, 160);
  const description = clean(body.description, 400);
  const date = clean(body.date, 10);
  const author = clean(body.author || 'ГАРАЖ PRO', 100);
  const text = sanitizeBodyHtml(escapeMarkdown(body.body || ''));
  if (!title || !description || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !text || !text.replace(/<[^>]*>/g, '').trim()) return send(res, 400, { error: 'Заполни название, описание, дату и текст статьи.' });
  if (text.length > 100000) return send(res, 413, { error: 'Текст слишком большой (максимум 100 000 символов).' });
  let imagePath = '';
  const image = body.image;
  if (image && image.data && image.name) {
    const match = String(image.data).match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) return send(res, 400, { error: 'Фото должно быть в формате JPG, PNG, WEBP или GIF.' });
    const raw = Buffer.from(match[2], 'base64');
    if (raw.length > 3 * 1024 * 1024) return send(res, 413, { error: 'Фото больше 3 МБ. Уменьши его и попробуй снова.' });
    const ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' })[match[1]];
    const base = slugify(String(image.name).replace(/\.[^.]+$/, ''));
    const imageName = `${Date.now()}-${base}.${ext}`;
    imagePath = `/assets/images/blog/${imageName}`;
    try {
      await githubPut(`public/assets/images/blog/${imageName}`, raw.toString('base64'), `Добавить фото для статьи: ${title}`, true);
    } catch (error) { return send(res, 502, { error: error.message || 'Не удалось загрузить фото в GitHub.' }); }
  }
  const slug = `${date}-${slugify(title)}`;
  const frontmatter = [
    '---',
    `title: ${yamlString(title)}`,
    `description: ${yamlString(description)}`,
    `author: ${yamlString(author || 'ГАРАЖ PRO')}`,
    `date: ${date}`,
    'tags: []',
    'draft: false',
    ...(imagePath ? [`image: ${yamlString(imagePath)}`] : []),
    '---',
    '',
    ...(imagePath ? [`![${title.replace(/[\[\]]/g, '')}](${imagePath})`, ''] : []),
    text,
    '',
  ].join('\n');
  try {
    await githubPut(`src/content/blog/${slug}.md`, frontmatter, `Опубликовать статью: ${title}`);
    return send(res, 200, { ok: true, slug, message: 'Статья отправлена в GitHub. Сайт обновится после завершения деплоя Vercel.' });
  } catch (error) {
    return send(res, 502, { error: error.message || 'Не удалось сохранить статью.' });
  }
}
