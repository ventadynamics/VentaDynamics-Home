// Shared reporting endpoint for Venta Dynamics apps: receives a report/feedback message
// and forwards it to Telegram. Bot token and chat id live only in Vercel env vars.
//
//   POST /api/report
//   { app, kind?, message, meta?, contact?, version?, platform? }
//
// `app`     — which app sent it (e.g. "bsmu-student")
// `kind`    — report type (e.g. "schedule-inaccuracy", "bug", "feedback")
// `message` — the user's text (required)
// `meta`    — flat object of extra context (e.g. { group, day }) — shown as "key: value"
// `contact` — optional way to reach the reporter
//
// Optional per-app routing: env TELEGRAM_CHAT_ID_<APP_UPPER_SNAKE> overrides TELEGRAM_CHAT_ID.

const clip = (v, n) => String(v == null ? '' : v).slice(0, n);
const KIND = {
  'schedule-inaccuracy': '🐞 Неточность в расписании',
  bug: '🐞 Баг',
  feedback: '💬 Отзыв',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return res.status(503).json({ error: 'reporting not configured' });

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};

  const message = clip(b.message, 2000).trim();
  if (!message) return res.status(400).json({ error: 'empty message' });

  const app = clip(b.app, 40) || 'app';
  const perApp = process.env[`TELEGRAM_CHAT_ID_${app.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`];
  const chatId = perApp || process.env.TELEGRAM_CHAT_ID;
  if (!chatId) return res.status(503).json({ error: 'reporting not configured' });

  const header = KIND[b.kind] || (b.kind ? `📨 ${clip(b.kind, 40)}` : '📨 Сообщение');
  const lines = [`${header} · ${app}`];
  if (b.meta && typeof b.meta === 'object') {
    for (const [k, v] of Object.entries(b.meta)) {
      if (v != null && String(v).trim()) lines.push(`${clip(k, 30)}: ${clip(v, 160)}`);
    }
  }
  lines.push('', message);
  if (b.contact) lines.push('', `Связь: ${clip(b.contact, 200)}`);
  lines.push('', `— ${app} ${clip(b.version, 20)} (${clip(b.platform, 12)})`);

  try {
    const tg = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: lines.join('\n'), disable_web_page_preview: true }),
    });
    if (!tg.ok) return res.status(502).json({ error: 'telegram failed', detail: (await tg.text()).slice(0, 200) });
  } catch {
    return res.status(502).json({ error: 'telegram unreachable' });
  }
  return res.status(200).json({ ok: true });
}
