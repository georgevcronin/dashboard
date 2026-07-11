// Deterministic double-progression calculator: given an exercise's session
// history, decide whether to add weight, add a rep, deload, or hold — no LLM
// involved. Shared by /coach, the deterministic session generator, and the
// weekly plan's per-exercise pre-computed targets.
function computeProgression(lifts, name) {
  const ex = lifts.filter(l => l.exercise === name);
  if (!ex.length) return null;
  const byDate = {};
  for (const l of ex) { if (!byDate[l.date]) byDate[l.date] = []; byDate[l.date].push(l); }
  const sessions = Object.entries(byDate).sort(([a],[b]) => a.localeCompare(b)).slice(-6).map(([date, sets]) => {
    const topKg = Math.max(...sets.map(s => s.kg || 0));
    const topSet = sets.find(s => s.kg === topKg) || sets[0];
    const e1rm = topSet.kg > 0 && topSet.reps > 0 ? Math.round(topSet.kg * (1 + topSet.reps / 30)) : 0;
    return { date, kg: topSet.kg, reps: topSet.reps, e1rm, setCount: sets.length };
  });
  const last = sessions.at(-1);
  const prev = sessions.at(-2);
  const isLower = ['squat','deadlift','leg press','lunge','hip thrust','romanian'].some(k => name.includes(k));
  const inc = isLower ? 5 : 2.5;
  let suggestKg = last.kg, suggestReps = last.reps, trend, note;
  if (!prev) {
    trend = 'baseline'; note = `baseline — ${last.kg}kg×${last.reps}`;
  } else if (last.e1rm > prev.e1rm && last.reps >= 5) {
    suggestKg = last.kg + inc; trend = 'progressing';
    note = `progressing — try ${suggestKg}kg×${last.reps} (+${inc}kg)`;
  } else if (last.e1rm >= prev.e1rm) {
    suggestReps = last.reps + 1; trend = 'steady';
    note = `steady — target ${last.kg}kg×${suggestReps} (+1 rep)`;
  } else if (sessions.slice(-3).every((s, i, a) => i === 0 || s.e1rm <= a[i-1].e1rm)) {
    suggestKg = Math.max(0, last.kg - inc * 2); trend = 'stalled';
    note = `stalled — reset to ${suggestKg}kg and rebuild`;
  } else {
    trend = 'recovering'; note = `recovering — hold ${last.kg}kg×${last.reps}`;
  }
  const warmup1kg = Math.round(suggestKg * 0.6 / 2.5) * 2.5;
  const warmup2kg = Math.round(suggestKg * 0.85 / 2.5) * 2.5;
  const recentStr = sessions.slice(-3).map(s => `${s.date}: ${s.kg}kg×${s.reps} (e1RM ${s.e1rm})`).join(', ');
  return { name, trend, note, suggestKg, suggestReps, warmup1kg, warmup2kg, setCount: last.setCount, recentStr };
}

module.exports = { computeProgression };
