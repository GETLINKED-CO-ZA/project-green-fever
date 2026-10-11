'use strict';

const Busboy = require('busboy');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { LIMITS, validateFields, detectImage } = require('../lib/validate');
const { newReportEmail, confirmationEmail } = require('../lib/emails');

const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'RESEND_API_KEY', 'PGF_FROM_EMAIL', 'PGF_ADMIN_EMAIL', 'IP_HASH_SALT'];
const BUCKET = () => process.env.SUPABASE_EVIDENCE_BUCKET || 'pgf-evidence';
const SIGNED_URL_SECONDS = 7 * 24 * 3600;

function send(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(body);
}

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    let bb;
    try {
      bb = Busboy({
        headers: req.headers,
        limits: { fileSize: LIMITS.maxFileBytes, files: 1, fields: 20, fieldSize: 8 * 1024, parts: 30 }
      });
    } catch (e) { return reject(e); }
    const fields = {};
    let file = null, tooLarge = false, limitExceeded = false;
    bb.on('field', (n, v) => { fields[n] = v; });
    bb.on('file', (name, stream) => {
      if (name !== 'photo') { stream.resume(); return; }
      const chunks = [];
      stream.on('data', (c) => chunks.push(c));
      stream.on('limit', () => { tooLarge = true; });
      stream.on('end', () => { const buffer = Buffer.concat(chunks); if (buffer.length) file = { buffer }; });
    });
    bb.on('filesLimit', () => { limitExceeded = true; });
    bb.on('fieldsLimit', () => { limitExceeded = true; });
    bb.on('partsLimit', () => { limitExceeded = true; });
    bb.on('error', reject);
    bb.on('close', () => resolve({ fields, file, tooLarge, limitExceeded }));
    req.pipe(bb);
  });
}

async function verifyTurnstile(token, ip) {
  const body = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET, response: token || '', remoteip: ip });
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  const d = await r.json();
  return !!d.success;
}

async function sendEmail({ to, subject, html, text, replyTo }) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.PGF_FROM_EMAIL, to: [to], subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}) })
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 300)}`);
}

module.exports = async function handler(req, res) {
  // Optional CORS allow-list (only needed when the form lives on another origin).
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.origin;
  if (allowed.length && origin) {
    if (!allowed.includes(origin)) return send(res, 403, { ok: false, code: 'forbidden' });
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(res, 405, { ok: false, code: 'method_not_allowed' }); }

  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error('[PGF] Not configured. Missing environment variables:', missing.join(', '));
    return send(res, 503, { ok: false, code: 'not_configured' });
  }

  let parsed;
  try { parsed = await parseMultipart(req); }
  catch (e) { return send(res, 400, { ok: false, code: 'bad_request' }); }
  const { fields, file, tooLarge, limitExceeded } = parsed;
  if (limitExceeded) return send(res, 400, { ok: false, code: 'bad_request' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';

  // Anti-spam: honeypot and minimum fill time (client-measured elapsed ms, so clock skew is irrelevant).
  const elapsed = Number(fields.elapsed);
  if (fields.website || !Number.isFinite(elapsed) || elapsed < 3000) return send(res, 400, { ok: false, code: 'rejected' });
  if (process.env.TURNSTILE_SECRET) {
    let human = false;
    try { human = await verifyTurnstile(fields['cf-turnstile-response'], ip); } catch (e) { console.error('[PGF] Turnstile error', e.message); }
    if (!human) return send(res, 400, { ok: false, code: 'rejected' });
  }

  const { errors, value } = validateFields(fields);
  let img = null;
  if (tooLarge) errors.photo = 'This photo is larger than 4 MB. Please choose a smaller one.';
  else if (file) {
    img = detectImage(file.buffer);
    if (!img) errors.photo = 'Please upload a JPG, PNG or WebP image.';
  }
  if (Object.keys(errors).length) return send(res, 422, { ok: false, code: 'validation', errors });

  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const ipHash = crypto.createHash('sha256').update(process.env.IP_HASH_SALT + ip).digest('hex');
  let evidencePath = null;
  let stored = false;

  try {
    // Duplicate / retried submission: return the original reference, send nothing again.
    const existing = await db.from('pgf_reports').select('reference').eq('idempotency_key', value.idempotency_key).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return send(res, 200, { ok: true, reference: existing.data.reference, confirmation: 'not_resent', duplicate: true });

    // Rate limit per hashed IP.
    const limit = Number(process.env.PGF_RATE_LIMIT_PER_HOUR) || 5;
    const since = new Date(Date.now() - 3600 * 1000).toISOString();
    const recent = await db.from('pgf_reports').select('id', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('created_at', since);
    if (recent.error) throw recent.error;
    if ((recent.count || 0) >= limit) return send(res, 429, { ok: false, code: 'rate_limited' });

    // Store evidence privately under a random server-generated name.
    if (img) {
      const d = new Date();
      evidencePath = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}.${img.ext}`;
      const up = await db.storage.from(BUCKET()).upload(evidencePath, file.buffer, { contentType: img.mime, upsert: false });
      if (up.error) throw up.error;
    }

    const ins = await db.from('pgf_reports').insert({
      category: value.category, description: value.description, location_text: value.location_text || null,
      latitude: value.latitude, longitude: value.longitude,
      reporter_name: value.reporter_name, reporter_contact: value.reporter_contact, reporter_email: value.reporter_email,
      evidence_path: evidencePath, evidence_mime: img ? img.mime : null, evidence_bytes: file ? file.buffer.length : null,
      accuracy_confirmed: true, idempotency_key: value.idempotency_key, ip_hash: ipHash
    }).select().single();

    if (ins.error) {
      if (evidencePath) await db.storage.from(BUCKET()).remove([evidencePath]).catch(() => {});
      if (ins.error.code === '23505') { // concurrent duplicate of the same submission
        const again = await db.from('pgf_reports').select('reference').eq('idempotency_key', value.idempotency_key).maybeSingle();
        if (again.data) return send(res, 200, { ok: true, reference: again.data.reference, confirmation: 'not_resent', duplicate: true });
      }
      throw ins.error;
    }
    const report = ins.data;
    stored = true;

    // The report is now stored. Emails are best-effort and tracked; a failed email never loses the report.
    let evidenceUrl = null;
    if (evidencePath) {
      try {
        const s = await db.storage.from(BUCKET()).createSignedUrl(evidencePath, SIGNED_URL_SECONDS);
        if (!s.error) evidenceUrl = s.data.signedUrl;
      } catch (e) { console.error('[PGF] signed URL failed', e.message); }
    }
    const jobs = [sendEmail({
      to: process.env.PGF_ADMIN_EMAIL, replyTo: report.reporter_email || undefined,
      ...newReportEmail(report, { evidenceUrl, reviewUrl: process.env.PGF_REVIEW_URL })
    })];
    if (report.reporter_email) {
      jobs.push(sendEmail({
        to: report.reporter_email, replyTo: process.env.PGF_CONTACT_EMAIL || undefined,
        ...confirmationEmail(report, { contactEmail: process.env.PGF_CONTACT_EMAIL })
      }));
    }
    const results = await Promise.allSettled(jobs);
    results.forEach((r, i) => { if (r.status === 'rejected') console.error(`[PGF] ${report.reference} email ${i === 0 ? 'A (admin)' : 'B (reporter)'} failed:`, r.reason && r.reason.message); });

    const adminOk = results[0].status === 'fulfilled';
    const confirmOk = report.reporter_email ? results[1].status === 'fulfilled' : false;
    await db.from('pgf_reports').update({ admin_notified: adminOk, confirmation_sent: confirmOk }).eq('id', report.id)
      .then((r) => { if (r.error) console.error('[PGF] flag update failed', r.error.message); });

    return send(res, 200, {
      ok: true, reference: report.reference,
      confirmation: !report.reporter_email ? 'not_requested' : confirmOk ? 'sent' : 'failed'
    });
  } catch (e) {
    if (evidencePath && !stored) { try { await db.storage.from(BUCKET()).remove([evidencePath]); } catch (_) {} }
    console.error('[PGF] Submission failed:', e && (e.message || e));
    return send(res, 500, { ok: false, code: 'server_error' });
  }
};
