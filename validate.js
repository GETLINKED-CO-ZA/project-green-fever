'use strict';

const CATEGORIES = [
  'Litter', 'Illegal dumping', 'Damaged public infrastructure',
  'Neglected public space', 'Overgrown vegetation', 'Other'
];

const LIMITS = {
  maxFileBytes: 4 * 1024 * 1024, // Vercel functions accept ~4.5 MB request bodies
  descMin: 10, descMax: 2000, locMax: 300, nameMax: 100, contactMax: 150
};

const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const clean = (v, max) =>
  String(v == null ? '' : v)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max + 1); // keep one extra char so over-length is detectable

function validateFields(f) {
  const errors = {};
  const v = {};

  v.category = String(f.category || '');
  if (!CATEGORIES.includes(v.category)) errors.category = 'Please choose the type of issue.';

  v.description = clean(f.description, LIMITS.descMax);
  if (v.description.length < LIMITS.descMin) errors.description = 'Please describe what you saw (at least 10 characters).';
  else if (v.description.length > LIMITS.descMax) errors.description = 'Please keep the description under 2,000 characters.';

  // Optional GPS: only accepted as a valid pair.
  const lat = f.lat === '' || f.lat == null ? null : Number(f.lat);
  const lng = f.lng === '' || f.lng == null ? null : Number(f.lng);
  const gpsOk = lat !== null && lng !== null && Number.isFinite(lat) && Number.isFinite(lng) &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  v.latitude = gpsOk ? Math.round(lat * 1e5) / 1e5 : null;
  v.longitude = gpsOk ? Math.round(lng * 1e5) / 1e5 : null;

  v.location_text = clean(f.location, LIMITS.locMax);
  if (v.location_text.length > LIMITS.locMax) errors.location = 'Please keep the location under 300 characters.';
  else if (!v.location_text && !gpsOk) errors.location = 'Enter a street, landmark or area, or share your current location.';

  v.reporter_name = clean(f.name, LIMITS.nameMax) || null;
  if (v.reporter_name && v.reporter_name.length > LIMITS.nameMax) errors.name = 'Please keep the name under 100 characters.';

  v.reporter_contact = clean(f.contact, LIMITS.contactMax) || null;
  v.reporter_email = null;
  if (v.reporter_contact) {
    if (v.reporter_contact.length > LIMITS.contactMax) errors.contact = 'Please keep this under 150 characters.';
    else if (v.reporter_contact.includes('@')) {
      if (!EMAIL_RE.test(v.reporter_contact) || v.reporter_contact.length > 254) errors.contact = 'Enter a valid email address or phone number.';
      else v.reporter_email = v.reporter_contact.toLowerCase();
    } else if (!/^\d{7,15}$/.test(v.reporter_contact.replace(/[\s()+\-.]/g, ''))) {
      errors.contact = 'Enter a valid email address or phone number.';
    }
  }

  if (!['on', 'true', '1'].includes(String(f.accuracy || '').toLowerCase())) errors.accuracy = 'Please confirm before submitting.';

  v.idempotency_key = String(f.idempotency_key || '');
  if (!UUID_RE.test(v.idempotency_key)) errors.form = 'Invalid submission. Please reload the page and try again.';

  return { errors, value: v };
}

// Identify the real file type from its first bytes. The client's filename and MIME type are never trusted.
function detectImage(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

module.exports = { CATEGORIES, LIMITS, validateFields, detectImage };
