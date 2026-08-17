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

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body) {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const to = process.env.MAIL_TO || user;
  const from = process.env.MAIL_FROM || user;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;

  if (!host || !user || !pass || !to) {
    res.status(500).json({ ok: false, error: 'Mail is not configured' });
    return;
  }

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
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass }
    });

    await transporter.sendMail({
      from: `"Mehak & Karan Wedding RSVP" <${from}>`,
      to,
      replyTo: email,
      subject: `RSVP · ${name} · #Mehran`,
      text,
      html
    });

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('RSVP mail failed:', err);
    res.status(500).json({ ok: false, error: 'Could not send RSVP email' });
  }
};
