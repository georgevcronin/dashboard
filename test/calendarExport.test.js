const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildSessionICS, describeSession, escapeText, foldLine, toICSDate,
} = require('../functions/calendarExport');

const START = new Date('2026-08-03T18:00:00Z');
const NOW = new Date('2026-08-02T09:30:00Z');

const SESSION = {
  title: 'Press — Lower',
  start: START,
  durationMin: 63,
  now: NOW,
  uid: 'press-2026-08-03-lower',
  exercises: [
    { name: 'Leg Extension', sets: [{ reps: 8 }, { reps: 8 }, { reps: 8 }, { reps: 8 }] },
    { name: 'Seated Leg Curl', sets: [{ reps: 8 }, { reps: 8 }] },
  ],
  reasoning: [{ text: 'quads has recovered and is overdue.' }],
};

const unfold = ics => ics.replace(/\r\n /g, '');
const line = (ics, prefix) => unfold(ics).split('\r\n').find(l => l.startsWith(prefix));

// ---------------------------------------------------------------------------
// Format correctness. Each of these breaks silently in some client if wrong.
// ---------------------------------------------------------------------------

test('every line is CRLF-terminated, never bare LF', () => {
  const ics = buildSessionICS(SESSION);
  assert.ok(ics.endsWith('\r\n'));
  assert.equal(ics.split('\n').length - 1, ics.split('\r\n').length - 1,
    'found a bare LF not preceded by CR');
});

test('the calendar wrapper carries the properties RFC 5545 requires', () => {
  const ics = buildSessionICS(SESSION);
  for (const required of ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:', 'BEGIN:VEVENT',
                          'UID:', 'DTSTAMP:', 'DTSTART:', 'DTEND:', 'SUMMARY:',
                          'END:VEVENT', 'END:VCALENDAR']) {
    assert.ok(unfold(ics).includes(required), `missing ${required}`);
  }
});

test('timestamps are UTC in the compact form calendars expect', () => {
  const ics = buildSessionICS(SESSION);
  assert.equal(line(ics, 'DTSTART:'), 'DTSTART:20260803T180000Z');
  assert.equal(line(ics, 'DTSTAMP:'), 'DTSTAMP:20260802T093000Z');
});

test('the end time is the start plus the session duration', () => {
  const ics = buildSessionICS(SESSION);
  // 18:00 + 63 min
  assert.equal(line(ics, 'DTEND:'), 'DTEND:20260803T190300Z');
});

// An unescaped comma silently truncates the rest of the field in most clients,
// which is the kind of bug you only notice in someone else's calendar.
test('commas, semicolons and backslashes are escaped in text values', () => {
  assert.equal(escapeText('a,b'), 'a\\,b');
  assert.equal(escapeText('a;b'), 'a\\;b');
  assert.equal(escapeText('a\\b'), 'a\\\\b');
  assert.equal(escapeText('a\nb'), 'a\\nb');
});

test('the backslash rule runs first, so escapes are not double-escaped', () => {
  // "a\,b" must become "a\\\,b": the original backslash doubled, then the
  // comma escaped — not the backslash introduced by the comma rule doubled.
  assert.equal(escapeText('a\\,b'), 'a\\\\\\,b');
});

test('a comma in an exercise name survives into the description intact', () => {
  const ics = buildSessionICS({
    ...SESSION,
    exercises: [{ name: 'Decline Curl (Carter Curl), wide grip', sets: [{ reps: 8 }] }],
  });
  assert.ok(unfold(ics).includes('Decline Curl (Carter Curl)\\, wide grip'));
});

// ---------------------------------------------------------------------------
// Line folding
// ---------------------------------------------------------------------------

test('lines longer than 75 octets are folded with a leading space', () => {
  const long = 'DESCRIPTION:' + 'x'.repeat(200);
  const folded = foldLine(long);
  assert.ok(folded.includes('\r\n '));
  for (const part of folded.split('\r\n')) {
    assert.ok(Buffer.from(part, 'utf8').length <= 75, `segment too long: ${part.length}`);
  }
});

test('a short line is left alone', () => {
  assert.equal(foldLine('SUMMARY:Lower'), 'SUMMARY:Lower');
});

// The limit is octets, not characters — a naive slice can cut a multi-byte
// character in half and produce invalid UTF-8.
test('folding never splits a multi-byte character', () => {
  const folded = foldLine('DESCRIPTION:' + '→'.repeat(60));
  const rejoined = folded.replace(/\r\n /g, '');
  assert.equal(rejoined, 'DESCRIPTION:' + '→'.repeat(60));
  assert.ok(!rejoined.includes('�'), 'produced a replacement character');
});

test('unfolding a built event restores every original value', () => {
  const ics = buildSessionICS({ ...SESSION, title: 'Press — ' + 'Lower'.repeat(30) });
  assert.ok(unfold(ics).includes('Press — ' + 'Lower'.repeat(30)));
});

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

test('the description lists each exercise with its set scheme', () => {
  const text = describeSession(SESSION);
  assert.ok(text.includes('• Leg Extension — 4 x 8'));
  assert.ok(text.includes('• Seated Leg Curl — 2 x 8'));
});

test('reasoning is included when given and absent when not', () => {
  assert.ok(describeSession(SESSION).includes('Why this session:'));
  assert.ok(!describeSession({ exercises: SESSION.exercises }).includes('Why this session:'));
});

test('an exercise with no set data still appears, without a fabricated scheme', () => {
  const text = describeSession({ exercises: [{ name: 'Freestyle' }] });
  assert.ok(text.includes('• Freestyle'));
  assert.ok(!/Freestyle —/.test(text));
});

// A stable UID means re-exporting the same session updates the event instead
// of littering the calendar with duplicates.
test('a caller-supplied uid is used verbatim', () => {
  assert.equal(line(buildSessionICS(SESSION), 'UID:'), 'UID:press-2026-08-03-lower');
});

test('a missing uid falls back to something derived from the start time', () => {
  const { uid, ...noUid } = SESSION;
  assert.equal(line(buildSessionICS(noUid), 'UID:'), 'UID:press-20260803T180000Z');
});

test('location is emitted only when supplied', () => {
  assert.ok(unfold(buildSessionICS({ ...SESSION, location: 'PureGym' })).includes('LOCATION:PureGym'));
  assert.ok(!unfold(buildSessionICS(SESSION)).includes('LOCATION:'));
});

// ---------------------------------------------------------------------------
// Degradation
// ---------------------------------------------------------------------------

test('an unusable start time yields null rather than a broken event', () => {
  assert.equal(buildSessionICS({ ...SESSION, start: 'not a date' }), null);
  assert.equal(buildSessionICS({ ...SESSION, start: undefined }), null);
  assert.equal(buildSessionICS(), null);
  assert.equal(toICSDate('nonsense'), null);
});

test('a session with no exercises still produces a valid event', () => {
  const ics = buildSessionICS({ ...SESSION, exercises: [], reasoning: [] });
  assert.ok(ics.includes('BEGIN:VEVENT'));
  assert.ok(ics.includes('END:VCALENDAR'));
});
