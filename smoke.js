'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { validateFields, detectImage } = require('../lib/validate');
const { newReportEmail, confirmationEmail } = require('../lib/emails');

const good = { category: 'Illegal dumping', description: 'Building waste next to the road.', location: 'Example Street, Mbombela',
  accuracy: 'on', idempotency_key: '3f2b6c1e-8d4a-4b7e-9c10-2a5d7e9f1b34' };

// Validation
assert.deepStrictEqual(validateFields(good).errors, {});
assert.ok(validateFields({ ...good, category: 'Nope' }).errors.category);
assert.ok(validateFields({ ...good, description: 'short' }).errors.description);
assert.ok(validateFields({ ...good, location: '' }).errors.location);
assert.deepStrictEqual(validateFields({ ...good, location: '', lat: '-25.46543', lng: '30.98521' }).errors, {});
assert.ok(validateFields({ ...good, accuracy: '' }).errors.accuracy);
assert.ok(validateFields({ ...good, contact: 'not@valid' }).errors.contact);
assert.ok(validateFields({ ...good, contact: 'abc' }).errors.contact);
assert.strictEqual(validateFields({ ...good, contact: 'A@B.co' }).value.reporter_email, 'a@b.co');
assert.strictEqual(validateFields({ ...good, contact: '082 123 4567' }).value.reporter_email, null);

// File sniffing
const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)]);
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)]);
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(10)]);
assert.strictEqual(detectImage(jpg).ext, 'jpg');
assert.strictEqual(detectImage(png).ext, 'png');
assert.strictEqual(detectImage(webp).ext, 'webp');
assert.strictEqual(detectImage(Buffer.from('MZ\x90\x00 executable renamed to .jpg ....')), null);
assert.strictEqual(detectImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);

// Emails: render previews and check escaping
const r = { reference: 'PGF-2026-00124', created_at: new Date().toISOString(), category: 'Illegal dumping',
  location_text: 'Example Street, Mbombela', description: 'Building waste <script>alert(1)</script>\nnext to the road.',
  reporter_name: 'Thandi Nkosi', reporter_contact: 'thandi@example.com', latitude: null, longitude: null };
const a = newReportEmail(r, { evidenceUrl: 'https://example.supabase.co/signed/abc', reviewUrl: 'https://example.com/review' });
const b = confirmationEmail(r, { contactEmail: 'pgf@example.com' });
assert.ok(!a.html.includes('<script>'));
assert.strictEqual(a.subject, '[PGF REPORT] New Issue — Illegal dumping — PGF-2026-00124');
assert.strictEqual(b.subject, 'Project Green Fever — Report Received PGF-2026-00124');
assert.ok(!newReportEmail(r, { reviewUrl: 'javascript:alert(1)' }).html.includes('javascript:'));
const out = path.join(__dirname, '..', 'preview'); fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'email-a-admin.html'), a.html);
fs.writeFileSync(path.join(out, 'email-b-reporter.html'), b.html);
console.log('All smoke tests passed. Email previews written to /preview.');
