import { containsProfanity } from '../src/data/profanityFilter.js';



const CONTACT_EMAIL = 'karamboff@gmail.com';

function respond(res: any, status: number, body: Record<string, unknown>) {
  return res.status(status).setHeader('Cache-Control', 'no-store').json(body);
}


const RATE_WINDOW_SECONDS = 600;
const RATE_LIMIT = 3;
const MEMORY_WINDOW_MS = RATE_WINDOW_SECONDS * 1000;
const memoryAttempts = new Map<string, { count: number; expiresAt: number }>();
const memoryBans = new Map<string, { expiresAt: number; permanent?: boolean }>();
const memoryStrikes = new Map<string, { count: number; expiresAt: number }>();

function getClientIp(req: any): string {
  // Vercel supplies x-forwarded-for. Use only its first (client) address.
  const realIp = String(req.headers?.['x-real-ip'] ?? '').trim();
  const forwarded = String(req.headers?.['x-forwarded-for'] ?? '').split(',')[0].trim();
  const ip = realIp || forwarded;
  // Do not trust an arbitrary malformed value as a Redis key.
  return ip && ip.length <= 64 && /^[0-9a-fA-F:.]+$/.test(ip) ? ip : 'unknown';
}

async function redisCommand(command: unknown[]): Promise<any> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!response.ok) throw new Error(`Upstash Redis returned ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(String(data.error));
  return data.result;
}

const RATE_LIMIT_SCRIPT = `
local banKey = KEYS[1]
local rateKey = KEYS[2]
local strikeKey = KEYS[3]
local banTtl = redis.call('TTL', banKey)
if banTtl == -1 then return {2, -1, 0} end
if banTtl > 0 then return {0, banTtl, 0} end
local count = redis.call('INCR', rateKey)
if count == 1 then redis.call('EXPIRE', rateKey, tonumber(ARGV[1])) end
if count <= tonumber(ARGV[2]) then return {1, count, 0} end
local strikes = redis.call('INCR', strikeKey)
if strikes == 1 then redis.call('EXPIRE', strikeKey, 2592000) end
local exponent = math.min(strikes - 1, 7)
local duration = math.min(3600 * (2 ^ exponent), 604800)
redis.call('SET', banKey, 'automatic', 'EX', duration)
return {0, duration, strikes}
`;

async function checkRateLimit(ip: string): Promise<{ allowed: boolean; retryAfter?: number; permanent?: boolean }> {
  const redisReady = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
  if (redisReady) {
    try {
      const result = await redisCommand([
        'EVAL', RATE_LIMIT_SCRIPT, '3',
        `garage:contact:ban:${ip}`,
        `garage:contact:rate:${ip}`,
        `garage:contact:strikes:${ip}`,
        String(RATE_WINDOW_SECONDS), String(RATE_LIMIT),
      ]);
      const code = Number(result?.[0]);
      if (code === 2) return { allowed: false, permanent: true };
      if (code === 0) return { allowed: false, retryAfter: Number(result?.[1]) || 3600 };
      return { allowed: true };
    } catch (error) {
      console.error('Upstash rate limiter failed:', error);
      // If Redis is configured but unavailable, fail closed rather than send unprotected mail.
      return { allowed: false, retryAfter: 60 };
    }
  }

  // Temporary fallback for local development only. Vercel instances do not share memory;
  // configure Upstash for persistent, cross-instance limits and bans.
  const now = Date.now();
  const ban = memoryBans.get(ip);
  if (ban?.permanent) return { allowed: false, permanent: true };
  if (ban && ban.expiresAt > now) return { allowed: false, retryAfter: Math.ceil((ban.expiresAt - now) / 1000) };
  if (ban) memoryBans.delete(ip);
  let attempt = memoryAttempts.get(ip);
  if (!attempt || attempt.expiresAt <= now) {
    attempt = { count: 0, expiresAt: now + MEMORY_WINDOW_MS };
  }
  attempt.count += 1;
  memoryAttempts.set(ip, attempt);
  if (attempt.count <= RATE_LIMIT) return { allowed: true };
  let strike = memoryStrikes.get(ip);
  if (!strike || strike.expiresAt <= now) strike = { count: 0, expiresAt: now + 30 * 24 * 60 * 60 * 1000 };
  strike.count += 1;
  memoryStrikes.set(ip, strike);
  const seconds = Math.min(3600 * (2 ** Math.min(strike.count - 1, 7)), 604800);
  memoryBans.set(ip, { expiresAt: now + seconds * 1000 });
  return { allowed: false, retryAfter: seconds };
}

async function verifyTurnstile(token: string, ip: string, req: any): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  // Until the owner configures Turnstile, keep the existing form functional.
  // Once a secret is present, missing/invalid tokens are always rejected.
  if (!secret) {
    if (process.env.PUBLIC_TURNSTILE_SITE_KEY) {
      console.error('PUBLIC_TURNSTILE_SITE_KEY is set but TURNSTILE_SECRET_KEY is missing.');
      return false;
    }
    return true;
  }
  if (!token) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip !== 'unknown') body.set('remoteip', ip);
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const result = await response.json();
    if (!result.success) return false;
    const allowedHosts = String(process.env.TURNSTILE_ALLOWED_HOSTNAMES ?? '')
      .split(',').map((host) => host.trim().toLowerCase()).filter(Boolean);
    const requestHost = String(req.headers?.['x-forwarded-host'] ?? req.headers?.host ?? '')
      .split(',')[0].trim().split(':')[0].toLowerCase();
    const validHosts = allowedHosts.length ? allowedHosts : (requestHost ? [requestHost] : []);
    return !validHosts.length || validHosts.includes(String(result.hostname ?? '').toLowerCase());
  } catch (error) {
    console.error('Turnstile verification failed:', error);
    return false;
  }
}


export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return respond(res, 405, { ok: false, message: 'Метод не поддерживается.' });
  }

  const data = typeof req.body === 'string'
    ? (() => { try { return JSON.parse(req.body); } catch { return null; } })()
    : req.body;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return respond(res, 400, { ok: false, message: 'Некорректные данные формы.' });
  }

  // Honeypot: do not send anything when this hidden field was filled by a bot.
  if (String(data['bot-field'] ?? '').trim()) {
    return respond(res, 200, { ok: true, message: 'Сообщение принято.' });
  }

  const clientIp = getClientIp(req);
  const limit = await checkRateLimit(clientIp);
  if (!limit.allowed) {
    if (limit.permanent) {
      return respond(res, 429, { ok: false, code: 'BLOCKED', message: 'Отправка с вашего подключения временно недоступна. Пожалуйста, свяжитесь с нами по телефону.' });
    }
    res.setHeader('Retry-After', String(limit.retryAfter ?? 3600));
    return respond(res, 429, { ok: false, code: 'RATE_LIMIT', message: 'Слишком много попыток отправки. Пожалуйста, попробуйте позже или свяжитесь с нами по телефону.' });
  }

  const turnstileToken = String(data['cf-turnstile-response'] ?? '').trim();
  if (!(await verifyTurnstile(turnstileToken, clientIp, req))) {
    return respond(res, 403, { ok: false, code: 'CAPTCHA', message: 'Не удалось пройти проверку защиты от ботов. Обновите проверку и попробуйте ещё раз.' });
  }

  const name = String(data.name ?? '').trim();
  const email = String(data.email ?? '').trim();
  const phone = String(data.phone ?? '').trim();
  const message = String(data.message ?? '').trim();

  if (!name || !email || !message) {
    return respond(res, 400, { ok: false, message: 'Заполните имя, электронную почту и сообщение.' });
  }
  if (name.length > 120 || email.length > 254 || phone.length > 60 || message.length > 5000) {
    return respond(res, 400, { ok: false, message: 'Слишком длинное значение в одном из полей.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return respond(res, 400, { ok: false, message: 'Проверьте правильность адреса электронной почты.' });
  }

  // Authoritative server-side check runs before any email provider request.
  if (containsProfanity(name) || containsProfanity(message)) {
    return respond(res, 422, {
      ok: false,
      code: 'PROFANITY',
      message: 'Сообщение содержит недопустимую или ненормативную лексику. Пожалуйста, отредактируйте текст.',
    });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    console.error('Missing RESEND_API_KEY or RESEND_FROM_EMAIL environment variable.');
    return respond(res, 503, {
      ok: false,
      message: 'Отправка временно недоступна. Пожалуйста, позвоните нам или напишите на адрес, указанный на сайте.',
    });
  }

  // Prevent header injection. Message body itself is sent as plain text.
  const safeName = name.replace(/[\r\n]+/g, ' ');
  const safePhone = phone.replace(/[\r\n]+/g, ' ');

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [CONTACT_EMAIL],
        reply_to: email,
        subject: `Новое сообщение с сайта — ${safeName}`,
        text: [
          `Имя: ${safeName}`,
          `Email: ${email}`,
          `Телефон: ${safePhone || 'не указан'}`,
          '',
          'Сообщение:',
          message,
        ].join('\n'),
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      console.error('Resend API error:', response.status, details.slice(0, 1000));
      return respond(res, 502, {
        ok: false,
        message: 'Не удалось отправить сообщение. Попробуйте позже или свяжитесь с нами по телефону.',
      });
    }

    return respond(res, 200, {
      ok: true,
      message: 'Спасибо! Ваше сообщение отправлено. Мы свяжемся с вами в ближайшее время.',
    });
  } catch (error) {
    console.error('Resend request failed:', error);
    return respond(res, 502, {
      ok: false,
      message: 'Не удалось отправить сообщение. Проверьте подключение и попробуйте ещё раз.',
    });
  }
}
