import { badWords } from '../src/data/badWords';
import { siteData } from '../src/data/siteData';

function respond(res: any, status: number, body: Record<string, unknown>) {
  return res.status(status).setHeader('Cache-Control', 'no-store').json(body);
}

// Normalize punctuation/spacing and common lookalike substitutions before matching.
function normalize(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[0о]/g, 'о')
    .replace(/[3з]/g, 'з')
    .replace(/[4ч]/g, 'ч')
    .replace(/[6б]/g, 'б')
    .replace(/[1!|]/g, 'и')
    .replace(/[@а]/g, 'а')
    .replace(/[$5s]/g, 'с')
    .replace(/[^a-zа-я0-9]/gi, '');
}

function containsProfanity(value: string): boolean {
  const normalized = normalize(value);
  return badWords.some((entry) => {
    const word = normalize(entry);
    return word.length >= 3 && normalized.includes(word);
  });
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
        to: [siteData.email],
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
