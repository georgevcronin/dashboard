// Builds an RFC 5545 calendar event for a planned session, so it can be put
// in whatever calendar the athlete actually uses.
//
// .ics rather than a Google Calendar link: it opens natively in Apple
// Calendar (this app already leans on Apple Health, so that's the likely
// destination), and Google/Outlook import it too. A provider-specific URL
// would only work for one of them.
//
// The fiddly parts of the format, all of which break silently in some clients
// if you get them wrong:
//   - lines are CRLF-terminated, not LF;
//   - TEXT values escape backslash, semicolon and comma, and encode newlines
//     as a literal \n — an unescaped comma silently truncates a field;
//   - lines fold at 75 octets with a leading space on continuations, and the
//     limit is octets rather than characters, so it has to be measured after
//     UTF-8 encoding or a multi-byte character can push a line over;
//   - UID and DTSTAMP are required, and a duplicate UID makes a calendar
//     treat a second import as an edit of the first rather than a new event.

const PRODID = '-//Press//Training Session//EN';

// RFC 5545 §3.3.11. Order matters: the backslash rule has to run first or it
// re-escapes the backslashes the later rules introduce.
function escapeText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

// RFC 5545 §3.1. Folds at 75 octets, counting UTF-8 bytes rather than string
// length, and never splits a multi-byte character across the boundary.
function foldLine(line) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;

  const out = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Walk back off a UTF-8 continuation byte (10xxxxxx) so a character is
    // never cut in half.
    while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    out.push(bytes.slice(start, end).toString('utf8'));
    start = end;
    limit = 74; // continuation lines carry a leading space
  }
  return out.join('\r\n ');
}

// UTC form, YYYYMMDDTHHMMSSZ. Floating local time would land in the wrong hour
// for anyone whose calendar is in a different zone from where it was created.
function toICSDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

// A description a person can read at the gym: what to do, then why it was
// picked. Reasoning is included only if the caller passes it — this module
// never invents a justification.
function describeSession({ exercises = [], reasoning = [], note = null } = {}) {
  const lines = [];
  for (const ex of exercises) {
    const sets = Array.isArray(ex.sets) ? ex.sets.length : ex.sets;
    const reps = Array.isArray(ex.sets) ? ex.sets[0]?.reps : ex.reps;
    const scheme = sets && reps ? ` — ${sets} x ${reps}` : '';
    lines.push(`• ${ex.name}${scheme}`);
  }
  if (reasoning.length) {
    lines.push('');
    lines.push('Why this session:');
    for (const r of reasoning) lines.push(`— ${typeof r === 'string' ? r : r.text}`);
  }
  if (note) { lines.push(''); lines.push(note); }
  return lines.join('\n');
}

// One VEVENT wrapped in a VCALENDAR. `uid` is caller-supplied so a given
// session exports to the same event twice rather than duplicating; callers
// without a stable id should pass something derived from the date and title.
function buildSessionICS({
  title, start, durationMin = 60, exercises = [], reasoning = [], note = null,
  uid, now = new Date(), location = null,
} = {}) {
  const dtStart = toICSDate(start);
  if (!dtStart) return null;
  const dtEnd = toICSDate(new Date(new Date(start).getTime() + durationMin * 60_000));
  const dtStamp = toICSDate(now) || toICSDate(new Date());

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeText(uid || `press-${dtStart}`)}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeText(title || 'Training session')}`,
    `DESCRIPTION:${escapeText(describeSession({ exercises, reasoning, note }))}`,
    ...(location ? [`LOCATION:${escapeText(location)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return lines.map(foldLine).join('\r\n') + '\r\n';
}

module.exports = { buildSessionICS, describeSession, escapeText, foldLine, toICSDate, PRODID };
