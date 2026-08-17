const nodemailer = require('nodemailer');

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isValidEmail(email) {
  const value = String(email || '').trim();
  if (!/^[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+$/i.test(value)) return false;
  if (value.includes('..')) return false;
  const tld = (value.split('@')[1] || '').split('.').pop() || '';
  return /^[A-Z]{2,}$/i.test(tld);
}

function env(name) {
  return String(process.env[name] || '').trim().replace(/^['"]|['"]$/g, '');
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body) {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

function parseEmails(value) {
  return String(value || '')
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter((item) => isValidEmail(item));
}

const RSVP_INBOXES = [
  'kamaldeep212@gmail.com',
  'mehak.singal1995@gmail.com',
  'nakulsingal98@gmail.com'
];

function mailConfig() {
  const host = env('SMTP_HOST');
  const user = env('SMTP_USER');
  const pass = (env('SMTP_PASS') || env('SMTP_PASSWORD')).replace(/\s+/g, '');
  const toList = [...new Set([
    ...RSVP_INBOXES,
    ...parseEmails([env('MAIL_TO'), env('MAIL_CC')].filter(Boolean).join(','))
  ])];
  const to = toList.join(', ');
  const from = env('MAIL_FROM') || user || toList[0];
  const port = Number(env('SMTP_PORT') || 587);
  const secure = env('SMTP_SECURE') === 'true' || port === 465;
  const smtpReady = Boolean(host && user && pass && toList.length);
  return { host, user, pass, to, toList, from, port, secure, smtpReady };
}

function requestOrigin(req) {
  const origin = String(req.headers.origin || '').trim();
  if (origin) return origin.replace(/\/$/, '');
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  if (host) return `${proto}://${host}`;
  return 'https://mehakwedskaran-chi.vercel.app';
}

async function sendViaFormSubmit({ to, origin, name, email, subject, rows, text }) {
  const res = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(to)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Origin: origin,
      Referer: `${origin}/`
    },
    body: JSON.stringify({
      _subject: subject,
      _captcha: 'false',
      name,
      email,
      ...Object.fromEntries(rows),
      message: text
    })
  });
  const raw = await res.text();
  let data = {};
  try { data = JSON.parse(raw); } catch { data = { message: raw.slice(0, 300) }; }
  const success = String(data.success) === 'true';
  const activating = /activat/i.test(String(data.message || ''));
  if (!success && !activating) {
    throw new Error(data.message || `FormSubmit HTTP ${res.status}`);
  }
  return { activating };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method === 'GET') {
    const { smtpReady } = mailConfig();
    res.status(200).json({
      ok: true,
      mailConfigured: true,
      provider: smtpReady ? 'smtp' : 'formsubmit'
    });
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const { host, user, pass, to, toList, from, port, secure, smtpReady } = mailConfig();

  const body = readBody(req);
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const phone = String(body.phone || '').trim();
  const attending = String(body.attending || '').trim();
  const guests = String(body.guests || '').trim();
  const message = String(body.message || '').trim() || '—';

  if (!name || !isValidEmail(email) || phone.replace(/\D/g, '').length < 7 || !attending) {
    res.status(400).json({ ok: false, error: 'Invalid RSVP' });
    return;
  }

  const rows = [
    ['Name', name],
    ['Email', email],
    ['Phone', phone],
    ['Attending', attending],
    ['Guests', guests || '0'],
    ['Message', message]
  ];

  const text = [
    'New wedding RSVP for Mehak & Karan (#Mehran)',
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`)
  ].join('\n');

  const html = `
    <div style="font-family:Georgia,serif;background:#f7e6e9;padding:24px">
      <div style="max-width:560px;margin:0 auto;background:#fff7f8;border:1px solid #e3c4cc;border-radius:12px;overflow:hidden">
        <div style="padding:22px 24px;background:#8f3450;color:#fff5f7">
          <div style="font-size:12px;letter-spacing:.28em;text-transform:uppercase;opacity:.85">#Mehran</div>
          <h1 style="margin:8px 0 0;font-size:24px;font-weight:400">New RSVP</h1>
        </div>
        <div style="padding:8px 0 18px">
          ${rows.map(([label, value]) => `
            <div style="padding:12px 24px;border-bottom:1px solid #f0dde2">
              <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#9c4a63">${escapeHtml(label)}</div>
              <div style="margin-top:4px;font-size:16px;color:#3b2029;white-space:pre-wrap">${escapeHtml(value)}</div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  try {
    if (smtpReady) {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        requireTLS: port === 587,
        auth: { user, pass },
        tls: { minVersion: 'TLSv1.2' },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 20000
      });

      await transporter.sendMail({
        from: `"Mehak & Karan Wedding RSVP" <${from}>`,
        to: toList,
        replyTo: email,
        subject: `RSVP · ${name} · #Mehran`,
        text,
        html
      });
    } else {
      const origin = requestOrigin(req);
      const subject = `RSVP · ${name} · #Mehran`;
      for (const recipient of toList) {
        await sendViaFormSubmit({
          to: recipient,
          origin,
          name,
          email,
          subject,
          rows,
          text
        });
      }
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('RSVP mail failed:', err);
    res.status(500).json({ ok: false, error: 'Could not send RSVP email', detail: err.message });
  }
};
