const test = require('node:test');
const assert = require('node:assert');

const { buildReportEmail, REPORT_TO } = require('../functions/mailer');

test('buildReportEmail: labels the subject by type', () => {
  assert.match(buildReportEmail({ type: 'crash' }).subject, /^Press Crash/);
  assert.match(buildReportEmail({ type: 'bug', message: 'button broken' }).subject, /^Press Bug report: button broken/);
});

test('buildReportEmail: unknown type falls back to a generic label instead of throwing', () => {
  assert.match(buildReportEmail({ type: 'nonsense' }).subject, /^Press Report/);
});

test('buildReportEmail: body includes message and error when present, omits them when not', () => {
  const withBoth = buildReportEmail({ type: 'bug', message: 'it broke', error: 'TypeError: x' });
  assert.match(withBoth.text, /Message:\nit broke/);
  assert.match(withBoth.text, /Error:\nTypeError: x/);

  const withNeither = buildReportEmail({ type: 'contact' });
  assert.strictEqual(withNeither.text.includes('Message:'), false);
  assert.strictEqual(withNeither.text.includes('Error:'), false);
});

test('buildReportEmail: always includes sender/context fields, falling back when missing', () => {
  const text = buildReportEmail({ type: 'crash' }).text;
  assert.match(text, /From: not signed in/);
  assert.match(text, /App version: unknown/);
  assert.match(text, /URL: unknown/);
  assert.match(text, /User agent: unknown/);
});

test('buildReportEmail: uses real values over fallbacks when given', () => {
  const text = buildReportEmail({
    type: 'crash', userEmail: 'a@b.com', appVersion: '1.21', url: 'https://x/y', userAgent: 'UA/1',
  }).text;
  assert.match(text, /From: a@b\.com/);
  assert.match(text, /App version: 1\.21/);
  assert.match(text, /URL: https:\/\/x\/y/);
  assert.match(text, /User agent: UA\/1/);
});

test('REPORT_TO is the single shared inbox', () => {
  assert.strictEqual(REPORT_TO, 'pressnewsletterapp@gmail.com');
});
