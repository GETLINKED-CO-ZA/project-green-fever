'use strict';

const GREEN = '#1B7B61', GOLD = '#D4AF37', BURGUNDY = '#7B1C1C';
const INK = '#1d2421', MUTED = '#5d655f', LINE = '#ece9df';
const SANS = "Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const multiline = (s) => esc(s).replace(/\r?\n/g, '<br>');
const safeUrl = (u) => (/^https?:\/\/[^\s"'<>]+$/i.test(String(u || '')) ? u : null);

const fmtDate = (d) => new Intl.DateTimeFormat('en-ZA', {
  dateStyle: 'long', timeStyle: 'short', timeZone: 'Africa/Johannesburg'
}).format(new Date(d)) + ' SAST';

function row(label, valueHtml) {
  return `<tr><td style="padding:14px 0;border-top:1px solid ${LINE};font-family:${SANS};">
<div style="font-size:12px;line-height:16px;font-weight:700;color:${MUTED};">${esc(label)}</div>
<div style="font-size:16px;line-height:24px;color:${INK};margin-top:4px;">${valueHtml}</div></td></tr>`;
}

function button(label, url) {
  const href = safeUrl(url);
  if (!href) return '';
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" class="btn" style="margin:8px 0 4px 0;"><tr>
<td bgcolor="${GREEN}" style="border-radius:4px;"><a href="${esc(href)}" style="display:inline-block;padding:14px 28px;font-family:${SANS};font-size:14px;font-weight:700;letter-spacing:1.5px;color:#ffffff;text-decoration:none;">${esc(label)}</a></td></tr></table>`;
}

function shell({ preheader, eyebrow, headline, inner, footer }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting">
<title>${esc(headline)}</title>
<style>@media only screen and (max-width:620px){.px{padding-left:22px!important;padding-right:22px!important}.ref{font-size:26px!important}.btn,.btn td,.btn a{display:block!important;text-align:center!important}}</style></head>
<body style="margin:0;padding:0;background:#f4f2ec;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;color:#f4f2ec;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f2ec;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:6px;">
<tr><td style="height:4px;line-height:4px;font-size:0;background:${GOLD};border-radius:6px 6px 0 0;">&nbsp;</td></tr>
<tr><td class="px" style="padding:28px 40px 0 40px;font-family:${SANS};">
<div style="font-size:13px;font-weight:700;letter-spacing:2px;color:${GREEN};">PROJECT GREEN FEVER</div>
<div style="font-size:12px;color:${MUTED};margin-top:2px;">A LINK initiative</div></td></tr>
<tr><td class="px" style="padding:28px 40px 0 40px;font-family:${SANS};">
<div style="font-size:12px;font-weight:700;letter-spacing:1.5px;color:${MUTED};">${esc(eyebrow)}</div>
<h1 style="margin:8px 0 0 0;font-family:${SERIF};font-size:30px;line-height:38px;font-weight:normal;color:${INK};">${esc(headline)}</h1></td></tr>
<tr><td class="px" style="padding:20px 40px 32px 40px;font-family:${SANS};font-size:16px;line-height:24px;color:${INK};">${inner}</td></tr>
<tr><td class="px" style="padding:20px 40px 28px 40px;border-top:1px solid ${LINE};font-family:${SANS};font-size:12px;line-height:18px;color:${MUTED};">${footer}</td></tr>
</table></td></tr></table></body></html>`;
}

const refBlock = (ref, label) => `<div style="margin:0 0 8px 0;">
<div style="font-size:12px;font-weight:700;color:${MUTED};">${esc(label)}</div>
<div class="ref" style="font-family:${SERIF};font-size:32px;line-height:40px;font-weight:bold;color:${BURGUNDY};margin-top:4px;">${esc(ref)}</div></div>`;

// ---------- EMAIL A: to LINK ----------
function newReportEmail(r, { evidenceUrl, reviewUrl } = {}) {
  const gps = (r.latitude != null && r.longitude != null)
    ? `<br><span style="font-size:14px;color:${MUTED};">GPS shared by reporter: <a href="https://www.google.com/maps?q=${esc(r.latitude)},${esc(r.longitude)}" style="color:${GREEN};">${esc(r.latitude)}, ${esc(r.longitude)}</a></span>` : '';
  const contactRows = (r.reporter_name || r.reporter_contact)
    ? row('Reporter contact (as supplied)', [r.reporter_name && esc(r.reporter_name), r.reporter_contact && esc(r.reporter_contact)].filter(Boolean).join('<br>'))
    : row('Reporter contact', `<span style="color:${MUTED};">Not provided (anonymous report)</span>`);
  const evidence = safeUrl(evidenceUrl)
    ? row('Photographic evidence', `<a href="${esc(evidenceUrl)}" style="color:${GREEN};font-weight:700;">Open photo</a><br><span style="font-size:14px;color:${MUTED};">Secure link, expires in 7 days. Photo is stored privately; the original is kept in the evidence bucket.</span>`)
    : row('Photographic evidence', `<span style="color:${MUTED};">None attached</span>`);

  const inner = `${refBlock(r.reference, 'Reference')}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;">
${row('Issue category', esc(r.category))}
${row('Received', esc(fmtDate(r.created_at)))}
${row('Location (as supplied)', (r.location_text ? esc(r.location_text) : `<span style="color:${MUTED};">No address given</span>`) + gps)}
${row('Description (as supplied)', multiline(r.description))}
${contactRows}
${evidence}
${row('LINK verification', `<span style="color:${BURGUNDY};font-weight:700;">Not yet verified</span> &middot; Status: Received<br><span style="font-size:14px;color:${MUTED};">Everything above was supplied by the reporter and has not been checked by LINK.</span>`)}
</table>
<p style="margin:20px 0 16px 0;">Review the submitted details and evidence before deciding on the next action.</p>
${button('REVIEW REPORT', reviewUrl)}`;

  const footer = `GET LINK (PTY) LTD &middot; Project Green Fever<br>Internal notification. Do not forward the reporter's contact details outside LINK.`;
  const html = shell({ preheader: `${r.category} reported: ${r.location_text || 'GPS location shared'}`, eyebrow: 'NEW PUBLIC SPACE REPORT', headline: 'A new issue needs review.', inner, footer });

  const text = [
    'PROJECT GREEN FEVER - NEW PUBLIC SPACE REPORT', '',
    `Reference: ${r.reference}`, `Category: ${r.category}`, `Received: ${fmtDate(r.created_at)}`,
    `Location (as supplied): ${r.location_text || 'No address given'}`,
    r.latitude != null ? `GPS shared: ${r.latitude}, ${r.longitude}` : null,
    '', 'Description (as supplied):', r.description, '',
    `Reporter: ${[r.reporter_name, r.reporter_contact].filter(Boolean).join(' / ') || 'Anonymous'}`,
    `Photo: ${evidenceUrl || 'None attached'}`,
    'LINK verification: Not yet verified. Status: Received',
    safeUrl(reviewUrl) ? `Review: ${reviewUrl}` : null, '',
    'GET LINK (PTY) LTD - Project Green Fever'
  ].filter((x) => x !== null).join('\n');

  return { subject: `[PGF REPORT] New Issue — ${r.category} — ${r.reference}`, html, text };
}

// ---------- EMAIL B: to reporter ----------
function confirmationEmail(r, { contactEmail } = {}) {
  const greet = r.reporter_name ? `Hello ${esc(r.reporter_name.split(/\s+/)[0])},` : 'Hello,';
  const contact = contactEmail ? `Questions? Reply to this email or write to <a href="mailto:${esc(contactEmail)}" style="color:${GREEN};">${esc(contactEmail)}</a>.<br>` : '';
  const inner = `<p style="margin:0 0 16px 0;">${greet}</p>
<p style="margin:0 0 20px 0;">Your Project Green Fever report has been received.</p>
${refBlock(r.reference, 'Your reference number')}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0 20px 0;">
${row('Issue', esc(r.category))}
${row('Location', r.location_text ? esc(r.location_text) : 'Shared by GPS')}
</table>
<p style="margin:0 0 16px 0;">LINK will review the information and determine the appropriate next step. Receiving a report does not guarantee that the issue will be resolved or that action will be taken immediately, but your contribution helps us identify where attention is needed.</p>
<p style="margin:0;">Thank you for helping us care for our shared spaces.</p>`;
  const footer = `${contact}Project Green Fever &middot; GET LINK (PTY) LTD<br>You received this email because this address was entered on a Project Green Fever report. It is a one-time confirmation; we will not add you to any mailing list.`;
  const html = shell({ preheader: `Your reference number is ${r.reference}`, eyebrow: 'YOUR REPORT HAS BEEN RECEIVED', headline: 'Thank you for speaking up.', inner, footer });
  const text = [
    r.reporter_name ? `Hello ${r.reporter_name.split(/\s+/)[0]},` : 'Hello,', '',
    'Thank you for speaking up. Your Project Green Fever report has been received.', '',
    `Your reference number: ${r.reference}`, `Issue: ${r.category}`, `Location: ${r.location_text || 'Shared by GPS'}`, '',
    'LINK will review the information and determine the appropriate next step. Receiving a report does not guarantee that the issue will be resolved or that action will be taken immediately, but your contribution helps us identify where attention is needed.', '',
    'Thank you for helping us care for our shared spaces.', '',
    'Project Green Fever - GET LINK (PTY) LTD', contactEmail || ''
  ].join('\n');
  return { subject: `Project Green Fever — Report Received ${r.reference}`, html, text };
}

module.exports = { newReportEmail, confirmationEmail, esc };
