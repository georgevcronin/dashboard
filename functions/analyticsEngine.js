// Merged activity feed across the log types that are actually populated
// today. Every other source is keyed differently from the rest — soreness and
// injuries store epoch `ts` with no date field, workouts/lifts store a
// "YYYY-MM-DD" `date`, sleep isn't its own array at all but a `sleep_hours`
// column inside the date-keyed `metrics` map — so normalising to one
// {date, ts, type, data} shape has to happen per source, not generically.

// Matches index.js's day(): the app is single-user and UK-based, so a fixed
// zone rather than a per-athlete lookup.
const dayOf = ms => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
const msOf = date => new Date(`${date}T12:00:00Z`).getTime();

function buildUnifiedTimeline(db = {}) {
  const entries = [];

  (db.workouts || []).forEach(w => {
    if (!w.date) return;
    entries.push({
      date: w.date, ts: msOf(w.date), type: 'workout',
      data: { name: w.name || 'Session', exercises: w.exercises || [], notes: w.notes || '' },
    });
  });

  (db.lifts || []).forEach(l => {
    if (!l.date) return;
    entries.push({
      date: l.date, ts: msOf(l.date), type: 'lift',
      data: { exercise: l.exercise, kg: l.kg || 0, reps: l.reps || 0, source: l.source || null },
    });
  });

  Object.entries(db.metrics || {}).forEach(([date, m]) => {
    if (!m || m.sleep_hours == null) return;
    entries.push({
      date, ts: msOf(date), type: 'sleep',
      data: { hours: m.sleep_hours, efficiency: m.sleep_eff ?? null },
    });
  });

  (db.injuries || []).forEach(i => {
    if (!i.ts) return;
    entries.push({
      date: dayOf(i.ts), ts: i.ts, type: 'injury',
      data: { area: i.area, severity: i.severity, resolved: !!i.resolved, note: i.note || '' },
    });
  });

  (db.soreness || []).forEach(s => {
    if (!s.ts) return;
    entries.push({
      date: dayOf(s.ts), ts: s.ts, type: 'soreness',
      data: { muscle: s.muscle, score: s.score },
    });
  });

  (db.thoughts || []).forEach(t => {
    if (!t.date) return;
    entries.push({ date: t.date, ts: msOf(t.date), type: 'thought', data: { text: t.text } });
  });

  return entries.sort((a, b) => b.ts - a.ts);
}

module.exports = { buildUnifiedTimeline };
