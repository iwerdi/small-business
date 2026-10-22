import { badWords } from "../../src/data/badWords.ts";
import { siteData } from "../../src/data/siteData.ts";

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  body: JSON.stringify(body),
});

// Нормализация не позволяет обойти проверку пробелами, знаками препинания
// и некоторыми распространёнными заменами похожих символов.
function normalize(value = "") {
  return String(value)
    .normalize("NFKC")
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[0о]/g, "о")
    .replace(/[3з]/g, "з")
    .replace(/[4ч]/g, "ч")
    .replace(/[6б]/g, "б")
    .replace(/[1!|]/g, "и")
    .replace(/[@а]/g, "а")
    .replace(/[$5s]/g, "с")
    .replace(/[^a-zа-я0-9]/gi, "");
}

function containsProfanity(value) {
  const normalized = normalize(value);
  return badWords.some((entry) => {
    const word = normalize(entry);
    return word.length >= 3 && normalized.includes(word);
  });
}

export const handler = async (request) => {
  if (request.httpMethod !== "POST") {
    return {
      ...json(405, { ok: false, message: "Метод не поддерживается." }),
      headers: { "Content-Type": "application/json; charset=utf-8", Allow: "POST" },
    };
  }

  let data;
  try {
    data = JSON.parse(request.body || "{}");
  } catch {
    return json(400, { ok: false, message: "Некорректные данные формы." });
  }

  // Honeypot: скрытое поле для простых автоматических рассылок.
  if (String(data["bot-field"] || "").trim()) {
    return json(200, { ok: true, message: "Сообщение принято." });
  }

  const name = String(data.name || "").trim();
  const email = String(data.email || "").trim();
  const phone = String(data.phone || "").trim();
  const message = String(data.message || "").trim();

  if (!name || !email || !message) {
    return json(400, { ok: false, message: "Заполните имя, электронную почту и сообщение." });
  }
  if (name.length > 120 || email.length > 254 || phone.length > 60 || message.length > 5000) {
    return json(400, { ok: false, message: "Слишком длинное значение в одном из полей." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(400, { ok: false, message: "Проверьте правильность адреса электронной почты." });
  }

  // Обязательная серверная проверка: её нельзя обойти отключением JS в браузере.
  if (containsProfanity(message) || containsProfanity(name)) {
    return json(422, {
      ok: false,
      code: "PROFANITY",
      message: "Сообщение содержит недопустимую или ненормативную лексику. Пожалуйста, отредактируйте текст.",
    });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    console.error("Contact form is not configured: RESEND_API_KEY or RESEND_FROM_EMAIL is missing.");
    return json(503, {
      ok: false,
      message: "Отправка временно недоступна. Пожалуйста, позвоните нам или напишите на адрес, указанный на сайте.",
    });
  }

  const safeName = name.replace(/[\r\n]+/g, " ");
  const safePhone = phone.replace(/[\r\n]+/g, " ");
  const safeEmail = email.replace(/[\r\n]+/g, " ");

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [siteData.email],
        reply_to: email,
        subject: `Новое сообщение с сайта — ${safeName}`,
        text: [
          `Имя: ${safeName}`,
          `Email: ${safeEmail}`,
          `Телефон: ${safePhone || "не указан"}`,
          "",
          "Сообщение:",
          message,
        ].join("\n"),
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      console.error("Resend rejected contact email:", response.status, details.slice(0, 1000));
      return json(502, {
        ok: false,
        message: "Не удалось отправить сообщение. Попробуйте позже или свяжитесь с нами по телефону.",
      });
    }

    return json(200, {
      ok: true,
      message: "Спасибо! Ваше сообщение отправлено. Мы свяжемся с вами в ближайшее время.",
    });
  } catch (error) {
    console.error("Contact email request failed:", error);
    return json(502, {
      ok: false,
      message: "Не удалось отправить сообщение. Проверьте подключение и попробуйте ещё раз.",
    });
  }
};
