const nodemailer = require('nodemailer');

// Every report (crash, bug) lands in this one inbox — no per-type routing,
// this app has exactly one person reading it. Contact Us (Settings) is a
// plain mailto: link instead of going through here — see functions/index.js's
// /report route comment for why.
const REPORT_TO = 'pressnewsletterapp@gmail.com';

const TYPE_LABELS = { crash: 'Crash', bug: 'Bug report' };

// Pure formatting — kept separate from the actual send so it's testable
// without mocking SMTP (see ARCHITECTURE.md's Testing section).
function buildReportEmail({ type, message, error, url, userAgent, userEmail, appVersion }) {
  const label = TYPE_LABELS[type] || 'Report';
  const subject = `Press ${label}${message ? ': ' + message.slice(0, 60) : ''}`;
  const lines = [
    message ? `Message:\n${message}` : null,
    error ? `Error:\n${error}` : null,
    `From: ${userEmail || 'not signed in'}`,
    `App version: ${appVersion || 'unknown'}`,
    `URL: ${url || 'unknown'}`,
    `User agent: ${userAgent || 'unknown'}`,
  ].filter(Boolean);
  return { subject, text: lines.join('\n\n') };
}

let transporter = null;
// ponytail: Gmail SMTP + an app password on the same inbox reports land in —
// zero new accounts/services for a low-volume feedback channel. Swap for a
// transactional provider if volume or deliverability ever becomes a problem.
function getTransporter() {
  if (!process.env.GMAIL_APP_PASSWORD) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: REPORT_TO, pass: process.env.GMAIL_APP_PASSWORD },
    });
  }
  return transporter;
}

async function sendReport(payload) {
  const t = getTransporter();
  if (!t) throw new Error('email not configured (missing GMAIL_APP_PASSWORD)');
  const { subject, text } = buildReportEmail(payload);
  await t.sendMail({ from: REPORT_TO, to: REPORT_TO, subject, text });
}

module.exports = { buildReportEmail, sendReport, REPORT_TO };
