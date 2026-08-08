import React, { useState, useEffect, useLayoutEffect, useContext, useRef, useMemo } from "react";
import { auth, googleProvider, API_BASE, getToken, api, authFetch,
  toLocalDateStr, todayLocalStr, fmtDate, fmtDateShort, fmtHoursMins, pct, roundCal,
  computeTrainingStreak, computeSleepStreak } from './shared.js';
import { isAccountAlreadyOnboarded } from './onboardingGate.js';
import { S4, BODY_BASE, MUSCLES_WITHOUT_BODY_REGION, SORENESS_DIAGRAM_MUSCLES } from './sections/S4.jsx';
import { S6, MOVEMENT_GROUPS, groupExercise } from './sections/S6.jsx';
import { S8, GOAL_DEFS, GOAL_PRIORITIES, GOAL_METRIC_OPTIONS, buildGoalsPayload } from './sections/Goals.jsx';
import { MICRO_WIDGET_IDS, MICRO_WIDGET_LABELS, MICRO_WIDGET_UNITS, MicroWidget } from './sections/MicroWidgets.jsx';
import { DashboardGrid, computeColumnCount } from './sections/DashboardGrid.jsx';
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, GoogleAuthProvider, signInWithPopup, getRedirectResult } from 'firebase/auth';
import muscleTaxonomyPkg from '../functions/muscleTaxonomy.js';
import fatiguePkg from '../functions/fatigue.js';
import sessionPlannerPkg from '../functions/sessionPlanner.js';
import strengthStandardsPkg from '../functions/strengthStandards.js';
import machineBrandsPkg from '../functions/machineBrands.js';
import machineModelsPkg from '../functions/machineModels.js';
import resistanceCurvesPkg from '../functions/resistanceCurves.js';
import adaptationPkg from '../functions/adaptation.js';
import plateCalculatorPkg from '../functions/plateCalculator.js';
import progressionPkg from '../functions/progression.js';
import identityPkg from '../functions/identity.js';
import weeklyPlannerPkg from '../functions/weeklyPlanner.js';
import movementPatternsPkg from '../functions/movementPatterns.js';
import emgActivationPkg from '../functions/emgActivation.js';
import muscleCapacityPkg from '../functions/muscleCapacity.js';
import { chestSplitForExercise, flyHeadSplitForAngle } from '../functions/chestHeadSplit.js';
import { extensionHeadSplitForAngle } from '../functions/tricepsHeadSplit.js';
import trackingCategoriesPkg from '../functions/trackingCategories.js';
const { resolveTrackingCategories: trackingCategoriesFor } = trackingCategoriesPkg;
import { EXERCISE_ANGLES } from '../functions/exerciseAngles.js';
import { EXERCISE_DB, EXERCISE_MUSCLE_GROUPS, EXERCISE_PATTERNS } from '../functions/exerciseDb.js';
import expertisePkg from '../functions/expertise.js';
import parameterExplorerPkg from '../functions/parameterExplorer.js';
import targetMusclePlannerPkg from '../functions/targetMusclePlanner.js';
import exercisePreferenceRankingPkg from '../functions/exercisePreferenceRanking.js';
import muscleCreditPkg from '../functions/muscleCredit.js';
import calendarExportPkg from '../functions/calendarExport.js';
import splitPlannerPkg from '../functions/splitPlanner.js';
import { PRESS_CSS, GRIDSTACK_CSS } from './pressCss.js';
import { AreaChart, BarChart, Sparkline, AdaptationChart } from './charts.jsx';

// Muscle taxonomy + fatigue math + progression logic are shared with the
// backend (functions/muscleTaxonomy.js, functions/fatigue.js,
// functions/sessionPlanner.js) rather than hand-copied here — this used to be
// three independently-drifting implementations (hyphen/case mismatches,
// an 'ab'-substring collision, and 14 exercises the muscle-bucket taxonomy
// couldn't see at all). One implementation, bundled into both. EXERCISE_DB
// itself is imported separately for the session-logging autocomplete, which
// needs the full exercise name list rather than a derived lookup.
const { ALL_MUSCLES, PRIMARY_MUSCLES, musclesForExercise, isCompoundExercise, findExercise } = muscleTaxonomyPkg;
const { computeStructuralFatigue, computeMetabolicFatigue, computeCNSFatigue, cnsLoad, recoveryWord } = fatiguePkg;
const { computePatternFatigue } = movementPatternsPkg;
const { progressionFor, suggestedWorkingSetCount, suggestedRirSequence, isLowRepPattern, LOW_REP_THRESHOLD } = sessionPlannerPkg;
const { e1rm: calcE1RM } = strengthStandardsPkg;
const { rankExercises, DEFAULT_RATING: DEFAULT_EXERCISE_RATING } = exercisePreferenceRankingPkg;
const { defaultMachineBrands } = machineBrandsPkg;
const { MACHINE_MODELS } = machineModelsPkg;
const { normalize: normalizeExerciseKeyPkg } = resistanceCurvesPkg;
const {
  sessionStimulusScore, adaptationCurve, ADAPTATION_PEAK_H, computeStimulusContributions, computeAdaptationLevel,
  computeAdaptationSeries, estimateAtrophyRate, DEFAULT_ATROPHY_RATE, secondaryMuscleRatio, DEFAULT_RIR,
} = adaptationPkg;
const { platesForWeight, STANDARD_PLATES_KG } = plateCalculatorPkg;
const { DEFAULT_WARMUP_SCHEME, WARMUP_SCHEME_PRESETS } = progressionPkg;
const { validateUsername, validateDisplayName, normalizeUsername, USERNAME_MAX, canChangeUsername, usernameChangeAvailableAt } = identityPkg;
const { FATIGUE_CEILING } = weeklyPlannerPkg;
const { angleOptionsFor, activationAt, optimalAngleFor, compareAngle, bestConfigurationsFor, targetableMuscles, axisOptions, activationOnAxis, axisSensitivity, AXIS_META } = parameterExplorerPkg;
const { findOptimalConfigurations, fatigueChangedTheAnswer, allTargetableMuscles } = targetMusclePlannerPkg;
const { muscleCredit } = muscleCreditPkg;
const { buildSessionICS } = calendarExportPkg;
const { SPLIT_GROUPS } = splitPlannerPkg;
const { PRESS_ANGLE_DESC, ROW_ANGLE_DESC, FLY_ANGLE_DESC, CURL_ANGLE_DESC, EXTENSION_ANGLE_DESC, LEG_CURL_ANGLE_DESC, HYPEREXTENSION_ANGLE_DESC, classifyMuscles, emgForAngle, frontalCueForProfile, gripCueForProfile, GRIP_ANGLES_BY_EQUIPMENT } = emgActivationPkg;

// Priority-ordered: checked in this order so a compound phrase like "iso-
// lateral cable machine" resolves to 'cable' (an iso-lateral cable stack),
// not 'machine' (a fixed-handle selectorized machine) -- the two behave very
// differently for grip choice, and "cable machine" specifically means the
// former. Most of the athlete's real logged history (Hevy-imported names)
// doesn't exact-match exerciseDb.js at all, so this keyword fallback is what
// actually makes the grip-availability gating apply to real exercises
// rather than only the ~3 that happen to match a curated DB entry verbatim.
const EQUIPMENT_NAME_HINTS = [['barbell', 'barbell'], ['dumbbell', 'dumbbell'], ['cable', 'cable'], ['machine', 'machine']];
function equipmentFromName(name) {
  for (const [kw, equip] of EQUIPMENT_NAME_HINTS) {
    if (new RegExp(`\\b${kw}\\b`).test(name)) return equip;
  }
  return undefined;
}

// Resolves the sagittal EMG profile (which muscle(s) this exercise
// emphasizes) for either a PressRowBuilder-generated exercise (carries its
// own emgWeights/pattern/equipment once addExercise's customExercises
// fallback has resolved it) or one of the athlete's pre-existing
// angle-mapped exercises (functions/exerciseAngles.js, equipment looked up
// from exerciseDb.js first, then guessed from the name itself) -- one
// resolver so the form cues work the same way for both, instead of two
// parallel lookups. `equipment` may still end up undefined (no db match and
// no equipment word in the name) -- callers treat that as "unknown, don't
// restrict the grip cue."
function sagittalProfileForExercise(ex) {
  if (ex?.emgWeights && ex?.pattern) return { pattern: ex.pattern, weights: ex.emgWeights, equipment: ex.equipment };
  // A session-generator family recommendation (functions/sessionPlanner.js's
  // generateSessionExercises, ex.family) carries pattern+angle but not yet
  // its own emgWeights (only computed once actually added to a workout, see
  // toExercise above) -- resolve it the same way rather than falling all
  // the way through to the EXERCISE_ANGLES name map, which has no entry for
  // a generic family name like "Cable Fly".
  if (ex?.family && ex?.pattern && ex?.angle != null) {
    const weights = emgForAngle(ex.pattern, ex.angle);
    if (weights) return { pattern: ex.pattern, weights, equipment: ex.equipment };
  }
  const key = (ex?.name || '').toLowerCase().trim();
  const angleInfo = EXERCISE_ANGLES[key];
  if (!angleInfo) return null;
  const weights = emgForAngle(angleInfo.pattern, angleInfo.angle);
  if (!weights) return null;
  const equipment = EXERCISE_DB.find(e => e.name.toLowerCase() === key)?.equipment || equipmentFromName(key);
  return { pattern: angleInfo.pattern, weights, equipment };
}

// Elbow-flare (frontal-plane) and grip-rotation form cues for one exercise.
// Combined into one resolver (rather than two independent ones) because
// they can genuinely conflict: a pronated or supinated grip restricts how
// far you can comfortably abduct/flare the elbow, so if the flare cue wants
// real width, that's only fully achievable with a neutral grip. When the
// grip cue recommends something other than neutral AND the flare cue wants
// meaningful width, the grip line says so rather than presenting two cues
// that quietly fight each other.
function formCuesForExercise(ex) {
  const profile = sagittalProfileForExercise(ex);
  if (!profile) return [];
  const tips = [];
  const flareCue = frontalCueForProfile(profile.pattern, profile.weights);
  if (flareCue) {
    const muscleLabel = muscleDisplayLabel(flareCue.muscle);
    const flareDesc = flareCue.angle >= 60 ? 'flared out toward horizontal' : flareCue.angle <= 15 ? 'tucked close to your torso' : 'roughly halfway out from your torso';
    tips.push(`Elbows ${flareDesc} (~${flareCue.angle}°) to fully engage ${muscleLabel}, which this ${profile.pattern} already emphasizes.`);
  }
  // GRIP_ANGLES_BY_EQUIPMENT[undefined] is undefined, which triggers
  // gripCueForProfile's own default (full range) -- correct fallback for an
  // exercise whose equipment isn't known, vs. GRIP_ANGLES_BY_EQUIPMENT's
  // own [] for 'machine', which correctly yields no cue at all.
  const gripCue = gripCueForProfile(profile.pattern, profile.weights, GRIP_ANGLES_BY_EQUIPMENT[profile.equipment]);
  if (gripCue) {
    const gripMuscleLabel = muscleDisplayLabel(gripCue.muscle);
    let line = `Use a ${gripCue.grip} grip to fully engage ${gripMuscleLabel}.`;
    if (flareCue && flareCue.angle >= 45 && gripCue.angle !== 90) {
      line += ' Note: that grip restricts how far you can comfortably flare your elbows — a neutral grip allows the widest range if both matter here.';
    }
    tips.push(line);
  }
  return tips;
}
const { buildObservations, solveMuscleCapacities, predictExerciseE1RM, suggestedWeightForReps } = muscleCapacityPkg;









// #15: superseded as the editable selection by TRACKING_CATEGORIES below —
// kept only for LEGACY_TRACKING_LEVEL_MAP's migration and reading an old
// profile.trackingLevel string's title where one's still needed (e.g. a
// stored value from before the checkbox UI existed).
const ECHELONS = [
  { key: 'workout', title: 'Training', desc: 'Workout logging, fatigue model, personal records, and AI-planned sessions.' },
  { key: 'workout_sleep', title: 'Training + Recovery', desc: 'Adds sleep tracking, HRV analysis, and recovery-aware planning via Apple Health.' },
  { key: 'full', title: 'Full System', desc: 'Everything — nutrition logging, macro tracking, meal photo scanning, and daily fuel briefings.' },
];
// #14/#15: replaces ECHELONS' 3-preset radio with independent checkboxes —
// Training itself is always on (there's no scenario with literally nothing
// tracked), Sleep and Nutrition are each their own toggle, any combination
// including ones the old 3 presets couldn't express (e.g. Training +
// Nutrition, no Sleep).
const TRACKING_CATEGORIES = [
  { key: 'sleep', title: 'Recovery', desc: 'Sleep tracking, HRV analysis, and recovery-aware planning via Apple Health.' },
  { key: 'nutrition', title: 'Nutrition', desc: 'Nutrition logging, macro tracking, meal photo scanning, and daily fuel briefings.' },
];
// #14: resolveTrackingCategories (imported below as trackingCategoriesFor)
// used to be duplicated here — a second copy of the exact same migration
// logic the backend briefing/newscast generators need too, which is exactly
// the kind of drift #14's audit exists to catch. Now the one shared
// implementation, in functions/trackingCategories.js.

// ── HELPERS ─────────────────────────────────────────────────────────────────
// Dates are stored as "YYYY-MM-DD" strings. `new Date("YYYY-MM-DD")` parses
// that as UTC midnight, so formatting it with toLocaleDateString in a
// negative-UTC-offset timezone (most of the Americas) rolls it back to the
// previous calendar day. Constructing from the local-time components instead
// keeps the displayed day matching the logged day everywhere.
const localDateFromYMD = (ymd) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
};
// The reverse direction: a Date -> "YYYY-MM-DD" using this browser's own
// local timezone, not UTC. `date.toISOString().split('T')[0]` is the bug to
// avoid here — it always converts to UTC first, so a moment that's already
// "tomorrow" locally (e.g. 11:45pm) gets stored under yesterday's date, or
// vice versa depending on offset direction.


// Detail-level gating lives in functions/expertise.js so the rules are
// testable and so it stays visible that nothing in the engine imports them —
// see that file's header for the contract. Only the React plumbing is here.
const {
  EXPERTISE_LEVELS, EXPERTISE_LABELS, EXPERTISE_BLURBS, DEFAULT_EXPERTISE,
  normalizeExpertise, expertiseAtLeast, expertiseAtMost,
  visibleRecoveryTabs: visibleRecoveryTabsFor, resolvePanelState,
} = expertisePkg;

const ExpertiseContext = React.createContext(DEFAULT_EXPERTISE);

function useExpertise() {
  const level = useContext(ExpertiseContext);
  return {
    level,
    atLeast: min => expertiseAtLeast(level, min),
    atMost: max => expertiseAtMost(level, max),
  };
}

// Gates a block of interface. `min` reveals it from that level upward, `max`
// only at or below it — the pair covers both things the levels do: add detail,
// and swap detail for a plainer substitute.
function Detail({ min, max, children }) {
  const { atLeast, atMost } = useExpertise();
  if (min && !atLeast(min)) return null;
  if (max && !atMost(max)) return null;
  return <>{children}</>;
}

function Header({ s, onSignOut, onOpenSettings, socialBadgeCount, onSyncShortcut, syncingShortcut }) {
  const today = s?.today || {};
  const n = s?.nutritionToday || {};
  const mt = s?.macroTargets || {};
  const steps = today.steps != null ? Math.round(today.steps * 1000) : null;
  const exactCal = s?.profile?.exactCalories !== false;

  const items = [
    { sym: '$RCVRY',   val: today.recovery != null ? `${Math.round(today.recovery)}` : '—',   chg: null, up: true },
    { sym: '$SLEEP',   val: today.sleepH != null ? `${today.sleepH.toFixed(1)}h` : '—',       chg: null, up: true },
    { sym: '$HRV',     val: today.hrv != null ? `${today.hrv}ms` : '—',                       chg: null, up: true },
    { sym: '$RHR',     val: today.rhr != null ? `${today.rhr}bpm` : '—',                      chg: null, up: false },
    { sym: '$STEPS',   val: steps ? steps.toLocaleString() : '—', chg: steps ? `${pct(steps, 10000)}%` : null, up: steps >= 8000 },
    { sym: '$KCAL',    val: n.calories ? `${roundCal(n.calories, exactCal)}` : '—', chg: mt.calories ? `${pct(n.calories, mt.calories)}%` : null, up: pct(n.calories, mt.calories) >= 80 },
    { sym: '$PROTEIN', val: n.protein ? `${n.protein}g` : '—', chg: mt.protein ? `${pct(n.protein, mt.protein)}%` : null, up: pct(n.protein, mt.protein) >= 80 },
    { sym: '$MASS',    val: s?.weights?.[0]?.value ? `${s.weights[0].value}kg` : '—', chg: null, up: true },
  ];

  return (
    <div className="hdr">
      {onSyncShortcut && (
        <button onClick={onSyncShortcut} disabled={syncingShortcut} className="mobile-sync-btn"
          style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 7, letterSpacing: '.14em', textTransform: 'uppercase', background: 'none', border: '1px solid var(--rule)', color: 'var(--dim)', padding: '2px 6px', cursor: 'pointer', lineHeight: 1.4 }}>
          {syncingShortcut ? 'Syncing…' : 'Sync'}
        </button>
      )}
      <div className="masthead">
        <div className="mast-left" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {onOpenSettings && (
            <button onClick={onOpenSettings} style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 7, letterSpacing: '.14em', textTransform: 'uppercase', background: 'none', border: '1px solid var(--rule)', color: 'var(--dim)', padding: '2px 6px', cursor: 'pointer', lineHeight: 1.4 }}>
              Settings{socialBadgeCount > 0 ? ` (${socialBadgeCount})` : ''}
            </button>
          )}
          <span>Vol. I &nbsp;·&nbsp; Est. 2026</span>
        </div>
        <div className="mast-title">PRESS</div>
        <div className="mast-right mast-right-stack">
          <span>{fmtDateShort()}</span>
          <span className="mast-right-row">
            <span>{s?.profile?.name ? `${s.profile.name}'s Edition` : 'Personal Edition'}</span>
            {onSignOut && <button onClick={onSignOut} style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 7, letterSpacing: '.14em', textTransform: 'uppercase', background: 'none', border: '1px solid var(--rule)', color: 'var(--dim)', padding: '2px 6px', cursor: 'pointer', lineHeight: 1.4 }}>Sign out</button>}
          </span>
        </div>
      </div>
      <div className="ticker-wrap">
        <div className="ticker-track">
          {[...items, ...items, ...items].map((t, i) => (
            <div key={i} className="tick">
              <span className="t-sym">{t.sym}</span>
              <span className="t-val">{t.val}</span>
              {t.chg && <span className={t.up ? 't-up' : 't-dn'}>{t.chg}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── S1: FRONT PAGE ───────────────────────────────────────────────────────────
// Today's single biggest constraint, from /plan/recommendation's limitingFactor
// (functions/limitingFactor.js). It lives on Dispatch rather than in its own
// panel because Dispatch is already the first thing on the page and the day's
// entry point — "what's holding me back today" belongs next to "what's today",
// not three panels further down.
//
// Every effect line names something the engine genuinely does at that
// threshold, so this is never mood-setting: see limitingFactor.js's header for
// the threshold-to-behaviour map it's built from.
function LimitingFactorPanel({ limitingFactor }) {
  if (!limitingFactor) return null;
  const { primary, others, clear } = limitingFactor;
  const mono = { fontFamily: "'JetBrains Mono',monospace" };
  const tone = { high: 'var(--ember)', moderate: 'var(--gold)', low: 'var(--dim)' };

  if (clear) {
    return (
      <div className="fade" style={{ flexShrink: 0, borderTop: '1px solid var(--rule)', paddingTop: 8, marginTop: 8 }}>
        <div className="kicker" style={{ marginBottom: 3 }}>Today's Limiting Factor</div>
        <div style={{ ...mono, fontSize: 11, color: 'var(--forest)' }}>
          None — nothing is constraining today's session.
        </div>
      </div>
    );
  }

  return (
    <div className="fade" style={{ flexShrink: 0, borderTop: '1px solid var(--rule)', paddingTop: 8, marginTop: 8 }}>
      <div className="kicker" style={{ marginBottom: 3 }}>Today's Limiting Factor</div>
      <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 15, fontWeight: 700, color: tone[primary.severity], lineHeight: 1.25 }}>
        <span style={{ ...mono, fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase', marginRight: 6, color: tone[primary.severity] }}>
          [{primary.severity}]
        </span>
        {primary.headline}
      </div>

      {/* The three depths come from limitingFactor.js, which emits all of them
          every time and never reads a level itself — the factor and its rank
          are identical here regardless of which one is shown. */}
      <Detail max="beginner">
        <div style={{ fontSize: 12, color: 'var(--ink)', lineHeight: 1.5, marginTop: 4 }}>
          {primary.explanations?.beginner || primary.detail}
        </div>
        <div style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--dim)', lineHeight: 1.5, marginTop: 4 }}>
          {primary.mitigation}
        </div>
      </Detail>

      <Detail min="intermediate" max="intermediate">
        <div style={{ ...mono, fontSize: 10, color: 'var(--ink)', lineHeight: 1.6, marginTop: 4 }}>
          {primary.explanations?.intermediate || primary.detail}
        </div>
        <div style={{ ...mono, fontSize: 9, color: 'var(--dim)', lineHeight: 1.6, marginTop: 3, fontStyle: 'italic' }}>{primary.mitigation}</div>
      </Detail>

      <Detail min="scientist">
        <div style={{ ...mono, fontSize: 10, color: 'var(--dim)', lineHeight: 1.6, marginTop: 4 }}>{primary.detail}</div>
        <div style={{ ...mono, fontSize: 10, color: 'var(--ink)', lineHeight: 1.6, marginTop: 3 }}>{primary.effect}</div>
        <div style={{ ...mono, fontSize: 9, color: 'var(--dim)', lineHeight: 1.6, marginTop: 3 }}>
          {primary.explanations?.scientist}
        </div>
        <div style={{ ...mono, fontSize: 9, color: 'var(--dim)', lineHeight: 1.6, marginTop: 3, fontStyle: 'italic' }}>{primary.mitigation}</div>
      </Detail>

      {/* The others genuinely crossed their thresholds too — at Sport Scientist
          level the full stack is more useful than just the winner. */}
      <Detail min="scientist">
        {others.length > 0 && (
          <div style={{ marginTop: 6, borderTop: '1px solid var(--paper2)', paddingTop: 5 }}>
            <div style={{ ...mono, fontSize: 8, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 3 }}>
              Also active
            </div>
            {others.map(f => (
              <div key={f.code} style={{ ...mono, fontSize: 9, color: 'var(--dim)', lineHeight: 1.7 }}>
                <span style={{ color: tone[f.severity], marginRight: 4 }}>•</span>
                <span style={{ color: tone[f.severity], textTransform: 'uppercase', fontSize: 8, letterSpacing: '.06em', marginRight: 6 }}>
                  [{f.severity}]
                </span>
                {f.detail}
              </div>
            ))}
          </div>
        )}
      </Detail>
    </div>
  );
}

// When each muscle comes back. Every figure is an inversion of the decay
// fatigue.js already runs (see functions/recoveryForecast.js) — nothing is
// fitted or predicted, so these are as good as the decay model and no better.
//
// What today's recovery score is actually made of. An exact decomposition of
// the weighted sum in functions/recoveryScore.js — each bar is that factor's
// contribution in points of the final score, and they sum back to it.
//
// Ranked by cost (points given up against the most that factor could
// contribute) rather than by contribution, because contribution alone ranks
// HRV first every single day purely for carrying the largest weight, including
// on days HRV is the one thing going well.
//
// A factor with no reading is drawn hollow and labelled: the engine substitutes
// 0.8 for a missing sensor, and rendering that as a solid bar would attribute
// points to data that was never collected.
function RecoveryDriversPanel({ drivers }) {
  if (!drivers?.factors?.length || drivers.score == null) return null;
  const mono = { fontFamily: "'JetBrains Mono',monospace" };
  const worst = drivers.factors.filter(f => f.measured && f.cost >= 1);

  return (
    <Detail min="intermediate">
      <div className="fade" style={{ flexShrink: 0, borderTop: '1px solid var(--rule)', paddingTop: 8, marginTop: 8 }}>
        <div className="kicker" style={{ marginBottom: 4 }}>What's Driving Recovery</div>

        {drivers.factors.map(f => (
          <div key={f.key} style={{ marginBottom: 5 }}>
            <div style={{ ...mono, fontSize: 10, display: 'flex', justifyContent: 'space-between', gap: 8, lineHeight: 1.5 }}>
              <span style={{ color: f.measured ? 'var(--ink)' : 'var(--dim)' }}>
                {f.label}{f.measured ? '' : ' (no reading)'}
              </span>
              <span style={{ color: 'var(--dim)', whiteSpace: 'nowrap' }}>
                {f.points} / {f.maxPoints}
              </span>
            </div>
            <div className="driver-track" role="img"
              aria-label={`${f.label} contributed ${f.points} of a possible ${f.maxPoints} points${f.measured ? '' : ', estimated because there was no reading'}`}>
              <div className={f.measured ? 'driver-fill' : 'driver-fill driver-fill-estimated'}
                style={{ width: `${Math.max(0, Math.min(100, (f.points / f.maxPoints) * 100))}%` }} />
            </div>
          </div>
        ))}

        <div style={{ ...mono, fontSize: 8, color: 'var(--dim)', marginTop: 5, lineHeight: 1.6 }}>
          {worst.length
            ? `Costing you most: ${worst.slice(0, 2).map(f => `${f.label.toLowerCase()} (${f.cost})`).join(', ')}.`
            : 'Nothing measured is holding today back.'}
          {drivers.unmeasured.length > 0 && ` ${drivers.unmeasured.length} factor${drivers.unmeasured.length === 1 ? '' : 's'} estimated — no reading today.`}
        </div>
      </div>
    </Detail>
  );
}

// Withheld at Beginner: "quads in 14h" is only actionable if you already think
// in terms of a fatigue ceiling, and Beginner deliberately doesn't show one.
function RecoveryForecastPanel({ forecast }) {
  if (!forecast) return null;
  const waiting = forecast.muscles.filter(m => !m.ready && m.hoursUntilReady != null);
  const mono = { fontFamily: "'JetBrains Mono',monospace" };
  const when = h => (h < 1 ? 'under an hour' : h < 24 ? `${Math.round(h)}h` : `${(h / 24).toFixed(1)} days`);

  return (
    <Detail min="intermediate">
      <div className="fade" style={{ flexShrink: 0, borderTop: '1px solid var(--rule)', paddingTop: 8, marginTop: 8 }}>
        <div className="kicker" style={{ marginBottom: 4 }}>Recovery Forecast</div>

        {!waiting.length ? (
          <div style={{ ...mono, fontSize: 10, color: 'var(--forest)' }}>
            Every tracked muscle is below the training ceiling.
          </div>
        ) : (
          waiting.slice(0, 6).map(m => (
            <div key={m.muscle} style={{ ...mono, fontSize: 10, color: 'var(--dim)', display: 'flex', justifyContent: 'space-between', lineHeight: 1.8 }}>
              <span style={{ textTransform: 'capitalize' }}>
                {m.muscle}{m.clamped ? ' *' : ''}
              </span>
              <span style={{ color: 'var(--ink)' }}>{when(m.hoursUntilReady)}</span>
            </div>
          ))
        )}

        {forecast.cns && forecast.cns.hoursUntilHeavyTrainingAvailable > 0 && (
          <div style={{ ...mono, fontSize: 10, color: 'var(--dim)', display: 'flex', justifyContent: 'space-between', lineHeight: 1.8, borderTop: '1px solid var(--paper2)', marginTop: 4, paddingTop: 4 }}>
            <span>CNS (heavy compounds)</span>
            <span style={{ color: 'var(--ink)' }}>{when(forecast.cns.hoursUntilHeavyTrainingAvailable)}</span>
          </div>
        )}

        {/* Both caveats are real and would otherwise be invisible: this assumes
            you don't train again, and a muscle pinned at the 100 cap may be far
            above it, making its figure a floor rather than an estimate. */}
        <div style={{ ...mono, fontSize: 8, color: 'var(--dim)', marginTop: 5, lineHeight: 1.6 }}>
          Assumes no further training.{waiting.some(m => m.clamped) ? ' * capped at 100 — recovery takes at least this long, possibly longer.' : ''}
        </div>
      </div>
    </Detail>
  );
}

function S1({ s, recommendation, briefing, onShowBriefing, onShowAfternoon, onShowNight, onShowWeekly, afternoonLoaded, nightLoaded, weeklyLoaded, loadingPeriod, newscastError, onShowTimeline }) {
  const today = s?.today || {};
  const recovery = today.recovery ?? s?.recoveryTrend?.at(-1) ?? null;

  const trainingStreak = useMemo(() => computeTrainingStreak(s?.workouts), [s?.workouts]);
  const waterStreak = s?.waterStats?.streak ?? 0;
  const sleepStreak = useMemo(() => computeSleepStreak(s?.sleepSeries, s?.sleepTarget), [s?.sleepSeries, s?.sleepTarget]);
  const hrv = today.hrv;
  const rhr = today.rhr;
  const sleep = today.sleepH;
  const sleepEff = today.sleepEff;
  const sleepDebt = s?.sleepDebtH ?? 0;
  const fatigue = useMemo(() => computeStructuralFatigue(s?.lifts, s?.musclePeaks, s?.soreness, s?.muscleSensitivity), [s?.lifts, s?.musclePeaks, s?.soreness, s?.muscleSensitivity]);
  const fatigueVals = Object.values(fatigue);
  const overallFatigue = fatigueVals.length ? Math.round(fatigueVals.reduce((a,b) => a+b, 0) / fatigueVals.length) : null;
  // No scheduled deload weeks in this program (see the Wiki entry) — fatigue
  // is per-muscle and autoregulated live, so the only thing worth surfacing
  // here is which specific muscles are actually over the ceiling right now,
  // not a blanket whole-body "recovery week" recommendation.
  const overloadedMuscles = Object.entries(fatigue).filter(([, v]) => v >= FATIGUE_CEILING).sort((a, b) => b[1] - a[1]).map(([m]) => m);
  const steps = today.steps != null ? Math.round(today.steps * 1000) : null;
  const n = s?.nutritionToday || {};
  const mt = s?.macroTargets || {};
  const protein = n.protein || 0;
  const proteinTarget = mt.protein || 160;
  const sleepTarget = s?.sleepTarget || 8;

  let hl1 = 'Morning', hl2 = 'Dispatch';
  if (recovery != null) {
    if (recovery >= 80)      { hl1 = 'Body Clears'; hl2 = 'for Heavy Load'; }
    else if (recovery >= 65) { hl1 = 'Steady State —'; hl2 = 'Build Today'; }
    else                     { hl1 = 'Recovery Day —'; hl2 = 'Light Work Only'; }
  }

  const hrvDelta = hrv != null && s?.baselines?.hrv != null ? Math.round(hrv - s.baselines.hrv) : null;
  const rhrDelta = rhr != null && s?.baselines?.rhr != null ? Math.round(rhr - s.baselines.rhr) : null;
  const recoveryTrend = s?.recoveryTrend || [];

  const thought = s?.thoughts?.[0]?.text;
  const hour = new Date().getHours();
  // Exclusive windows, not cumulative thresholds — hour >= 18 alone left
  // canAfternoon (hour >= 12) also true all evening, showing both the
  // mid-day and the night report slots at once past 6pm. Only one time-
  // of-day slot should ever be current.
  const canAfternoon = hour >= 12 && hour < 18;
  const canNight = hour >= 18;
  // Weekly review is only worth generating early in the week, before it's
  // stale news -- Mon/Tue/Wed only (getDay(): 0=Sun ... 3=Wed).
  const day = new Date().getDay();
  const canWeekly = day >= 1 && day <= 3;

  return (
    <section id="s1" style={{ padding: '18px 20px 16px', justifyContent: 'space-between' }}>
      <div className="fade panel-head" style={{ flexShrink: 0 }} data-tour="s1-headline">
        <div className="kicker">Today's Edition · {fmtDate()} · Recovery &amp; Readiness</div>
        <div className="headline" style={{ fontSize: 'clamp(30px,8vw,52px)', lineHeight: '.96', marginBottom: 0 }}>{hl1}<br />{hl2}</div>
      </div>

      {briefing && (
        <div className="briefing-preview fade" style={{ flexShrink: 0 }} onClick={onShowBriefing}>
          <div className="kicker" style={{ marginBottom: 3 }}>Morning Briefing</div>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, fontWeight: 700, color: 'var(--gold)', lineHeight: 1.2 }}>
            {briefing.headline}
          </div>
          {briefing.subheading && (
            <div style={{ fontFamily: "'Times New Roman',serif", fontSize: 12, color: 'var(--dim)', fontStyle: 'italic', marginTop: 4 }}>
              {briefing.subheading}
            </div>
          )}
        </div>
      )}

      <div data-tour="s1-limiting-factor" style={{ flexShrink: 0 }}>
        <LimitingFactorPanel limitingFactor={recommendation?.limitingFactor} />
      </div>

      {canAfternoon && (
        <div className="briefing-preview fade" style={{ flexShrink: 0, cursor: loadingPeriod === 'afternoon' ? 'default' : 'pointer', opacity: loadingPeriod === 'afternoon' ? 0.6 : 1 }} onClick={onShowAfternoon}>
          <div className="kicker" style={{ marginBottom: 3 }}>Mid-Day Update</div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--dim)', fontStyle: 'italic' }}>
            {loadingPeriod === 'afternoon' ? 'Generating…' : afternoonLoaded ? 'Read mid-day update' : 'Generate mid-day report'}
          </div>
        </div>
      )}

      {canNight && (
        <div className="briefing-preview fade" style={{ flexShrink: 0, cursor: loadingPeriod === 'night' ? 'default' : 'pointer', opacity: loadingPeriod === 'night' ? 0.6 : 1 }} onClick={onShowNight}>
          <div className="kicker" style={{ marginBottom: 3 }}>Tonight's Report</div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--dim)', fontStyle: 'italic' }}>
            {loadingPeriod === 'night' ? 'Generating…' : nightLoaded ? "Read tonight's report" : 'Generate evening report'}
          </div>
        </div>
      )}

      {canWeekly && (
      <div className="briefing-preview fade" style={{ flexShrink: 0, cursor: loadingPeriod === 'weekly' ? 'default' : 'pointer', opacity: loadingPeriod === 'weekly' ? 0.6 : 1 }} onClick={onShowWeekly}>
        <div className="kicker" style={{ marginBottom: 3 }}>Weekly Review</div>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--dim)', fontStyle: 'italic' }}>
          {loadingPeriod === 'weekly' ? 'Generating…' : weeklyLoaded ? 'Read weekly review' : 'Generate weekly review'}
        </div>
      </div>
      )}

      <div className="briefing-preview fade" style={{ flexShrink: 0, cursor: 'pointer' }} onClick={onShowTimeline} data-tour="s1-timeline">
        <div className="kicker" style={{ marginBottom: 3 }}>Timeline</div>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--dim)', fontStyle: 'italic' }}>
          Workouts, sleep, injuries and thoughts, newest first
        </div>
      </div>

      {newscastError && (
        <div className="fade" style={{ flexShrink: 0, fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--red)', padding: '6px 0' }}>
          {newscastError}
        </div>
      )}

      <div className="fade" style={{ flex: 1, display: 'flex', gap: 0, alignItems: 'stretch', minHeight: 0, borderTop: '2px solid var(--ink)', borderBottom: '2px solid var(--ink)', margin: '12px 0', overflow: 'hidden' }} data-tour="s1-vitals">
        {/* Left: recovery number + ghost chart */}
        <div style={{ width: '44%', flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '14px 16px 14px 0', borderRight: '1px solid var(--rule)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, opacity: 0.45, pointerEvents: 'none' }}>
            <AreaChart data={recoveryTrend.length ? recoveryTrend : s?.sleepSeries || []} color="#6b5800" id="ghost" />
          </div>
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div className="sc-label" style={{ marginBottom: 6 }}>Recovery · Today</div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 'clamp(52px,13vw,84px)', lineHeight: '.82', letterSpacing: '-.05em', color: 'var(--gold)', whiteSpace: 'nowrap' }}>
              {recovery != null ? Math.round(recovery) : '—'}<span style={{ fontSize: '.32em', color: 'var(--rule)', letterSpacing: 0, fontWeight: 700 }}> /100</span>
            </div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--forest)', marginTop: 10, letterSpacing: '.04em' }}>
              {recovery != null ? (recovery >= 70 ? '▲ TRAIN HEAVY' : recovery >= 50 ? '→ TRAIN MODERATE' : '▼ REST OR LIGHT') : 'AWAITING DATA'}
            </div>
            {s?.profile?.cycleTrackingEnabled && s?.cycleStats?.cycleDay != null && (
              <div className="sc-delta" style={{ marginTop: 4 }}>
                Cycle day {s.cycleStats.cycleDay}{s.cycleStats.onPeriod ? ' · on period' : s.cycleStats.factor < 0.95 ? ' · peak window' : ''}
              </div>
            )}
          </div>
        </div>

        {/* Right: 4 vitals */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '12px 0 12px 16px' }}>
          <div>
            <div className="sc-label">HRV</div>
            <div className="sc-num navy" style={{ fontSize: 'clamp(26px,6vw,40px)' }}>{hrv != null ? hrv : '—'}<span style={{ fontSize: '.4em', color: 'var(--dim)' }}>ms</span></div>
            <div className="sc-delta up">{hrvDelta != null ? `${hrvDelta >= 0 ? '▲' : '▼'} ${Math.abs(hrvDelta)} vs baseline` : `Baseline: ${s?.baselines?.hrv ?? '—'}ms`}</div>
          </div>
          <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 10 }}>
            <div className="sc-label">Resting HR</div>
            <div className="sc-num forest" style={{ fontSize: 'clamp(26px,6vw,40px)' }}>{rhr != null ? rhr : '—'}<span style={{ fontSize: '.4em', color: 'var(--dim)' }}>bpm</span></div>
            <div className="sc-delta up">{rhrDelta != null ? `${rhrDelta <= 0 ? '▼' : '▲'} ${Math.abs(rhrDelta)} vs baseline` : `Baseline: ${s?.baselines?.rhr ?? '—'}bpm`}</div>
          </div>
          <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 10 }}>
            <div className="sc-label">Sleep</div>
            <div className="sc-num plum" style={{ fontSize: 'clamp(26px,6vw,40px)' }}>{sleep != null ? sleep.toFixed(1) : '—'}<span style={{ fontSize: '.4em', color: 'var(--dim)' }}>h</span></div>
            <div className="sc-delta" style={{ color: 'var(--dim)' }}>
              {sleep != null ? `${sleepEff != null ? `${Math.round(sleepEff * 100)}% eff · ` : ''}${sleepDebt.toFixed(1)}h debt` : `Target: ${fmtHoursMins(sleepTarget)}`}
            </div>
          </div>
          <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 10 }}>
            <div className="sc-label">Recent Load</div>
            <div className="sc-num red" style={{ fontSize: 'clamp(26px,6vw,40px)' }}>{overallFatigue != null ? overallFatigue : '—'}<span style={{ fontSize: '.4em', color: 'var(--dim)' }}>/100</span></div>
            <div className="sc-delta up">{overallFatigue != null ? (overallFatigue < 40 ? 'Low — cleared for heavy load' : overallFatigue < 70 ? 'Moderate — train smart' : 'High — recovery first') : 'No recent sessions'}</div>
          </div>
        </div>
      </div>

      {/* Progress bars */}
      <div className="fade" style={{ flexShrink: 0 }} data-tour="s1-progress">
        <div className="prog-head">Daily Progress</div>
        {[
          { label: 'Sleep',    color: 'var(--plum)',   val: sleep,                       target: sleepTarget,   fmt: v => `${v.toFixed(1)}h`,                 tgt: fmtHoursMins(sleepTarget) },
          { label: 'Recovery', color: 'var(--gold)',   val: recovery,                    target: 100,           fmt: v => `${Math.round(v)}`,                   tgt: '100' },
          { label: 'Steps',    color: 'var(--forest)', val: steps ? steps/1000 : null,   target: 10,            fmt: v => `${Math.round(v*1000).toLocaleString()}`, tgt: '10k' },
          { label: 'Protein',  color: 'var(--ember)',  val: protein,                     target: proteinTarget, fmt: v => `${Math.round(v)}g`,                  tgt: `${proteinTarget}g` },
          { label: 'Recent Load',  color: 'var(--red)',    val: overallFatigue,              target: 100,           fmt: v => `${Math.round(v)}`,                   tgt: '100' },
        ].map(({ label, color, val, target, fmt, tgt }, i) => {
          const p = val != null && target ? Math.min(100, val / target * 100) : 0;
          return (
            <div key={label} className="prog-row" style={i === 4 ? { marginBottom: 0 } : {}}>
              <div className="prog-dot" style={{ background: color }} />
              <div className="prog-label">{label}</div>
              <div className="prog-track"><div className="prog-fill" style={{ width: `${p}%`, background: color }} /></div>
              <div className="prog-val" style={{ color }}>
                {val != null ? fmt(val) : '—'} <span className="prog-sub">/ {tgt}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Streaks row */}
      <div className="streak-row fade" style={{ flexShrink: 0 }} data-tour="s1-streaks">
        {[
          { label: 'Training Streak', val: trainingStreak },
          { label: 'Water Streak', val: waterStreak },
          { label: 'Sleep Streak', val: sleepStreak },
        ].map(({ label, val }) => (
          <div key={label} className="streak-cell">
            <div className="streak-num" style={{ color: val > 7 ? 'var(--forest)' : val > 3 ? 'var(--gold)' : 'var(--ink)' }}>{val}</div>
            <div className="streak-lbl">{label}</div>
          </div>
        ))}
      </div>

      {/* Sleep debt */}
      {sleepDebt > 0 && (
        <div className="sleep-debt-bar fade" style={{ flexShrink: 0, borderLeftColor: sleepDebt > 1 ? 'var(--red)' : 'var(--gold)' }}>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 600, color: sleepDebt > 1 ? 'var(--red)' : 'var(--gold)' }}>
            {sleepDebt.toFixed(1)}h sleep debt
          </div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', marginTop: 2 }}>
            {sleepDebt > 1 ? 'Prioritise 9h tonight to recover' : 'Slight deficit — aim for full sleep tonight'}
          </div>
        </div>
      )}
      {sleepDebt === 0 && (
        <div className="sleep-debt-bar fade" style={{ flexShrink: 0, borderLeftColor: 'var(--forest)' }}>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--forest)' }}>Sleep debt clear</div>
        </div>
      )}

      {overloadedMuscles.length > 0 && (
        <div className="fatigue-banner fade" style={{ flexShrink: 0 }}>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 600, color: 'var(--paper)', letterSpacing: '.04em', textTransform: 'capitalize' }}>
            {overloadedMuscles.length === 1
              ? `${muscleDisplayLabel(overloadedMuscles[0])} — leave it alone`
              : `${overloadedMuscles.map(muscleDisplayLabel).join(', ')} — leave them alone`}
          </div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'rgba(245,240,226,0.75)', marginTop: 3, lineHeight: 1.5 }}>
            Above the {FATIGUE_CEILING}% fatigue ceiling — skip {overloadedMuscles.length === 1 ? 'it' : 'them'} today and train everything else as normal.
          </div>
        </div>
      )}

      {/* Pull quote */}
      <div className="pull fade" style={{ margin: '10px 0 0', fontSize: 'clamp(12px,3vw,15px)' }}
        dangerouslySetInnerHTML={{ __html: thought
          ? `"${thought}"`
          : '"The body adapts to what you consistently demand of it. <strong>Consistency compounds.</strong>"' }} />
    </section>
  );
}

// ── S2: SLEEP ────────────────────────────────────────────────────────────────
const SLEEP_COMPONENT_LABELS = { duration: 'Duration', efficiency: 'Efficiency', deep: 'Deep Sleep', rem: 'REM Sleep', light: 'Light Sleep', hrDip: 'HR Dip', waso: 'Fragmentation' };

function sleepScoreColor(score) {
  if (score >= 80) return 'var(--forest)';
  if (score >= 60) return 'var(--gold)';
  return 'var(--ember)';
}

function SleepScorePanel({ sleepScore, sleepScoreTrend }) {
  if (!sleepScore) return (
    <div className="fade" style={{ borderTop: '1px solid var(--rule)', paddingTop: 10, flexShrink: 0 }} data-tour="s2-score">
      <div className="kicker" style={{ marginBottom: 4 }}>Sleep Score</div>
      <div style={{ fontSize: 11, color: 'var(--dim)', fontStyle: 'italic' }}>Sync sleep hours and efficiency to see a score — add stage/HR-dip data via the setup guide for the full clinical breakdown.</div>
    </div>
  );
  const availableComponents = Object.entries(sleepScore.components).filter(([, v]) => v != null);
  return (
    <div className="fade" style={{ borderTop: '1px solid var(--rule)', paddingTop: 10, flexShrink: 0 }} data-tour="s2-score">
      <div className="kicker" style={{ marginBottom: 8 }}>Sleep Score</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 10 }}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 40, fontWeight: 900, lineHeight: 1, color: sleepScoreColor(sleepScore.score) }}>
          {sleepScore.score}<span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: 'var(--dim)', marginLeft: 2 }}>/100</span>
        </div>
        {sleepScoreTrend?.length > 1 && <Sparkline data={sleepScoreTrend} color={sleepScoreColor(sleepScore.score)} width={64} height={26} />}
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {availableComponents.map(([key, val]) => (
          <div key={key} style={{ minWidth: 64 }}>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 2 }}>{SLEEP_COMPONENT_LABELS[key]}</div>
            <div className="macro-track" style={{ marginBottom: 2 }}><div className="macro-fill" style={{ width: `${val}%`, background: sleepScoreColor(val) }} /></div>
          </div>
        ))}
      </div>
      {sleepScore.inputs && (sleepScore.inputs.deepPct != null || sleepScore.inputs.hrDipPct != null) && (
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', marginTop: 8 }}>
          {sleepScore.inputs.deepPct != null && `${sleepScore.inputs.deepPct}% deep · ${sleepScore.inputs.remPct}% REM · ${sleepScore.inputs.lightPct}% light`}
          {sleepScore.inputs.deepPct != null && sleepScore.inputs.hrDipPct != null && ' · '}
          {sleepScore.inputs.hrDipPct != null && `${sleepScore.inputs.hrDipPct}% overnight HR dip`}
        </div>
      )}
    </div>
  );
}

function S2({ s, refresh }) {
  const series = s?.sleepSeries || [];
  const sleepTarget = s?.sleepTarget || 8;
  const debt = s?.sleepDebtH ?? 0;
  const todaySleep = s?.today?.sleepH;
  const eff = s?.today?.sleepEff;
  const vo2Series = (s?.vo2maxSeries || []).map(p => p.value);
  const hrrSeries = (s?.hrrSeries || []).map(p => p.value);
  const alcoholLastNight = s?.alcoholLastNight || 0;
  const alcoholLast7 = s?.alcoholLast7 || 0;
  const [alcoholUnits, setAlcoholUnits] = useState('');
  const [loggingAlcohol, setLoggingAlcohol] = useState(false);

  const hi = series.length ? Math.max(...series).toFixed(1) : '—';
  const lo = series.length ? Math.min(...series).toFixed(1) : '—';
  const avg = series.length ? (series.reduce((a,b) => a+b,0) / series.length).toFixed(2) : '—';
  const effPct = eff != null ? Math.round(eff) : null;

  const logAlcohol = async () => {
    if (!alcoholUnits) return;
    setLoggingAlcohol(true);
    const data = await api('alcohol', { method: 'POST', body: JSON.stringify({ units: +alcoholUnits }) });
    setAlcoholUnits('');
    setLoggingAlcohol(false);
    refresh({ ...s, alcoholLastNight: data.alcoholLastNight, alcoholLast7: data.alcoholLast7 });
  };

  return (
    <section id="s2">
      <div className="fade panel-head" data-tour="s2-headline">
        <div className="kicker">Health · Sleep Analysis · {series.length}‑Night</div>
        <div className="headline">
          {todaySleep != null ? `${todaySleep.toFixed(1)} Hours —` : 'Lights Out —'}<br />
          {effPct != null ? `${effPct}% Efficiency` : 'Nothing on Record'}
        </div>
        <div className="deck">
          {debt > 0
            ? `Sleep debt stands at ${debt.toFixed(1)} hours. Consistent nights above target needed to clear it.`
            : 'Sleep debt cleared. Maintain consistent bedtimes to hold this position.'}
        </div>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--dim)', marginTop: -8, marginBottom: 14 }}>
          Target {fmtHoursMins(sleepTarget)} ({s?.sleepTargetLearned ? 'learned from your recent nights' : 'default — not enough data yet to personalise'})
        </div>
      </div>
      <div className="chart-wrap fade" style={{ flex: '0 0 90px', position: 'relative' }} data-tour="s2-chart">
        {series.length ? (
          <>
            <AreaChart data={series} color="#3d2452" id="sleep" />
            {(() => {
              const mn = Math.min(...series), mx = Math.max(...series), rng = (mx - mn) || 1;
              const lo = mn - rng * 0.07, r = (mx + rng * 0.07) - lo;
              const tgtY = 100 - ((sleepTarget - lo) / r * 100);
              if (tgtY < 0 || tgtY > 100) return null;
              return (
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                  <svg viewBox="0 0 320 100" style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }} preserveAspectRatio="none">
                    <line x1="0" y1={tgtY} x2="320" y2={tgtY} stroke="var(--gold)" strokeWidth="1" strokeDasharray="4,4" opacity="0.7" />
                  </svg>
                </div>
              );
            })()}
          </>
        ) : (
          <div style={{ color: 'var(--dim)', fontStyle: 'italic', fontSize: 13, padding: '20px 0' }}>Sleep data syncing.</div>
        )}
      </div>
      <div className="fade">
        <div className="stat-cols stat-cols-4" style={{ borderTop: '1px solid var(--rule)', paddingTop: 10 }} data-tour="s2-stats">
          <div className="stat-cell"><div className="sc-label">{series.length}N High</div><div className="sc-num" style={{ fontSize: 22 }}>{hi}<span style={{ fontSize: '.5em', color: 'var(--dim)' }}>h</span></div></div>
          <div className="stat-cell"><div className="sc-label">{series.length}N Low</div><div className="sc-num red" style={{ fontSize: 22 }}>{lo}<span style={{ fontSize: '.5em', color: 'var(--dim)' }}>h</span></div></div>
          <div className="stat-cell"><div className="sc-label">{series.length}N Avg</div><div className="sc-num" style={{ fontSize: 22 }}>{avg}<span style={{ fontSize: '.5em', color: 'var(--dim)' }}>h</span></div></div>
          <div className="stat-cell"><div className="sc-label">Sleep Debt</div><div className="sc-num red" style={{ fontSize: 22 }}>{debt.toFixed(1)}<span style={{ fontSize: '.5em', color: 'var(--dim)' }}>h</span></div></div>
        </div>
      </div>

      <SleepScorePanel sleepScore={s?.sleepScore} sleepScoreTrend={s?.sleepScoreTrend} />

      {/* VO2 max + HRR trends */}
      {(vo2Series.length > 0 || hrrSeries.length > 0) && (
        <div className="fade" style={{ borderTop: '1px solid var(--rule)', paddingTop: 10, flexShrink: 0 }}>
          <div className="kicker" style={{ marginBottom: 8 }}>Cardiovascular Fitness</div>
          <div style={{ display: 'flex', gap: 20 }}>
            {vo2Series.length > 0 && (
              <div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 4 }}>VO2 Max</div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                  <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700, lineHeight: 1, color: 'var(--forest)' }}>
                    {vo2Series.at(-1)}<span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', marginLeft: 2 }}>ml/kg/min</span>
                  </div>
                  <Sparkline data={vo2Series} color="var(--forest)" width={56} height={22} />
                </div>
              </div>
            )}
            {hrrSeries.length > 0 && (
              <div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 4 }}>Heart Rate Recovery</div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                  <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700, lineHeight: 1, color: 'var(--navy)' }}>
                    {hrrSeries.at(-1)}<span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', marginLeft: 2 }}>bpm</span>
                  </div>
                  <Sparkline data={hrrSeries} color="var(--navy)" width={56} height={22} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Wrist temp / SpO2 / current HR — folded into the recovery score, shown here */}
      {(s?.today?.wristTemp != null || s?.today?.spo2 != null || s?.today?.hr != null) && (
        <div className="fade" style={{ borderTop: '1px solid var(--rule)', paddingTop: 10, flexShrink: 0 }}>
          <div className="kicker" style={{ marginBottom: 8 }}>Recovery Signals</div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {s?.today?.wristTemp != null && (
              <div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 4 }}>Wrist Temp</div>
                <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700, lineHeight: 1, color: s?.baselines?.wristTemp != null && s.today.wristTemp - s.baselines.wristTemp > 0.3 ? 'var(--ember)' : 'var(--forest)' }}>
                  {s.today.wristTemp.toFixed(1)}<span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', marginLeft: 2 }}>°C</span>
                </div>
                {s?.baselines?.wristTemp != null && (
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', marginTop: 2 }}>
                    baseline {s.baselines.wristTemp}°C ({s.today.wristTemp - s.baselines.wristTemp >= 0 ? '+' : ''}{(s.today.wristTemp - s.baselines.wristTemp).toFixed(1)})
                  </div>
                )}
              </div>
            )}
            {s?.today?.spo2 != null && (
              <div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 4 }}>Blood Oxygen</div>
                <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700, lineHeight: 1, color: s.today.spo2 < 95 ? 'var(--ember)' : 'var(--forest)' }}>
                  {s.today.spo2}<span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', marginLeft: 2 }}>%</span>
                </div>
              </div>
            )}
            {s?.today?.hr != null && (
              <div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 4 }}>Heart Rate</div>
                <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700, lineHeight: 1, color: 'var(--navy)' }}>
                  {s.today.hr}<span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', marginLeft: 2 }}>bpm</span>
                </div>
                {s?.baselines?.hr != null && (
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', marginTop: 2 }}>baseline {s.baselines.hr}bpm</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Alcohol section */}
      <div className="fade" style={{ borderTop: '1px solid var(--rule)', paddingTop: 10, flexShrink: 0 }} data-tour="s2-alcohol">
        <div className="kicker" style={{ marginBottom: 6 }}>Alcohol</div>
        {alcoholLastNight > 0 && (
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--ember)', marginBottom: 6, letterSpacing: '.06em' }}>
            {alcoholLastNight} unit{alcoholLastNight !== 1 ? 's' : ''} last night · HRV + sleep likely affected
          </div>
        )}
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', marginBottom: 8 }}>
          Last 7 days: {alcoholLast7} units
        </div>
        <div className="alcohol-row">
          <input
            style={{ width: 60, fontFamily: "'JetBrains Mono',monospace", fontSize: 13, padding: '5px 6px', border: '1px solid var(--rule)', background: 'var(--paper)', color: 'var(--ink)', textAlign: 'center' }}
            type="number" min="0" step="0.5" placeholder="0"
            value={alcoholUnits} onChange={e => setAlcoholUnits(e.target.value)}
            inputMode="decimal"
          />
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)' }}>units tonight</span>
          <button className="prof-btn solid" onClick={logAlcohol} disabled={!alcoholUnits || loggingAlcohol} style={{ padding: '5px 14px', fontSize: 9 }}>
            {loggingAlcohol ? '…' : 'Log'}
          </button>
        </div>
      </div>
    </section>
  );
}

// ── WORKOUT LOGGER ───────────────────────────────────────────────────────────
// Was a hand-maintained 57-name list that had drifted so far from
// EXERCISE_DB's actual naming (e.g. 'skull crusher' vs. the DB's
// "Skullcrusher (Barbell)") that 41 of the 57 default suggestions — including
// "bench press", "deadlift", "pull up" — never matched any DB entry. Logging
// one of those meant zero fatigue tracking and no equipment-aware
// progression rounding for that exercise. Deriving from EXERCISE_DB directly
// keeps the suggestion list and the actual data in permanent sync.
const BASE_EXERCISES = EXERCISE_DB.map(e => e.name.toLowerCase());

// Colloquial terms that don't appear anywhere in EXERCISE_DB's own
// primary/secondary muscle names, so the plain muscle-tag match above can't
// find them on its own — "bicep" -> "biceps" is already covered by simple
// substring matching, but "legs", "back", "delts" etc. name a muscle *group*,
// not a single tracked muscle, and never literally appear in any exercise's
// tag data. Expanded into EXERCISE_SEARCH_TAGS below so e.g. "back" finds
// every row/pulldown/lat-pulldown variant, not just exercises literally
// tagged "lats".
const MUSCLE_SYNONYMS = {
  legs: ['quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors', 'hip-flexors', 'tibialis'],
  back: ['lats', 'rhomboids', 'traps', 'mid-traps', 'lower-traps', 'rear-delt', 'erectors'],
  shoulders: ['front-delt', 'mid-delt', 'rear-delt', 'rotator-cuff'],
  delts: ['front-delt', 'mid-delt', 'rear-delt'],
  arms: ['biceps', 'triceps', 'forearms', 'brachialis', 'brachioradialis'],
  abs: ['abs', 'obliques', 'transverse-abs', 'core'],
  core: ['abs', 'obliques', 'transverse-abs', 'erectors'],
  hammies: ['hamstrings'],
  pecs: ['chest'],
  traps: ['traps', 'mid-traps', 'lower-traps'],
};

// Lets exercise search match on muscles/equipment/category ("lats" finds
// every row/pulldown variant) without those tags cluttering the visible
// suggestion list — keyed by the same lowercase name used in allExercises.
const EXERCISE_SEARCH_TAGS = new Map(EXERCISE_DB.map(e => {
  const muscles = [...(e.primary || []), ...(e.secondary || [])];
  const synonyms = Object.entries(MUSCLE_SYNONYMS)
    .filter(([, group]) => group.some(m => muscles.includes(m)))
    .map(([synonym]) => synonym);
  return [
    e.name.toLowerCase(),
    [...muscles, ...synonyms, e.equipment, e.category].join(' ').toLowerCase(),
  ];
}));

const e1rm = (kg, reps) => (kg > 0 && reps > 0) ? Math.round(calcE1RM(kg, reps)) : null;

// Minimum whole reps at `kg` needed to actually register as a new PR --
// must mirror completeSet's own isNewPR check exactly (rounded e1rm, strict
// >), not just approach targetE1RM, or this hint can promise a rep count
// that then ties rather than beats the old PR once rounded (raw calcE1RM
// landing just above targetE1RM can still round down to the same integer,
// or land exactly on it with >=) -- reported live: hitting the suggested
// reps at the suggested weight still came back "Short of target" instead
// of a PR. e1rm rises monotonically with reps at a fixed weight (see
// strengthStandards.js), so walking reps up from 1 is simpler and just as
// exact as inverting the curve algebraically. Capped at 20: past that a
// "reps needed for a PR" hint stops being an answerable (or useful)
// question.
const repsForPR = (kg, targetE1RM) => {
  if (!kg || !targetE1RM) return null;
  for (let r = 1; r <= 20; r++) {
    if (e1rm(kg, r) > targetE1RM) return r;
  }
  return null;
};
// Which fields each device's Health data actually supports differ enough
// (Find Health Samples hard-errors, not empty, on a type the device never
// writes) that one universal Shortcut can't cover everyone — see
// .design/feature-brainstorm or chat history for the full field-by-field
// breakdown this list was derived from. `url` is filled in per device as
// each Shortcut variant is built; empty means "not published yet".
const HEALTH_SHORTCUT_DEVICES = [
  { key: 'aw3', label: 'Apple Watch Series 3', url: 'https://www.icloud.com/shortcuts/0ac09c122a924736acfbcb5efcf69344' },
  { key: 'aw4-5-se12', label: 'Apple Watch Series 4–5 / SE (1st/2nd gen)', url: 'https://www.icloud.com/shortcuts/97c153fb788049f3affa45feafb95e87' },
  { key: 'aw6-7', label: 'Apple Watch Series 6–7', url: 'https://www.icloud.com/shortcuts/b1fdd430f64645f19f136d98c6bc6c32' },
  { key: 'awse3', label: 'Apple Watch SE 3', url: 'https://www.icloud.com/shortcuts/bc8ece69279843e4839624d74d5c8e6f' },
  { key: 'aw8-11-ultra', label: 'Apple Watch Series 8–11 / Ultra (1–3)', url: 'https://www.icloud.com/shortcuts/7182780e1df1493cbc6b30dec162eeff' },
  { key: 'whoop3', label: 'Whoop 3.0', url: 'https://www.icloud.com/shortcuts/c4278af9b31d465aa0f18e899eca1aee' },
  { key: 'whoop4', label: 'Whoop 4.0', url: 'https://www.icloud.com/shortcuts/7b4e5624538d4c39ba5593357863e48d' },
  { key: 'oura1-2', label: 'Oura Gen 1–2', url: 'https://www.icloud.com/shortcuts/86299aad30514c9186e663aa3843afcc' },
  { key: 'oura3plus', label: 'Oura Gen 3 / Ring 4 / Ring 5', url: 'https://www.icloud.com/shortcuts/ce5569a95a87408c99972234d26ae129' },
];
const SET_TYPES = ['W','N','D'];
const SET_LABELS = { W: 'Warm-up', N: 'Normal', D: 'Drop Set' };
const REST_DEFAULT = 90;
// Rest timer displays live muscle glycogen replenishment instead of a plain
// countdown — exponential recovery shaped by a 45s half-life, but rescaled
// against this rest window's own total so it always reads 100% right as the
// timer ends, rather than an absolute physiological % that would cap at 75%
// (90s rest) or 94% (180s rest) and vanish mid-value when the banner closes.
const GLYCOGEN_HALF_LIFE_S = 45;
const glycogenPct = (elapsedS, totalS) => {
  const raw = 1 - Math.pow(0.5, elapsedS / GLYCOGEN_HALF_LIFE_S);
  const rawAtTotal = 1 - Math.pow(0.5, totalS / GLYCOGEN_HALF_LIFE_S);
  return Math.round(Math.min(100, 100 * raw / rawAtTotal));
};

// Shown at the top of Settings. Newest first — add a new entry (bump the
// version, today's date, a feature-list bullet per notable change) whenever
// shipping something worth calling out, rather than editing this comment
// instead of the list. v0.1 is the first tracked release, not literally the
// app's first version — everything before this had no changelog at all.
const CHANGELOG = [
  {
    version: '1.21',
    date: '2026-08-08',
    features: [
      'Fixed the app failing to load entirely (blank screen on every device) — a leftover effect from an abandoned swim/bike recommendation card referenced two state setters that were never declared, throwing on every load. The working replacement (Today\'s Ride/Swim panels) was unaffected; this only removes dead code left behind when it was superseded.',
    ],
  },
  {
    version: '1.20',
    date: '2026-08-08',
    features: [
      'Nutrition now tracks micronutrients (fiber, sodium, potassium, calcium, iron, vitamins, and more) alongside calories/protein/carbs/fat — from a barcode scan (real data), and now also from meal photos, label photos, and text descriptions (an AI estimate, clearly marked "may not be accurate" wherever it shows, never presented with the same confidence as a scan).',
      'Shown as raw values plus a percent-of-daily-reference figure, both on the entry you\'re about to log and as a running total for the day — no score, no badge, matching how everything else here avoids gamifying your data.',
    ],
  },
  {
    version: '1.19',
    date: '2026-08-08',
    features: [
      'Added an "Evidence" tab to the Wiki — real citations behind the algorithms Press actually uses (adaptation curves, running load/injury-risk models, VO₂max estimation, EMG-based exercise splits, and more), pulled from sources already in the codebase, not written up new. Where something is a named practitioner heuristic rather than a published study, it says so.',
    ],
  },
  {
    version: '1.18',
    date: '2026-08-08',
    features: [
      'Swimming and biking now feed their own fatigue contribution into the same unified ceiling lifting and running already share, instead of being invisible to it — no re-syncing needed, this reads from Strava activity data already being received.',
      'Fixed a bug where the running recommendation (Today\'s Run, Training) never actually loaded for an account with real logged runs, due to an incorrect import.',
    ],
  },
  {
    version: '1.17',
    date: '2026-08-08',
    features: [
      'If fat loss is one of your goals, your running recommendation now weights toward steady Zone 2 aerobic work (60-70% HR reserve) rather than mixing in as much interval/tempo intensity — Zone 2 is the effort level most associated with fat oxidation as fuel, and the reasoning says so rather than just picking it silently.',
    ],
  },
  {
    version: '1.16',
    date: '2026-08-08',
    features: [
      'Morning briefings, the mid-day/evening updates, and the weekly review no longer mention or nag about sleep or nutrition data if you\'ve turned those categories off in Settings — previously they\'d flag "not logged" and prompt you to log food or sleep you never asked to track, every day.',
    ],
  },
  {
    version: '1.15',
    date: '2026-08-08',
    features: [
      'Tracking Level (onboarding step 5 and Settings) is now two independent checkboxes — Recovery and Nutrition — instead of a fixed three-preset choice. Training is always on. You can now pick combinations the old presets couldn\'t express, like Training + Nutrition without Recovery.',
    ],
  },
  {
    version: '1.14',
    date: '2026-08-08',
    features: [
      'Fixed the interactive walkthrough repeatedly showing for Sleep and every panel after it on mobile — swiping (not tapping) between sections could fire a section\'s tour for wherever the drag was passing through mid-gesture, before it was actually the one on screen, sometimes leaving it unable to show correctly on a later, genuine visit either.',
    ],
  },
  {
    version: '1.13',
    date: '2026-08-08',
    features: [
      'Goal-editor text fields (exercise name, benchmark, target) no longer invite the browser\'s autofill/strong-password suggestions — they were unmarked free-text inputs, which some mobile browsers guess are login or contact fields and overlay with irrelevant autofill UI.',
    ],
  },
  {
    version: '1.12',
    date: '2026-08-08',
    features: [
      'Timeline entries for sleep now show "7h 18m" instead of the raw decimal hour count (e.g. "7.3h" or, worse, "8.116666666666667h").',
      'Fixed the Recovery panel\'s Recovery/Resting HR readout exploding into a vertical stack of single characters on mobile — the "Avg Recent Load" tile next to it was hogging space it didn\'t need instead of sharing the row.',
      'Fixed the interactive walkthrough sometimes leaving the page stuck scrolled down afterward with no way back up on mobile — its step-target scrollIntoView() calls could set a hidden, unrecoverable scroll offset on the section carousel itself.',
    ],
  },
  {
    version: '1.11',
    date: '2026-08-08',
    features: [
      'Fixed the "Month" stat on Training wrapping its "sessions" label mid-word (e.g. "ses" / "sions" on two lines) when the Load tile pushed it into a narrower column.',
    ],
  },
  {
    version: '1.10',
    date: '2026-08-08',
    features: [
      'Muscle Focus (Onboarding step 7 and Settings) now defaults to a simplified 14-region list — e.g. one "Traps" pick instead of separately setting traps/lower-traps/mid-traps, Obliques folded into Abs, Gluteus Medius folded into Glutes, Erectors relabelled Lower Back. Hip Flexors has no row at all in this view and defaults to Avoid while hidden, since there\'s no single recognisable hip-flexor exercise to fold it into. A "Show scientific muscle names" checkbox reveals the full granular breakdown (Latissimus Dorsi, Trapezius, Erector Spinae, etc.) for anyone who wants it; nothing about what\'s actually stored or how the planner reads it changes either way.',
    ],
  },
  {
    version: '1.09',
    date: '2026-08-08',
    features: [
      'Fixed generated workouts occasionally piling extra sets onto every exercise at once: the working-set experiment (which cycles 2/3/4 sets per exercise over time to probe volume tolerance) now caps how many exercises in a single session can actually land on the higher end — at most 2, prioritized toward whichever trained muscle\'s recent strength trend is most stalled. A repeating exercise template previously could sync all its exercises onto "4 sets" the same session; now the rest stay at their normal 2.',
    ],
  },
  {
    version: '1.08',
    date: '2026-08-08',
    features: [
      'Error messages across the app (setup, mentor chat, profile/username saves, newscasts, comparisons, feed) now show the actual failure reason instead of a generic "Connection error — try again."',
    ],
  },
  {
    version: '1.07',
    date: '2026-08-08',
    features: [
      'Weekly guidance\'s lift/cardio session targets are no longer driven by a "Training Priority" strength/cardio/sport toggle — that setting is removed from Settings. They\'re now derived from your Training Days / Week plus your Activities\' priority tiers, so the split actually reflects what you said you train for.',
    ],
  },
  {
    version: '1.06',
    date: '2026-08-08',
    features: [
      'A day quick-marked busy from the Plan Ahead panel now also shows up in Settings → Plan Ahead — Holidays & Travel, with its own Remove button — previously it was only visible/clearable from the panel itself.',
    ],
  },
  {
    version: '1.05',
    date: '2026-08-08',
    features: [
      'Onboarding\'s Welcome screen now shows how to save Press to your home screen (Share → Add to Home Screen on iOS, the Chrome menu on Android), with instructions matched to your device — hidden automatically once you\'ve already installed it.',
    ],
  },
  {
    version: '1.04',
    date: '2026-08-07',
    features: [
      'A "Lose Fat" goal now actually changes your plan: the weekly guidance guarantees at least 2 cardio sessions regardless of your Training Priority setting, and the Cut macro auto-calculation sizes your calorie deficit to hit your goal\'s target by its target date (based on your real estimated maintenance calories) instead of a flat guess — falls back to a flat 15% deficit if the goal has no concrete target/date.',
    ],
  },
  {
    version: '1.03',
    date: '2026-08-07',
    features: [
      'Recovery Forecast (the per-muscle "ready again in ___" panel), Today\'s Limiting Factor, and the Weekly Volume Pace widget were silently broken for every account — all three depended on a weekly plan that only ever got created by an action nothing in the app actually triggered. Now generates automatically the first time it\'s needed.',
      '"Fatigue" renamed to "Recent Load" throughout Dispatch, Recovery, and Training — same number, clearer that it\'s measured against your own recent peak, not some absolute scale.',
      'Deload suggestions (Training → performance trend) could never actually fire — they required a fully unbroken 10-day stretch of poor recovery, and a single normal rest day reset the count to zero regardless of how bad the preceding stretch was. Now looks at a 14-day rolling average instead, so it can actually catch sustained overreaching.',
    ],
  },
  {
    version: '1.02',
    date: '2026-08-07',
    features: [
      'Plan Ahead panel: tap a day and pick a session length (30/45/60/90 min) just for that date, overriding the global max-duration default — useful for a day you know is going to be tight.',
    ],
  },
  {
    version: '1.01',
    date: '2026-08-07',
    features: [
      'Fixed a Plan Ahead bug where a window starting mid-week could chain two weeks\' worth of sessions into a run with zero rest days (e.g. every day showing a Full Body session) — the weekly session cap now also applies on a rolling trailing-7-day basis, not just per Monday-aligned week.',
      'Split-Day Anchors (Settings → Plan Ahead) now accept more than one day per bucket — e.g. Legs on both Monday and Thursday, instead of a single fixed day.',
      'Plan Ahead panel: tap a day, then "Mark Busy" to flag a one-off holiday or busy day directly from the calendar — the solver now rests that day, same as a Settings holiday window.',
    ],
  },
  {
    version: '1.00',
    date: '2026-08-07',
    features: [
      'Training now shows a "Load" number alongside Duration/Output/Month — a single 0-100 score for how hard your last session was, framed against your own recent average rather than an absolute scale.',
      'Added a "Form" line with a 30-day trend sparkline below that: a fitness/fatigue balance computed the way TrainingPeaks\' CTL/ATL/TSB model works, applied to the new Load number. If form stays deeply negative for 10+ straight days, it now says so and suggests a lighter week — a suggestion only, nothing gets changed in your plan automatically.',
      'The finish-workout screen now flags it when a muscle crosses into a new strength tier (e.g. Novice 2 → Novice 3) during that session — a "Rank Up" block above Atlas\' summary, one line per muscle with the tier it climbed from and to.',
    ],
  },
  {
    version: '0.99',
    date: '2026-08-07',
    features: [
      'The interactive walkthrough (previously Dispatch/Training/Recovery only) now covers every panel — Sleep, Nutrition, Body, Records, Goals, Social, Cycle, and Running — plus Settings itself, which spotlights its section index and Identity group the first time you open it. Same rules as before: shows once per surface, ever, skippable at any point, and "Replay Walkthrough" in Settings → Account resets and re-triggers all of them.',
      'Fixed the walkthrough losing track of its target on mobile: a forced restart (Replay Walkthrough) now swipes the phone carousel to the right section first instead of measuring a panel that\'s scrolled off to the side, and every step now scrolls itself into view on both mobile and desktop if a tall panel had put it below the fold.',
    ],
  },
  {
    version: '0.98',
    date: '2026-08-07',
    features: [
      'New Sport and Aerobic panels, alongside Cycling and Swimming — same daily readiness-based prescription, heart-rate zones and load tracking. Both share one computation off whatever Strava logs that isn\'t running/cycling/swimming (a five-a-side match, a hike, a Pilates class) since there\'s no principled way to tell those two activity choices apart from the raw data — picking both just gets you two panels reading the same session history.',
    ],
  },
  {
    version: '0.97',
    date: '2026-08-07',
    features: [
      'New Cycling and Swimming panels — same daily readiness-based prescription treatment as Running, only appearing for an account that listed that activity. Cycling gets its own real physiology model off actual Strava power-meter data where available: FTP detection, Coggan power zones, TSS-based load, and a power-based VO₂max estimate — not just a heart-rate approximation of the running engine. Falls back to heart-rate zones/TRIMP load when no power meter is present. Swimming uses heart-rate zones (with a lower max-HR allowance than land sports) and pace-per-100m, honestly — there\'s no power or pace-test equivalent for swimming to build a stronger estimate from.',
      'VO₂max now has a rough self-calculated fallback (from resting/max heart rate) for any account with neither a watch reading nor a pace/power test on record — Running, Cycling, and Swimming all benefit, not just accounts syncing to Apple Health.',
      'New Cardio Score in Personal Records — VO₂max\'s equivalent of the per-muscle strength ranking already there: a single Beginner→Elite tier scored against published age/sex VO₂max standards.',
    ],
  },
  {
    version: '0.96',
    date: '2026-08-07',
    features: [
      'Activities (Onboarding step 4 and Settings) replaced Hybrid/Team Sports/Endurance/CrossFit with Cycling/Swimming/Sport/Aerobic. The old four were just volume presets layered on the same Strength/Running numbers — confusing in a multi-select picker where a "hybrid" athlete already had Strength + Running as two separate entries. One choice per real weekly-target bucket (lifting/running/sports) now, no overlap.',
    ],
  },
  {
    version: '0.95',
    date: '2026-08-07',
    features: [
      'Cycle panel can now log a past period (pick a start and end date directly, instead of only "starting now") — same heaviness pick and calibration step as ending a period live, so history from before you started tracking can feed the recovery calibration too.',
      '"Log Period Start"/"End Period" replaced with Set Period Start Date/Set Period End Date — pick the actual day instead of only "right now", so a late log doesn\'t skew the calibration.',
      'New bubble tracker shows the current day of an open period at a glance, extended out to your own average logged period length.',
      'Cycle history is now a monthly calendar — logged periods marked solid, one predicted next-period window marked as an outline (still just the same average-cycle-length math, not a fertility model). Tap a logged day to see, edit, or remove that period.',
    ],
  },
  {
    version: '0.94',
    date: '2026-08-07',
    features: [
      'Strength Level ranking gets adductors back (removed by an earlier explicit request, since reversed) and, new, rhomboids and mid-traps — both were unrankable before since every real exercise that trains them shares the load with lats or rear-delt. They now score from an EMG-weighted blend of Seated Cable Row and Barbell Row (Overhand/Pendlay), weighted by each exercise\'s real published activation % for that muscle, using the same sourced strengthlevel.com bodyweight tables as every other ranked muscle. Lower-traps stays unranked — no real exercise credits it as more than an incidental stabilizer.',
    ],
  },
  {
    version: '0.93',
    date: '2026-08-07',
    features: [
      'Settings\' Macro Targets section is now two separately-navigable TOC entries — Calorie Target and Macro Split — matching that they\'re two independent controls now (still saved together with one button).',
      'Meal photo scan now has separate Take Photo / Upload Photo buttons — upload an already-taken photo instead of only shooting a new one',
      'Exact Calories now defaults to on (was nearest-300 rounding) — Settings still lets you switch back',
    ],
  },
  {
    version: '0.92',
    date: '2026-08-07',
    features: [
      'Macro Targets\' presets are now High Carb / Low Carb / High Protein instead of Cut/Maintain/Bulk — each just fills in a split ratio, same as dragging the sliders by hand. Calorie Target is its own explicit stepper now, separate from the split entirely, so picking a split preset never changes your calorie total.',
    ],
  },
  {
    version: '0.91',
    date: '2026-08-07',
    features: [
      'Settings\' Diet Goal picker is now Macro Targets — three presets (Cut/Maintain/Bulk, collapsed down from four labels that secretly computed only three different results) plus a new Custom option to redistribute the macro split (protein/carbs/fat) at your current calorie target, without changing the total.',
    ],
  },
  {
    version: '0.90',
    date: '2026-08-07',
    features: [
      'New Running panel — daily run readiness, session prescription, pace/HR zones and an 8-week VO₂max forecast, all previously computed server-side with nothing showing it. Only appears for an account with Running listed as an activity.',
      'Onboarding\'s Daily Targets step no longer asks for a diet goal (Lose Fat/Build Muscle/Maintain/Athletic Performance) — that lives in Settings instead. The step now also recommends a water target from your weight, activity level, and climate, still fully editable — the same calculator now lives in Settings\' Targets section too.',
    ],
  },
  {
    version: '0.89',
    date: '2026-08-07',
    features: [
      'Reverted the "return to Press automatically" behaviour on both Sync buttons (0.87) — the shortcuts://x-callback-url wrapper it relied on made the Shortcut itself fail to run for at least one real device, worse than the UX gap it was fixing. Both buttons are back to the plain shortcuts:// link that was confirmed working.',
    ],
  },
  {
    version: '0.88',
    date: '2026-08-07',
    features: [
      'The mobile header\'s Sync button now runs your own device\'s Shortcut (once picked in Settings\' Apple Health guide) instead of the old generic name every device shared — same fix as Settings\' guide link, now everywhere Sync appears.',
    ],
  },
  {
    version: '0.87',
    date: '2026-08-07',
    features: [
      'Both Sync buttons (Settings\' per-device guide and the mobile header) now bring you straight back to Press once the Shortcut finishes, instead of leaving you sitting in the Shortcuts app — via x-success on the shortcuts:// callback.',
    ],
  },
  {
    version: '0.86',
    date: '2026-08-07',
    features: [
      'Settings\' Apple Health setup guide now has a device picker (Apple Watch generation, Whoop, or Oura) that links straight to the Shortcut built for that device, instead of one Shortcut everyone has to hand-edit. Device-specific links are rolling out — picking one not yet published tells you so instead of a dead link.',
      'The guide\'s own "Sync Now" link runs the exact Shortcut for your picked device (pressnewsletter-<device>) directly, alongside the app\'s existing generic Sync button.',
    ],
  },
  {
    version: '0.85',
    date: '2026-08-07',
    features: [
      'Apple Health setup guide now covers Blood Oxygen and Wrist Temperature per device (Apple Watch generations, Whoop, Oura) instead of one blanket "delete if unsupported" note — including the Oura gotcha where its temperature lands in Health as "Body Temperature", not "Wrist Temperature".',
    ],
  },
  {
    version: '0.84',
    date: '2026-08-07',
    features: [
      'Added a Sync button, top-right corner on mobile only, next to Settings: launches your Apple Health Shortcut directly from the app and refreshes the dashboard a few seconds later so new data shows up without switching apps yourself.',
    ],
  },
  {
    version: '0.83',
    date: '2026-08-06',
    features: [
      'Cycle-Aware Recovery (opt-in, Settings → Profile & Training): manually log when a period starts and ends, pick a starting estimate for how much it affects training capacity, and Press quietly extends recovery time during menstruation and shortens it again around the midpoint — plus a small RIR nudge on freestyle-logged sets. That estimate isn\'t static: it refines itself over time from how training actually went during each logged period, gently, one cycle at a time. A new Cycle panel holds the log and history; nothing changes until you turn it on and log at least one period.',
    ],
  },
  {
    version: '0.82',
    date: '2026-08-06',
    features: [
      'The Goals panel itself now has an Edit button — add, drop, re-rank, or re-target a training goal directly from the panel, the same fields as Onboarding and Settings\' Training Goals editor, no detour required.',
      'Fixed the right-hand section-nav dots on desktop: the freeform drag/resize grid can put several sections on screen at once in different columns, and the dots were toggling every one of them active independently instead of tracking a single "you are here" — only the most-visible section\'s dot lights up now.',
    ],
  },
  {
    version: '0.81',
    date: '2026-08-06',
    features: [
      '"Restart Setup" (Settings → Account) now prefills every step from your existing data — name, body stats, training goals, activities, diet goal, targets, training background, muscle focus, even whether Strava\'s already connected — instead of handing you a blank form to redo from scratch. A genuinely new account still starts blank; this only changes what a repeat run of setup looks like.',
    ],
  },
  {
    version: '0.80',
    date: '2026-08-06',
    features: [
      'Lose Fat now has real deficit limits. Your fat-loss calorie target is checked against an estimated maintenance calorie figure (from bodyweight, height, age, sex, and training frequency) — over a 20% deficit shows a warning, over 30% is a hard limit and gets capped there automatically, since sustained deficits past that aren\'t attainable. Shown in both Onboarding and Settings\' Diet Goal picker.',
    ],
  },
  {
    version: '0.79',
    date: '2026-08-06',
    features: [
      'Settings is now a wiki-style page instead of a stack of accordions: a left table of contents lists every group and section and jumps straight to it, while the body stays one continuous document you can still just scroll through by hand — nothing collapses or hides content anymore. The TOC tracks your position as you scroll and highlights the section you\'re currently reading. On phone, the sidebar becomes a horizontal scrollable strip of section names pinned above the content.',
    ],
  },
  {
    version: '0.78',
    date: '2026-08-06',
    features: [
      'Settings → Profile & Training overhauled: the old "Profile" section — 25+ unrelated fields in one flat list — is now nine focused sub-sections (Identity, Training Goals, Activities, Diet Goal, Tracking Level, Training Preferences, Training Background, Appearance, Personal Journalist Memory) in roughly the same order as Onboarding.',
      'Training Goals and Activities — set once during Onboarding with no way back to them — now have real editors in Settings, matching the same picker Onboarding uses. The Goals panel\'s "add some from Settings" pointer now actually leads somewhere.',
      'Diet Goal in Settings now matches Onboarding\'s wording exactly (Lose Fat / Build Muscle / Maintain / Athletic Performance) and actually saves your goal, not just the derived macro mode — previously it showed different labels (cut/recomp/bulk) and never wrote the field the Personal Journalist reads your goal from, so that context stayed frozen at whatever Onboarding set, forever.',
      'Settings\' Experience Level was missing the third Onboarding option, "Returning after a break," and its accompanying break-length question — both now present, so switching to it here seeds a starting atrophy estimate the same way Onboarding does.',
    ],
  },
  {
    version: '0.77',
    date: '2026-08-06',
    features: [
      'Fixed the dashboard headline clipping into the ticker bar on desktop — the grid was using padding to clear the fixed header, which absolutely-positioned panels ignore; switched to margin so it actually pushes them down.',
    ],
  },
  {
    version: '0.76',
    date: '2026-08-05',
    features: [
      'Fixed the dashboard and Settings scrolling sideways on narrow phone screens — several grids (stat readouts, soreness picker, onboarding goal cards, the weekly calendar strip, briefing stats) could get pushed wider than the screen by a single long number, muscle name, or split label instead of wrapping.',
      'Added Social, a new front-page section: follow requests and username search — previously only in Settings → Social, which still works too — plus muscle comparison, now reachable directly from the front page instead of only after opening a profile via Settings.',
      'New activity feed on that section shows recent sessions from people you follow, one line each (who, what, when — no likes or streaks). It\'s a separate opt-in from "workout sessions visible to followers" and stays off by default even if that one is already on — turn it on in Settings → Social → Visibility to include your own sessions in it.',
      'Mobile section navigation is now swipeable: drag left or right to move to the next or previous section (Dispatch, Sleep, Training, Nutrition, Recovery, Body, Records, Goals), with a smooth slide between them. The dock still jumps straight to any section by tapping — both stay in sync, and the slide becomes an instant jump if you have reduced motion turned on.',
      'Onboarding cleanup. The Diet & Daily Targets step no longer blocks Continue until you pick a primary diet goal — it was the only onboarding step that couldn\'t be skipped, contradicting every other step\'s "leave it blank, fill it in later" behaviour. Its heading was also renamed from the generic "Your Goals" (too easily confused with the training-goals step right before it) to "Diet & Daily Targets", with copy that says outright it\'s a separate question from what you\'re training for.',
      'The Training Background step no longer asks a brand-new lifter for their "usual" split, working sets, and rep range — those presuppose a habit that doesn\'t exist yet. They\'re now behind a "set one anyway" toggle for anyone who picked "New to training", and still asked directly for everyone else.',
      'Fixed a couple of small copy bugs found in the same pass: Connect Services referred to a "Profile page" that doesn\'t exist in the app (now says Settings, matching everywhere else); the Hevy API Key button showed the same label whether it was open or closed instead of toggling to "Hide"; the completion screen\'s sleep/water/training-days summary line was tied to whether a diet goal had been picked even though those targets always save with sensible defaults regardless.',
      'Added an interactive walkthrough: Dispatch, Training, and Recovery now spotlight their controls with a short explanation the first time you actually visit each section — never again automatically after that. Skippable at any point (an explicit Skip control, a close button, or Escape), fully keyboard-operable, and honours reduced-motion (no animated spotlight movement — it just appears). "Replay Walkthrough" in Settings → Account resets and re-triggers it if you want to see it again.',
    ],
  },
  {
    version: '0.75',
    date: '2026-08-05',
    features: [
      'The Weekly Review is now a structured brief, not just a Gemini narrative. New fixed sections above the write-up: Goal Check (progress toward every concrete training goal you\'ve set, including a "at this rate you\'ll hit it by ___" projection from your last 4 weeks of data), What\'s Working / Needs Attention (this week vs last week across sessions, volume, recovery, sleep, nutrition logging, and PRs), and Fatigue Trend (your 14-day recovery trend plus what\'s driving it — most-fatigued muscles, CNS and metabolic load).',
    ],
  },
  {
    version: '0.74',
    date: '2026-08-05',
    features: [
      'Favorite exercises are now a real ranked order, not just a list. Finish a workout that shares a primary muscle with something you\'ve logged before, and you\'ll sometimes see a quick "which do you prefer?" prompt — answer it or skip it, it\'s never blocking. Skipped comparisons (and exercises you haven\'t been asked about yet) still nudge the ranking a little from how often you actually train each one and whether your numbers are climbing on it, so the order reflects real training, not just what got typed into a box once.',
      'Settings → Profile & Training\'s favorites list now shows that ranked order (Scientist mode also shows the underlying rating and comparison count) instead of an unordered pile — adding/removing favorites still works exactly as before underneath.',
      'A first bulk history import now seeds the ranking from that history\'s own frequency, so it starts somewhere sensible instead of blank.',
    ],
  },
  {
    version: '0.73',
    date: '2026-08-05',
    features: [
      'Added Plan Ahead: a 7/30-day forward calendar (Home → toggle Week/Month) that solves each day\'s actual recommended session from real fatigue, not just a readiness colour. Tap a day to see it; today\'s day still starts your session, logs freestyle, or opens Other Ways/Train A Muscle exactly as before. Replaces the old "This Week\'s Guidance" advisory block.',
      'The calendar is fully optimal to your goal by default. Settings → Profile & Training now has constraints to layer on top: recurring days off, an allow-list of training days, one-off holiday/travel windows (rest, bodyweight-only, or restricted-equipment), a weekly session-count target (auto or manual), and a soft day-of-week split anchor (e.g. "Legs on Friday") — honored when fresh, otherwise the calendar falls back and shows the conflict rather than forcing a fatigued muscle through.',
      'Removed the "What If?" sandbox tool — superseded by the calendar, which now previews a session\'s actual effect before you commit to it.',
    ],
  },
  {
    version: '0.72',
    date: '2026-08-05',
    features: [
      'Replaced the desktop dashboard\'s auto-packed panel grid with a freeform drag-and-resize one: turn on "Rearrange Panels" (Settings → Dashboard Layout) and drag any panel or micro-widget to reposition it, or drag a corner to resize — everything else auto-compacts around it so there\'s never empty space. Positions save automatically and are remembered separately per column count.',
      'Added a Columns setting (Settings → Dashboard Layout): Auto tracks your window width (1-4 columns), or pick a fixed count so panels resize in pixels instead of the column count changing as you resize the window.',
      'The three layout presets (Review, Dense, Retrospective) now also reset the freeform grid to a fresh auto-packed layout in the new order, and include the Goals panel (previously missing from Review/Retrospective\'s order).',
    ],
  },
  {
    version: '0.71',
    date: '2026-08-04',
    features: [
      'Onboarding\'s Goals step is now a real multi-goal picker: pick any of Lose Fat, Gain Muscle/Strength, Improve Cardiovascular Health, Improve Flexibility, or Improve in a Sport, rank each Primary/Secondary/Minor, and optionally set a concrete target and date (bodyweight, body-fat %, a specific lift, Fat-Free Mass, FFMI, resting heart rate, a benchmark time, or VO₂max) — or leave it open-ended. A new Goals panel shows current-vs-target for anything trackable, and a plain trend or tag for the rest.',
      'Added an Activities step to onboarding — pick from Strength, Running, Hybrid, Team Sports, Endurance, CrossFit, or Other, each ranked Primary/Secondary/Minor, replacing the old single primary/secondary activity pair. Weekly session and volume defaults now blend across every activity you pick, weighted by rank, instead of only ever reading one "primary" activity.',
      'Sleep, water, and training-days targets on the Daily Targets step now start from a suggestion based on your training goals (still fully editable) instead of a flat 8h/7 glasses/4 days for everyone.',
      'Added a third onboarding experience option, "Returning after a break" — asks how long the break was and seeds a conservative starting-point estimate for detraining, automatically replaced by a measured one the moment there\'s real logged history (or an imported one) with an actual gap in it.',
    ],
  },
  {
    version: '0.70',
    date: '2026-08-04',
    features: [
      'Dashboard panels now span a real default width on wide screens instead of every panel being one fixed column — Dispatch and Recovery carry more content, so they default to two columns wide once there\'s room (1380px+), three at the widest tier (1800px+). The zero-gap packing this dashboard has always used is unchanged; wide panels just pack into it.',
      'Added 9 small "micro-widget" cards that fill whatever gaps are left over: Hydration Ring, Resting Heart Rate, Training Streak, Steps, an AI Coaching Insight line, Optimal Training Window, Today\'s Muscle Focus, 7-day Body Weight Delta, and Weekly Volume Pace. All optional — Settings → Dashboard Layout → Micro-Widgets to reorder or hide them. Desktop only.',
      'Optimal Training Window is grounded in your actual wake time (from synced Apple Health sleep data), not a generic clock time — peak physical performance tracks the circadian core-temperature rhythm, roughly 10-12h after waking. Shows a message instead of a guess if sleep data isn\'t synced yet.',
      'Added one-click desktop layout presets in Settings → Dashboard Layout: Review (Dispatch/Training/Recovery wide and first), Dense (every panel collapsed to its headline — the most panels visible at once), and Retrospective (Sleep/Nutrition/Body/Records wide and first). Training now also gets the wide-panel treatment Dispatch and Recovery already had.',
    ],
  },
  {
    version: '0.69',
    date: '2026-08-04',
    features: [
      'The adaptation model (Recovery → Adaptation tab) now runs two overlapping recovery phases instead of one — a fast, smaller inflammatory-resolution response peaking around 12 hours, and a slower, larger tissue-remodeling response peaking around 48 hours, combining to a true peak around 45 hours instead of exactly 48. The projected-peak numbers and the chart\'s peak marker move with it.',
      'Secondary-muscle credit in the adaptation model is no longer a flat half-credit for every assisting muscle on every exercise — where EMG data exists for the exercise, it now credits each assisting muscle by how hard it actually works relative to the prime mover. A Chest Dip, for instance, genuinely hits triceps harder than chest, which a flat rule couldn\'t reflect either way.',
      'ACWR (the acute:chronic workload ratio behind part of the Metabolic fatigue score) now uses an exponentially-weighted running average instead of a 7-day-sum vs. 28-day-average window — a lift no longer disappears from your "acute" load the instant it turns 8 days old, which used to produce a same-size overnight jump with no physiological basis.',
      'Backbone exercise selection now weights real EMG data over primary-muscle array position where that data exists, fixing the same "over-broad exercise wins for touching more muscles, not training any of them particularly well" bias its predecessor was built to catch — just with real numbers behind it instead of a proxy.',
    ],
  },
  {
    version: '0.68',
    date: '2026-08-04',
    features: [
      'Movement pattern fatigue now has somewhere to live. Recovery gained a Patterns tab (Sport Scientist level, alongside Types and Adaptation) showing residual fatigue by pressing/hinging/rowing/squatting/etc., not just by muscle — the tracking shipped in 0.67 with nothing rendering it; now it does.',
      'Added a Timeline: a teaser under Dispatch opens a full chronological view of workouts, lifts, sleep, injuries, soreness logs and thoughts, newest first.',
      'The CNS-sparing exercise swap (the one that trades a barbell compound for a machine/cable alternative when CNS fatigue is high) now ranks candidates by actual EMG stimulus similarity where the data exists, instead of just counting how many primary-muscle names two exercises happen to share.',
      'The Recovery fatigue heatmap now carries a hoverable, screen-reader-readable label per muscle ("Quads: 62% (moderate)") alongside its colour fill, so the fatigue band no longer depends on being able to tell gold from ember by hue alone.',
      'Fixed stale copy on the Muscle Focus control (onboarding and Settings): it still described the old Focus/Ignore/Normal options after they were renamed to Priority/Maintain/Lower/Avoid, and never mentioned Lower at all.',
    ],
  },
  {
    version: '0.67',
    date: '2026-08-03',
    features: [
      'Recovery Forecast no longer under-reports how long a hammered muscle takes to come back. Fatigue is shown as a percentage of your own peak load and displayed capped at 100, but the real figure can go well past that — three ab exercises in one session can put abs at more than double their peak. The forecast was counting down from the capped 100 rather than the real number, so a muscle at 250% and one at 110% were both told to be ready at the same hour, and the earlier of the two was wrong. It now decays from the true figure. Muscles you have genuinely buried will report longer waits than before; that is the correction, not a change to the model. The percentage still displays capped and still carries its * to say so.',
      'Movement patterns are now tracked alongside muscles. Press records volume and residual fatigue by what you did — pressing, hinging, rowing, squatting — not only by which muscles it loaded. Muscle fatigue tells you the chest is cooked; pattern fatigue tells you horizontal pressing is cooked, which is the thing that decides whether swapping dumbbell bench for barbell bench actually buys you anything. Nothing displays it yet.',
    ],
  },
  {
    version: '0.66',
    date: '2026-08-02',
    features: [
      'Train A Muscle now covers the whole body. It was only ever sweeping the seven movement families that have an angle slider, so it silently offered no quads, abs, obliques, calves, traps, forearms, adductors, abductors, hip-flexors or rotator-cuff \u2014 most of the lower body and all of the core. The data was never missing; the exercise database has covered squats, leg presses and the rest all along, and the search just never looked there. It now ranks fixed exercises alongside angle configurations using the same score, so 28 muscles are selectable instead of 17. A fixed exercise names itself rather than reporting an angle it does not have.',
      'Tidied the Training panel\'s button row. It had grown to eight identical boxes mixing three different kinds of control — ones that start a session and leave the screen, ones that just expand a panel below, and utilities — so nothing indicated which was the thing to press. Start Session, Freestyle and Group Session stay as buttons; Other Ways, What If and Train A Muscle become text toggles under a rule, marked + when closed and − when open. They no longer relabel themselves to "Hide …", which was making the whole row jump about every time you opened one. Add to Calendar, Refresh Guidance and Auto-Pick Freshest sit together at the right as utilities. Nothing was removed and nothing behaves differently.',
      'Fixed: Add to Calendar has never worked. It threw an error the moment you pressed it, on every browser, since the day it shipped — the line-folding step used a facility that exists on the server but not in a browser, so no .ics file was ever produced. The whole backend test suite passed throughout, because those tests run on the server where that facility does exist. Now uses a method available in both, and produces byte-identical output. A new check fails the build if any server-only facility reaches the browser bundle again.',
    ],
  },
  {
    version: '0.65',
    date: '2026-08-02',
    features: [
      'New What If button next to Other Ways (Intermediate and above). Switch exercises off, add or drop sets, and see what today\'s session would actually do to you before committing — fatigue per muscle before and after, which muscles it pushes over the ceiling and therefore out of tomorrow\'s selection, and how much longer everything takes to come back. It is not a prediction: the candidate session is turned into the same lift rows the logger would write, appended to a copy of your history, and the same fatigue functions the Recovery panel already shows are re-run over it. So these are the numbers you will actually see tomorrow, and you can check them. There is no predicted strength or stimulus change, because Press has still never compared a prediction of that kind against an outcome.',
      'New Train A Muscle button: pick one or more muscles and get the movement and angle that hit them hardest given what you have already spent. Ranked on real activation against your current fatigue, so a position that would normally win can lose to a slightly weaker one whose synergists are fresh — and when that happens it says which movement it ranked above and why. The fatigue weighting is a training preference rather than a measurement, and is labelled as one.',
      'The Build Press/Row angle picker gains two more sliders where the data supports them: elbow flare and grip rotation. Each reads its own EMG table and is shown separately rather than being folded into the angle, because nothing measured them in combination. Grip rotation disappears entirely on fixed-handle machines, which do not offer a choice, and a slider that barely moves your target muscle says so instead of pointing at a setting that changes nothing.',
      'The muscle bars under the sliders can now show a second bar: the fatigue that position would actually cost each muscle, alongside how hard it works it. They are kept as two bars in two units on purpose — a muscle can be worked hard and cost little, or barely worked and be expensive because it is nearly spent, and that is the trade-off worth seeing.',
      'Today\'s Limiting Factor now explains itself at whichever detail level you are on, rather than showing the same sentence to everyone, and Training re-ranks it against the session actually generated — spent lats matter before a pull session and not before a leg session. The factor, its severity and its ranking are identical at every detail level; only the wording changes.',
    ],
  },
  {
    version: '0.64',
    date: '2026-08-02',
    features: [
      'New Other Ways button next to Add to Calendar. It rebuilds today\'s session three more times under one changed constraint each — a 30-minute version, a machine-and-cable version that spares the nervous system, and a bodyweight-only version — and states what each one costs. Every trade-off is a measured difference between two sessions that were actually generated: minutes, working sets, and which muscles lose their dedicated exercise. There are no predicted-stimulus percentages, because Press has never checked a prediction against an outcome. Alternatives that come out identical to the recommended session are dropped rather than offered as a choice that changes nothing, so an empty result means today genuinely has one sensible shape. Starting an alternative uses its own exercise list, so a short session stays short rather than being refilled by the Max Length slider.',
      'Fixed: opening Press in a background browser tab could leave the desktop panels overlapping each other until the window was resized. Repacking was queued on an animation frame, which a hidden tab never runs, and switching to the tab did not trigger a new one.',
      'New What\'s Driving Recovery block in the Recovery panel (Intermediate and above). The recovery score has always been a weighted sum of six things — heart rate variability, sleep, resting heart rate, wrist temperature, blood oxygen and heart rate — and this now shows what each one actually contributed, in points of the final score, ranked by how much it is costing you rather than by how heavily it is weighted. A factor with no reading today is drawn hatched and labelled: the score substitutes a default for a missing sensor, and showing that as a measurement would credit points to data that was never collected. Worth knowing what it revealed: heart rate variability at your own baseline earns half of the 40 points it can contribute, and full marks need about 1.5x baseline, so it will usually rank first. That is how the score has always worked; nothing about it was changed here.',
    ],
  },
  {
    version: '0.63',
    date: '2026-08-01',
    features: [
      'The desktop dashboard now packs its panels like a masonry grid instead of balanced newspaper columns. Previously every column was forced to one shared height and a panel could not be split, so any panel too tall for the space left in its column jumped to the next one and left a large empty block behind it — most visibly under Recovery on a four-column screen. Panels now drop into whichever column is shortest, so there is no gap between stacked panels at any width.',
      'Dashboard panels can be collapsed to just their headline with the − control in the top-right corner, and set to Collapsed, Standard or Wide (double-width) per panel in Settings → Dashboard Layout. Collapsing the long ones — All-Time Bests in particular — is what reclaims the leftover space at the foot of the shorter columns. Both are desktop-only; the phone dock already shows one section at a time.',
      'Workouts now record the time they happened, not just the date. Fatigue is calculated from when the work was actually done, so an evening session no longer reads as though it happened at midnight — which was understating same-day fatigue by roughly 15-25 points and quietly making a second session that day look more advisable than it was. This flows through everything downstream: structural and CNS decay, days-since-trained, and the recovery forecast. Applies to new sessions and to future Hevy imports, which carry their own real start times; existing history keeps its old date-only anchoring rather than being rewritten with guesses. A session logged for a past date is deliberately left un-stamped, since "now" would be actively wrong for it, and the in-app timer is ignored past six hours so a session left running overnight can not place the work before you woke up.',
      'New Add to Calendar button next to Start Session. Exports the session currently on screen as a standard .ics file — the exercise list with its set scheme, plus the reasoning behind the pick — which opens straight into Apple Calendar and imports into Google or Outlook. It schedules for the next full hour today as a placeholder you can drag: the app has no idea when you actually train, and inferring a time from your history would be inventing a preference you never stated. Re-exporting the same day and muscle group updates the same event rather than stacking duplicates.',
      'Muscle priorities gained a fourth setting. "Ignore" was doing two incompatible jobs, so it is now Lower and Avoid. Lower keeps the muscle fully modelled — it still accumulates fatigue from compounds, still recovers, still appears in Recovery — and only reduces how often it is picked for direct work. Avoid removes it from selection outright, which is right for an injury or a medical restriction and wrong for "I do not care much about calves". The other two are relabelled Priority and Maintain. Nothing was migrated: anything you had set to Ignore is still Avoid, so if you meant "just deprioritise this", move it to Lower.',
      'New Recovery Forecast (Recovery panel, Intermediate and above): when each muscle drops back below the training ceiling, and when CNS fatigue clears enough for heavy barbell compounds again. It is an exact inversion of the decay the app already runs rather than a new model, so it is as good as that model and no better — it says so, along with the two things that limit it: it assumes you do not train again, and a muscle pinned at the 100 cap may be well above it, making its figure a floor rather than an estimate.',
      'The Build Press/Row/… angle picker is now a slider instead of 13 buttons. Sweeping it updates a live muscle-activation readout underneath, so you can compare positions before committing rather than picking blind and backing out. Optionally pick a target muscle first: the slider then marks that muscle\'s best angle, and the confirm step tells you how far your choice sits from it — stated as an EMG activation difference against that muscle\'s own peak, which is what the data supports, not a predicted strength or growth difference. It never stops you choosing any angle. The bars are drawn against each muscle\'s own peak activation and deliberately don\'t total 100%, because these are per-muscle activation levels rather than shares of the exercise.',
      'Dispatch now leads with Today\'s Limiting Factor — the single biggest thing constraining today\'s session, whether that\'s CNS fatigue, a muscle over the fatigue ceiling, an injury flag, metabolic fatigue, recovery markers below baseline or short sleep. Each one names what it is, what the app is actually doing about it (swapping barbell compounds for machines, capping the week at 2 sessions, capping working sets at 2 per exercise) and what clears it. Nothing is reported unless it has genuinely crossed a threshold the planner acts on, so an empty state means exactly that: nothing is holding you back today.',
      'Generated sessions now mark which exercise drives the session. The backbone lift is tagged Primary and everything else Secondary or Isolation, taken from the planner\'s own selection rather than guessed from the name. At Beginner only the main lift is tagged, since that\'s the part you can act on.',
      'The default home-screen order is now recommendation-first — Dispatch, Training, Recovery, then sleep, nutrition, body and records. Only affects accounts that have never reordered their panels; a saved order still wins.',
      'The weekly guidance now explains itself. A "Why This" block under the muscle-group chips gives the reason the top group was picked, which groups lost and by how much, and how confident the pick is. Tapping a group other than the recommended one shows what that choice actually trades — which muscles you\'d train instead, and which of them can\'t be loaded today because they\'re over the fatigue ceiling or flagged as injured. It never blocks the choice. Detail Level controls the depth: a single sentence at Beginner, the full reasoning at Intermediate, and the term-by-term score arithmetic (recovered + overdue + priority bonus) at Sport Scientist. Confidence is reported as a level with named causes rather than a percentage — Press has never checked a prediction against an outcome, so a number would be invented.',
      'New Detail Level setting (Settings → Profile & Training): Beginner, Intermediate or Sport Scientist. It changes only how much of the model is shown — the planner, fatigue maths and exercise selection are untouched, so today\'s recommendation is identical whichever you pick. Beginner states recovery in words (Fresh/Recovering/Limited/Fatigued) with a sentence explaining the pick, and hides the Ranking, Types and Adaptation tabs; Intermediate restores the percentages and ranking; Sport Scientist adds the structural/metabolic/CNS split and adaptation estimates. Existing accounts default to Sport Scientist, so nothing is hidden unless you choose to hide it. Soreness and Injuries stay visible at every level — that\'s data going in, not analysis coming out.',
    ],
  },
  {
    version: '0.62',
    date: '2026-07-30',
    features: [
      'Build Press/Row/Fly/... now also builds Leg Curl (0°=lying/prone through 180°=seated, hip position shifting stretch on the biarticular hamstrings) and Hyperextension. Hyperextension is a deliberate exception to the usual 0-180° picker — only 2 real device types exist for this movement (a 45° bench and a 90° Roman chair), so it\'s a 2-button choice instead of a fabricated continuous range, with the angle keyed directly to the real pad angle.',
    ],
  },
  {
    version: '0.61',
    date: '2026-07-30',
    features: [
      'Build Press/Row/Fly now also builds Curl and Extension: pick a pattern, equipment, and an EMG-backed angle (curl: 0°=incline curl through 180°=preacher curl, shifting emphasis between biceps and brachialis; extension: 0°=pushdown/lying through 180°=overhead, shifting emphasis toward the long head of triceps and adding real shoulder demand). Extension also shows an informational long/lateral/medial triceps-head breakdown for the chosen angle — same idea as fly\'s chest split, purely informational, your tracked \'triceps\' number stays one comparable value everywhere else. Auto-generated sessions can recommend these too, same as Press/Row/Fly.',
    ],
  },
  {
    version: '0.60',
    date: '2026-07-30',
    features: [
      'Press/Row/Fly built via Build Press/Row/Fly now share one exercise identity per pattern+equipment (e.g. every "Cable Fly" you build, at any angle, is one tracked exercise with one logged history) instead of a separate identity per angle — angle is a per-set attribute now, shown next to each logged set and factored precisely into fatigue crediting and weight-suggestion math for that exact angle, same as before. Brand rides along on the exercise\'s machine/brand field instead of the name.',
      'Auto-generated sessions can now recommend one of these angle-built exercises directly (e.g. "Cable Fly @ 165° (recommended)") when it\'s genuinely the best way to hit a target muscle — shown in the session preview and, once added to a workout, pre-loaded with the correct angle and weighted muscle profile already attached.',
    ],
  },
  {
    version: '0.59',
    date: '2026-07-30',
    features: [
      'Build Press/Row now also builds Fly: pick Fly, equipment (dumbbell/cable/machine — no barbell fly), and an EMG-backed angle (0° = a high-to-low cable fly finishing near your hips, through 90° = flat/mid fly, to 180° = a low-to-high fly finishing raised near overhead), and it becomes its own tracked exercise like any Press/Row builder result. Also shows an informational lower/mid/upper pec breakdown for the chosen angle — same idea as the existing per-exercise chest split, but on fly\'s own arm-to-torso-angle axis rather than bench incline, and purely informational: your tracked \'chest\' number stays one comparable value everywhere else.',
    ],
  },
  {
    version: '0.58',
    date: '2026-07-29',
    features: [
      'Added gym equipment presets: starting a workout now silently checks your location against a shared directory of gyms and offers "At [Gym] · change" if it finds one nearby, or "+ Set Gym" to search/add one yourself. With a gym active, the Machine/Brand dropdown shows that gym\'s known brands first (under "In your gym"), and a new Model field lets you tag the exact named machine (e.g. "Life Fitness — Insignia Series Leg Press") — researched against real manufacturer product lines for 29 brands. Whatever you pick while a gym is active saves back to it automatically, so the next person (or you, next visit) sees it prefilled.',
    ],
  },
  {
    version: '0.57',
    date: '2026-07-29',
    features: [
      'Group Session no longer opens as a separate page — it\'s now a small tab strip right in the normal workout logger. "You" is just your regular logging screen, unchanged; tapping someone else\'s name (or the new Refresh link) pulls the latest and shows their sets inline, still editable, using the exact same exercise search/browser as solo logging when adding something for the whole group. Also fixed: exercises with a weight/reps typed in (not yet checked off) now actually reach the shared session — previously only checked-off sets did.',
    ],
  },
  {
    version: '0.56',
    date: '2026-07-28',
    features: [
      'Added Group Session (Training tab): start one to get a 4-character join code, or join with someone else\'s — up to 4 people, each logging their own sets while seeing everyone else\'s. Any exercise already logged in your current workout merges in the moment you connect. Sets can be edited or deleted by anyone in the session while it\'s active; a participant\'s data locks and disappears from the others\' view the moment they finish or leave. Finishing tags the saved workout with who else was in it. A stalled participant (an hour with no activity) gets auto-finished so the session doesn\'t hang open indefinitely.',
    ],
  },
  {
    version: '0.55',
    date: '2026-07-28',
    features: [
      'Added a Compare feature to profiles you mutually follow (both accounts need the comparison visibility toggle on, in Settings): a per-muscle strength-score comparison and a training-stimulus comparison over a 7/14/30-day window, each shown as two side-by-side body diagrams plus a table.',
    ],
  },
  {
    version: '0.54',
    date: '2026-07-28',
    features: [
      'Added a Social section in Settings: search for other accounts by username, send/accept follow requests (a badge on the Settings button shows pending requests and any that were just accepted), and a profile view for people you find — minimal for accounts you don\'t follow yet, workout sessions visible once they accept your follow request and have that category toggled on. New per-category visibility toggles (workout sessions on by default, strength/stimulus comparison off by default) control what a follower can see.',
    ],
  },
  {
    version: '0.53',
    date: '2026-07-28',
    features: [
      'Every account now needs a username — a mandatory (but pre-filled, low-friction) step on first login, and retroactively for existing accounts too. Separate from a freeform display name, of which only the first name is ever shown to anyone else. Both are editable later from Settings; username changes are limited to once a month, display name has no limit.',
    ],
  },
  {
    version: '0.52',
    date: '2026-07-28',
    features: [
      'Shrugs now have curated weighted EMG fatigue profiles — a dedicated scapular-elevation dataset covering upper traps, mid-traps, rhomboids, and forearm/grip demand across the full range of motion. 207 of 211 exercises now curated; Tibialis Raise (Wall Sit) is the only one left on flat credit, since no dorsiflexion EMG literature exists to curate it from.',
    ],
  },
  {
    version: '0.51',
    date: '2026-07-28',
    features: [
      'Removed Farmer\'s Carry, Suitcase Carry, Goblet Carry, and Tibialis Raise (ATG Sled Push) from the exercise list — no EMG literature covers isometric loaded-carry bracing or sled-push dorsiflexion, so they had no honest path to weighted fatigue crediting.',
    ],
  },
  {
    version: '0.50',
    date: '2026-07-28',
    features: [
      'Added Kelso Shrug (Low/Mid/High Pulley) as new exercises — bent-over, straight-arm scapular retraction, targeting mid-traps/rhomboids rather than a vertical shrug\'s upper-trap elevation. Curated EMG fatigue weighting from the same pull-angle data as the rest of the row family, so the mid-traps/rhomboid-vs-lat/rear-delt ratio genuinely shifts across the three pulley heights.',
    ],
  },
  {
    version: '0.49',
    date: '2026-07-28',
    features: [
      'Curated EMG fatigue profiles now cover chest flys, pullovers, face pulls, upright rows, hammer curls, and close-grip/diamond triceps-emphasis presses too (201 of 212 exercises now curated) — each honestly flagged in code for exactly what it does and doesn\'t capture versus the ideal data. Loaded carries, shrugs, and tibialis raises are the only 8 left on flat crediting, since no literature axis exists for those mechanisms at all.',
    ],
  },
  {
    version: '0.48',
    date: '2026-07-28',
    features: [
      'Weighted EMG fatigue attribution now also covers bench/overhead press variants (flat, incline, decline) and the rest of the row family (bent-over, T-bar, cable, machine, wide-grip) — 183 of 212 exercises now have a curated profile instead of flat credit. Exercises with no honest single-axis fit (chest flys, pullovers, shrugs, loaded carries, close-grip/diamond triceps-emphasis presses, hammer curls, face pulls, tibialis raises, leg raises) are deliberately left uncurated rather than forced onto data that would misrepresent them.',
    ],
  },
  {
    version: '0.47',
    date: '2026-07-28',
    features: [
      'Weighted EMG fatigue attribution now covers 140+ exercises across squats, hinges, lunges, curls, extensions, hip abduction/adduction, calves, core anti-extension/anti-rotation, rotator cuff, lateral raises, pulldowns/pull-ups, dips, and more — not just Build Press/Row exercises. Each credits the muscles it actually trains at literature-backed percentages instead of flat full credit, so fatigue and "days since trained" better reflect a lift\'s real emphasis (e.g. a Leg Press crediting quads less than a Zercher Squat, or a pulldown crediting lats below rear-delt/rhomboids per the source data).',
      'Your own hand-mapped press/row angles (from Build Press/Row\'s angle picker) now also drive fatigue attribution when logged under an existing exercise name, not just the target-weight suggestion.',
    ],
  },
  {
    version: '0.46',
    date: '2026-07-28',
    features: [
      'Fixed weighted EMG fatigue for a Build Press/Row exercise only working the session it was created — every later time it was logged via search, its muscle profile silently failed to reattach and fell back to zero fatigue attribution.',
      'Press/row exercises now show a grip-rotation form cue alongside the elbow-flare one (e.g. "Use a supinated grip to fully engage Biceps") — and flags it when the two cues are in real anatomical tension, since a pronated or supinated grip restricts how far you can comfortably flare your elbows.',
    ],
  },
  {
    version: '0.45',
    date: '2026-07-28',
    features: [
      'Chest exercises now show a lower/mid/upper pec split (e.g. "Lower 38% · Mid 42% · Upper 20%") in the session preview and while logging — literature-grounded per bench angle, shown for all 27 chest exercises already in the database. Informational only: fatigue and stimulus outside a workout still track a single chest number, unchanged and fully comparable to every other muscle.',
    ],
  },
  {
    version: '0.44',
    date: '2026-07-28',
    features: [
      'Added a "Build Press/Row" exercise builder to the workout logger — pick Press or Row, equipment, an EMG-backed angle, and (for cable/machine) a brand, and it becomes its own tracked exercise with a real per-muscle weighted fatigue/stimulus profile instead of the flat primary/secondary every other exercise gets.',
      'New angles now get a suggested first-set target weight, cross-calibrated from your real history on other angle-mapped press/row exercises via a per-muscle strength regression — with a full breakdown of which muscle contributed how much, and clearly flagged as a rough estimate when a contributing muscle has no supporting history yet.',
    ],
  },
  {
    version: '0.43',
    date: '2026-07-27',
    features: [
      'Added "Restart Setup" in Settings → Account, to redo the Onboarding wizard on demand without affecting an already-set-up account\'s normal behavior of never showing it automatically.',
      'Settings\' 15 sections are now grouped into 7 collapsible categories (Profile & Training, Dashboard Layout, Targets & Nutrition, Connected Data, Tools, Account, What\'s New) instead of one long undifferentiated scroll — only Profile & Training is open by default.',
    ],
  },
  {
    version: '0.42',
    date: '2026-07-27',
    features: [
      'Fixed invisible text in Dark Mode — Settings\' close ×, the Morning Briefing edition label, and a trained-day\'s label in the weekly strip were all hardcoded to a light color meant for a dark header background, which goes light in Dark Mode (--ink and --paper swap), making the text disappear against itself.',
    ],
  },
  {
    version: '0.41',
    date: '2026-07-27',
    features: [
      'Settings → Profile → Name now has an explicit Save button with saving/success/error states, instead of only saving silently on blur — a failed save previously looked identical to a successful one.',
    ],
  },
  {
    version: '0.40',
    date: '2026-07-27',
    features: [
      'Adaptation tab\'s atrophy-rate calibration no longer needs 2+ training gaps to offer a personal estimate — a single real 14-90 day gap now works too, labeled "(low confidence)" since a lone data point is noisier than a median across several.',
    ],
  },
  {
    version: '0.39',
    date: '2026-07-27',
    features: [
      'Fixed the Muscle Fatigue headline\'s "Train X Today" — it was naming the 2nd-most-fatigued muscle, which is backwards advice (recommending to load what\'s already loaded). Now pulls the actual top pick from the same weekly guidance the Training section shows.',
    ],
  },
  {
    version: '0.38',
    date: '2026-07-27',
    features: [
      'On phone-width screens, replaced the single long vertical scroll through every section with a bottom dock — tap Dispatch/Sleep/Training/Nutrition/Recovery/Body/Records to jump straight to it. Desktop/tablet layout is unchanged.',
    ],
  },
  {
    version: '0.37',
    date: '2026-07-27',
    features: [
      "Fixed Onboarding silently swallowing save failures — a genuine error (bad connection, timeout, whatever) looked identical to success, walking you through all 7 steps to \"You're set up\" with nothing actually saved. Now stops on the failed step with a visible error and a Retry.",
    ],
  },
  {
    version: '0.36',
    date: '2026-07-27',
    features: [
      "Fixed Onboarding showing again from scratch on a new browser/device for an already-set-up account — completion was only ever tracked in that browser's local storage, with no check against the real account data.",
    ],
  },
  {
    version: '0.35',
    date: '2026-07-25',
    features: [
      'Settings now lets you change everything Onboarding originally collected — date of birth, height, experience level, typical split, usual sets/reps, favorite exercises, and Muscle Focus — all pre-filled with your current values instead of onboarding being the only chance to set them.',
    ],
  },
  {
    version: '0.34',
    date: '2026-07-25',
    features: [
      "Fixed the session Max Length slider only applying after clicking Refresh Guidance — dragging it now updates the exercise list and estimated length instantly, no round-trip.",
    ],
  },
  {
    version: '0.33',
    date: '2026-07-25',
    features: [
      "Added a way to cross off a logged meal (removes it and unwinds it from the day's totals, not just a visual hide) and a History tab showing the last 7 days of logged meals.",
    ],
  },
  {
    version: '0.32',
    date: '2026-07-25',
    features: [
      "Fixed meal name and description on photo/text-scanned meals being copies of each other — the name was literally just the description's first 40 characters. Gemini now returns a real short name and a genuinely separate description.",
    ],
  },
  {
    version: '0.31',
    date: '2026-07-25',
    features: [
      'Fixed the Small/Medium/Large portion buttons overlapping their own labels — they were still sized for the old short "×1.5" style buttons.',
    ],
  },
  {
    version: '0.30',
    date: '2026-07-24',
    features: [
      'Added a Muscle Focus step to onboarding — mark any muscle Focus (extra priority when picking what to train) or Ignore (excluded from fatigue tracking and never picked as a target) instead of the app treating everything equally.',
    ],
  },
  {
    version: '0.29',
    date: '2026-07-24',
    features: [
      'Auto-generated sessions now show an estimated length, and a Max Length slider lets you cap it — over the cap, exercises for whichever muscles are already most recently trained get dropped first, keeping the ones your freshest muscles still need.',
    ],
  },
  {
    version: '0.28',
    date: '2026-07-24',
    features: [
      'Personal Journalist now has persistent memory — it saves durable facts about you (training preferences, injuries, goals) across conversations instead of starting fresh every chat. Editable in Settings.',
      'Fixed Personal Journalist sometimes timing out and showing "Connection error" on a reply that was actually still coming — the app was giving up sooner than the reply could legitimately take',
      'Trimmed the health-metrics data Personal Journalist reads to the last 14 days instead of your entire history, keeping every chat message fast regardless of how long you\'ve used the app',
    ],
  },
  {
    version: '0.27',
    date: '2026-07-24',
    features: [
      'Fixed the mid-day/evening/weekly report buttons all showing "Generating…" together when only one was clicked',
      'Weekly Review now only appears Monday–Wednesday, before it becomes stale news',
      'Fixed steps sometimes including stray samples from the previous day, inflating the daily total',
      'Fixed a text-described meal (no photo) being mislabeled "Per 100g values" — it\'s a whole-portion AI estimate like a photo scan, not a per-100g reference, so the grams calculator no longer misapplies to it',
      'You can now set/edit the time on a logged meal, both when logging it and afterwards in today\'s log',
      'Fixed camera barcode scans always reporting "Product not found" — the scan result was being read from the wrong field',
      'Meal photos and text-described meals now offer Small/Medium/Large portion estimates from Gemini up front, instead of one guess you had to correct yourself with a x0.5/1.5/2 multiplier',
      'Sleep target now shown as "Xh Ym" instead of a decimal hour count, and moved out of the stretched sleep-summary paragraph into its own line',
      'Settings moved to the top-left of the header, out of the Profile section',
    ],
  },
  {
    version: '0.26',
    date: '2026-07-24',
    features: [
      'Re-importing a Hevy CSV now merges in any sets missing from an already-imported session (e.g. warm-ups a fixed export now includes) instead of skipping the whole session because it was seen before.',
    ],
  },
  {
    version: '0.25',
    date: '2026-07-24',
    features: [
      "Fixed Hevy warm-up sets being silently dropped during import instead of saved — they're now imported and tagged as warm-ups (not lumped in as working sets), so \"Import Hevy\" and the API backfill both bring in your full set history.",
      'Adding an exercise now autofills the actual previous structure (warm-up sets included) instead of always flattening history into plain working sets.',
    ],
  },
  {
    version: '0.24',
    date: '2026-07-24',
    features: [
      'Added a Compound / Isolation preference slider in Settings — overrides the auto-detected accessory-exercise leaning in full-body auto-generated sessions instead of it always being inferred from your last 90 days.',
    ],
  },
  {
    version: '0.23',
    date: '2026-07-24',
    features: [
      'Fixed "Freshest Right Now" (Full Body) auto-generating bloated sessions (20+ exercises, including near-duplicate isolation work like 5 different curl variants in one session) — it now picks compound lifts that cover multiple fresh muscles at once and only adds an accessory for muscles genuinely left uncovered, instead of forcing two exercises per muscle.',
    ],
  },
  {
    version: '0.22',
    date: '2026-07-21',
    features: [
      'App now loads instantly from cache on reopen instead of re-downloading everything from scratch every time — the service worker was doing nothing but push notifications before',
      'Fixed the dashboard home screen doing one redundant computation on every load (internal — no visible change, just faster)',
    ],
  },
  {
    version: '0.21',
    date: '2026-07-20',
    features: [
      'Removed Press/Row/Fly as pattern categories in "Browse by Muscle" — nearly every exercise was one of these, making the middle step pointless busywork. Those exercises now show up directly at the muscle-group level instead.',
    ],
  },
  {
    version: '0.20',
    date: '2026-07-20',
    features: [
      'Full-body auto-generated sessions no longer pick from a fixed Push/Pull/Legs/Core bucket — every muscle is now ranked by freshness directly, sized off your own real session history, so a session can lean push- or pull-heavy on a given day if that\'s genuinely what\'s freshest',
      'New "Preferred Split" setting: Full Body, Upper/Lower, Push/Pull/Legs, Arnold Split, or PPL Arnold — picks up on what you\'re already doing from your real history if you\'ve never set it explicitly, but your own choice always wins once set',
      'Named splits now warn when the rotation hasn\'t reached a whole muscle group (e.g. no Pull day) in 3+ weeks, instead of only tracking freshness within the split itself',
      'Fixed a floating-point rounding bug that could show a suggested weight like 9.600000000000001kg',
      'Fixed the session preview miscounting sets/reps/weight by including warm-up sets in the total',
      'Dead Bug and Ab Wheel Rollout no longer show up as core "backbone" exercises outside travel mode — no real external-load progression path, so they weren\'t a fair substitute for a loadable core exercise',
      'Fixed the rest-timer glycogen readout vanishing mid-value (it topped out around 75-94% rather than reaching 100%) and no longer resetting if you background the app mid-rest',
      'Fixed the live Session Stimulus badge carrying over numbers from your last workout before you\'d logged a single set in the new one',
      'Morning briefing now only generates/notifies once a day — was re-firing on every Apple Health sync — and the auto-popup no longer reappears repeatedly if the app gets reloaded in the background after you\'ve already seen it',
      'Set-type button: tap now toggles Warm-up/Working directly, hold for Drop Set — removed Failure as a separate set type',
    ],
  },
  {
    version: '0.19',
    date: '2026-07-20',
    features: [
      'Apple Health sync (Shortcuts) now actually works — fixed a body-shape mismatch that silently dropped every field, made syncing robust to how Shortcuts really serializes Health data, fixed unrounded HRV/RHR/HR/SpO2/wrist-temp display and a steps unit bug that showed 1,702,000 instead of 1,702',
      'Each account now gets its own personal Apple Health sync link, so a second person\'s data no longer lands in the wrong account',
      'Muscle recovery times recalibrated to real research (quads dropped from 72h to 24h, several others from 72h to 48h) — fatigue readings should now clear faster and more accurately for large muscle groups',
      'Fixed the "Browse by Muscle" exercise picker going blank after picking a muscle group',
      'Fixed the home-screen Recovery number getting clipped in its box on some screen sizes',
      'Fixed occasional "Gemini returned invalid JSON" errors on briefings/newscasts/reviews',
      'Nutrition logging can now be done by just describing what you ate, no photo required',
    ],
  },
  {
    version: '0.18',
    date: '2026-07-19',
    features: [
      'Home screen no longer suggests a whole-week "recovery week" once several muscles get fatigued — it now names exactly which muscle(s) are over the fatigue ceiling and says to leave those alone, since this program never runs on a scheduled deload anyway',
      'Full-body auto-generated sessions no longer pair up two exercises that do the same job on the same muscle (e.g. Barbell Overhead Press + Machine Shoulder Press) — a second exercise for the same muscle only shows up now if it\'s genuinely different work',
      'Home screen panels and Recovery tabs can now be reordered and hidden from Settings',
      'Disabled pinch-to-zoom so the app behaves more like a native app rather than a zoomable page',
      'Fixed the mid-day and evening report both being generatable at once in the evening — only the report matching the actual time of day shows now',
    ],
  },
  {
    version: '0.17',
    date: '2026-07-18',
    features: [
      'Fixed sections sometimes staying invisible after the loading screen dismissed — a scroll-reveal effect stopped re-attaching once the loading screen delayed when the page actually mounted',
      'Weight suggestions and progress trends now account for switching gyms/machine brands — logging the same exercise on a different brand no longer reads as a strength change once you\'ve logged it on both close enough in time to compare',
      'Adaptation tab now defaults to a colored body diagram by current stimulus level (red = atrophying, green = actively adapting), not just tap-to-select',
      'Exercise selection now correctly recognizes a lot more of your real logged history — imported exercise names that didn\'t exactly match the database (e.g. "Bench Press (Barbell)") were silently being treated as novel; ~140 known real aliases are now wired into exercise selection, not just the ranking system',
      'Exercises you log regularly (10+ sessions) are now protected as "staples" — no longer rotated away from for variety',
      'Any imported workout history referencing an exercise not in the database now auto-saves it as a custom exercise, from any import source',
      'New "Merge Exercises" tool in Settings, for folding two entries that are really the same exercise into one',
      'New onboarding step: split, usual sets/reps, favorite exercises, and experience level — gives session planning a real starting point before you\'ve logged anything',
      'Beginners (self-tagged at onboarding) get Easy/Medium/Failure effort logging instead of numeric RPE',
      'New Wiki page (Settings → Learn): plain-language training concepts and a searchable exercise reference',
      'Exercise search now understands muscle-group terms like "back," "legs," and "delts," not just individual muscle names',
      'Renamed Niggles to Injuries',
      'New plate calculator in the workout logger',
      'Machine/cable entry is now a brand dropdown instead of free text, with a single/double-pulley option for cables',
      'Exercises are now tagged by muscle group, movement pattern, and movement family (e.g. Bench Press → Barbell/Dumbbell × Flat/Incline/Decline) — new "Browse by Muscle" picker in the workout logger lets you drill down to an exercise instead of only searching by name',
    ],
  },
  {
    version: '0.16',
    date: '2026-07-18',
    features: [
      'Fixed the Atlas post-session summary and Personal Journalist chat sometimes getting cut off mid-sentence — Gemini\'s "thinking" pass was silently eating into the same token budget as the visible reply; now detected and retried with more room instead of quietly returning the cut-off text',
      'New rep-range callout: flags it live while logging once most hard sets in a session are running 3 reps or under (the training ethos biases toward 8-9), and Atlas will mention it after the session too if it never got worked back up',
    ],
  },
  {
    version: '0.15',
    date: '2026-07-18',
    features: [
      'Replaced the flat "hard sets this session ÷ 4" Stimulus score with a continuous per-muscle adaptation model: each session contributes a rise-and-decay curve peaking 48h later, and curves from different sessions stack — a frequency-first week of small sessions can now correctly read as fully dosed, instead of every individual session looking under-dosed in isolation',
      'New Adaptation tab (Recovery section): a per-muscle chart of that stacked curve, plus a dashed projection of where it heads with no further training — the projected decay rate calibrates automatically from your own real training gaps where there\'s enough history, with a manual override',
      'The live "Session Stimulus" badge while logging a workout now shows a projected peak (recent history + this session so far) instead of a flat this-session-only dose',
    ],
  },
  {
    version: '0.14',
    date: '2026-07-18',
    features: [
      'Added Dark Mode — toggle it in Settings → Profile, syncs across logins/devices',
      'Fixed a gap where a failed /summary request could silently defeat the loading screen and briefly show empty data instead',
      'Rest timer now shows live glycogen replenishment (half-life 45s) instead of a plain time countdown',
      'Fatigue Types (Structural/Metabolic/CNS) now shown as a plain percentage',
      'Session Stimulus no longer credits a secondary/assistor muscle (e.g. biceps on a row) the same as the actual primary target — secondary muscles now count at half weight',
    ],
  },
  {
    version: '0.13',
    date: '2026-07-18',
    features: [
      'Exercise selection now heavily favors whatever you\'ve actually done before over something novel, whether picking a backbone lift or an accessory',
      'Big disincentive against isometric holds (Plank, Pallof Press, Side Plank, ...) in favor of exercises with a normal, progressively-loadable range of motion — mechanical tension through full ROM is the primary driver of strength stimulus',
      'Obscure/novel exercises (like the Pallof Press) are now scored down hard as accessories, and were already excluded from backbone picks entirely',
    ],
  },
  {
    version: '0.12',
    date: '2026-07-18',
    features: [
      'Exercise search now also matches muscle, equipment, and category — searching "lats" finds every pulldown/row variant, not just exercises with "lats" literally in the name',
      'Full-body auto-picked sessions now give 2 exercises per muscle group instead of 1, with the split between compound and isolation work following whichever you\'ve actually favored over your last 90 days of training',
      'Fixed the Strength Level panel (All-Time Bests) never appearing on mobile — a scroll-reveal effect required 35% of the section on-screen at once, which a long PR list can never reach on a phone-sized viewport',
      'App now shows a proper loading screen on open instead of the full page appearing with every section empty for a few seconds while data loads',
      'Moved What\'s New to the bottom of Settings, out of the way of the settings you actually came to change',
    ],
  },
  {
    version: '0.11',
    date: '2026-07-18',
    features: [
      'Fixed the Ranking legend showing no color at all for 5 of its 6 tiers (Beginner through Elite) — a key mismatch left every dot but Untrained blank',
      'Ranking tier colors now run grey → green → blue → purple → orange → gold as you climb, ending Elite on literal gold, instead of an arbitrary hue per tier',
    ],
  },
  {
    version: '0.10',
    date: '2026-07-16',
    features: [
      'Soreness logging now has a body diagram picker, matching Fatigue and Ranking — tap a muscle on the diagram instead of hunting through a 31-button grid (muscles without a diagram region still list separately below it)',
    ],
  },
  {
    version: '0.9',
    date: '2026-07-16',
    features: [
      'Added a real home-screen icon (a bold serif "P" on the app\'s own paper/ink colours) plus a web app manifest, so "Add to Home Screen" no longer falls back to a screenshot — also fixes push notifications, which were already referencing an icon file that never existed',
    ],
  },
  {
    version: '0.8',
    date: '2026-07-16',
    features: [
      'Freestyle-logged exercises now suggest a set count and a descending RIR target per set (e.g. "3 sets · RIR 2→1→0"), matching the same guidance a pre-planned session already gets for free',
    ],
  },
  {
    version: '0.7',
    date: '2026-07-16',
    features: [
      'New "Session Stimulus" readout while logging a workout: 100% = optimal hard-set dose for a muscle this session, above 100% means you\'ve gone past the useful dose into diminishing returns',
    ],
  },
  {
    version: '0.6',
    date: '2026-07-16',
    features: [
      'Fixed muscle fatigue reading far too low after a real session — the fatigue denominator was an unbounded all-time peak, so one old specialization day (e.g. 4 quad exercises stacked in one leg day) could permanently suppress that muscle\'s fatigue% forever, even years later',
    ],
  },
  {
    version: '0.5',
    date: '2026-07-16',
    features: [
      'Nutrition log entries can now carry a free-text description/note, editable regardless of whether it came from a photo scan — shown in the meal log table, Recent Foods, and CSV export',
      'Fixed Recent Foods always showing empty (it was matching on a field no nutrition entry actually has)',
    ],
  },
  {
    version: '0.4',
    date: '2026-07-16',
    features: [
      'Fixed Hevy live-sync webhook responding before the workout was actually saved, so a sync could silently fail to update anything (fatigue included) despite Hevy reporting success',
    ],
  },
  {
    version: '0.3',
    date: '2026-07-16',
    features: [
      'Strength Level bars now fill toward the next numbered sub-level instead of a flat 0-100',
      'Wide-range time estimate to your next strength level, shown only when you have a real, sustained progression trend behind it',
    ],
  },
  {
    version: '0.2',
    date: '2026-07-16',
    features: [
      'Strength ranks simplified back to the original 5, each split into 3 numbered sub-levels (e.g. Beginner 1/2/3) instead of separate invented names',
    ],
  },
  {
    version: '0.1',
    date: '2026-07-15',
    features: [
      'Session CNS-load badge no longer misreads row-heavy sessions as "Light"',
      'Warmup sets no longer flagged "Short of target"',
      'A set that lands a new e1RM PR no longer flagged "Short of target"',
      'Live "PR pace" hint shows the rep range needed to beat your PR as you enter a weight',
      'Machine/technique tag suggests real UK commercial-gym equipment brands',
      'In-progress sessions now survive backgrounding the app (no more lost workouts)',
      'Removed a duplicate progression note and fixed truncated AI coaching cues',
      'Ranking tab body diagram no longer shows stale colors from previous data',
      'Ranking tab diagram colors now correctly match the legend key',
      'Finer strength ranks added between the original 5, plus an open-ended "Ultra Elite" tier above 100',
    ],
  },
];

// In-progress session persistence — WorkoutLogger previously held its whole
// state (exercises, elapsed timer, custom-exercise additions) in plain React
// state with nowhere else to live. Mobile browsers/PWAs routinely discard a
// backgrounded tab's JS state and reload the page when you switch back to
// it, which silently wiped an entire session mid-workout. Mirrored to
// localStorage on every change and restored on mount instead.
const ACTIVE_SESSION_KEY = 'press_active_session';
const ACTIVE_SESSION_MAX_AGE_MS = 24 * 3600000; // abandoned, not resumable

function saveActiveSession(data) {
  try { localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(data)); } catch {}
}
function loadActiveSession() {
  try {
    const raw = localStorage.getItem(ACTIVE_SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data.startedAt || Date.now() - data.startedAt > ACTIVE_SESSION_MAX_AGE_MS) {
      localStorage.removeItem(ACTIVE_SESSION_KEY);
      return null;
    }
    return data;
  } catch { return null; }
}
function clearActiveSession() {
  try { localStorage.removeItem(ACTIVE_SESSION_KEY); } catch {}
}
// cnsLoad and progression (computeProgression via progressionFor) are
// imported — see the top-of-file comment by the muscleTaxonomy/fatigue/
// sessionPlanner imports.

const sessionFatigue = exercises => {
  const scores = {};
  for (const ex of exercises) {
    for (const s of ex.sets) {
      if (!s.done) continue;
      const load = (+s.kg || 0) * (+s.reps || 1);
      for (const m of musclesForExercise(ex.name)) scores[m] = (scores[m] || 0) + load;
    }
  }
  const max = Math.max(...Object.values(scores), 1);
  return Object.fromEntries(Object.entries(scores).map(([m, v]) => [m, Math.min(100, Math.round(v / max * 100))]));
};

// Live preview of the continuous adaptation model (functions/adaptation.js):
// for each muscle touched so far this session, projects where that muscle's
// stacked adaptation curve would peak (ADAPTATION_PEAK_H out) if the session
// ended right now — the already-logged history's own curves at that future
// point, plus this in-progress session's own contribution evaluated at its
// peak (ADAPTATION_PEAK_H is exactly the peak for a session dated "now", so
// this is sessionStimulusScore(...) directly, just expressed via
// adaptationCurve to stay visibly consistent with the rest of the model). Replaces the old flat
// "hard sets this session ÷ a fixed target" badge, which couldn't see that a
// frequency-first program's small per-session doses are meant to stack
// across the week, not clear a bar in any single session.
const liveAdaptationPreview = (exercises, lifts) => {
  const peakMs = Date.now() + ADAPTATION_PEAK_H * 3600000;
  const historicalContributions = computeStimulusContributions(lifts);

  const liveScore = {};
  for (const ex of exercises) {
    const doneSets = ex.sets.filter(s => s.type !== 'W' && s.done);
    if (!doneSets.length) continue;
    const avgRIR = doneSets.reduce((acc, s) => {
      const rpe = s.rpe === '' || s.rpe == null ? null : +s.rpe;
      return acc + (rpe != null ? Math.max(0, 10 - rpe) : DEFAULT_RIR);
    }, 0) / doneSets.length;
    const score = sessionStimulusScore(doneSets.length, avgRIR);
    const entry = findExercise(ex.name);
    if (entry) {
      for (const m of entry.primary || []) liveScore[m] = (liveScore[m] || 0) + score;
      for (const m of entry.secondary || []) liveScore[m] = (liveScore[m] || 0) + score * secondaryMuscleRatio(entry, m);
    } else {
      for (const m of musclesForExercise(ex.name)) liveScore[m] = (liveScore[m] || 0) + score;
    }
  }

  // Only muscles actually touched by a done set THIS session are shown --
  // historicalContributions still feeds each shown muscle's value (that's
  // the whole "projected peak" point), but a muscle with pure history and
  // nothing logged yet today shouldn't appear in what's meant to read as
  // live in-session feedback.
  const muscles = new Set(Object.keys(liveScore));
  const out = {};
  for (const m of muscles) {
    const historicalLevel = computeAdaptationLevel(historicalContributions[m], peakMs);
    const liveContribution = adaptationCurve(48, liveScore[m] || 0);
    out[m] = Math.round((historicalLevel + liveContribution) * 100);
  }
  return out;
};

function ExHistoryChart({ name, lifts }) {
  const pts = useMemo(() => {
    const byDate = {};
    for (const l of lifts.filter(l => l.exercise === name)) {
      const v = e1rm(l.kg, l.reps);
      if (v && (!byDate[l.date] || v > byDate[l.date])) byDate[l.date] = v;
    }
    return Object.entries(byDate).sort(([a],[b]) => a.localeCompare(b)).slice(-16).map(([d,v]) => ({ d, v }));
  }, [name, lifts]);

  if (pts.length < 2) return <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--dim)', padding: '8px 0' }}>Not enough history.</div>;

  const vals = pts.map(p => p.v);
  const mn = Math.min(...vals), mx = Math.max(...vals), rng = mx - mn || 1;
  const W = 300, H = 70;
  const x = i => (i / (pts.length - 1)) * W;
  const y = v => H - ((v - mn) / rng) * (H - 8) - 4;
  let d = `M${x(0).toFixed(1)},${y(pts[0].v).toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const mx2 = (x(i-1) + x(i)) / 2;
    d += ` C${mx2},${y(pts[i-1].v)} ${mx2},${y(pts[i].v)} ${x(i).toFixed(1)},${y(pts[i].v).toFixed(1)}`;
  }
  const last = pts.at(-1);

  return (
    <div style={{ margin: '8px 0 12px', padding: '10px 12px', background: 'var(--paper2)', borderLeft: '2px solid var(--navy)' }}>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 6 }}>
        e1RM History · {pts.length} sessions · Peak {Math.max(...vals)}kg
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 70, display: 'block' }} preserveAspectRatio="none">
        <path d={`${d} L${W},${H} L0,${H}Z`} fill="var(--navy)" opacity=".12" />
        <path d={d} fill="none" stroke="var(--navy)" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx={x(pts.length-1)} cy={y(last.v)} r="3" fill="var(--navy)" />
        <text x={x(pts.length-1)-2} y={y(last.v)-6} textAnchor="end" fontSize="8" fill="var(--navy)" fontFamily="JetBrains Mono,monospace">{last.v}kg</text>
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', marginTop: 2 }}>
        <span>{localDateFromYMD(pts[0].d).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</span>
        <span>{localDateFromYMD(last.d).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</span>
      </div>
    </div>
  );
}

// Enhanced exercise picker with tabs: Recent, Frequent, Browse, Machine search
// Horizontal drill-down tree for Browse tab (Muscle → Pattern → Movement → Equipment → Variants)
// Global search across all exercises, ranked by recency
const HIDDEN_PATTERNS = new Set(['press', 'row', 'fly']);

function EnhancedExercisePicker({ onAdd, lifts, workoutDate }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState('muscle'); // muscle → movement → equipment → exercise
  const [selectedMuscle, setSelectedMuscle] = useState(null);
  const [selectedMovement, setSelectedMovement] = useState(null);
  const [selectedEquipment, setSelectedEquipment] = useState(null);

  const sessionDate = workoutDate || new Date().toISOString().split('T')[0];

  const handleClose = () => {
    setOpen(false);
    setStep('muscle');
    setSelectedMuscle(null);
    setSelectedMovement(null);
    setSelectedEquipment(null);
  };

  const pickExercise = (exerciseName) => {
    onAdd(exerciseName);
    handleClose();
  };

  // Tree picker data
  const muscles = useMemo(() => EXERCISE_MUSCLE_GROUPS.filter(g => EXERCISE_DB.some(e => e.muscleGroup === g)), []);

  const movements = useMemo(() => {
    if (!selectedMuscle) return [];
    const byId = new Map();
    for (const e of EXERCISE_DB) {
      if (e.muscleGroup !== selectedMuscle) continue;
      if (!byId.has(e.movementId)) {
        byId.set(e.movementId, { movementId: e.movementId, name: e.movementName });
      }
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [selectedMuscle]);

  const equipment = useMemo(() => {
    if (!selectedMovement) return [];
    const exercisesInMovement = EXERCISE_DB.filter(e => e.movementId === selectedMovement);
    return [...new Set(exercisesInMovement.map(e => e.equipment))].sort();
  }, [selectedMovement]);

  const exercises = useMemo(() => {
    if (!selectedEquipment || !selectedMovement) return [];
    return EXERCISE_DB.filter(e => e.movementId === selectedMovement && e.equipment === selectedEquipment).sort((a, b) => a.name.localeCompare(b.name));
  }, [selectedMovement, selectedEquipment]);

  const renderItem = (item, onClick) => (
    <div onClick={onClick} style={{ padding: '10px 0', cursor: 'pointer', borderBottom: '1px solid var(--paper2)', fontSize: 12, fontFamily: "'JetBrains Mono',monospace", display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--paper2)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      <span>{item}</span>
      <span style={{ fontSize: 10, color: 'var(--dim)' }}>→</span>
    </div>
  );

  return (
    <div style={{ marginTop: 16, borderTop: '1px solid var(--rule)', paddingTop: 10 }}>
      {open ? (
        <div style={{ marginBottom: 12, background: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 4, padding: 16 }}>
          {/* Breadcrumb */}
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '.08em' }}>
            {step === 'muscle' && 'Select Primary Muscle'}
            {step === 'movement' && `${selectedMuscle} · Select Movement`}
            {step === 'equipment' && `${selectedMuscle} · ${selectedMovement} · Select Equipment`}
            {step === 'exercise' && `${selectedMuscle} · ${selectedMovement} · ${selectedEquipment} · Select Exercise`}
          </div>

          {/* Muscle selection */}
          {step === 'muscle' && (
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {muscles.map(m => renderItem(m, () => {
                setSelectedMuscle(m);
                setStep('movement');
              }))}
            </div>
          )}

          {/* Movement selection */}
          {step === 'movement' && (
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              <button onClick={() => { setSelectedMuscle(null); setStep('muscle'); }} style={{ background: 'none', border: 'none', color: 'var(--ink)', textDecoration: 'underline', cursor: 'pointer', padding: '10px 0', fontSize: 12, fontFamily: "'JetBrains Mono',monospace", width: '100%', textAlign: 'left', marginBottom: 8 }}>← Back</button>
              {movements.length > 0 ? movements.map(m => renderItem(m.name, () => {
                setSelectedMovement(m.movementId);
                setStep('equipment');
              })) : <div style={{ color: 'var(--dim)', fontSize: 11 }}>No movements available</div>}
            </div>
          )}

          {/* Equipment selection */}
          {step === 'equipment' && (
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              <button onClick={() => setStep('movement')} style={{ background: 'none', border: 'none', color: 'var(--ink)', textDecoration: 'underline', cursor: 'pointer', padding: '10px 0', fontSize: 12, fontFamily: "'JetBrains Mono',monospace", width: '100%', textAlign: 'left', marginBottom: 8 }}>← Back</button>
              {equipment.length > 0 ? equipment.map(e => renderItem(e, () => {
                setSelectedEquipment(e);
                setStep('exercise');
              })) : <div style={{ color: 'var(--dim)', fontSize: 11 }}>No equipment available</div>}
            </div>
          )}

          {/* Exercise selection */}
          {step === 'exercise' && (
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              <button onClick={() => setStep('equipment')} style={{ background: 'none', border: 'none', color: 'var(--ink)', textDecoration: 'underline', cursor: 'pointer', padding: '10px 0', fontSize: 12, fontFamily: "'JetBrains Mono',monospace", width: '100%', textAlign: 'left', marginBottom: 8 }}>← Back</button>
              {exercises.length > 0 ? exercises.map(e => (
                <div key={e.name} onClick={() => pickExercise(e.name)} style={{ padding: '10px 0', cursor: 'pointer', borderBottom: '1px solid var(--paper2)', fontSize: 12, fontFamily: "'JetBrains Mono',monospace" }} onMouseEnter={e => e.currentTarget.style.background = 'var(--paper2)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  {e.name}
                </div>
              )) : <div style={{ color: 'var(--dim)', fontSize: 11 }}>No exercises available</div>}
            </div>
          )}

          <button onClick={handleClose} style={{ marginTop: 12, fontSize: 9, padding: '8px 12px', background: 'var(--paper2)', border: '1px solid var(--rule)', borderRadius: 3, cursor: 'pointer', width: '100%' }}>Close</button>
        </div>
      ) : (
        <button onClick={() => setOpen(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--dim)' }}>
          + Exercise Picker
        </button>
      )}
    </div>
  );
}

// Tree-nav exercise picker: muscle group -> pattern -> movement -> variant.
// Additive alongside the free-text search above, not a replacement — same
// addExercise() call either way, this is just a browsable way to arrive at
// a name for someone who doesn't know exactly what they're looking for.
// Skips the variant step when a movement only has one (e.g. Face Pull),
// since making someone pick between one option isn't navigation.
// Too generic to be a useful intermediate click — nearly every push/pull
// exercise IS a press/row/fly, so this bucket contained most of the tree.
// Exercises using these patterns skip the pattern step entirely and show
// up directly at the muscle-group level instead (see hiddenMovements).
const HIDDEN_PATTERNS_OLD = new Set(['press', 'row', 'fly']);

function ExerciseBrowser({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState(null);
  const [pattern, setPattern] = useState(null);
  const [movementId, setMovementId] = useState(null);

  const reset = () => { setGroup(null); setPattern(null); setMovementId(null); };

  const groups = useMemo(() => EXERCISE_MUSCLE_GROUPS.filter(g => EXERCISE_DB.some(e => e.muscleGroup === g)), []);

  const patterns = useMemo(() => {
    if (!group) return [];
    const present = new Set(EXERCISE_DB.filter(e => e.muscleGroup === group).map(e => e.pattern));
    return EXERCISE_PATTERNS.filter(p => present.has(p) && !HIDDEN_PATTERNS_OLD.has(p));
  }, [group]);

  // Movements for hidden-pattern exercises (press/row/fly) within this
  // group — shown directly alongside the remaining pattern tiles, one
  // step earlier than a normal pattern-gated movement.
  const hiddenMovements = useMemo(() => {
    if (!group) return [];
    const byId = new Map();
    for (const e of EXERCISE_DB) {
      if (e.muscleGroup !== group || !HIDDEN_PATTERNS_OLD.has(e.pattern)) continue;
      if (!byId.has(e.movementId)) byId.set(e.movementId, { movementId: e.movementId, movementName: e.movementName, count: 0 });
      byId.get(e.movementId).count++;
    }
    return [...byId.values()].sort((a, b) => a.movementName.localeCompare(b.movementName));
  }, [group]);

  const movements = useMemo(() => {
    if (!group || !pattern) return [];
    const byId = new Map();
    for (const e of EXERCISE_DB) {
      if (e.muscleGroup !== group || e.pattern !== pattern) continue;
      if (!byId.has(e.movementId)) byId.set(e.movementId, { movementId: e.movementId, movementName: e.movementName, count: 0 });
      byId.get(e.movementId).count++;
    }
    return [...byId.values()].sort((a, b) => a.movementName.localeCompare(b.movementName));
  }, [group, pattern]);

  const variants = useMemo(() => {
    if (!movementId) return [];
    return EXERCISE_DB.filter(e => e.movementId === movementId).sort((a, b) => a.name.localeCompare(b.name));
  }, [movementId]);

  const pick = ex => {
    onAdd(ex.name.toLowerCase());
    reset();
  };

  const selectMovement = m => {
    if (m.count === 1) {
      pick(EXERCISE_DB.find(e => e.movementId === m.movementId));
    } else {
      setMovementId(m.movementId);
    }
  };

  const tileStyle = { padding: '9px 12px', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, textTransform: 'capitalize', cursor: 'pointer', border: '1px solid var(--rule)', background: 'var(--paper)', color: 'var(--ink)', textAlign: 'left' };

  let step = 'group', items = [], onPick = null;
  // movementId must be checked before pattern: the hidden-pattern shortcut
  // below (press/row/fly) sets movementId directly from the pattern step,
  // without ever setting pattern -- checking !pattern first would keep
  // falling back into the pattern step forever for that path, never
  // reaching the variant list even once movementId is set.
  if (!group) { step = 'group'; items = groups.map(g => ({ key: g, label: g })); onPick = it => setGroup(it.key); }
  else if (movementId) { step = 'variant'; items = variants.map(v => ({ key: v.id, label: v.name, v })); onPick = it => pick(it.v); }
  else if (!pattern) {
    step = 'pattern';
    items = [
      ...patterns.map(p => ({ key: `pattern-${p}`, label: p, kind: 'pattern', pattern: p })),
      ...hiddenMovements.map(m => ({ key: `move-${m.movementId}`, label: m.count > 1 ? `${m.movementName} (${m.count})` : m.movementName, kind: 'movement', m })),
    ];
    onPick = it => it.kind === 'pattern' ? setPattern(it.pattern) : selectMovement(it.m);
  }
  else { step = 'movement'; items = movements.map(m => ({ key: m.movementId, label: m.count > 1 ? `${m.movementName} (${m.count})` : m.movementName, m })); onPick = it => selectMovement(it.m); }

  return (
    <div style={{ marginTop: 16, borderTop: '1px solid var(--rule)', paddingTop: 10 }}>
      <button onClick={() => { setOpen(v => !v); reset(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--dim)' }}>
        {open ? '− ' : '+ '}Browse by Muscle
      </button>
      {open && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8, fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', textTransform: 'capitalize' }}>
            {group && <button onClick={() => reset()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--dim)', textTransform: 'capitalize', padding: 0 }}>{group}</button>}
            {pattern && <><span>›</span><button onClick={() => { setPattern(null); setMovementId(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--dim)', textTransform: 'capitalize', padding: 0 }}>{pattern}</button></>}
            {movementId && <><span>›</span><span>{variants[0]?.movementName}</span></>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 260, overflowY: 'auto' }}>
            {items.map(it => (
              <button key={it.key} style={tileStyle} onClick={() => onPick(it)}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--paper2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--paper)'}>
                {it.label}
              </button>
            ))}
          </div>
          {step !== 'group' && (
            <button className="ol-btn ol-btn-ghost" style={{ fontSize: 8, marginTop: 8 }}
              onClick={() => {
                if (step === 'variant') setMovementId(null);
                else if (step === 'movement') setPattern(null);
                else if (step === 'pattern') setGroup(null);
              }}>
              ← Back
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Builds a genuinely new exercise identity from Press/Row/Fly + equipment +
// angle + brand, rather than resolving to an existing exerciseDb.js entry —
// each combination gets its own EMG-weighted muscle profile (functions/
// emgActivation.js) and is tracked as its own exercise going forward, same
// as any other custom exercise. See onAdd's second argument in WorkoutLogger
// for how the weighted profile travels with the logged sets. Fly's angle is
// a different physical quantity than press/row's (arm-to-torso angle at
// full contraction, not shoulder-flexion/pull-direction through the rep —
// see emgActivation.js's header) but shares the same picker mechanics.
const PATTERN_LABELS = { press: 'Press', row: 'Row', fly: 'Fly', curl: 'Curl', extension: 'Extension', 'leg-curl': 'Leg Curl', hyperextension: 'Hyperextension' };
function patternLabelFor(pattern) { return PATTERN_LABELS[pattern] || pattern; }

// Live muscle activation for the angle currently under the slider.
//
// The bars are drawn against `scale` — the highest activation this movement
// reaches at any angle — not against 100. EMG values here are "% of each
// muscle's own MVIC" and legitimately exceed 100 (see emgActivation.js's
// header), so a 0-100 bar would clip real data. They are also not shares of
// the exercise and never sum to 100, which is why there's no pie and no
// percentage-of-session figure: that would be a fabricated distribution.
// A second bar is drawn under the first when a real load is known: the
// structural fatigue this exercise would actually add, from
// functions/muscleCredit.js, which gets it by running the same simulation the
// What If sandbox uses. The two bars answer different questions in different
// units — "how hard is this muscle working" and "what does that cost you
// tomorrow" — and a muscle can rank high on one and low on the other, which is
// the whole reason they aren't collapsed into a single score.
//
// Without a load there is no second bar at all, rather than an empty one:
// drawing a flat bar would read as "this costs nothing".
function MuscleCreditBars({ pattern, angle, axis = 'sagittal', equipment, targetMuscle, costContext = null }) {
  const credit = muscleCredit({
    pattern, angle, axis, equipment,
    ...(costContext || {}),
  });
  if (!credit) return null;
  const mono = { fontFamily: "'JetBrains Mono',monospace" };
  const colorFor = role => (role === 'primary' ? 'var(--ink)' : role === 'secondary' ? 'var(--dim)' : 'var(--rule)');

  // Cost bars are drawn against the largest cost on screen, so the tallest is
  // full width and the rest are readable against it. Against the 0-100 fatigue
  // scale every bar for a normal session would be a sliver.
  const maxCost = credit.hasCost
    ? Math.max(...credit.muscles.map(m => m.fatigueCost || 0), 1)
    : 1;

  return (
    <div style={{ marginTop: 8 }}>
      {credit.muscles.map(m => (
        <div key={m.muscle} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: credit.hasCost ? 6 : 3 }}>
          <div style={{
            ...mono, fontSize: 9, width: 84, flexShrink: 0, textTransform: 'capitalize',
            color: m.muscle === targetMuscle ? 'var(--gold)' : 'var(--dim)',
            fontWeight: m.muscle === targetMuscle ? 600 : 400,
          }}>{m.muscle}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Width transition is the animation — see .muscle-bar-fill, which
                stops under prefers-reduced-motion. */}
            <div className="muscle-bar-track">
              <div className="muscle-bar-fill" style={{
                width: `${Math.min(100, (m.activation / credit.scale) * 100)}%`,
                background: m.muscle === targetMuscle ? 'var(--gold)' : colorFor(m.role),
              }} />
            </div>
            {credit.hasCost && (
              <div className="muscle-bar-track" style={{ marginTop: 2 }}>
                <div className="muscle-bar-fill muscle-bar-cost" style={{
                  width: `${Math.min(100, ((m.fatigueCost || 0) / maxCost) * 100)}%`,
                  background: m.crossesCeiling ? 'var(--red)' : 'var(--ember)',
                }} />
              </div>
            )}
          </div>
          <div style={{ ...mono, fontSize: 9, color: 'var(--dim)', width: 46, textAlign: 'right', flexShrink: 0 }}>
            {Math.round(m.activation)}
            {credit.hasCost && (
              <span style={{ display: 'block', color: m.crossesCeiling ? 'var(--red)' : 'var(--ember)' }}>
                +{m.fatigueCost ?? 0}
              </span>
            )}
          </div>
        </div>
      ))}
      <div style={{ ...mono, fontSize: 8, color: 'var(--dim)', marginTop: 4, lineHeight: 1.5 }}>
        % of each muscle's own peak activation — not a share of the exercise, so these don't total 100.
        {credit.hasCost && ' Second bar: fatigue points this would add, at your current working weight.'}
      </div>
      {credit.hasCost && credit.muscles.some(m => m.crossesCeiling) && (
        <div style={{ ...mono, fontSize: 8, color: 'var(--red)', marginTop: 2, lineHeight: 1.5 }}>
          Red: crosses the {credit.ceiling}-point ceiling, so that muscle drops out of tomorrow's selection.
        </div>
      )}
    </div>
  );
}

// The angle picker. Was 13 buttons where choosing one immediately advanced the
// wizard, so you couldn't compare positions without backing out; now a slider
// you can sweep with the muscle bars updating under it, and an explicit
// confirm. Snapped to the angles that have EMG data rather than free 1-degree
// movement, because emgForAngle is a table lookup and anything between stops
// would have to be invented.
function AngleSlider({ pattern, angle, onChange, targetMuscle }) {
  const options = angleOptionsFor(pattern);
  if (!options.length) return null;
  const index = Math.max(0, options.indexOf(angle));
  const optimum = targetMuscle ? optimalAngleFor(pattern, targetMuscle) : null;
  const mono = { fontFamily: "'JetBrains Mono',monospace" };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ ...mono, fontSize: 15, color: 'var(--ink)' }}>{angle}°</span>
        {optimum && (
          <button onClick={() => onChange(optimum.angle)}
            style={{ ...mono, fontSize: 9, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: angle === optimum.angle ? 'var(--forest)' : 'var(--gold)' }}>
            {angle === optimum.angle ? `✓ best for ${targetMuscle}` : `best for ${targetMuscle}: ${optimum.angle}° →`}
          </button>
        )}
      </div>
      <input
        type="range" min={0} max={options.length - 1} step={1} value={index}
        onChange={e => onChange(options[+e.target.value])}
        aria-label={`${pattern} angle`}
        aria-valuetext={`${angle} degrees`}
        style={{ width: '100%', accentColor: 'var(--ink)', minHeight: 44 }}
      />
      <div style={{ ...mono, fontSize: 8, color: 'var(--dim)', display: 'flex', justifyContent: 'space-between' }}>
        <span>{options[0]}°</span><span>{options[options.length - 1]}°</span>
      </div>
    </div>
  );
}

// The same slider for the two secondary axes — elbow flare and grip rotation.
//
// They are kept as separate controls reading separate tables rather than being
// folded into the angle above, because nothing measured these axes in
// combination and multiplying them would invent the combined values (see
// parameterExplorer.js's multi-axis header, and test/parameterModelComparison
// .test.js for what that failure looks like numerically).
//
// An axis a muscle barely responds to is reported as such instead of getting a
// confident recommendation: `swing` under a few points means the slider has
// nothing to offer, and saying so is more useful than an arrow to a setting
// that changes nothing.
const AXIS_SWING_FLOOR = 10;

function AxisSlider({ pattern, axis, value, onChange, equipment, targetMuscle }) {
  const options = axisOptions(pattern, axis, { equipment });
  if (options.length < 2) return null;

  const index = Math.max(0, options.indexOf(value));
  const reading = activationOnAxis(pattern, axis, value, { equipment });
  const sensitivity = targetMuscle ? axisSensitivity(pattern, axis, targetMuscle, { equipment }) : null;
  const worthMoving = sensitivity && sensitivity.swing >= AXIS_SWING_FLOOR;
  const mono = { fontFamily: "'JetBrains Mono',monospace" };
  const label = AXIS_META[axis]?.label || axis;

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ ...mono, fontSize: 8, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--dim)' }}>
          {label}
        </span>
        {sensitivity && (
          worthMoving ? (
            <button onClick={() => onChange(sensitivity.bestValue)}
              style={{ ...mono, fontSize: 9, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: value === sensitivity.bestValue ? 'var(--forest)' : 'var(--gold)' }}>
              {value === sensitivity.bestValue ? `✓ best for ${targetMuscle}` : `best for ${targetMuscle} →`}
            </button>
          ) : (
            <span style={{ ...mono, fontSize: 8, color: 'var(--dim)' }}>
              barely affects {targetMuscle}
            </span>
          )
        )}
      </div>
      <div style={{ ...mono, fontSize: 11, color: 'var(--ink)', marginBottom: 2 }}>{reading?.description}</div>
      <input
        type="range" min={0} max={options.length - 1} step={1} value={index}
        onChange={e => onChange(options[+e.target.value])}
        aria-label={`${pattern} ${label}`}
        aria-valuetext={reading?.description || String(value)}
        style={{ width: '100%', accentColor: 'var(--ink)', minHeight: 44 }}
      />
    </div>
  );
}

function PressRowBuilder({ onAdd, lifts }) {
  const [open, setOpen] = useState(false);
  const [pattern, setPattern] = useState(null);
  const [equipment, setEquipment] = useState(null);
  const [angle, setAngle] = useState(null);
  // Separate from `angle` because the angle step now lets you sweep the slider
  // and watch the muscle bars move before committing. Previously picking an
  // angle immediately advanced the wizard, so comparing two positions meant
  // backing out and starting the step again.
  const [angleLocked, setAngleLocked] = useState(false);
  // Optional. When set, the slider marks that muscle's best angle and the
  // confirm step reports how far the current pick is from it.
  const [targetMuscle, setTargetMuscle] = useState(null);
  // The two secondary axes. Independent of `angle` and of each other — each
  // reads its own table, and none of them are combined into a single profile.
  const [frontal, setFrontal] = useState(null);
  const [grip, setGrip] = useState(null);
  const [brand, setBrand] = useState('');
  const [brandPicked, setBrandPicked] = useState(false);

  const reset = () => {
    setPattern(null); setEquipment(null); setAngle(null); setAngleLocked(false);
    setTargetMuscle(null); setBrand(''); setBrandPicked(false);
    setFrontal(null); setGrip(null);
  };

  // Entering the angle step with nothing selected would leave the slider
  // thumbless, so it opens mid-range — or straight on the optimum if a target
  // muscle is already chosen.
  const startAngleStep = (pat, eq) => {
    const options = angleOptionsFor(pat);
    const preset = targetMuscle ? optimalAngleFor(pat, targetMuscle)?.angle : null;
    setEquipment(eq);
    setAngle(preset ?? options[Math.floor(options.length / 2)] ?? null);
    setAngleLocked(false);
  };

  const needsBrand = equipment === 'cable' || equipment === 'machine';
  const brands = needsBrand ? defaultMachineBrands(equipment) : [];

  const pickBrand = b => { setBrand(b); setBrandPicked(true); };
  const skipBrand = () => { setBrand(''); setBrandPicked(true); };

  // Cross-exercise target-weight prediction (functions/muscleCapacity.js):
  // solves per-muscle "capacity" from the athlete's real history on OTHER
  // press/row exercises they've angle-mapped, then predicts this exact,
  // possibly-never-logged angle's expected e1RM from those capacities. Only
  // recomputed when lifts actually change, not on every angle click.
  const capacityResult = useMemo(() => solveMuscleCapacities(buildObservations(lifts), lifts), [lifts]);
  const prediction = angle != null ? predictExerciseE1RM(pattern, angle, capacityResult, equipment) : null;
  const suggestedKg = prediction ? suggestedWeightForReps(prediction.e1rm, 8) : null;

  const build = () => {
    const weights = emgForAngle(pattern, angle);
    if (!weights) return;
    const { primary, secondary } = classifyMuscles(weights);
    const equipLabel = equipment[0].toUpperCase() + equipment.slice(1);
    const patternLabel = patternLabelFor(pattern);
    // Name matches one of functions/exerciseDb.js's isAngleFamily entries
    // exactly (e.g. "Cable Fly") -- angle/brand are per-set attributes now,
    // not part of exercise identity, so every angle you build shares one
    // history under this name. Brand rides along on `machine`, the same
    // per-set field a normal machine/cable exercise already uses for its
    // brand/model, instead of fragmenting identity like angle used to.
    const name = `${equipLabel} ${patternLabel}`;
    onAdd(name, { primary, secondary, emgWeights: weights, suggestedKg, pattern, equipment, angle, machine: brand.trim() || undefined });
    setOpen(false);
    reset();
  };

  const tileStyle = { padding: '9px 12px', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, textTransform: 'capitalize', cursor: 'pointer', border: '1px solid var(--rule)', background: 'var(--paper)', color: 'var(--ink)', textAlign: 'left' };
  const showAngleStep = pattern && equipment && angle != null && !angleLocked;
  const showBrandStep = pattern && equipment && angleLocked && needsBrand && !brandPicked;
  const showConfirm = pattern && equipment && angleLocked && (!needsBrand || brandPicked);
  const targetDeviation = targetMuscle && angle != null ? compareAngle(pattern, angle, targetMuscle) : null;

  return (
    <div style={{ marginTop: 10, borderTop: '1px solid var(--rule)', paddingTop: 10 }}>
      <button onClick={() => { setOpen(v => !v); reset(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--dim)' }}>
        {open ? '− ' : '+ '}Build Press/Row/Fly/Curl/Extension/Leg Curl/Hyperextension
      </button>
      {open && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8, fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', textTransform: 'capitalize' }}>
            {pattern && <button onClick={() => reset()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--dim)', textTransform: 'capitalize', padding: 0 }}>{pattern}</button>}
            {equipment && <><span>›</span><button onClick={() => { setEquipment(null); setAngle(null); setAngleLocked(false); setBrand(''); setBrandPicked(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--dim)', textTransform: 'capitalize', padding: 0 }}>{equipment}</button></>}
            {angleLocked && <><span>›</span><button onClick={() => { setAngleLocked(false); setBrand(''); setBrandPicked(false); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--dim)', padding: 0 }}>{angle}°</button></>}
            {brandPicked && brand && <><span>›</span><span>{brand}</span></>}
          </div>

          {!pattern && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <button style={tileStyle} onClick={() => setPattern('press')}>Press</button>
              <button style={tileStyle} onClick={() => setPattern('row')}>Row</button>
              <button style={tileStyle} onClick={() => setPattern('fly')}>Fly</button>
              <button style={tileStyle} onClick={() => setPattern('curl')}>Curl</button>
              <button style={tileStyle} onClick={() => setPattern('extension')}>Extension</button>
              <button style={tileStyle} onClick={() => setPattern('leg-curl')}>Leg Curl</button>
              <button style={tileStyle} onClick={() => setPattern('hyperextension')}>Hyperextension</button>
            </div>
          )}

          {pattern && !equipment && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {(pattern === 'fly' ? ['dumbbell', 'cable', 'machine']
                : pattern === 'leg-curl' ? ['machine', 'cable']
                : pattern === 'hyperextension' ? ['bodyweight']
                : ['barbell', 'dumbbell', 'cable', 'machine']).map(eq => (
                <button key={eq} style={tileStyle} onClick={() => startAngleStep(pattern, eq)}>{eq}</button>
              ))}
            </div>
          )}

          {showAngleStep && (
            <div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', lineHeight: 1.6, marginBottom: 10 }}>
                {pattern === 'press' ? PRESS_ANGLE_DESC : pattern === 'row' ? ROW_ANGLE_DESC : pattern === 'fly' ? FLY_ANGLE_DESC
                  : pattern === 'curl' ? CURL_ANGLE_DESC : pattern === 'extension' ? EXTENSION_ANGLE_DESC
                  : pattern === 'leg-curl' ? LEG_CURL_ANGLE_DESC : HYPEREXTENSION_ANGLE_DESC}
              </div>
              {/* Optional target muscle. Picking one marks its best angle on
                  the slider and reports the gap on confirm — it never moves the
                  slider on you or restricts which angles you can choose. */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 4 }}>
                  Target muscle <span style={{ textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {targetableMuscles([pattern]).map(m => (
                    <button key={m} onClick={() => setTargetMuscle(targetMuscle === m ? null : m)}
                      style={{
                        fontFamily: "'JetBrains Mono',monospace", fontSize: 9, padding: '4px 8px', cursor: 'pointer',
                        textTransform: 'capitalize', minHeight: 30,
                        border: `1px solid ${targetMuscle === m ? 'var(--gold)' : 'var(--rule)'}`,
                        background: targetMuscle === m ? 'var(--gold)' : 'none',
                        color: targetMuscle === m ? 'var(--paper)' : 'var(--dim)',
                      }}>{m}</button>
                  ))}
                </div>
              </div>

              <AngleSlider pattern={pattern} angle={angle} onChange={setAngle} targetMuscle={targetMuscle} />
              {/* The cost bar needs a real load to be worth drawing, so it
                  appears only once there's a predicted working weight for this
                  movement — suggestedKg comes from the athlete's own capacity
                  model, not a nominal figure invented to fill the bar. */}
              <MuscleCreditBars pattern={pattern} angle={angle} targetMuscle={targetMuscle}
                costContext={suggestedKg ? {
                  exerciseName: `${equipment[0].toUpperCase() + equipment.slice(1)} ${patternLabelFor(pattern)}`,
                  emgWeights: emgForAngle(pattern, angle),
                  sets: 3, kg: suggestedKg, reps: 8, lifts: lifts || [],
                } : null} />

              {/* Elbow flare and grip rotation, where the tables support them.
                  Both render nothing when the pattern has no such table, and
                  grip disappears entirely on a fixed-handle machine — a
                  control for something the equipment can't do would be worse
                  than no control. */}
              <AxisSlider pattern={pattern} axis="frontal" value={frontal ?? 45}
                onChange={setFrontal} equipment={equipment} targetMuscle={targetMuscle} />
              {frontal != null && (
                <MuscleCreditBars pattern={pattern} angle={frontal} axis="frontal"
                  equipment={equipment} targetMuscle={targetMuscle} />
              )}

              <AxisSlider pattern={pattern} axis="grip" value={grip ?? 90}
                onChange={setGrip} equipment={equipment} targetMuscle={targetMuscle} />
              {grip != null && (
                <MuscleCreditBars pattern={pattern} angle={grip} axis="grip"
                  equipment={equipment} targetMuscle={targetMuscle} />
              )}

              <button onClick={() => setAngleLocked(true)}
                style={{ ...tileStyle, width: '100%', marginTop: 10, textAlign: 'center', minHeight: 44, background: 'var(--ink)', color: 'var(--paper)', borderColor: 'var(--ink)' }}>
                Use {angle}°
              </button>
            </div>
          )}

          {showBrandStep && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {brands.map(b => (
                <button key={b} style={tileStyle} onClick={() => pickBrand(b)}>{b}</button>
              ))}
              <button style={{ ...tileStyle, color: 'var(--dim)' }} onClick={skipBrand}>Skip brand</button>
            </div>
          )}

          {showConfirm && (
            <div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--ink)', marginBottom: 8 }}>
                {equipment[0].toUpperCase() + equipment.slice(1)} {patternLabelFor(pattern)} — {angle}°{brand.trim() ? ` — ${brand.trim()}` : ''}
              </div>
              {/* Recommended vs chosen. States the gap and leaves the choice
                  alone — deficitPct is an EMG activation difference against
                  that muscle's own peak, not a predicted strength or growth
                  difference, which the tables can't support. */}
              {targetDeviation && (
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, lineHeight: 1.6, marginBottom: 10, color: targetDeviation.atOptimum ? 'var(--forest)' : 'var(--gold)' }}>
                  {targetDeviation.atOptimum
                    ? `Best available angle for ${targetDeviation.muscle} (${Math.round(targetDeviation.peak)}% activation).`
                    : `${targetDeviation.muscle} at ${Math.round(targetDeviation.current)}% here vs ${Math.round(targetDeviation.peak)}% at ${targetDeviation.peakAngle}° — ${targetDeviation.deficitPct}% below its best angle.`}
                  <span style={{ display: 'block', color: 'var(--dim)', marginTop: 2 }}>Activation difference only — not a predicted strength or growth difference.</span>
                </div>
              )}
              {pattern === 'fly' && flyHeadSplitForAngle(angle) && (() => {
                const split = flyHeadSplitForAngle(angle);
                return (
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', marginBottom: 10 }}>
                    Lower {split.lower}% · Mid {split.mid}% · Upper {split.upper}%
                    <span style={{ display: 'block', marginTop: 2 }}>Informational only — doesn't change your tracked chest number.</span>
                  </div>
                );
              })()}
              {pattern === 'extension' && extensionHeadSplitForAngle(angle) && (() => {
                const split = extensionHeadSplitForAngle(angle);
                return (
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', marginBottom: 10 }}>
                    Long {split.long}% · Lateral {split.lateral}% · Medial {split.medial}%
                    <span style={{ display: 'block', marginTop: 2 }}>Informational only — doesn't change your tracked triceps number.</span>
                  </div>
                );
              })()}
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', lineHeight: 1.6, marginBottom: suggestedKg ? 6 : 10 }}>
                {suggestedKg
                  ? `Suggested first set: ~${suggestedKg}kg × 8 reps${
                      prediction.confidence === 'rough' ? ' — rough ballpark, based on very little logged history yet'
                      : prediction.confidence === 'partial' ? ' — rough estimate, some contributing muscles have no history yet'
                      : ' — from your history on other angles'
                    }.`
                  : 'No target weight suggestion yet — log at least one other press/row/fly exercise (with an angle set) to get even a rough estimate.'}
              </div>
              {prediction?.breakdown && (
                <div style={{ marginBottom: 10, border: '1px solid var(--rule)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--dim)', borderBottom: '1px solid var(--rule)' }}>
                    <span style={{ flex: 1 }}>Muscle</span>
                    <span style={{ width: 34, textAlign: 'right' }}>EMG</span>
                    <span style={{ width: 64, textAlign: 'right' }}>Capacity</span>
                    <span style={{ width: 48, textAlign: 'right' }}>Adds</span>
                  </div>
                  {prediction.breakdown.map(b => (
                    <div key={b.muscle} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', fontFamily: "'JetBrains Mono',monospace", fontSize: 9, borderBottom: '1px solid var(--rule)' }}>
                      <span style={{ flex: 1, textTransform: 'capitalize', color: 'var(--ink)' }}>{b.muscle.replace('-', ' ')}</span>
                      <span style={{ color: 'var(--dim)', width: 34, textAlign: 'right' }}>{b.pct}%</span>
                      <span style={{ color: 'var(--dim)', width: 64, textAlign: 'right' }}>{b.hasData ? `× ${b.capacity}kg` : 'no data'}</span>
                      <span style={{ color: 'var(--ink)', width: 48, textAlign: 'right' }}>{b.hasData ? `${b.contribution}kg` : '—'}</span>
                    </div>
                  ))}
                </div>
              )}
              <button className="prof-btn solid" onClick={build}>Add Exercise</button>
            </div>
          )}

          <button className="ol-btn ol-btn-ghost" style={{ fontSize: 8, marginTop: 8 }} onClick={() => { setOpen(false); reset(); }}>Cancel</button>
        </div>
      )}
    </div>
  );
}

function PlateCalculator() {
  const [open, setOpen] = useState(false);
  const [barWeight, setBarWeight] = useState('20');
  const [targetWeight, setTargetWeight] = useState('');
  const [disabledPlates, setDisabledPlates] = useState(() => new Set());

  const result = useMemo(() => {
    const target = parseFloat(targetWeight), bar = parseFloat(barWeight);
    if (!target || !bar) return null;
    if (target <= bar) return { tooLight: true };
    const available = STANDARD_PLATES_KG.filter(p => !disabledPlates.has(p));
    return platesForWeight(target, bar, available);
  }, [targetWeight, barWeight, disabledPlates]);

  return (
    <div style={{ marginTop: 16, borderTop: '1px solid var(--rule)', paddingTop: 10 }}>
      <button onClick={() => setOpen(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--dim)' }}>
        {open ? '− ' : '+ '}Plate Calculator
      </button>
      {open && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <div className="prof-lbl" style={{ marginBottom: 4 }}>Bar (kg)</div>
              <input className="prof-input" style={{ width: '100%' }} inputMode="decimal" value={barWeight} onChange={e => setBarWeight(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <div className="prof-lbl" style={{ marginBottom: 4 }}>Target (kg)</div>
              <input className="prof-input" style={{ width: '100%' }} inputMode="decimal" placeholder="e.g. 100" value={targetWeight} onChange={e => setTargetWeight(e.target.value)} />
            </div>
          </div>

          <div className="prof-lbl" style={{ marginBottom: 4 }}>Available plates</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {STANDARD_PLATES_KG.map(p => (
              <button key={p} className={`prof-btn${disabledPlates.has(p) ? '' : ' solid'}`}
                onClick={() => setDisabledPlates(prev => {
                  const next = new Set(prev);
                  next.has(p) ? next.delete(p) : next.add(p);
                  return next;
                })}>
                {p}
              </button>
            ))}
          </div>

          {result?.tooLight && (
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--dim)', fontStyle: 'italic' }}>Target is at or under the bar weight.</div>
          )}
          {result && !result.tooLight && (
            <div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', marginBottom: 6 }}>{result.perSide}kg per side:</div>
              {result.plates.length === 0 ? (
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--dim)', fontStyle: 'italic' }}>No available plate combination reaches this weight.</div>
              ) : (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {result.plates.map(({ plate, count }) => (
                    <div key={plate} style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, color: 'var(--ink)', border: '1px solid var(--rule)', padding: '5px 10px' }}>
                      {plate}kg <span style={{ color: 'var(--dim)' }}>×{count}</span>
                    </div>
                  ))}
                </div>
              )}
              {result.leftover > 0 && (
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--ember)', marginTop: 6 }}>
                  {result.leftover}kg per side can't be made with the available plates.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const RPE_PLAIN_LANGUAGE = { easy: 6, medium: 8, failure: 10 };

// Which exercises drive the session. The role comes from sessionPlanner's own
// backbone/accessory split, so this ranks the list the same way the planner
// built it. Beginner only gets the one label that changes behaviour — which
// lift to spend the effort on — since "secondary compound vs isolation" is a
// distinction you can't act on without already knowing the taxonomy.
const ROLE_LABELS = { primary: 'Primary', secondary: 'Secondary', isolation: 'Isolation' };
function ExerciseRoleTag({ role }) {
  const { atMost } = useExpertise();
  if (atMost('beginner') && role !== 'primary') return null;
  const label = atMost('beginner') ? 'Main lift' : ROLE_LABELS[role];
  if (!label) return null;
  return (
    <span style={{
      fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.12em',
      textTransform: 'uppercase', color: role === 'primary' ? 'var(--ink)' : 'var(--dim)',
      border: `1px solid ${role === 'primary' ? 'var(--ink)' : 'var(--rule)'}`,
      padding: '1px 5px', whiteSpace: 'nowrap',
    }}>{label}</span>
  );
}

function WorkoutLogger({ planDay, lifts, customExercises, experienceLevel, cycleRirOffset = 0, onClose, refresh }) {
  const isBeginner = experienceLevel === 'New to training';
  // Read once, on mount — a session already restored into `exercises` below
  // shouldn't be re-read on every render (the App-level restore that opened
  // this component in the first place already matched on the same key).
  const [restored] = useState(() => loadActiveSession());
  const [exercises, setExercises] = useState(() => restored?.exercises || []);
  const [loading, setLoading] = useState(() => !restored && !!planDay);
  const [expandedEx, setExpandedEx] = useState(null);
  const [otherMachineRows, setOtherMachineRows] = useState(() => new Set());
  const [coachNotes, setCoachNotes] = useState({});
  const [coachLoading, setCoachLoading] = useState({});
  const [newEx, setNewEx] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [start] = useState(() => restored?.startedAt || Date.now());
  const workoutDate = new Date().toISOString().split('T')[0];
  const [elapsed, setElapsed] = useState(() => Math.floor((Date.now() - (restored?.startedAt || Date.now())) / 1000));
  // Stored as an absolute end timestamp (survives a backgrounded-tab reload
  // the same way `start`/elapsed does — see the elapsed-timer comment below)
  // rather than a counter decremented in place, and restored from the
  // persisted session below regardless of whether endAt has already passed
  // — the banner is meant to stay up (glycogenPct caps at 100%) until the
  // athlete dismisses it via Skip or starts the next set, not auto-clear
  // itself just because the rest window elapsed while the app was closed.
  const [rest, setRest] = useState(() => restored?.rest || null);
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState(null);
  // FEATURES.md #142: candidate "X vs Y" prompts from this session's own
  // applySessionComplete response, shown one at a time on the finish screen.
  const [comparisonCandidates, setComparisonCandidates] = useState([]);
  const [comparisonIndex, setComparisonIndex] = useState(0);
  // Muscles that crossed into a new strength tier this session (same
  // applySessionComplete response), shown on the finish screen.
  const [rankUps, setRankUps] = useState([]);
  const [newCustomExercises, setNewCustomExercises] = useState(() => restored?.newCustomExercises || []);
  // Guards against losing work by accident — null when no confirmation is
  // pending, 'discard' or 'finish' while one is. Discard only prompts if
  // there's actually something to lose (an untouched session discards
  // silently); Finish only prompts when a set has kg/reps typed in but was
  // never checked off, since that's exactly the kind of set easy to
  // overlook walking away from the gym.
  const [confirmAction, setConfirmAction] = useState(null);
  const [showTypeHelp, setShowTypeHelp] = useState(false);
  const [currentSetIndex, setCurrentSetIndex] = useState(null); // Track which set to fill next
  const [sessionPaused, setSessionPaused] = useState(false);
  const [pausedTime, setPausedTime] = useState(null);
  // ── Gym equipment catalog ────────────────────────────────────────────────
  // See .design/feature-brainstorm/GYM_MACHINE_CATALOG.md. activeGym/
  // gymDetectDone are part of the restored-session snapshot (saveActiveSession
  // below) so "once per workout, at start" survives a mid-workout reload
  // instead of re-prompting every time. gymDetail (the gym's full soft/hard
  // save data) is transient — refetched from the id whenever it's missing.
  const [activeGym, setActiveGym] = useState(() => restored?.activeGym || null); // { id, name }
  const [gymDetectDone, setGymDetectDone] = useState(() => !!restored?.gymDetectDone);
  const [gymDetail, setGymDetail] = useState(null); // { softBrands, hardSaves }
  const [gymCandidates, setGymCandidates] = useState(null); // multiple nearby matches, awaiting a pick
  const [showGymPicker, setShowGymPicker] = useState(false);
  const lastCoordsRef = useRef(null);
  // ── Group session (inline, not a separate page) ─────────────────────────
  // See .design/feature-brainstorm/GROUP_WORKOUT.md. "Your own tab" IS this
  // component's normal exercises state/UI, unchanged — no separate view for
  // it. Only switching to someone else's tab swaps in a different (still
  // plain, non-boxy) view below. groupSessionId persists across a reload
  // the same way ACTIVE_SESSION_KEY does.
  const [groupSessionId, setGroupSessionId] = useState(() => { try { return localStorage.getItem(GROUP_SESSION_KEY) || null; } catch { return null; } });
  const [showGroupStart, setShowGroupStart] = useState(false);
  const [groupData, setGroupData] = useState(null); // { code, participants, entries }
  const [activeGroupTab, setActiveGroupTab] = useState(null); // null = "me"
  const [groupBusy, setGroupBusy] = useState(false);
  const [finishingGroup, setFinishingGroup] = useState(false);
  const inputRef = useRef();

  const allExercises = useMemo(() => {
    const fromLifts = [...new Set((lifts || []).map(l => l.exercise).filter(Boolean))];
    const fromCustom = (customExercises || []).map(ce => ce.name).filter(Boolean);
    return [...new Set([...fromLifts, ...fromCustom, ...BASE_EXERCISES])].sort();
  }, [lifts, customExercises]);

  const prevData = useMemo(() => {
    const byEx = {};
    for (const l of (lifts || [])) {
      if (!byEx[l.exercise]) byEx[l.exercise] = {};
      if (!byEx[l.exercise][l.date]) byEx[l.exercise][l.date] = [];
      byEx[l.exercise][l.date].push(l);
    }
    const out = {};
    for (const [ex, byDate] of Object.entries(byEx)) {
      const d = Object.keys(byDate).sort().at(-1);
      if (d) out[ex] = { date: d, sets: byDate[d] };
    }
    return out;
  }, [lifts]);

  const prData = useMemo(() => {
    const out = {};
    for (const l of (lifts || [])) {
      const v = e1rm(l.kg, l.reps);
      if (v && v > (out[l.exercise] || 0)) out[l.exercise] = v;
    }
    return out;
  }, [lifts]);

  // Load exercises — use preloaded if available, otherwise fetch from AI.
  // Skipped entirely when resuming a restored session: `exercises` is
  // already hydrated from storage above, and re-running this would replace
  // real in-progress sets with a freshly (re)generated plan.
  useEffect(() => {
    if (!planDay || restored) return;
    const session = planDay.sessions?.[0];
    if (!session || session.type === 'rest') { setLoading(false); return; }

    // ex.family (functions/sessionPlanner.js's generateSessionExercises,
    // for an isAngleFamily pick like "Cable Fly") carries pattern/equipment/
    // angle but no emgWeights of its own -- compute it the same way
    // PressRowBuilder.build() does for a manually-built one, so a session-
    // generator-recommended family exercise gets the same precise
    // angle-based fatigue/stimulus crediting once logged, not just the
    // coarse static primary/secondary array every other exercise falls
    // back to.
    const toExercise = ex => ({
      name: ex.name.toLowerCase().trim(),
      targetReps: ex.sets?.[0]?.reps || 8,
      sets: (ex.sets || Array.from({length:3},()=>({type:'N',kg:'',reps:'8'}))).map(s => ({ type: s.type || 'N', kg: String(s.kg || ''), reps: String(s.reps || ''), rpe: '', done: false })),
      // From generateSessionExercises — which lift actually drives this
      // session vs. what's supporting it. Carried through rather than
      // re-derived so the label can't disagree with the plan.
      ...(ex.role ? { role: ex.role } : {}),
      ...(ex.family ? { pattern: ex.pattern, equipment: ex.equipment, angle: ex.angle, emgWeights: emgForAngle(ex.pattern, ex.angle) } : {}),
    });

    if (planDay.preloadedExercises?.length) {
      setExercises(planDay.preloadedExercises.map(toExercise));
      setLoading(false);
      return;
    }

    authFetch(`${API_BASE}/plan/session-exercises`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: session.type, targetMuscles: session.targetMuscles, backboneExercises: session.backboneExercises }),
    }).then(r => r.json()).then(data => {
      if (data.exercises?.length) setExercises(data.exercises.map(toExercise));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    // Derived from `start` on every tick rather than incremented — a plain
    // counter reads correctly while the tab stays alive, but resets to 0 on
    // restore/remount even though `start` (and the persisted session) still
    // know when the session actually began.
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, [start]);

  // Mirror the live session to localStorage on every change so a
  // backgrounded-tab reload (common on mobile) can restore it instead of
  // losing it — see the ACTIVE_SESSION_KEY comment above. Stops once the
  // session is complete; `finish()`/discard clear the key outright at that
  // point instead of leaving a finished session's snapshot behind.
  useEffect(() => {
    if (summary || loading) return;
    saveActiveSession({ planDay, exercises, newCustomExercises, startedAt: start, rest, activeGym, gymDetectDone });
  }, [planDay, exercises, newCustomExercises, start, summary, loading, rest, activeGym, gymDetectDone]);

  // Auto-detect gym once per workout, at start (GYM_MACHINE_CATALOG.md §4).
  // gymDetectDone gets set true regardless of outcome (denied, no match,
  // multiple matches) so this never re-prompts mid-workout on a reload.
  useEffect(() => {
    if (gymDetectDone || !navigator.geolocation) { if (!navigator.geolocation) setGymDetectDone(true); return; }
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude, longitude } = pos.coords;
        lastCoordsRef.current = { lat: latitude, lng: longitude };
        try {
          const r = await api(`gyms/nearby?lat=${latitude}&lng=${longitude}`);
          const gyms = r.gyms || [];
          if (gyms.length === 1) setActiveGym({ id: gyms[0].id, name: gyms[0].name });
          else if (gyms.length > 1) setGymCandidates(gyms);
        } catch {}
        setGymDetectDone(true);
      },
      () => setGymDetectDone(true),
      { timeout: 8000 },
    );
  }, []);

  useEffect(() => {
    if (!activeGym) { setGymDetail(null); return; }
    api(`gyms/${activeGym.id}`).then(setGymDetail).catch(() => setGymDetail(null));
  }, [activeGym?.id]);

  // Implicit soft/hard save (GYM_MACHINE_CATALOG.md §5) — whatever
  // brand/model you pick while an active gym is set is saved back to it,
  // no separate "add a machine" screen. Fire-and-forget: a failed save
  // shouldn't block logging, and gymDetail is optimistically patched so the
  // "in your gym"/prefill UI reflects it immediately rather than waiting on
  // a refetch.
  const saveToGym = (exerciseName, equipmentType, brand, model) => {
    if (!activeGym || !brand) return;
    const key = exerciseName.toLowerCase().trim();
    api(`gyms/${activeGym.id}/save-machine`, {
      method: 'POST',
      body: JSON.stringify({ equipmentType, brand, exercise: exerciseName, model: model || undefined }),
    }).catch(() => {});
    setGymDetail(gd => {
      const base = gd || { softBrands: { cable: [], machine: [], smith: [] }, hardSaves: {} };
      const list = base.softBrands[equipmentType] || [];
      return {
        ...base,
        softBrands: { ...base.softBrands, [equipmentType]: list.includes(brand) ? list : [...list, brand] },
        hardSaves: { ...base.hardSaves, [key]: { brand, model: model || null } },
      };
    });
  };

  // No countdown/auto-clear effect on purpose — the banner is meant to
  // persist (glycogen capped at 100%) once rest is over, not disappear on
  // its own; `elapsed`'s own 1s tick above already re-renders this
  // component every second, which is enough to keep the derived
  // `restRemaining` (computed from the absolute `rest.endAt` below) current.
  // Dismissing it is an explicit choice — Skip, or starting the next set
  // (which overwrites `rest` with a fresh window).
  const restRemaining = rest ? Math.max(0, Math.ceil((rest.endAt - Date.now()) / 1000)) : 0;

  const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const onSearchChange = val => {
    setNewEx(val);
    if (!val.trim()) { setSuggestions([]); return; }
    const q = val.toLowerCase();
    const nameMatches = allExercises.filter(e => e.includes(q));
    const tagMatches = allExercises.filter(e => !e.includes(q) && (EXERCISE_SEARCH_TAGS.get(e) || '').includes(q));
    setSuggestions([...nameMatches, ...tagMatches].slice(0, 8));
  };

  // `custom` (optional) carries a generated exercise's own muscle data —
  // {primary, secondary, emgWeights} from PressRowBuilder — so it's a real
  // exercise-taxonomy entry (visible to session generation, staleness,
  // PR tracking) instead of the bare {name} every other custom exercise
  // gets, and so fatigue.js can use emgWeights for weighted attribution
  // once it's copied onto each set at finish() below.
  const addExercise = (name, custom) => {
    if (!name.trim()) return;
    const key = name.toLowerCase().trim();
    // A generated Press/Row exercise's weighted profile is only ever passed
    // explicitly the moment it's first built (PressRowBuilder's onAdd) --
    // every later time it's picked via search/autocomplete, `custom` is
    // undefined even though the exercise's own record (customExercises,
    // persisted server-side) still has emgWeights/pattern. Without this
    // fallback, weighted fatigue attribution and the elbow-flare tip would
    // silently work only in the session the exercise was first created.
    const stored = !custom ? customExercises?.find(ce => ce.name === key) : null;
    const effective = custom || stored || {};
    // suggestedKg is a one-off logging convenience (this session's first-set
    // prefill), not a fact about the exercise itself -- kept out of the
    // stored customExercises record, unlike primary/secondary/emgWeights/pattern.
    // angle/machine (brand) are likewise per-add, not per-name facts -- a
    // shared family name like "Cable Fly" gets built at a different angle
    // (and possibly different brand) every time, so baking either into the
    // name-keyed customExercises record would misrepresent every add after
    // the first. Since these names now resolve to a real exerciseDb.js
    // entry (functions/exerciseDb.js's isAngleFamily rows), this branch
    // naturally stops firing for them anyway (`allExercises` already
    // includes the name) -- this destructure just keeps taxonomy clean for
    // any other custom exercise that isn't a family build.
    const { suggestedKg, angle, machine: builderMachine, ...taxonomy } = effective;
    if (!allExercises.includes(key)) {
      setNewCustomExercises(p => p.some(ce => ce.name === key) ? p : [...p, { name: key, ...taxonomy }]);
    }
    const prev = prevData[key];
    const sets = prev?.sets?.map(s => ({ type: s.type || 'N', kg: String(s.kg || ''), reps: String(s.reps || ''), rpe: '', done: false }))
      || [{ type: 'N', kg: suggestedKg ? String(suggestedKg) : '', reps: '', rpe: '', done: false }];
    // Prefill from this gym's hard save (GYM_MACHINE_CATALOG.md §5) if one
    // exists for this exercise — the whole point of a hard save.
    const hardSave = activeGym && gymDetail?.hardSaves?.[key];
    setExercises(p => [...p, {
      name: key, targetReps: 8, sets,
      ...(effective.emgWeights ? { emgWeights: effective.emgWeights, pattern: effective.pattern, equipment: effective.equipment, angle } : {}),
      ...(builderMachine ? { machine: builderMachine } : {}),
      ...(hardSave ? { machine: hardSave.brand, ...(hardSave.model ? { model: hardSave.model } : {}) } : {}),
    }]);
    setNewEx(''); setSuggestions([]);
    setTimeout(() => inputRef.current?.focus(), 50);
    // No progression fetch here — the render below already calls
    // progressionFor(lifts, ex.name) live for every exercise, including
    // ones just added here, so a separate backend round-trip for the same
    // computation was redundant (and, worse, rendered as a visible
    // duplicate of the exact same note text once it resolved).
  };

  // expandedEx tracks a raw array index, so removing an earlier exercise
  // reindexes the array underneath it — without this adjustment, expanding
  // exercise B, then deleting an exercise before it in the list, would leave
  // expandedEx pointing at whatever exercise slid into B's old slot instead
  // of B (or the wrong row collapsing/expanding depending on position).
  const removeExercise = i => {
    setExercises(p => p.filter((_, j) => j !== i));
    setExpandedEx(prev => prev == null ? prev : prev === i ? null : prev > i ? prev - 1 : prev);
  };

  const addSet = i => setExercises(p => p.map((ex, j) => j !== i ? ex : {
    ...ex, sets: [...ex.sets, { type: 'N', kg: ex.sets.at(-1)?.kg || '', reps: ex.sets.at(-1)?.reps || '', rpe: '', done: false }]
  }));

  const updateSet = (ei, si, field, val) => setExercises(p => p.map((ex, i) =>
    i !== ei ? ex : { ...ex, sets: ex.sets.map((s, j) => j !== si ? s : { ...s, [field]: val }) }
  ));

  // Tap toggles Warm-up/Working; long-press toggles Drop Set — two separate
  // gestures instead of one cycle through all three, since Drop Set is rare
  // enough that burying it behind an extra tap on every set was more
  // friction than it was worth.
  const toggleType = (ei, si) => setExercises(p => p.map((ex, i) =>
    i !== ei ? ex : { ...ex, sets: ex.sets.map((s, j) => j !== si ? s : { ...s, type: s.type === 'N' ? 'W' : 'N' }) }
  ));
  const toggleDropSet = (ei, si) => setExercises(p => p.map((ex, i) =>
    i !== ei ? ex : { ...ex, sets: ex.sets.map((s, j) => j !== si ? s : { ...s, type: s.type === 'D' ? 'N' : 'D' }) }
  ));
  const typePressTimer = useRef(null);
  const typeLongPressed = useRef(false);
  const handleTypePressStart = (ei, si) => {
    typeLongPressed.current = false;
    typePressTimer.current = setTimeout(() => {
      typeLongPressed.current = true;
      toggleDropSet(ei, si);
    }, 500);
  };
  const handleTypePressEnd = () => {
    if (typePressTimer.current) { clearTimeout(typePressTimer.current); typePressTimer.current = null; }
  };
  const handleTypeClick = (ei, si) => {
    if (typeLongPressed.current) { typeLongPressed.current = false; return; }
    toggleType(ei, si);
  };

  const completeSet = (ei, si) => {
    const ex = exercises[ei];
    const set = ex.sets[si];
    const rpe = parseInt(set.rpe) || null;
    const reps = parseInt(set.reps) || 0;
    const kg = parseFloat(set.kg) || 0;
    const targetReps = ex.targetReps || 8;

    const weekAgo = toLocalDateStr(new Date(Date.now() - 7 * 86400000));
    const exLifts = (lifts || []).filter(l => l.exercise === ex.name && l.date < weekAgo);
    const weekOldMax = exLifts.length ? Math.max(...exLifts.map(l => l.kg || 0)) : null;
    const weekProgressionPct = (weekOldMax && kg) ? ((kg - weekOldMax) / weekOldMax * 100) : 0;
    const setE1rm = e1rm(kg, reps);
    const isNewPR = setE1rm && setE1rm > (prData[ex.name] || 0);

    let feedback = null;
    let feedbackType = 'neutral';
    if (set.type === 'W') {
      // Warmup sets are deliberately low-rep ramp-ups, not attempts at the
      // working-set target — comparing them to targetReps flagged every
      // warmup as "short of target" regardless of how the set actually went.
    } else if (rpe !== null && rpe >= 9 && weekProgressionPct > 5) {
      feedback = 'High effort + rapid load increase — check form before adding weight';
      feedbackType = 'red';
      api(`exercises/${encodeURIComponent(ex.name.replace(/\s+/g, '-'))}`).then(d => {
        if (d.exercise?.form?.[0]) {
          setExercises(p => p.map((e, i) => i !== ei ? e : {
            ...e, sets: e.sets.map((s, j) => j !== si ? s : { ...s, feedback: `${d.exercise.form[0]}`, feedbackType: 'red' })
          }));
        }
      }).catch(() => {});
    } else if (isNewPR) {
      // A rep count under targetReps still reads as "short" by the branch
      // below, but a heavier set that lands a new e1RM PR is the opposite of
      // a shortfall — check this before the rep-count comparison, not after.
      feedback = 'New e1RM PR — strong set';
      feedbackType = 'green';
    } else if (reps < targetReps - 2) {
      feedback = 'Short of target — hold weight next set';
      feedbackType = 'amber';
    } else if (reps > targetReps + 2 && (rpe === null || rpe <= 7)) {
      feedback = 'Strong set — add 2.5kg next set';
      feedbackType = 'green';
    } else if (rpe !== null && rpe >= 7 && rpe <= 8 && reps >= targetReps) {
      feedback = 'On target — maintain next set';
      feedbackType = 'green';
    }

    setExercises(p => p.map((e, i) => i !== ei ? e : {
      ...e, sets: e.sets.map((s, j) => j !== si ? s : { ...s, done: true, feedback, feedbackType })
    }));
    const restDuration = rpe !== null && rpe >= 9 ? 180 : rpe !== null && rpe >= 7 ? 90 : REST_DEFAULT;
    setRest({ endAt: Date.now() + restDuration * 1000, total: restDuration });
  };

  // Re-opens a completed set for editing (mis-entered weight/reps, wrong
  // RPE) — clears feedback too since it was computed from whatever values
  // are about to change, not the corrected ones; completeSet recomputes it
  // fresh when the set is checked off again. Leaves any rest timer already
  // running alone rather than second-guessing whether the athlete still
  // wants it.
  const uncheckSet = (ei, si) => setExercises(p => p.map((ex, i) =>
    i !== ei ? ex : { ...ex, sets: ex.sets.map((s, j) => j !== si ? s : { ...s, done: false, feedback: null, feedbackType: 'neutral' }) }
  ));

  const removeSet = (ei, si) => setExercises(p => p.map((ex, i) =>
    i !== ei ? ex : { ...ex, sets: ex.sets.filter((_, j) => j !== si) }
  ).filter(ex => ex.sets.length > 0));

  const loadCoach = async name => {
    if (coachNotes[name] || coachLoading[name]) return;
    setCoachLoading(p => ({ ...p, [name]: true }));
    try {
      const d = await api(`coach/${encodeURIComponent(name)}`);
      setCoachNotes(p => ({ ...p, [name]: d.note || '' }));
    } finally { setCoachLoading(p => ({ ...p, [name]: false })); }
  };

  const myUid = auth.currentUser?.uid;

  // The exact exercise-add UI (search+suggestions, guided browser, angle
  // builder) — factored out so the group session's "add to everyone" flow
  // (below) uses this literally, not a separate simplified version. Shares
  // the same newEx/suggestions state as the solo body since only one of
  // the two contexts is ever visible at once.
  const renderExerciseAdd = (onAddFn) => (
    <>
      <div style={{ position: 'relative', marginTop: 8, paddingBottom: 40 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input ref={inputRef} className="ex-input" value={newEx}
            onChange={e => onSearchChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onAddFn(newEx); if (e.key === 'Escape') { setSuggestions([]); setNewEx(''); } }}
            placeholder="Search or add exercise…" autoComplete="off" />
          {newEx.trim() && <button className="ol-btn ol-btn-solid" onClick={() => onAddFn(newEx)}>Add</button>}
        </div>
        {suggestions.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--paper)', border: '1px solid var(--ink)', zIndex: 50, maxHeight: 220, overflowY: 'auto' }}>
            {suggestions.map(ex => (
              <div key={ex} onClick={() => onAddFn(ex)}
                style={{ padding: '9px 12px', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, textTransform: 'capitalize', cursor: 'pointer', borderBottom: '1px solid var(--paper2)', color: 'var(--ink)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--paper2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>{ex}</div>
            ))}
            {!allExercises.includes(newEx.toLowerCase().trim()) && newEx.trim() && (
              <div onClick={() => onAddFn(newEx)}
                style={{ padding: '9px 12px', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, cursor: 'pointer', color: 'var(--gold)', borderTop: '1px solid var(--rule)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--paper2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                + Use "{newEx.trim()}"
              </div>
            )}
          </div>
        )}
      </div>
      <EnhancedExercisePicker onAdd={onAddFn} lifts={lifts} workoutDate={workoutDate} />
      <PressRowBuilder onAdd={onAddFn} lifts={lifts} />
    </>
  );

  const persistGroupSessionId = (id) => {
    setGroupSessionId(id);
    try { if (id) localStorage.setItem(GROUP_SESSION_KEY, id); else localStorage.removeItem(GROUP_SESSION_KEY); } catch {}
  };

  // Pull-reconcile-push, always in that strict order within one cycle —
  // not a separate live push independent of polling. Pulling first means a
  // push can never fire without having already folded in whatever another
  // participant added to my tab since the last cycle, which is what
  // actually removes the race a debounced-on-every-keystroke push would
  // have (an in-flight push built from stale local state, wiping a
  // teammate's just-added placeholder before I'd learned about it). This
  // also matches the original design more literally — "manual refresh or
  // ~2-minute poll," not continuous live sync — the local cache
  // (ACTIVE_SESSION_KEY, already mirrored on every exercises change) is
  // what carries you between cycles, not a per-edit network round trip.
  const setsToSync = (list) => {
    const sets = [];
    list.forEach(ex => (ex.sets || []).forEach(st => {
      if (st.kg && st.reps) {
        sets.push({
          exercise: ex.name, kg: st.kg, reps: st.reps, rpe: st.rpe || null,
          type: st.type && st.type !== 'N' ? st.type : null,
          machine: ex.machine || null, pulleyType: ex.pulleyType || null, model: ex.model || null,
        });
      }
    }));
    return sets;
  };

  const loadGroup = () => {
    if (!groupSessionId) return;
    api(`session/${groupSessionId}`).then(r => {
      if (r.error || r.ended) { persistGroupSessionId(null); setGroupData(null); return; }
      setGroupData(r);
      setExercises(prev => {
        const myNames = new Set(prev.map(ex => ex.name));
        const incomingNames = [...new Set((r.entries || []).filter(e => e.uid === myUid).map(e => e.exercise))];
        const missing = incomingNames.filter(n => n && !myNames.has(n));
        const merged = missing.length
          ? [...prev, ...missing.map(name => ({ name, targetReps: 8, sets: [{ type: 'N', kg: '', reps: '', rpe: '', done: false }] }))]
          : prev;
        api(`session/${groupSessionId}/merge`, { method: 'POST', body: JSON.stringify({ sets: setsToSync(merged) }) }).catch(() => {});
        return merged;
      });
    }).catch(() => {});
  };

  useEffect(() => { loadGroup(); }, [groupSessionId]);
  // The only two sync triggers: this ~2-minute automatic poll, and manual
  // refresh (switching to someone else's tab, wired below, or the explicit
  // pre-finish pull in finish()). No polling once finished/left. See
  // GROUP_WORKOUT.md §1.
  useEffect(() => {
    if (!groupSessionId) return;
    const t = setInterval(loadGroup, 2 * 60 * 1000);
    return () => clearInterval(t);
  }, [groupSessionId]);

  // Adding an exercise "to everyone" (GROUP_WORKOUT.md §3) uses the exact
  // same add-exercise path as solo logging for my own copy — addExercise()
  // below, unchanged — rather than a separate simplified version, so it
  // gets the same prior-session set prefill, custom-exercise taxonomy
  // handling, etc. Only the placeholder pushed to everyone else's tab is
  // group-specific (name only, no numbers — see §3 "empty exercise slot").
  const addExerciseToEveryone = async (name, custom) => {
    if (!name.trim() || !groupData) return;
    const key = name.toLowerCase().trim();
    addExercise(name, custom);
    setGroupBusy(true);
    const others = groupData.participants.filter(p => p.status === 'active' && p.uid !== myUid);
    for (const p of others) {
      await api(`session/${groupSessionId}/entries`, { method: 'POST', body: JSON.stringify({ uid: p.uid, exercise: key }) }).catch(() => {});
    }
    setGroupBusy(false);
    loadGroup();
  };

  const updateOtherEntry = async (entryId, patch) => {
    await api(`session/${groupSessionId}/entries/${entryId}`, { method: 'PUT', body: JSON.stringify(patch) }).catch(() => {});
    loadGroup();
  };
  const deleteOtherEntry = async (entryId) => {
    await api(`session/${groupSessionId}/entries/${entryId}`, { method: 'DELETE' }).catch(() => {});
    loadGroup();
  };
  const addSetToOther = async (uid, exerciseName) => {
    await api(`session/${groupSessionId}/entries`, { method: 'POST', body: JSON.stringify({ uid, exercise: exerciseName }) }).catch(() => {});
    loadGroup();
  };

  const leaveGroup = async () => {
    setGroupBusy(true);
    await api(`session/${groupSessionId}/leave`, { method: 'POST' }).catch(() => {});
    persistGroupSessionId(null); setGroupData(null); setActiveGroupTab(null); setGroupBusy(false);
  };

  const finish = async () => {
    const valid = exercises.map(ex => ({
      ...ex, sets: ex.sets.filter(s => s.done || s.kg !== '' || s.reps !== ''),
    })).filter(ex => ex.sets.length > 0);
    if (!valid.length) { clearActiveSession(); onClose(); return; }
    setSaving(true);
    const today = todayLocalStr();
    const allSets = valid.flatMap(ex => ex.sets.map(s => ({
      exercise: ex.name, kg: parseFloat(s.kg) || 0, reps: parseInt(s.reps) || 0, rpe: parseInt(s.rpe) || null,
      ...(s.type && s.type !== 'N' ? { type: s.type } : {}),
      ...(ex.machine ? { machine: ex.machine } : {}),
      ...(ex.pulleyType ? { pulleyType: ex.pulleyType } : {}),
      ...(ex.model ? { model: ex.model } : {}),
      ...(ex.emgWeights ? { emgWeights: ex.emgWeights } : {}),
      ...(ex.angle != null ? { angle: ex.angle } : {}),
      ...(ex.pattern ? { pattern: ex.pattern } : {}),
    })));
    try {
      let r;
      if (groupSessionId) {
        setFinishingGroup(true);
        // Refresh-then-submit (§4): one last push of local state, then pull
        // the freshest shared data — which may include edits someone else
        // made to my sets — and submit THAT as the final record, not the
        // possibly-stale local `allSets`.
        await api(`session/${groupSessionId}/merge`, { method: 'POST', body: JSON.stringify({ sets: setsToSync(exercises) }) }).catch(() => {});
        const fresh = await api(`session/${groupSessionId}`).catch(() => null);
        const myEntries = (fresh?.entries || groupData?.entries || []).filter(e => e.uid === myUid && e.exercise && e.kg && e.reps);
        const finalSets = myEntries.map(e => ({ exercise: e.exercise, kg: e.kg, reps: e.reps, rpe: e.rpe, type: e.type, machine: e.machine, pulleyType: e.pulleyType, model: e.model }));
        r = await api(`session/${groupSessionId}/finish`, {
          method: 'POST',
          body: JSON.stringify({ workout: { name: planDay?.sessions?.[0]?.title || 'Session', date: today, ...(activeGym ? { gymId: activeGym.id } : {}) }, sets: finalSets, customExercises: newCustomExercises, elapsed }),
        });
        persistGroupSessionId(null); setGroupData(null); setFinishingGroup(false);
      } else {
        r = await api('session/complete', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workout: { name: planDay?.sessions?.[0]?.title || 'Session', date: today, ...(activeGym ? { gymId: activeGym.id } : {}) }, sets: allSets, customExercises: newCustomExercises, elapsed }),
        });
      }
      clearActiveSession(); // saved server-side now — stop persisting/offering to restore this one
      await api('summary').then(refresh);
      setSummary({
        name: planDay?.sessions?.[0]?.title || 'Session',
        duration: Math.round(elapsed / 60),
        setsLogged: allSets.filter(s => s.kg || s.reps).length,
        atlasSummary: r.atlasSummary,
      });
      setComparisonCandidates(r.comparisonCandidates || []);
      setComparisonIndex(0);
      setRankUps(r.rankUps || []);
    } catch (e) {
      // Left persisted deliberately: session/complete failed (network etc.),
      // so the in-progress draft is still the only copy of this data.
      onClose();
    }
    setSaving(false);
  };

  // Answering sends a real vote (winner named); skipping omits it entirely
  // — POST /preferences/compare falls back to the implicit signal
  // server-side (resolveImplicitWinner against the account's own history)
  // rather than the frontend guessing what "skip" should count as.
  const answerComparison = winner => {
    const cand = comparisonCandidates[comparisonIndex];
    api('preferences/compare', { method: 'POST', body: JSON.stringify({ a: cand.a, b: cand.b, winner }) }).catch(() => {});
    setComparisonIndex(i => i + 1);
  };
  const skipComparison = () => {
    const cand = comparisonCandidates[comparisonIndex];
    api('preferences/compare', { method: 'POST', body: JSON.stringify({ a: cand.a, b: cand.b }) }).catch(() => {});
    setComparisonIndex(i => i + 1);
  };

  const session = planDay?.sessions?.[0];
  const cns = cnsLoad(exercises);
  const fatigue = sessionFatigue(exercises);
  const fatigueMuscles = Object.entries(fatigue).sort(([,a],[,b]) => b - a);
  // Stimulus is a different question from the fatigue block below it: not
  // "which muscles got hit hardest relative to each other this session"
  // (sessionFatigue, normalized against the session's own max), but "if this
  // session ended right now, where would each muscle's continuous adaptation
  // level peak" — see liveAdaptationPreview and functions/adaptation.js.
  // 100 = the single-session peak a maximal-effort session on its own would
  // reach; recent history stacks on top, so this can (correctly) exceed 100.
  const stimulus = liveAdaptationPreview(exercises, lifts);
  const stimulusMuscles = Object.entries(stimulus).sort(([,a],[,b]) => b - a);
  // Session-wide pattern, not a per-set nag — a single deliberate heavy
  // single/double/triple (testing a top set) shouldn't trip this, only a
  // real majority of the session landing at/below LOW_REP_THRESHOLD. See
  // sessionPlanner.js's isLowRepPattern for the training-ethos reasoning.
  const hardSetsSoFar = exercises.flatMap(ex => ex.sets.filter(s => s.type !== 'W' && s.done));
  const lowRepPattern = isLowRepPattern(hardSetsSoFar);
  const hasUncheckedSets = exercises.some(e => e.sets.some(s => !s.done && (s.kg !== '' || s.reps !== '')));
  const hasLoggedData = exercises.some(e => e.sets.some(s => s.done || s.kg !== '' || s.reps !== ''));
  const th = { fontSize: 8, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--dim)', fontWeight: 400, padding: '3px 0', borderBottom: '1px solid var(--rule)', textAlign: 'right' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--paper)', overflowY: 'auto', display: 'flex', flexDirection: 'column', paddingBottom: rest ? 72 : 0 }}>

      {/* Header */}
      <div className="ol-hdr">
        <div>
          <div className="kicker" style={{ marginBottom: 2 }}>{summary ? 'Complete' : 'In Session'}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 22, fontWeight: 600, letterSpacing: '-.02em' }}>{fmt(elapsed)}</div>
            {!summary && exercises.some(e => e.sets.some(s => s.done)) && (
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.12em', textTransform: 'uppercase', padding: '2px 7px', background: cns.color, color: 'var(--paper)' }}>{cns.label}</span>
            )}
          </div>
          {!summary && exercises.length > 0 && (
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--dim)', marginTop: 4 }}>
              {exercises.filter(e => e.sets.some(s => s.done)).length} of {exercises.length} exercises · {exercises.reduce((sum, e) => sum + e.sets.filter(s => s.done).length, 0)} sets
            </div>
          )}
          {!summary && !groupSessionId && (
            <button onClick={() => setShowGroupStart(true)} style={{ marginTop: 4, background: 'none', border: 'none', fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--dim)', cursor: 'pointer', padding: 0 }}>
              + Group Session
            </button>
          )}
          {/* Gym auto-detect indicator/picker (GYM_MACHINE_CATALOG.md §4).
              Multiple nearby matches don't auto-pick — a short inline
              chooser instead. Once resolved (or dismissed), the small
              "At [gym] · change" link is the only entry point back in. */}
          {!summary && gymCandidates && (
            <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--dim)' }}>
              <span>Which gym?</span>
              {gymCandidates.map(g => (
                <button key={g.id} onClick={() => { setActiveGym({ id: g.id, name: g.name }); setGymCandidates(null); }}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--ink)', textDecoration: 'underline', textTransform: 'none', letterSpacing: 0 }}>
                  {g.name}
                </button>
              ))}
              <button onClick={() => setGymCandidates(null)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--dim)' }}>None</button>
            </div>
          )}
          {!summary && !gymCandidates && activeGym && (
            <button onClick={() => setShowGymPicker(true)} style={{ marginTop: 4, background: 'none', border: 'none', fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--dim)', cursor: 'pointer', padding: 0 }}>
              At {activeGym.name} · change
            </button>
          )}
          {!summary && !gymCandidates && !activeGym && gymDetectDone && (
            <button onClick={() => setShowGymPicker(true)} style={{ marginTop: 4, background: 'none', border: 'none', fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--dim)', cursor: 'pointer', padding: 0 }}>
              + Set Gym
            </button>
          )}
          {/* Tab strip appears here once a group session is attached — a
              plain row of small text buttons, same font/size as the rest of
              the header, not a separate page or a different visual style. */}
          {!summary && groupSessionId && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--dim)' }}>Code {groupData?.code || '…'}</span>
              {(groupData?.participants || []).filter(p => p.status === 'active').map(p => {
                const isMe = p.uid === myUid;
                const active = isMe ? activeGroupTab === null : activeGroupTab === p.uid;
                return (
                  <button key={p.uid} onClick={() => { setActiveGroupTab(isMe ? null : p.uid); loadGroup(); }}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.1em', textTransform: 'uppercase', color: active ? 'var(--ink)' : 'var(--dim)', textDecoration: active ? 'underline' : 'none' }}>
                    {isMe ? 'You' : (p.displayNameFirst || 'Someone')}
                  </button>
                );
              })}
              <button onClick={loadGroup} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--dim)' }}>
                Refresh
              </button>
              <button onClick={leaveGroup} disabled={groupBusy} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--dim)' }}>
                Leave
              </button>
            </div>
          )}
        </div>
        {summary ? (
          <button className="ol-btn ol-btn-solid" onClick={onClose}>Back to Press</button>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="ol-btn ol-btn-ghost" onClick={() => {
              if (hasLoggedData) setConfirmAction('discard'); else { clearActiveSession(); onClose(); }
            }}>Discard</button>
            <button className="ol-btn ol-btn-ghost" onClick={() => { setSessionPaused(!sessionPaused); setPausedTime(sessionPaused ? null : Date.now()); }} title={sessionPaused ? 'Resume session' : 'Pause for a break'}>
              {sessionPaused ? 'Resume' : 'Pause'}
            </button>
            {/* Nothing logged yet -- Finish is disabled rather than allowed
                to silently no-op (finish() used to just close with nothing
                saved). Discard is still the right action for an empty
                session. */}
            <button className="ol-btn ol-btn-solid" onClick={() => setConfirmAction('finish')} disabled={saving || !hasLoggedData} title={!hasLoggedData ? 'Log at least one set before finishing' : undefined}>
              {finishingGroup ? 'Finishing…' : saving ? 'Saving…' : 'Finish'}
            </button>
          </div>
        )}
      </div>

      {/* Loading template */}
      {loading && (
        <div style={{ padding: '40px 20px', textAlign: 'center', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--dim)', letterSpacing: '.08em' }}>
          Generating session plan…
        </div>
      )}

      {!loading && summary && (
        <div style={{ padding: '24px 20px', flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <div className="kicker">Session Complete</div>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 28, fontWeight: 900, lineHeight: 1.1, margin: '6px 0 4px' }}>{summary.name.toUpperCase()}</div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', letterSpacing: '.1em' }}>
              {new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · {summary.duration}min · {summary.setsLogged} sets
            </div>
          </div>
          {rankUps.length > 0 && (
            <div style={{ borderTop: '2px solid var(--ink)', paddingTop: 14 }}>
              <div className="kicker" style={{ marginBottom: 8 }}>Rank Up</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {rankUps.map(({ muscle, fromTier, toTier }) => (
                  <div key={muscle} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: TIER_COLOR[toTier] || 'var(--ink)', flexShrink: 0 }} />
                    <span style={{ fontFamily: "'Playfair Display',serif", fontWeight: 700, fontSize: 14, textTransform: 'capitalize' }}>{muscle.replace(/-/g, ' ')}</span>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)' }}>{fromTier} → {toTier}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div style={{ borderTop: '2px solid var(--ink)', paddingTop: 14 }}>
            <div className="kicker" style={{ marginBottom: 8 }}>Atlas · Training</div>
            {summary.atlasSummary
              ? <div style={{ fontFamily: "'Times New Roman',serif", fontSize: 14, lineHeight: 1.85, color: 'var(--ink)' }}>{summary.atlasSummary}</div>
              : <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--dim)' }}>Atlas was quiet today.</div>
            }
          </div>
          {comparisonIndex < comparisonCandidates.length && (() => {
            const cand = comparisonCandidates[comparisonIndex];
            return (
              <div style={{ borderTop: '2px solid var(--ink)', paddingTop: 14 }}>
                <div className="kicker" style={{ marginBottom: 8 }}>Which do you prefer?</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button className="ol-btn ol-btn-solid" style={{ textAlign: 'left' }} onClick={() => answerComparison(cand.a)}>{cand.a}</button>
                  <button className="ol-btn ol-btn-solid" style={{ textAlign: 'left' }} onClick={() => answerComparison(cand.b)}>{cand.b}</button>
                  <button className="ol-btn ol-btn-ghost" style={{ fontSize: 8, alignSelf: 'flex-start' }} onClick={skipComparison}>Skip</button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {!loading && !summary && activeGroupTab === null && (
        <div style={{ padding: '16px 20px', flex: 1, display: 'flex', flexDirection: 'column' }}>

          {/* AI plan context */}
          {session && (
            <div style={{ marginBottom: 18, padding: '10px 12px', borderLeft: '2px solid var(--gold)', background: 'var(--paper2)' }}>
              <div className="kicker" style={{ marginBottom: 4 }}>{session.type} · {session.duration}</div>
              <div style={{ fontFamily: "'Playfair Display',serif", fontStyle: 'italic', fontSize: 15, marginBottom: 4 }}>{session.title}</div>
              <div style={{ fontSize: 11, color: 'var(--dim)', lineHeight: 1.5 }}>{session.detail}</div>
            </div>
          )}

          {/* Low-rep pattern callout — training ethos biases toward 8-9 reps;
              1-2 reps rarely deliver enough stimulus per set to default to.
              Only shown once it's a real session-wide majority, not a single
              deliberate heavy set. */}
          {lowRepPattern && (
            <div style={{ marginBottom: 18, padding: '10px 12px', borderLeft: '2px solid var(--ember)', background: 'var(--paper2)' }}>
              <div className="kicker" style={{ marginBottom: 4 }}>Rep Range</div>
              <div style={{ fontSize: 11, color: 'var(--dim)', lineHeight: 1.5 }}>
                Most hard sets so far are at or under {LOW_REP_THRESHOLD} reps. Ethos biases toward 8-9 reps — low singles/doubles/triples rarely deliver enough stimulus per set to default to.
              </div>
            </div>
          )}

          {/* Load impact preview */}
          {fatigueMuscles.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div className="kicker" style={{ marginBottom: 6 }}>Session Load</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {fatigueMuscles.map(([m, pct]) => (
                  <div key={m} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: pct > 70 ? 'var(--ember)' : pct > 35 ? 'var(--gold)' : 'var(--forest)', flexShrink: 0 }} />
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', textTransform: 'capitalize' }}>{m}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Live projected peak — where each muscle's stacked adaptation
              curve (recent history + this session so far) would peak
              ADAPTATION_PEAK_H from now if the session ended right now. 100 = a single maximal
              session's own peak; recent history stacking on top can push
              this past 100, which is expected, not a warning. */}
          {stimulusMuscles.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div className="kicker" style={{ marginBottom: 6 }}>Session Stimulus</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {stimulusMuscles.map(([m, pct]) => (
                  <div key={m} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: pct > 130 ? 'var(--ember)' : pct >= 70 ? 'var(--forest)' : 'var(--gold)', flexShrink: 0 }} />
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', textTransform: 'capitalize' }}>{m} {pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Exercise blocks */}
          {(() => {
            let nextSetFound = false;
            return exercises.map((ex, i) => {
              const prev = prevData[ex.name];
              const doneE1rms = ex.sets.filter(s => s.done).map(s => e1rm(+s.kg, +s.reps)).filter(Boolean);
              const bestE1rm = doneE1rms.length ? Math.max(...doneE1rms) : null;
              const isPR = bestE1rm && bestE1rm > (prData[ex.name] || 0);
            const vol = ex.sets.filter(s => s.done).reduce((a, s) => a + (+s.kg || 0) * (+s.reps || 1), 0);
            const prog = progressionFor(lifts, ex.name);
            const progression = prog?.note || null;
            // Freestyle-only: a planned session already communicates its set
            // count by pre-filling that many rows (see
            // generateSessionExercises), but a freestyle-added exercise
            // starts with just one blank/carried-over set and no RIR
            // guidance at all — this fills that specific gap.
            let freestyleSuggestion = null;
            if (!planDay) {
              const sessionCount = new Set(lifts.filter(l => l.exercise === ex.name).map(l => l.date)).size;
              const setCount = suggestedWorkingSetCount(sessionCount);
              freestyleSuggestion = `Suggested: ${setCount} sets · RIR ${suggestedRirSequence(setCount, cycleRirOffset).join('→')}`;
            }
            const isExpanded = expandedEx === i;
            const coach = coachNotes[ex.name];
            const isLoadingCoach = coachLoading[ex.name];
            const muscleGroup = EXERCISE_DB.find(e => e.name === ex.name)?.muscleGroup || '';
            const showMuscleSeparator = i === 0 || EXERCISE_DB.find(e => e.name === exercises[i-1].name)?.muscleGroup !== muscleGroup;

            return (
              <div key={i}>
                {showMuscleSeparator && muscleGroup && (
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--dim)', marginTop: i > 0 ? 18 : 0, marginBottom: 8, fontWeight: 600 }}>— {muscleGroup} —</div>
                )}
                <div style={{ marginBottom: 22, paddingBottom: 16, borderBottom: '2px solid var(--ink)' }}>
                  {/* Exercise header row */}
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 2 }}>
                  <button onClick={() => setExpandedEx(isExpanded ? null : i)}
                    style={{ fontFamily: "'Playfair Display',serif", fontWeight: 700, fontSize: 17, textTransform: 'capitalize', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--ink)', textAlign: 'left', transition: 'opacity .2s' }}>
                    {ex.name} {isExpanded ? '▼' : '▸'}
                  </button>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    {ex.role && <ExerciseRoleTag role={ex.role} />}
                    {isPR && <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.12em', background: 'var(--gold)', color: 'var(--paper)', padding: '2px 6px' }}>PR</span>}
                    {bestE1rm && <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)' }}>e1RM {bestE1rm}kg</span>}
                    <button onClick={() => removeExercise(i)} style={{ background: 'none', border: 'none', color: 'var(--dim)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
                  </div>
                </div>

                {/* Chest-head split — informational only, shown just for this
                    logged exercise. Deliberately doesn't feed fatigue/stimulus
                    as its own tracked muscle (see functions/chestHeadSplit.js):
                    outside a workout, chest stays one number comparable to
                    every other unsplit muscle; inside one, you can see which
                    head this specific exercise is actually emphasizing. */}
                {(() => {
                  const split = chestSplitForExercise(ex.name);
                  return split && (
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', marginBottom: 3 }}>
                      Lower {split.lower}% · Mid {split.mid}% · Upper {split.upper}%
                    </div>
                  );
                })()}

                {/* Angle-family exercise (functions/exerciseDb.js's
                    isAngleFamily, e.g. "Cable Fly" built via Build Press/
                    Row/Fly, or recommended by session generation) — angle is
                    a per-set attribute now, not part of the name, so it's
                    shown here rather than in the header. Fly's own
                    lower/mid/upper split is angle-derived (chestHeadSplit.js's
                    flyHeadSplitForAngle), a different axis than the
                    bench-incline split above, so it's shown separately. */}
                {ex.pattern && ex.angle != null && (
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', marginBottom: 3 }}>
                    {patternLabelFor(ex.pattern)} angle: {ex.angle}°
                    {ex.pattern === 'fly' && flyHeadSplitForAngle(ex.angle) && (() => {
                      const split = flyHeadSplitForAngle(ex.angle);
                      return <span> — Lower {split.lower}% · Mid {split.mid}% · Upper {split.upper}%</span>;
                    })()}
                    {ex.pattern === 'extension' && extensionHeadSplitForAngle(ex.angle) && (() => {
                      const split = extensionHeadSplitForAngle(ex.angle);
                      return <span> — Long {split.long}% · Lateral {split.lateral}% · Medial {split.medial}%</span>;
                    })()}
                  </div>
                )}

                {/* Elbow-flare (frontal-plane) and grip-rotation form cues —
                    companions to the press/row angle already chosen
                    (functions/emgActivation.js's formCuesForExercise).
                    Describe how to position elbows/grip to actually hit what
                    this exercise's angle already targets; don't change
                    fatigue/stimulus attribution at all. */}
                {formCuesForExercise(ex).map((tip, ti) => (
                  <div key={ti} style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', marginBottom: 3, fontStyle: 'italic' }}>
                    {tip}
                  </div>
                ))}

                {/* History chart (expanded) */}
                {isExpanded && <ExHistoryChart name={ex.name} lifts={lifts} />}

                {/* Previous performance */}
                {prev && (
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', marginBottom: 3 }}>
                    {localDateFromYMD(prev.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {prev.sets.map(s => `${s.kg}×${s.reps}${s.type === 'W' ? 'w' : ''}`).join(', ')}
                  </div>
                )}

                {/* Progressive overload suggestion — used to be duplicated by a
                    second "AI-generated" note fetched from the backend, back
                    when the session planner called Gemini for this. Since the
                    planner went fully deterministic (both paths call the same
                    progressionFor()), that second fetch just reproduced this
                    exact same string a beat later and rendered it twice. */}
                {progression && (
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: prog.trend === 'stalled' ? 'var(--ember)' : 'var(--forest)', marginBottom: 5 }}>
                    {progression}
                  </div>
                )}

                {/* Freestyle set-count/RIR guidance — see freestyleSuggestion
                    above for why this only appears outside a planned session. */}
                {freestyleSuggestion && (
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--navy)', marginBottom: 5 }}>
                    {freestyleSuggestion}
                  </div>
                )}

                {/* AI coaching note */}
                <div style={{ marginBottom: 8 }}>
                  {coach
                    ? <div style={{ fontFamily: "'Playfair Display',serif", fontStyle: 'italic', fontSize: 11, color: 'var(--dim)', lineHeight: 1.4 }}>"{coach}"</div>
                    : <button onClick={() => loadCoach(ex.name)} disabled={isLoadingCoach}
                        style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.1em', textTransform: 'uppercase', background: 'none', border: 'none', color: 'var(--dim)', cursor: 'pointer', padding: 0, opacity: isLoadingCoach ? .5 : 1 }}>
                        {isLoadingCoach ? 'Loading cue…' : '+ Coaching cue'}
                      </button>
                  }
                </div>

                {/* Volume + optional machine/technique tag */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                  {vol > 0 && <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)' }}>{Math.round(vol).toLocaleString()} kg total</span>}
                  {(() => {
                    const equipment = findExercise(ex.name)?.equipment;
                    const brands = defaultMachineBrands(equipment);
                    const tagStyle = { fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.03em', padding: '3px 6px', border: '1px solid var(--rule)', background: 'none', color: 'var(--dim)' };
                    if (!brands.length) {
                      // Barbell/dumbbell/bodyweight have no brand-specific
                      // leverage/curve — free text stays for whatever
                      // personal technique note is still worth tagging.
                      return (
                        <>
                          <input list={`machine-tags-${i}`} value={ex.machine || ''} placeholder="Machine/technique (optional)"
                            onChange={e => setExercises(p => p.map((el, j) => j !== i ? el : { ...el, machine: e.target.value }))}
                            style={{ ...tagStyle, width: 150 }} />
                          <datalist id={`machine-tags-${i}`}>
                            {[...new Set((lifts || []).filter(l => l.exercise === ex.name && l.machine).map(l => l.machine))].map(m => <option key={m} value={m} />)}
                          </datalist>
                        </>
                      );
                    }
                    // Gym-scoped brands (GYM_MACHINE_CATALOG.md §5) surface
                    // first via a labeled <optgroup> — a native, no-JS way to
                    // get a divider inside a <select> — with the full
                    // catalog below. saveToGym below is the implicit
                    // soft/hard-save side effect of picking here; there's no
                    // separate "add a machine" screen.
                    const gymBrands = (activeGym && gymDetail?.softBrands?.[equipment]) || [];
                    const otherBrands = brands.filter(b => !gymBrands.includes(b));
                    const showOther = otherMachineRows.has(i) || (ex.machine && !brands.includes(ex.machine));
                    const modelKey = ex.machine ? `${normalizeExerciseKeyPkg(ex.name)}|${ex.machine.toLowerCase()}` : null;
                    const suggestedModel = modelKey ? MACHINE_MODELS[modelKey] : null;
                    return (
                      <>
                        <select value={showOther ? '__other__' : (ex.machine || '')}
                          onChange={e => {
                            const v = e.target.value;
                            if (v === '__other__') { setOtherMachineRows(p => new Set(p).add(i)); return; }
                            setOtherMachineRows(p => { const n = new Set(p); n.delete(i); return n; });
                            // A researched-catalog suggestion (MACHINE_MODELS)
                            // is committed to state here, not just shown as a
                            // placeholder — otherwise the model input below
                            // could display a suggestion that silently never
                            // gets saved if the user never touches it.
                            const nextModel = ex.model || (v ? MACHINE_MODELS[`${normalizeExerciseKeyPkg(ex.name)}|${v.toLowerCase()}`] : undefined) || '';
                            setExercises(p => p.map((el, j) => j !== i ? el : { ...el, machine: v, model: nextModel }));
                            if (v) saveToGym(ex.name, equipment, v, nextModel);
                          }}
                          style={tagStyle}>
                          <option value="">Brand (optional)</option>
                          {gymBrands.length > 0 ? (
                            <>
                              <optgroup label="In your gym">
                                {gymBrands.map(b => <option key={b} value={b}>{b}</option>)}
                              </optgroup>
                              <optgroup label="All brands">
                                {otherBrands.map(b => <option key={b} value={b}>{b}</option>)}
                              </optgroup>
                            </>
                          ) : otherBrands.map(b => <option key={b} value={b}>{b}</option>)}
                          <option value="__other__">Other…</option>
                        </select>
                        {showOther && (
                          <input value={ex.machine || ''} placeholder="Gym/brand name" autoFocus
                            onChange={e => setExercises(p => p.map((el, j) => j !== i ? el : { ...el, machine: e.target.value }))}
                            onBlur={e => e.target.value && saveToGym(ex.name, equipment, e.target.value, ex.model)}
                            style={{ ...tagStyle, width: 120 }} />
                        )}
                        {ex.machine && (
                          <>
                            <input list={`model-tags-${i}`} value={ex.model || ''} placeholder="Model (optional)"
                              onChange={e => setExercises(p => p.map((el, j) => j !== i ? el : { ...el, model: e.target.value }))}
                              onBlur={e => e.target.value && saveToGym(ex.name, equipment, ex.machine, e.target.value)}
                              style={{ ...tagStyle, width: 150 }} />
                            <datalist id={`model-tags-${i}`}>
                              {suggestedModel && <option value={suggestedModel} />}
                            </datalist>
                          </>
                        )}
                        {equipment === 'cable' && (
                          <select value={ex.pulleyType || ''}
                            onChange={e => setExercises(p => p.map((el, j) => j !== i ? el : { ...el, pulleyType: e.target.value }))}
                            style={tagStyle}>
                            <option value="">Pulley (optional)</option>
                            <option value="single">Single Pulley</option>
                            <option value="double">Double Pulley</option>
                          </select>
                        )}
                      </>
                    );
                  })()}
                </div>

                {/* Sets table */}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, marginBottom: 8 }}>
                  <thead>
                    <tr>
                      <th style={{ ...th, textAlign: 'left', width: 26 }}>Set</th>
                      <th style={{ ...th, width: 56 }}>Prev</th>
                      <th style={{ ...th, width: 48 }}>kg</th>
                      <th style={{ ...th, width: 38 }}>Reps</th>
                      <th style={{ ...th, width: isBeginner ? 58 : 28 }}>{isBeginner ? 'Effort' : 'RPE'}</th>
                      <th style={{ ...th, width: 26 }}>✓</th>
                      <th style={{ ...th, width: 16 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {ex.sets.map((set, j) => {
                      const prevSet = prev?.sets?.[j];
                      const setE1rm = e1rm(+set.kg, +set.reps);
                      const setIsPR = setE1rm && setE1rm > (prData[ex.name] || 0);
                      const isWorking = set.type !== 'W';
                      const fbColor = set.feedbackType === 'green' ? 'var(--forest)' : set.feedbackType === 'red' ? 'var(--red)' : set.feedbackType === 'amber' ? 'var(--gold)' : 'var(--dim)';
                      const minRepsForPR = (!set.done && isWorking && +set.kg > 0) ? repsForPR(+set.kg, prData[ex.name]) : null;
                      const isCurrentSet = !nextSetFound && !set.done;
                      if (isCurrentSet) nextSetFound = true;
                      return (
                        <React.Fragment key={j}>
                        <tr style={{ opacity: set.done ? 0.45 : 1, backgroundColor: isCurrentSet ? 'var(--paper2)' : 'transparent' }}>
                          <td style={{ padding: '5px 0', textAlign: 'left' }}>
                            <button onClick={() => handleTypeClick(i, j)}
                              onMouseDown={() => handleTypePressStart(i, j)} onMouseUp={handleTypePressEnd} onMouseLeave={handleTypePressEnd}
                              onTouchStart={() => handleTypePressStart(i, j)} onTouchEnd={handleTypePressEnd}
                              title={`${SET_LABELS[set.type]} — tap: warm-up/working, hold: drop set`}
                              style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 600, background: set.type === 'W' ? 'var(--navy)' : set.type === 'D' ? 'var(--gold)' : 'var(--paper2)', color: set.type !== 'N' ? 'var(--paper)' : 'var(--dim)', border: 'none', padding: '4px 6px', cursor: 'pointer', minWidth: 28, textAlign: 'center', touchAction: 'manipulation', borderRadius: 3 }}>
                              {set.type === 'N' ? j + 1 : set.type}
                            </button>
                          </td>
                          <td style={{ padding: '5px 0', textAlign: 'right', color: 'var(--dim)', fontSize: 10 }}>
                            {prevSet ? `${prevSet.kg}×${prevSet.reps}` : '—'}
                          </td>
                          <td style={{ padding: '5px 0', textAlign: 'right' }}>
                            <input className="set-input" value={set.kg} onChange={e => updateSet(i, j, 'kg', e.target.value)}
                              inputMode="decimal" placeholder="—" disabled={set.done}
                              style={{ color: setIsPR ? 'var(--gold)' : 'var(--ink)', width: 42 }} />
                          </td>
                          <td style={{ padding: '5px 0', textAlign: 'right' }}>
                            <input className="set-input" value={set.reps} onChange={e => updateSet(i, j, 'reps', e.target.value)}
                              inputMode="numeric" placeholder="—" disabled={set.done}
                              style={{ color: 'var(--ink)', width: 30 }} />
                          </td>
                          <td style={{ padding: '5px 0', textAlign: 'right' }}>
                            {isWorking
                              ? isBeginner
                                ? <select value={Object.keys(RPE_PLAIN_LANGUAGE).find(k => String(RPE_PLAIN_LANGUAGE[k]) === String(set.rpe)) || ''}
                                    onChange={e => updateSet(i, j, 'rpe', e.target.value ? String(RPE_PLAIN_LANGUAGE[e.target.value]) : '')}
                                    disabled={set.done}
                                    style={{ color: 'var(--dim)', fontFamily: "'JetBrains Mono',monospace", fontSize: 9, background: 'transparent', border: 'none', width: 56 }}>
                                    <option value="">—</option>
                                    <option value="easy">Easy</option>
                                    <option value="medium">Medium</option>
                                    <option value="failure">Failure</option>
                                  </select>
                                : <input className="set-input" value={set.rpe} onChange={e => updateSet(i, j, 'rpe', e.target.value)}
                                    inputMode="numeric" placeholder="—" disabled={set.done}
                                    style={{ color: 'var(--dim)', width: 24 }} />
                              : <span style={{ color: 'var(--rule)', fontSize: 10 }}>—</span>
                            }
                          </td>
                          <td style={{ padding: '5px 0', textAlign: 'right' }}>
                            {set.done
                              ? <button onClick={() => uncheckSet(i, j)} title="Tap to re-edit" style={{ background: 'none', border: 'none', color: 'var(--forest)', cursor: 'pointer', fontSize: 13, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</button>
                              : <button onClick={() => completeSet(i, j)} style={{ background: 'none', border: '1px solid var(--rule)', color: 'var(--dim)', cursor: 'pointer', fontSize: 11, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</button>
                            }
                          </td>
                          <td style={{ textAlign: 'right', padding: '5px 0' }}>
                            <button onClick={() => removeSet(i, j)} style={{ background: 'none', border: 'none', color: 'var(--rule)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
                          </td>
                        </tr>
                        {set.done && set.feedback && (
                          <tr>
                            <td colSpan={6} style={{ paddingBottom: 4 }}>
                              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.09em', color: fbColor }}>↳ {set.feedback}</span>
                            </td>
                          </tr>
                        )}
                        {minRepsForPR != null && (
                          <tr>
                            <td colSpan={6} style={{ paddingBottom: 4 }}>
                              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.09em', color: 'var(--dim)' }}>
                                ↳ PR pace at {set.kg}kg — {minRepsForPR}–{minRepsForPR + 3} reps
                              </span>
                            </td>
                          </tr>
                        )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
                <button className="ol-btn ol-btn-ghost" style={{ fontSize: 8 }} onClick={() => addSet(i)}>+ Set</button>
                </div>
              </div>
            );
            });
          })()}

          {/* Exercise search */}
          {renderExerciseAdd(addExercise)}
          <PlateCalculator />
        </div>
      )}

      {/* Someone else's tab in a group session — a plain list using the same
          typography as the rest of the app (Times New Roman body text,
          JetBrains Mono labels), not a separate boxy page. Full mutual edit:
          any active participant can edit or delete any other's sets while
          both are still active. */}
      {!loading && !summary && activeGroupTab !== null && (() => {
        const otherParticipant = (groupData?.participants || []).find(p => p.uid === activeGroupTab);
        const otherEntries = (groupData?.entries || []).filter(e => e.uid === activeGroupTab);
        const otherExerciseNames = [...new Set(otherEntries.map(e => e.exercise))];
        return (
          <div style={{ padding: '16px 20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div className="kicker" style={{ marginBottom: 10 }}>{otherParticipant?.displayNameFirst || 'Someone'}'s sets</div>

            {otherExerciseNames.length === 0 && (
              <div style={{ fontFamily: "'Times New Roman',serif", fontSize: 13, color: 'var(--dim)', fontStyle: 'italic' }}>Nothing logged here yet.</div>
            )}

            {otherExerciseNames.map(exName => (
              <div key={exName} style={{ marginBottom: 18 }}>
                <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 15, fontWeight: 700, marginBottom: 6, textTransform: 'capitalize' }}>{exName}</div>
                {otherEntries.filter(e => e.exercise === exName).map(e => (
                  <div key={`${e.id}-${e.updatedAt}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--paper2)' }}>
                    <input style={{ width: 56, border: 'none', borderBottom: '1px solid var(--rule)', background: 'transparent', fontFamily: 'Times New Roman,serif', fontSize: 14, color: 'var(--ink)' }}
                      type="number" inputMode="decimal" placeholder="kg" defaultValue={e.kg ?? ''}
                      onBlur={ev => { const v = ev.target.value ? +ev.target.value : null; if (v !== e.kg) updateOtherEntry(e.id, { kg: v }); }} />
                    <span style={{ fontSize: 11, color: 'var(--dim)' }}>×</span>
                    <input style={{ width: 46, border: 'none', borderBottom: '1px solid var(--rule)', background: 'transparent', fontFamily: 'Times New Roman,serif', fontSize: 14, color: 'var(--ink)' }}
                      type="number" inputMode="numeric" placeholder="reps" defaultValue={e.reps ?? ''}
                      onBlur={ev => { const v = ev.target.value ? +ev.target.value : null; if (v !== e.reps) updateOtherEntry(e.id, { reps: v }); }} />
                    <input style={{ width: 46, border: 'none', borderBottom: '1px solid var(--rule)', background: 'transparent', fontFamily: 'Times New Roman,serif', fontSize: 14, color: 'var(--ink)' }}
                      type="number" inputMode="decimal" placeholder="RPE" defaultValue={e.rpe ?? ''}
                      onBlur={ev => { const v = ev.target.value ? +ev.target.value : null; if (v !== e.rpe) updateOtherEntry(e.id, { rpe: v }); }} />
                    <button onClick={() => deleteOtherEntry(e.id)} style={{ background: 'none', border: 'none', color: 'var(--dim)', cursor: 'pointer', fontSize: 15, padding: '0 4px', marginLeft: 'auto' }}>×</button>
                  </div>
                ))}
                <button onClick={() => addSetToOther(activeGroupTab, exName)}
                  style={{ marginTop: 6, background: 'none', border: 'none', fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--dim)', cursor: 'pointer', padding: 0 }}>
                  + Set
                </button>
              </div>
            ))}

            <div className="kicker" style={{ margin: '14px 0 6px' }}>Add for everyone</div>
            {renderExerciseAdd(addExerciseToEveryone)}
          </div>
        );
      })()}

      {/* Rest timer — shows live glycogen replenishment (% recovered, half-life
          45s) rather than a plain time countdown; stays capped at 100% once
          rest is over rather than auto-clearing, until Skip or the next set. */}
      {rest && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--ink)', color: 'var(--paper)', zIndex: 1100, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,.2)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: '100%', background: 'var(--paper)', borderRadius: 2, transform: `scaleX(${glycogenPct(rest.total - restRemaining, rest.total) / 100})`, transformOrigin: 'left', transition: 'transform 1s linear' }} />
          </div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 16, fontWeight: 600, whiteSpace: 'nowrap' }}>Glycogen {glycogenPct(rest.total - restRemaining, rest.total)}%</div>
          <button onClick={() => setRest(null)} style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', background: 'none', border: '1px solid rgba(255,255,255,.3)', color: 'var(--paper)', padding: '4px 10px', cursor: 'pointer' }}>Skip</button>
        </div>
      )}

      {/* Discard/Finish safety prompts. Discard only prompts if there's
          actually something to lose (hasData check above); Finish now always
          confirms before ending the session, with a more specific warning
          layered on top when there's also an unchecked-but-filled-in set
          about to be silently saved as-is. */}
      {/* Type legend help modal */}
      {showTypeHelp && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--paper)', border: '3px solid var(--ink)', padding: 24, maxWidth: 360, width: '100%' }}>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 17, fontWeight: 700, marginBottom: 14, color: 'var(--ink)' }}>Set Type</div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--ink)', lineHeight: 2, marginBottom: 20 }}>
              <div><span style={{ fontWeight: 600 }}>N</span> = Normal set</div>
              <div><span style={{ fontWeight: 600 }}>W</span> = Warmup (lighter, preparatory)</div>
              <div><span style={{ fontWeight: 600 }}>R</span> = Rest-pause (take reps, rest 15s, more reps)</div>
              <div><span style={{ fontWeight: 600 }}>S</span> = Straight set (as written, no variation)</div>
              <div><span style={{ fontWeight: 600 }}>T</span> = Drop set (heavy, then drop weight and continue)</div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="ol-btn ol-btn-solid" onClick={() => setShowTypeHelp(false)}>Got it</button>
            </div>
          </div>
        </div>
      )}

      {confirmAction && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--paper)', border: '3px solid var(--ink)', padding: 24, maxWidth: 360, width: '100%' }}>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 17, fontWeight: 700, marginBottom: 10, color: 'var(--ink)' }}>
              {confirmAction === 'discard' ? 'Discard this workout?' : hasUncheckedSets ? 'Finish with unchecked sets?' : 'End this workout?'}
            </div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--dim)', lineHeight: 1.6, marginBottom: 20 }}>
              {confirmAction === 'discard'
                ? 'Every set you\'ve entered will be lost — this can\'t be undone.'
                : hasUncheckedSets
                  ? 'Some sets have a weight or rep count entered but were never checked off. Finishing now will save them as-is without a coaching cue, and they won\'t get another chance to be reviewed.'
                  : `You'll save ${exercises.length} exercises with ${exercises.reduce((sum, e) => sum + e.sets.filter(s => s.done).length, 0)} completed sets and end this session.`}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="ol-btn ol-btn-ghost" onClick={() => setConfirmAction(null)}>Cancel</button>
              <button className="ol-btn ol-btn-solid" onClick={() => {
                const action = confirmAction;
                setConfirmAction(null);
                if (action === 'discard') { clearActiveSession(); onClose(); } else finish();
              }}>{confirmAction === 'discard' ? 'Discard' : 'Finish'}</button>
            </div>
          </div>
        </div>
      )}
      {showGroupStart && (
        <GroupSessionStartModal
          onClose={() => setShowGroupStart(false)}
          onStarted={(sessionId) => { persistGroupSessionId(sessionId); setShowGroupStart(false); }}
        />
      )}
      {showGymPicker && (
        <GymPickerModal
          activeGym={activeGym}
          lastCoordsRef={lastCoordsRef}
          onClose={() => setShowGymPicker(false)}
          onSelect={g => { setActiveGym(g); setGymCandidates(null); setShowGymPicker(false); }}
          onClear={() => { setActiveGym(null); setShowGymPicker(false); }}
        />
      )}
    </div>
  );
}

// ── HEVY IMPORT ───────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.replace(/\r/g, '').trim().split('\n');
  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
  return lines.slice(1).filter(Boolean).map(line => {
    const vals = []; let cur = ''; let q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === ',' && !q) { vals.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    vals.push(cur.trim());
    return Object.fromEntries(headers.map((h, i) => [h, (vals[i] || '').replace(/^"|"$/g, '')]));
  });
}

function parseHevyCSV(text) {
  const rows = parseCSV(text);
  const map = {};
  for (const row of rows) {
    const title = row['title'] || row['Title'] || row['Workout Name'] || 'Session';
    const startRaw = row['start_time'] || row['Start Time'] || row['Date'];
    if (!startRaw) continue;
    const key = `${title}__${startRaw}`;
    if (!map[key]) {
      const startMs = new Date(startRaw).getTime();
      const endRaw = row['end_time'] || row['End Time'];
      const endMs = endRaw ? new Date(endRaw).getTime() : null;
      const dateISO = toLocalDateStr(new Date(startRaw));
      map[key] = {
        name: title,
        date: dateISO,
        // Forwarded so the backend can stamp lifts with a real clock reading
        // rather than midnight on dateISO — this value was already being read
        // to derive the date, then thrown away.
        start: Number.isNaN(startMs) ? null : new Date(startMs).toISOString(),
        duration: endMs ? Math.round((endMs - startMs) / 60000) : null,
        exercises: {},
      };
    }
    const exRaw = row['exercise_title'] || row['Exercise Name'] || row['Exercise'];
    if (!exRaw) continue;
    const exName = exRaw.toLowerCase().trim();
    if (!map[key].exercises[exName]) map[key].exercises[exName] = [];
    const kg = parseFloat(row['weight_kg'] ?? row['Weight (kg)'] ?? row['Weight']) || 0;
    const reps = parseInt(row['reps'] || row['Reps']) || 0;
    // Hevy's export uses the same set_type vocabulary as its API
    // (warmup/normal/failure/dropset) — mapped onto the app's W/N/D here so
    // warmup sets are remembered as warmup sets, not indistinguishable from
    // working sets (see hevySetType in functions/index.js for the same
    // mapping on the API import path).
    const rawType = (row['set_type'] || row['Set Type'] || '').toLowerCase();
    const type = rawType === 'warmup' ? 'W' : rawType === 'dropset' ? 'D' : 'N';
    if (kg > 0 || reps > 0) map[key].exercises[exName].push({ kg, reps, type });
  }
  return Object.values(map).map(s => ({
    ...s,
    exercises: Object.entries(s.exercises).map(([name, sets]) => ({ name, sets })),
  })).filter(s => s.exercises.length > 0).sort((a, b) => a.date.localeCompare(b.date));
}

const IMPORT_BATCH = 10;

function HevyImport({ onClose, refresh }) {
  const [sessions, setSessions] = useState([]);
  const [status, setStatus] = useState('idle');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState({ done: 0, total: 0, imported: 0, merged: 0, skipped: 0, current: null });
  const [log, setLog] = useState([]);
  const logRef = useRef();
  const fileRef = useRef();

  const handleFile = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = parseHevyCSV(ev.target.result);
        if (!parsed.length) { setError('No workout data found — make sure this is a Hevy CSV export.'); return; }
        setSessions(parsed);
        setStatus('parsed');
      } catch (err) { setError('Failed to parse file: ' + err.message); }
    };
    reader.readAsText(file);
  };

  const doImport = async () => {
    const total = sessions.length;
    // flushSync forces React to synchronously commit before any async work starts
    flushSync(() => {
      setStatus('importing');
      setLog([]);
      setProgress({ done: 0, total, imported: 0, merged: 0, skipped: 0, current: sessions[0] || null });
    });

    setProgress({ done: 0, total, current: sessions[0], imported: 0, merged: 0, skipped: 0 });

    let totalImported = 0, totalMerged = 0, totalSkipped = 0;
    try {
      const r = await authFetch(`${API_BASE}/import/hevy`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessions }),
      }).then(res => res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`)));
      totalImported = r?.imported || 0;
      totalMerged = r?.merged || 0;
      totalSkipped = r?.skipped || 0;
      setLog(sessions.map(s => ({ name: s.name, date: s.date, exCount: s.exercises.length })));
    } catch (err) {
      setResult({ ok: false, error: err.message });
      setStatus('done');
      return;
    }

    setProgress({ done: total, total, imported: totalImported, merged: totalMerged, skipped: totalSkipped, current: null });
    setResult({ ok: true, imported: totalImported, merged: totalMerged, skipped: totalSkipped });
    await api('summary').then(refresh);
    setStatus('done');
  };

  const totalSets = sessions.reduce((a, s) => a + s.exercises.reduce((b, e) => b + e.sets.length, 0), 0);
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--paper)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      <div className="ol-hdr">
        <div>
          <div className="kicker" style={{ marginBottom: 2 }}>Data Import</div>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 19, fontWeight: 700 }}>Hevy CSV</div>
        </div>
        {status !== 'importing' && <button className="ol-btn ol-btn-ghost" onClick={onClose}>Close</button>}
      </div>

      <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column' }}>

        {status === 'idle' && (
          <>
            <div style={{ fontSize: 12, color: 'var(--dim)', lineHeight: 1.7, marginBottom: 20 }}>
              In Hevy: <strong>Profile → Settings → Export Workout Data → CSV</strong>. Then select the downloaded file below. All sessions and lifts will be imported into Press.
            </div>
            {error && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--ember)', marginBottom: 12 }}>{error}</div>}
            <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFile} style={{ display: 'none' }} />
            <button className="ol-btn ol-btn-solid" onClick={() => fileRef.current?.click()}>Select CSV file</button>
          </>
        )}

        {status === 'parsed' && (
          <>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--dim)', marginBottom: 12, letterSpacing: '.06em' }}>
              {sessions.length} sessions · {sessions.reduce((a,s)=>a+s.exercises.length,0)} exercises · {totalSets} sets
            </div>
            <div style={{ maxHeight: 320, overflowY: 'auto', marginBottom: 16, borderTop: '1px solid var(--rule)', flex: 1 }}>
              {sessions.slice().reverse().map((s, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '8px 0', borderBottom: '1px solid var(--rule)' }}>
                  <div>
                    <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 13, fontWeight: 700, textTransform: 'capitalize' }}>{s.name}</div>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', marginTop: 2 }}>{s.exercises.map(e => e.name).join(' · ')}</div>
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', whiteSpace: 'nowrap', marginLeft: 12 }}>{s.date}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="ol-btn ol-btn-solid" onClick={doImport}>Import {sessions.length} sessions</button>
              <button className="ol-btn ol-btn-ghost" onClick={onClose}>Cancel</button>
            </div>
          </>
        )}

        {status === 'importing' && (
          <>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontFamily: "'Playfair Display',serif", fontStyle: 'italic', fontSize: 15, color: 'var(--ink)', marginBottom: 10 }}>
                Importing {progress.total} sessions…
              </div>
              <div style={{ height: 3, background: 'var(--rule)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: 'var(--ink)', borderRadius: 2, width: '100%', animation: 'pulse-bar 1.4s ease-in-out infinite' }} />
              </div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', marginTop: 6 }}>
                Sending to server — this takes a few seconds
              </div>
            </div>

            {/* Live log */}
            <div ref={logRef} style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid var(--rule)' }}>
              {log.slice().reverse().map((s, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '7px 0', borderBottom: '1px solid var(--rule)', opacity: i === 0 ? 1 : Math.max(0.25, 1 - i * 0.05) }}>
                  <div>
                    <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 12, fontWeight: 700, textTransform: 'capitalize', color: s.error ? 'var(--ember)' : 'var(--ink)' }}>{s.name}</div>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: s.error ? 'var(--ember)' : 'var(--dim)', marginTop: 1 }}>{s.error ? 'skipped — timeout' : `${s.exCount} exercises`}</div>
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: s.error ? 'var(--ember)' : 'var(--forest)' }}>{s.error ? '⚠ ' : '✓ '}{s.date}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {status === 'done' && (
          <>
            {result?.ok ? (
              <>
                <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
                  {result.imported} sessions imported.
                </div>
                {result.merged > 0 && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--dim)', marginBottom: 4 }}>{result.merged} already-imported sessions gained new sets (e.g. warm-ups this file has that were missing before).</div>}
                {result.skipped > 0 && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--dim)', marginBottom: 16 }}>{result.skipped} already fully imported — skipped.</div>}
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--forest)', marginBottom: 20, letterSpacing: '.06em' }}>✓ Progressive overload + fatigue models updated</div>
              </>
            ) : (
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--ember)', marginBottom: 16 }}>
                Import failed: {result?.error || 'unknown error'}. Try again.
              </div>
            )}
            <button className="ol-btn ol-btn-solid" onClick={onClose}>Done</button>
          </>
        )}
      </div>
    </div>
  );
}

// ── WORKOUT HISTORY ───────────────────────────────────────────────────────────
function WorkoutHistory({ s, onClose, refresh }) {
  const [expanded, setExpanded] = useState(null);
  const [confirmDeleteDate, setConfirmDeleteDate] = useState(null);
  const [deletingDate, setDeletingDate] = useState(null);
  const [editingDate, setEditingDate] = useState(null);
  const [editRows, setEditRows] = useState([]);
  const [savingEdit, setSavingEdit] = useState(false);
  const workouts = useMemo(() => {
    return [...(s?.workouts || [])].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [s?.workouts]);

  const lifts = s?.lifts || [];

  const deleteWorkout = async (date) => {
    setDeletingDate(date);
    await api(`workout/${date}`, { method: 'DELETE' });
    await api('summary').then(refresh);
    setConfirmDeleteDate(null);
    setDeletingDate(null);
  };

  // Edit mode replaces the whole day's set list wholesale on save (see
  // PUT /workout/:date) -- editRows is seeded from the currently-saved
  // lifts for that date, freely add/removable, not diffed against the
  // original.
  const startEdit = (date) => {
    const dayLifts = lifts.filter(l => l.date === date);
    setEditRows(dayLifts.map(l => ({ exercise: l.exercise, kg: String(l.kg ?? ''), reps: String(l.reps ?? ''), rpe: l.rpe != null ? String(l.rpe) : '' })));
    setEditingDate(date);
    setExpanded(null);
  };
  const updateEditRow = (i, field, value) => setEditRows(p => p.map((r, j) => j !== i ? r : { ...r, [field]: value }));
  const addEditRow = () => setEditRows(p => [...p, { exercise: '', kg: '', reps: '', rpe: '' }]);
  const removeEditRow = (i) => setEditRows(p => p.filter((_, j) => j !== i));
  const saveEdit = async () => {
    setSavingEdit(true);
    const sets = editRows
      .filter(r => r.exercise.trim() && r.kg !== '' && r.reps !== '')
      .map(r => ({ exercise: r.exercise.trim().toLowerCase(), kg: r.kg, reps: r.reps, rpe: r.rpe || null }));
    await api(`workout/${editingDate}`, { method: 'PUT', body: JSON.stringify({ sets }) });
    await api('summary').then(refresh);
    setSavingEdit(false);
    setEditingDate(null);
  };

  const getExerciseSummary = (date) => {
    const dayLifts = lifts.filter(l => l.date === date);
    const byEx = {};
    dayLifts.forEach(l => {
      if (!byEx[l.exercise]) byEx[l.exercise] = { sets: 0, maxKg: 0 };
      byEx[l.exercise].sets++;
      if (l.kg > byEx[l.exercise].maxKg) byEx[l.exercise].maxKg = l.kg;
    });
    return Object.entries(byEx).map(([ex, data]) => ({ ex, sets: data.sets, maxKg: data.maxKg }));
  };

  return (
    <div className="hist-overlay">
      <div className="ol-hdr">
        <div>
          <div className="kicker" style={{ marginBottom: 2 }}>Training</div>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 19, fontWeight: 700 }}>Workout History</div>
        </div>
        <button className="ol-btn ol-btn-ghost" onClick={onClose}>Close</button>
      </div>
      <div style={{ padding: '0 20px 20px', flex: 1 }}>
        {workouts.length === 0 && (
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--dim)', padding: '24px 0', fontStyle: 'italic' }}>
            No workouts logged yet.
          </div>
        )}
        {workouts.map((w, i) => {
          const isOpen = expanded === i;
          const exercises = getExerciseSummary(w.date);
          return (
            <div key={i} className="hist-row" onClick={() => setExpanded(isOpen ? null : i)}>
              <div className="hist-row-hdr">
                <span className="hist-date">{w.date}</span>
                <span className="hist-name">{w.name || 'Session'}</span>
                {w.duration && <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)' }}>{w.duration}min</span>}
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }} onClick={e => e.stopPropagation()}>
                  {confirmDeleteDate === w.date ? (
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.1em' }}>
                      Delete?{' '}
                      <button onClick={() => deleteWorkout(w.date)} disabled={deletingDate === w.date} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', textTransform: 'uppercase', padding: 0 }}>
                        {deletingDate === w.date ? '…' : 'Yes'}
                      </button>{' '}
                      <button onClick={() => setConfirmDeleteDate(null)} disabled={deletingDate === w.date} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--dim)', textTransform: 'uppercase', padding: 0 }}>
                        No
                      </button>
                    </span>
                  ) : (
                    <>
                      <button onClick={() => startEdit(w.date)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--dim)', fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.1em', textTransform: 'uppercase', padding: 0 }}>
                        Edit
                      </button>
                      <button onClick={() => setConfirmDeleteDate(w.date)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--dim)', fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.1em', textTransform: 'uppercase', padding: 0 }}>
                        Delete
                      </button>
                    </>
                  )}
                </span>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)' }}>{isOpen ? '▲' : '▸'}</span>
              </div>
              {editingDate === w.date ? (
                <div className="hist-detail" onClick={e => e.stopPropagation()}>
                  {editRows.map((r, i) => (
                    <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                      <input value={r.exercise} placeholder="Exercise" list="hist-edit-exercises"
                        onChange={e => updateEditRow(i, 'exercise', e.target.value)}
                        style={{ flex: '1 1 120px', minWidth: 0, fontFamily: "'JetBrains Mono',monospace", fontSize: 10, padding: '4px 6px', border: '1px solid var(--rule)', background: 'var(--paper)', color: 'var(--ink)' }} />
                      <input value={r.kg} placeholder="kg" inputMode="decimal"
                        onChange={e => updateEditRow(i, 'kg', e.target.value)}
                        style={{ width: 48, fontFamily: "'JetBrains Mono',monospace", fontSize: 10, padding: '4px 6px', border: '1px solid var(--rule)', background: 'var(--paper)', color: 'var(--ink)' }} />
                      <input value={r.reps} placeholder="reps" inputMode="numeric"
                        onChange={e => updateEditRow(i, 'reps', e.target.value)}
                        style={{ width: 40, fontFamily: "'JetBrains Mono',monospace", fontSize: 10, padding: '4px 6px', border: '1px solid var(--rule)', background: 'var(--paper)', color: 'var(--ink)' }} />
                      <input value={r.rpe} placeholder="RPE" inputMode="numeric"
                        onChange={e => updateEditRow(i, 'rpe', e.target.value)}
                        style={{ width: 36, fontFamily: "'JetBrains Mono',monospace", fontSize: 10, padding: '4px 6px', border: '1px solid var(--rule)', background: 'var(--paper)', color: 'var(--ink)' }} />
                      <button onClick={() => removeEditRow(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: 14, lineHeight: 1, padding: '0 4px' }}>×</button>
                    </div>
                  ))}
                  <datalist id="hist-edit-exercises">
                    {[...new Set(lifts.map(l => l.exercise))].map(ex => <option key={ex} value={ex} />)}
                  </datalist>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                    <button onClick={addEditRow} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--dim)', fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.1em', textTransform: 'uppercase', padding: 0 }}>
                      + Add Set
                    </button>
                    <span style={{ marginLeft: 'auto' }} />
                    <button onClick={() => setEditingDate(null)} disabled={savingEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--dim)', fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.1em', textTransform: 'uppercase', padding: 0 }}>
                      Cancel
                    </button>
                    <button onClick={saveEdit} disabled={savingEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink)', fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.1em', textTransform: 'uppercase', padding: 0, fontWeight: 700 }}>
                      {savingEdit ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {isOpen && exercises.length > 0 && (
                    <div className="hist-detail">
                      {exercises.map(({ ex, sets, maxKg }) => (
                        <div key={ex} className="hist-ex">
                          {ex}: {sets} set{sets !== 1 ? 's' : ''}{maxKg > 0 ? ` · ${maxKg}kg peak` : ''}
                        </div>
                      ))}
                    </div>
                  )}
                  {isOpen && exercises.length === 0 && (
                    <div className="hist-detail">
                      <div className="hist-ex" style={{ fontStyle: 'italic' }}>No lift data for this session.</div>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── S3: TRAINING ──────────────────────────────────────────────────────────────
// Mirrors functions/strengthStandards.js's TIER_BANDS — every name
// computeMuscleLevels can return needs a color here. The 3 numbered
// sub-levels within a tier (Beginner 1/2/3, etc.) share their parent tier's
// color rather than getting a distinct hue each — the number already gives
// the precise sub-rank, the color just needs to place it in the right
// broad band at a glance.
//
// Ordered as an ascending "rarity" ramp (grey → green → blue → purple →
// orange → gold) rather than an arbitrary hue assignment, so the color
// itself hints at rank without reading the label: grey reads as "nothing
// yet", and Elite lands on literal gold — the one color association
// (gold medal, "going for gold") that needs no legend at all. Every tier
// still carries its name as text alongside the color (never color-alone),
// so this is a readability upgrade, not a new colorblind-accessibility
// dependency.
const TIER_BASE_COLOR = {
  Untrained: 'var(--dim)',
  Beginner: 'var(--forest)',
  Novice: 'var(--navy)',
  Intermediate: 'var(--plum)',
  Advanced: 'var(--ember)',
  Elite: 'var(--gold)',
};
// Keyed by both the broad tier name (diagram/legend) and each numbered
// sub-level (per-muscle panel, e.g. "Beginner 1") — both forms need to
// resolve to a color and previously only the numbered form did, leaving
// the legend's dots for every tier but Untrained with no color at all.
const TIER_COLOR = { Untrained: TIER_BASE_COLOR.Untrained };
for (const tier of ['Beginner', 'Novice', 'Intermediate', 'Advanced', 'Elite']) {
  TIER_COLOR[tier] = TIER_BASE_COLOR[tier];
  for (const n of [1, 2, 3]) TIER_COLOR[`${tier} ${n}`] = TIER_BASE_COLOR[tier];
}
// The diagram/legend show the broad 6-tier version (no sub-level numbers) —
// same bands TIER_COLOR above already keys its sub-levels into, so a
// muscle's diagram color always matches whichever tier its precise
// (text-only) sub-level belongs to. Filter ids are named after the raw
// hue (fm-neutral is the forest-green filter, fm-gold is gold, etc.,
// defined once in each body-*.svg) rather than after a tier, since
// fm-neutral is shared with the Fatigue tab's own (unrelated) coloring —
// see TIER_BASE_COLOR above for which hue backs which tier.
const DIAGRAM_TIER_BANDS = [
  [0, 'Untrained', 'url(#fm-dim)'], [20, 'Beginner', 'url(#fm-neutral)'],
  [40, 'Novice', 'url(#fm-navy)'], [60, 'Intermediate', 'url(#fm-plum)'],
  [80, 'Advanced', 'url(#fm-ember)'], [100, 'Elite', 'url(#fm-gold)'],
];
function diagramFilterForScore(score) {
  let filter = DIAGRAM_TIER_BANDS[0][2];
  for (const [floor, , f] of DIAGRAM_TIER_BANDS) { if (score < floor) break; filter = f; }
  return filter;
}

// Per-muscle strength panel: shows every muscle in muscleLevels (backend's
// computeMuscleLevels) with a real strengthlevel.com-sourced tier, split
// into 3 numbered sub-levels each by TIER_BANDS (see strengthStandards.js).
// Muscles with no ranking yet (no published standard for any exercise
// that trains them, or a canonical exercise not yet logged under a
// recognized name) are simply omitted — no unranked/personal-best fallback
// section, by request.
//
// Display-only relabeling — the underlying taxonomy key stays 'abductors'
// everywhere else (fatigue tracking, weekly planning, etc. all key off it),
// this only changes what this one panel shows, since 'abductors' as a
// muscle is really gluteus medius/TFL work (see Abductor Machine's own
// exerciseDb.js note) and that's a clearer label for a ranked score.
// How much programming emphasis a muscle gets. The stored values stay 'focus'
// and 'ignore' so no existing profile needs migrating — only the labels and the
// middle option are new.
//
// The important pair is Lower vs Avoid, which used to be one setting called
// "ignore". Lower keeps the muscle fully modelled — it still accumulates
// fatigue from compounds, still recovers, still shows in Recovery — and only
// reduces how often it's picked for direct work. Avoid removes it from
// selection outright, which is what you want for an injury or a medical
// restriction and not what you want for "I don't care much about calves".
const MUSCLE_FOCUS_OPTIONS = [
  { value: 'focus', label: 'Priority' },
  { value: 'normal', label: 'Maintain' },
  { value: 'deprioritise', label: 'Lower' },
  { value: 'ignore', label: 'Avoid' },
];

const MUSCLE_DISPLAY_LABELS = { abductors: 'Gluteus Medius' };
const muscleDisplayLabel = m => MUSCLE_DISPLAY_LABELS[m] || m.replace(/-/g, ' ');

// Scientific/anatomical names, used only by the Muscle Focus editor's niche
// (showNicheMuscles: true) rows -- not muscleDisplayLabel/MUSCLE_DISPLAY_LABELS
// above, which every other surface (Recovery bars, PR panels, tooltips)
// still reads unchanged. Only listed where it actually differs from the
// plain hyphen-split label; hamstrings/obliques/rhomboids/rotator-cuff/
// brachialis/brachioradialis are already the correct anatomical term.
const MUSCLE_SCIENTIFIC_LABELS = {
  abductors: 'Gluteus Medius', abs: 'Rectus Abdominis', adductors: 'Adductor Group',
  biceps: 'Biceps Brachii', calves: 'Gastrocnemius', chest: 'Pectoralis Major',
  core: 'Core Stabilizers', erectors: 'Erector Spinae', forearms: 'Forearm Flexors',
  'front-delt': 'Anterior Deltoid', glutes: 'Gluteus Maximus', 'hip-flexors': 'Iliopsoas',
  lats: 'Latissimus Dorsi', 'lower-traps': 'Lower Trapezius', 'mid-delt': 'Lateral Deltoid',
  'mid-traps': 'Middle Trapezius', quads: 'Quadriceps Femoris', 'rear-delt': 'Posterior Deltoid',
  serratus: 'Serratus Anterior', tibialis: 'Tibialis Anterior', traps: 'Trapezius',
  'transverse-abs': 'Transverse Abdominis', triceps: 'Triceps Brachii',
};
const nicheMuscleLabel = m => MUSCLE_SCIENTIFIC_LABELS[m] || muscleDisplayLabel(m);

// Muscle Focus's simplified view (profile.showNicheMuscles: false, the
// default) folds PRIMARY_MUSCLES' granular subdivisions into the broader
// region most people actually recognise -- e.g. one "Traps" pick instead of
// three separate bets on traps/lower-traps/mid-traps for someone who's never
// had a reason to tell those apart. Every PRIMARY_MUSCLES entry appears in
// exactly one group here *except* hip-flexors, deliberately dropped rather
// than folded into another region -- see withHipFlexorDefault below (a
// duplicate or any other missing muscle would silently make part of the
// picker unreachable or double-write on a click, same failure mode
// functions/muscleTaxonomy.js's own MUSCLE_GROUPS check guards against).
// This is a display grouping only -- muscleFocus itself is always stored
// keyed by the real muscle name PRIMARY_MUSCLES/weeklyPlanner.js expect,
// whichever mode wrote it; toggling niche muscles back on just splits the
// group's shared value back into per-muscle rows (labelled via
// nicheMuscleLabel above) to edit individually.
const MUSCLE_FOCUS_GROUPS = [
  { key: 'abs', label: 'Abs', muscles: ['abs', 'core', 'transverse-abs', 'obliques'] },
  { key: 'erectors', label: 'Lower Back', muscles: ['erectors'] },
  { key: 'chest', label: 'Chest', muscles: ['chest', 'serratus'] },
  { key: 'shoulders', label: 'Shoulders', muscles: ['front-delt', 'mid-delt', 'rear-delt', 'rotator-cuff'] },
  { key: 'upper-back', label: 'Upper Back', muscles: ['lats', 'rhomboids'] },
  { key: 'traps', label: 'Traps', muscles: ['traps', 'lower-traps', 'mid-traps'] },
  { key: 'biceps', label: 'Biceps', muscles: ['biceps', 'brachialis'] },
  { key: 'triceps', label: 'Triceps', muscles: ['triceps'] },
  { key: 'forearms', label: 'Forearms', muscles: ['forearms', 'brachioradialis'] },
  { key: 'adductors', label: 'Adductors', muscles: ['adductors'] },
  { key: 'glutes', label: 'Glutes', muscles: ['glutes', 'abductors'] },
  { key: 'hamstrings', label: 'Hamstrings', muscles: ['hamstrings'] },
  { key: 'quads', label: 'Quads', muscles: ['quads'] },
  { key: 'calves', label: 'Calves', muscles: ['calves', 'tibialis'] },
];
// A group reads as one value only when every member agrees (all unset also
// counts as agreeing, on 'normal'); otherwise it's genuinely mixed -- e.g.
// set individually with niche muscles on, then toggled off -- and no single
// option button should claim to represent it.
const muscleGroupValue = (group, muscleFocus) => {
  const vals = group.muscles.map(m => muscleFocus[m] || 'normal');
  return vals.every(v => v === vals[0]) ? vals[0] : 'mixed';
};
// Hip flexors have no row at all in the simplified view -- there's no
// widely-recognised single "hip flexor" exercise the way there is for every
// other group, so folding it into a neighbouring region (glutes? abs?)
// would misrepresent it rather than simplify it. Defaults it to Avoid
// instead of the usual Maintain while it's hidden, since a value the
// interface never surfaces shouldn't silently opt someone into whatever
// hip-flexor accessory the planner happens to reach for. Only fills in the
// gap when unset -- an explicit Priority/Lower/Avoid choice made with niche
// muscles on is never overwritten. (Maintain isn't distinguishable from
// unset here, same as every other muscle -- picking it clears the key
// rather than storing 'normal' -- so it re-defaults to Avoid on the next
// save while niche muscles are off, same as if it had never been touched.)
const withHipFlexorDefault = (muscleFocus, showNiche) =>
  (!showNiche && muscleFocus['hip-flexors'] === undefined) ? { ...muscleFocus, 'hip-flexors': 'ignore' } : muscleFocus;

function StrengthLevelPanel({ muscleLevels, hasSex }) {
  const cutoff14 = toLocalDateStr(new Date(Date.now() - 14 * 864e5));

  if (!hasSex) return (
    <div className="fade" style={{ borderTop: '1px solid var(--rule)', paddingTop: 10 }} data-tour="s7-strength">
      <div className="kicker" style={{ marginBottom: 4 }}>Strength Level</div>
      <div style={{ fontSize: 11, color: 'var(--dim)', fontStyle: 'italic' }}>Set your sex in Settings → Profile to unlock strength-level rankings.</div>
    </div>
  );

  const rankedMuscles = Object.entries(muscleLevels || {}).filter(([, v]) => v)
    .sort(([, a], [, b]) => b.score - a.score);

  if (!rankedMuscles.length) return (
    <div className="fade" style={{ borderTop: '1px solid var(--rule)', paddingTop: 10 }} data-tour="s7-strength">
      <div className="kicker" style={{ marginBottom: 4 }}>Strength Level</div>
      <div style={{ fontSize: 11, color: 'var(--dim)', fontStyle: 'italic' }}>Log some lifts to see per-muscle strength levels — ranked against published bodyweight standards where one exists, Beginner→Elite.</div>
    </div>
  );

  return (
    <div className="fade" style={{ borderTop: '1px solid var(--rule)', paddingTop: 10 }} data-tour="s7-strength">
      <div className="kicker" style={{ marginBottom: 8 }}>Strength Level · By Muscle</div>
      {rankedMuscles.map(([muscle, v]) => {
        const isNew = v.date >= cutoff14;
        return (
          <div key={muscle} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: "'JetBrains Mono',monospace", fontSize: 10, marginBottom: 3 }}>
              <span style={{ color: 'var(--ink)', textTransform: 'capitalize', display: 'flex', alignItems: 'center', gap: 6 }}>
                {muscleDisplayLabel(muscle)}
                {isNew && <span style={{ fontSize: 7, letterSpacing: '.1em', background: 'var(--gold)', color: 'var(--paper)', padding: '1px 4px' }}>NEW</span>}
              </span>
              <span style={{ color: TIER_COLOR[v.tier] }}>{v.tier} · {v.score}{v.score <= 100 ? '/100' : ''}</span>
            </div>
            {/* Fills toward the next numbered sub-level (bandFloor->bandCeiling),
                not toward a flat 100 — bandCeiling is null only at the very top
                (Elite 3, no further checkpoint), where it just shows full. */}
            <div className="macro-track"><div className="macro-fill" style={{
              width: `${v.bandCeiling == null ? 100 : Math.max(0, Math.min(100, (v.score - v.bandFloor) / (v.bandCeiling - v.bandFloor) * 100))}%`,
              background: TIER_COLOR[v.tier],
            }} /></div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {v.exercise} · {v.e1RM}kg e1RM · {localDateFromYMD(v.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} at {v.bodyweightKg}kg bodyweight
              {v.blendedFrom?.length ? ` · blended with ${v.blendedFrom.length} other exercise${v.blendedFrom.length === 1 ? '' : 's'}` : ''}
            </div>
            {/* Only shown with a real, sustained upward trend behind it (see
                etaToNextLevel in strengthStandards.js) — blank rather than a
                guess when there isn't enough logged history to trust one. */}
            {v.etaWeeksLow != null && (
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', marginTop: 1, fontStyle: 'italic' }}>
                Est. {v.etaWeeksLow}–{v.etaWeeksHigh} weeks to {v.nextTier} at current pace
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Cardio Score — VO2max's equivalent of StrengthLevelPanel above, same row
// pattern (tier color, macro-track/macro-fill progress toward the next
// numbered checkpoint) for one score instead of a per-muscle list. Backend:
// functions/cardioStandards.js's computeCardioScore, wired into /summary
// alongside muscleLevels.
function CardioScorePanel({ cardioScore, hasSex }) {
  if (!hasSex) return (
    <div className="fade" style={{ borderTop: '1px solid var(--rule)', paddingTop: 10, marginTop: 12 }}>
      <div className="kicker" style={{ marginBottom: 4 }}>Cardio Score</div>
      <div style={{ fontSize: 11, color: 'var(--dim)', fontStyle: 'italic' }}>Set your sex in Settings → Profile to unlock a cardio-fitness ranking.</div>
    </div>
  );

  if (!cardioScore) return (
    <div className="fade" style={{ borderTop: '1px solid var(--rule)', paddingTop: 10, marginTop: 12 }}>
      <div className="kicker" style={{ marginBottom: 4 }}>Cardio Score</div>
      <div style={{ fontSize: 11, color: 'var(--dim)', fontStyle: 'italic' }}>
        No VO₂max data yet — sync a run, ride, or Apple Watch reading to unlock a cardio-fitness ranking against published age/sex standards, Beginner→Elite.
      </div>
    </div>
  );

  return (
    <div className="fade" style={{ borderTop: '1px solid var(--rule)', paddingTop: 10, marginTop: 12 }}>
      <div className="kicker" style={{ marginBottom: 8 }}>Cardio Score</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: "'JetBrains Mono',monospace", fontSize: 10, marginBottom: 3 }}>
        <span style={{ color: 'var(--ink)' }}>VO₂max {Math.round(cardioScore.vo2max * 10) / 10}</span>
        <span style={{ color: TIER_COLOR[cardioScore.tier] }}>{cardioScore.tier} · {cardioScore.score}{cardioScore.score <= 100 ? '/100' : ''}</span>
      </div>
      <div className="macro-track"><div className="macro-fill" style={{
        width: `${cardioScore.bandCeiling == null ? 100 : Math.max(0, Math.min(100, (cardioScore.score - cardioScore.bandFloor) / (cardioScore.bandCeiling - cardioScore.bandFloor) * 100))}%`,
        background: TIER_COLOR[cardioScore.tier],
      }} /></div>
    </div>
  );
}

const GROUP_SESSION_KEY = 'press_group_session_id';

// Small one-time dialog: start a new group session (get a code) or join an
// existing one (enter a code). Deliberately just this step, not the ongoing
// session view — once connected, WorkoutLogger shows a plain tab strip
// inline (see its groupSessionId/groupData state) instead of a separate
// page, so the normal solo logging UI/formatting never changes underneath
// it. See .design/feature-brainstorm/GROUP_WORKOUT.md.
function GroupSessionStartModal({ onClose, onStarted }) {
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const startSession = async () => {
    setBusy(true); setError('');
    try {
      const r = await api('session', { method: 'POST' });
      onStarted(r.sessionId);
    } catch { setError('Could not start a session — try again.'); setBusy(false); }
  };

  const joinSession = async () => {
    if (!joinCode.trim()) return;
    setBusy(true); setError('');
    try {
      const r = await api('session/join', { method: 'POST', body: JSON.stringify({ code: joinCode.trim().toUpperCase() }) });
      if (r.error) { setError(r.error); setBusy(false); return; }
      onStarted(r.sessionId);
    } catch { setError('Could not join — check the code and try again.'); setBusy(false); }
  };

  const inputStyle = { width: '100%', border: 'none', borderBottom: '2px solid var(--ink)', padding: '8px 0', background: 'transparent', fontFamily: 'Times New Roman,serif', fontSize: 16, outline: 'none', color: 'var(--ink)', boxSizing: 'border-box' };

  return (
    <div className="onboard-overlay" style={{ zIndex: 9998 }}>
      <div className="ob-wrap">
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--dim)', fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', padding: 0, marginBottom: 20 }}>← Back</button>
        <div className="ob-h">Group Session</div>
        <div className="ob-deck">Log a workout together — up to 4 people, each logs their own sets and can see everyone else's.</div>

        <button className="ob-next" style={{ width: '100%', padding: '14px 0', marginBottom: 24 }} onClick={startSession} disabled={busy}>
          {busy ? 'Starting…' : 'Start a New Session'}
        </button>

        <label className="ob-label">Join with a code</label>
        <input style={inputStyle} value={joinCode} maxLength={4} placeholder="4-character code"
          onChange={e => { setJoinCode(e.target.value.toUpperCase()); setError(''); }} autoCapitalize="characters" autoCorrect="off" />
        <button className="ob-next" style={{ width: '100%', padding: '14px 0', marginTop: 14 }} onClick={joinSession} disabled={busy || !joinCode.trim()}>
          {busy ? 'Joining…' : 'Join'}
        </button>
        {error && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--red)', marginTop: 14 }}>{error}</div>}
      </div>
    </div>
  );
}

// Manual gym selection/creation — the fallback to auto-detect
// (GYM_MACHINE_CATALOG.md §4), also how you change/clear a wrong auto-pick.
// Creating a gym runs the same proximity dedup as auto-detect: if the
// backend finds existing gyms nearby it returns them as `matches` instead of
// creating, and this shows them so the user can pick one or force-create.
function GymPickerModal({ activeGym, lastCoordsRef, onClose, onSelect, onClear }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [newName, setNewName] = useState('');
  const [matches, setMatches] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(() => {
      api(`gyms/search?q=${encodeURIComponent(query.trim())}`)
        .then(r => setResults(r.gyms || [])).catch(() => setResults([])).finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const createGym = async (force) => {
    if (!newName.trim()) return;
    setBusy(true); setError('');
    let coords = lastCoordsRef.current;
    if (!coords && navigator.geolocation) {
      coords = await new Promise(resolve => navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null), { timeout: 8000 },
      ));
    }
    if (!coords) { setError('Location needed to add a gym — allow location access and try again.'); setBusy(false); return; }
    try {
      const r = await api('gyms', { method: 'POST', body: JSON.stringify({ name: newName.trim(), lat: coords.lat, lng: coords.lng, force }) });
      if (r.matches?.length) { setMatches(r.matches); setBusy(false); return; }
      onSelect({ id: r.gymId, name: newName.trim() });
    } catch { setError('Could not add gym — try again.'); setBusy(false); }
  };

  const inputStyle = { width: '100%', border: 'none', borderBottom: '2px solid var(--ink)', padding: '8px 0', background: 'transparent', fontFamily: 'Times New Roman,serif', fontSize: 16, outline: 'none', color: 'var(--ink)', boxSizing: 'border-box' };
  const rowBtn = { display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid var(--rule)', padding: '10px 0', cursor: 'pointer', fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: 'var(--ink)' };

  return (
    <div className="onboard-overlay" style={{ zIndex: 9998 }}>
      <div className="ob-wrap">
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--dim)', fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', padding: 0, marginBottom: 20 }}>← Back</button>
        <div className="ob-h">Gym</div>
        <div className="ob-deck">Pick your gym to prefill the brands/models you've already tagged there.</div>

        {activeGym && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, marginBottom: 8 }}>Currently: {activeGym.name}</div>
            <button className="ob-next" style={{ width: '100%', padding: '10px 0' }} onClick={onClear}>Clear Gym</button>
          </div>
        )}

        <label className="ob-label">Search</label>
        <input style={inputStyle} value={query} placeholder="Gym name" onChange={e => setQuery(e.target.value)} />
        {searching && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', marginTop: 8 }}>Searching…</div>}
        {results.map(g => (
          <button key={g.id} onClick={() => onSelect({ id: g.id, name: g.name })} style={rowBtn}>{g.name}</button>
        ))}

        {matches ? (
          <div style={{ marginTop: 24 }}>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 8 }}>Found nearby — is this it?</div>
            {matches.map(g => (
              <button key={g.id} onClick={() => onSelect({ id: g.id, name: g.name })} style={rowBtn}>{g.name} · {g.distanceMeters}m away</button>
            ))}
            <button className="ob-next" style={{ width: '100%', padding: '14px 0', marginTop: 14 }} onClick={() => createGym(true)} disabled={busy}>
              {busy ? 'Adding…' : "No, it's a new gym"}
            </button>
          </div>
        ) : (
          <>
            <label className="ob-label" style={{ marginTop: 24 }}>Not listed? Add it</label>
            <input style={inputStyle} value={newName} placeholder="Gym name" onChange={e => setNewName(e.target.value)} />
            <button className="ob-next" style={{ width: '100%', padding: '14px 0', marginTop: 14 }} onClick={() => createGym(false)} disabled={busy || !newName.trim()}>
              {busy ? 'Adding…' : 'Add This Gym'}
            </button>
          </>
        )}
        {error && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--red)', marginTop: 14 }}>{error}</div>}
      </div>
    </div>
  );
}

// Why today's guidance picked what it picked. Every figure comes from the
// /plan/recommendation payload (functions/recommendation.js), which re-derives
// the planner's own terms — nothing here computes or rounds a second opinion.
// Renders nothing until that fetch lands, which is why it's absent for a beat
// after first paint rather than flashing a placeholder.
//
// The detail levels split cleanly: Beginner gets the lead sentence, so it
// reads as a coach's reason; Intermediate gets the full reasoning list plus
// what an override would trade away; Sport Scientist additionally gets the
// term-by-term arithmetic behind the top muscle's score.
function RecommendationPanel({ rec, selectedBucket }) {
  const { atLeast } = useExpertise();
  if (!rec?.chosen) return null;

  const lead = rec.reasoning[0];
  const override = selectedBucket && selectedBucket.name !== rec.chosen.name
    ? rec.comparisons.find(c => c.to === selectedBucket.name)
    : null;
  const mono = { fontFamily: "'JetBrains Mono',monospace" };
  // A bucket can carry a dozen muscles; naming them all turns the trade-off
  // into a wall of text nobody reads. The count keeps it honest about what's
  // being elided rather than silently truncating.
  const muscleList = (muscles, cap = 4) => muscles.length <= cap
    ? muscles.join(', ')
    : `${muscles.slice(0, cap).join(', ')} +${muscles.length - cap} more`;

  return (
    <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 8, marginBottom: 10 }}>
      <div className="kicker" style={{ marginBottom: 5 }}>Why This</div>

      <Detail max="beginner">
        {lead && <div style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--dim)', lineHeight: 1.5 }}>{lead.text}</div>}
      </Detail>

      <Detail min="intermediate">
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {rec.reasoning.map((r, i) => (
            <li key={i} style={{ ...mono, fontSize: 10, color: 'var(--dim)', lineHeight: 1.7, display: 'flex', gap: 7 }}>
              <span style={{ color: 'var(--rule)', flexShrink: 0 }}>—</span>
              <span>{r.text}{r.note && <span style={{ color: 'var(--gold)' }}> {r.note}</span>}</span>
            </li>
          ))}
        </ul>

        {/* The saved plan and today's fatigue have diverged. Worth stating
            plainly rather than quietly showing a different top pick. */}
        {rec.supersedes && (
          <div style={{ ...mono, fontSize: 9, color: 'var(--ember)', marginTop: 6, lineHeight: 1.6 }}>
            Your saved plan led with {rec.supersedes} — on current fatigue, {rec.chosen.name} now ranks higher.
          </div>
        )}
      </Detail>

      {/* Feature 8: never block the choice, quantify it. Only the measured
          consequences appear here — muscles traded, muscles that can't be
          loaded — never a predicted performance drop, which Press has no
          calibrated model for. */}
      {override && (
        <div style={{ borderLeft: '2px solid var(--gold)', paddingLeft: 10, marginTop: 8 }}>
          <div style={{ ...mono, fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 3 }}>
            Choosing {override.to} instead
          </div>
          <div style={{ ...mono, fontSize: 10, color: 'var(--dim)', lineHeight: 1.7 }}>
            {override.nearTie
              ? `Scores within ${Math.abs(override.scoreDelta)} points of ${override.from} — effectively an equal choice.`
              : `Ranks ${override.scoreDelta} points below ${override.from}.`}
            {override.trades.gaining.length > 0 && <> Trains {muscleList(override.trades.gaining)} instead of {muscleList(override.trades.losing)}.</>}
          </div>
          {override.blocked.length > 0 && (
            <div style={{ ...mono, fontSize: 9, color: 'var(--ember)', marginTop: 3, lineHeight: 1.6 }}>
              Can't be loaded today: {muscleList(override.blocked.map(b => `${b.muscle} (${b.reason === 'offline' ? 'flagged' : `fatigue ${b.fatigue}`})`), 5)}
            </div>
          )}
        </div>
      )}

      <Detail min="scientist">
        {rec.chosen.drivers?.[0] && (
          <div style={{ marginTop: 8, borderTop: '1px solid var(--paper2)', paddingTop: 6 }}>
            <div style={{ ...mono, fontSize: 8, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 4 }}>
              Score · {rec.chosen.drivers[0].muscle}
            </div>
            {rec.chosen.drivers[0].terms.map(t => (
              <div key={t.key} style={{ ...mono, fontSize: 9, color: 'var(--dim)', display: 'flex', justifyContent: 'space-between', lineHeight: 1.8 }}>
                <span>{t.label}{t.key === 'staleness' && t.days != null ? ` · ${t.days}d` : ''}</span>
                <span style={{ color: 'var(--ink)' }}>+{t.value}</span>
              </div>
            ))}
            <div style={{ ...mono, fontSize: 9, display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--rule)', marginTop: 3, paddingTop: 3 }}>
              <span style={{ color: 'var(--dim)' }}>Priority</span>
              <span>{rec.chosen.drivers[0].priority}</span>
            </div>
          </div>
        )}
      </Detail>

      {/* A level, never a percentage — see recommendationConfidence for why. */}
      <Detail min="intermediate">
        <div style={{ ...mono, fontSize: 9, color: 'var(--dim)', marginTop: 8, lineHeight: 1.6 }}>
          <span style={{ letterSpacing: '.08em', textTransform: 'uppercase' }}>Confidence</span>
          {' · '}
          <span style={{ color: rec.confidence.level === 'high' ? 'var(--forest)' : rec.confidence.level === 'moderate' ? 'var(--gold)' : 'var(--ember)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600 }}>
            {rec.confidence.level}
          </span>
          {atLeast('scientist') && rec.confidence.limitations.map((l, i) => (
            <div key={i} style={{ paddingLeft: 10, color: 'var(--dim)' }}>— {l.text}</div>
          ))}
        </div>
      </Detail>
    </div>
  );
}

// Pick the muscles, get the movement — the inverse of the usual workflow.
//
// Ranked by functions/targetMusclePlanner.js's Score = stimulus / (1 + λ·L),
// where L is the most-fatigued muscle the configuration meaningfully involves.
// The stimulus term is a sum of %MVIC values across the chosen muscles, which
// is a valid ordering and not a physical total — so it ranks the list and is
// never printed as a number. λ is a stated preference about training, not a
// measurement, and is labelled as one.
function TargetMusclePlannerPanel({ fatigue }) {
  const [targets, setTargets] = useState([]);
  const mono = { fontFamily: "'JetBrains Mono',monospace" };
  const all = useMemo(() => allTargetableMuscles(), []);

  const plan = useMemo(
    () => (targets.length ? findOptimalConfigurations(targets, { currentFatigue: fatigue || {} }) : null),
    [targets, fatigue],
  );
  const counterfactual = useMemo(
    () => (targets.length ? fatigueChangedTheAnswer(targets, { currentFatigue: fatigue || {} }) : null),
    [targets, fatigue],
  );

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ ...mono, fontSize: 8, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 6 }}>
        Train a muscle
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
        {all.map(m => {
          const on = targets.includes(m);
          return (
            <button key={m} onClick={() => setTargets(prev => (on ? prev.filter(x => x !== m) : [...prev, m]))}
              aria-pressed={on}
              style={{
                ...mono, fontSize: 9, padding: '4px 8px', cursor: 'pointer', minHeight: 30,
                textTransform: 'capitalize',
                border: `1px solid ${on ? 'var(--gold)' : 'var(--rule)'}`,
                background: on ? 'var(--gold)' : 'none',
                color: on ? 'var(--paper)' : 'var(--dim)',
              }}>{m}</button>
          );
        })}
      </div>

      {plan && plan.results.length === 0 && (
        <div style={{ ...mono, fontSize: 9, color: 'var(--dim)' }}>
          Nothing in the exercise database meaningfully reaches {targets.join(' and ')}.
        </div>
      )}

      {plan?.results.map((r, i) => (
        <div key={`${r.pattern ?? 'fixed'}-${r.angle ?? r.exercises[0]?.name}`} className={`target-config${i === 0 ? ' top' : ''}`}>
          <div style={{ ...mono, fontSize: 11, color: 'var(--ink)' }}>
            {/* A fixed exercise has no angle to choose, so it names itself
                rather than rendering an invented "at null degrees". */}
            {r.pattern ? `${patternLabelFor(r.pattern)} at ${r.angle}\u00b0` : r.exercises[0]?.name}
          </div>
          <div style={{ ...mono, fontSize: 9, color: 'var(--dim)', marginTop: 2, lineHeight: 1.6 }}>
            {r.perTarget.map(t => `${t.muscle} ${Math.round(t.activation)}%`).join(' · ')}
          </div>
          {r.pattern && (
            <div style={{ ...mono, fontSize: 8, color: 'var(--dim)', marginTop: 2 }}>
              {r.exercises.map(e => e.name).join(' · ')}
            </div>
          )}
          {r.limitingFatigue > 0 && (
            <div style={{ ...mono, fontSize: 8, color: r.spentMuscles.length ? 'var(--ember)' : 'var(--dim)', marginTop: 2 }}>
              Most-spent muscle involved: {r.limitingMuscle} at {Math.round(r.limitingFatigue * 100)}
              {r.spentMuscles.length > 0 && ` — over the ${plan.ceiling}-point ceiling`}
            </div>
          )}
        </div>
      ))}

      {counterfactual && (
        <div style={{ ...mono, fontSize: 9, color: 'var(--gold)', marginTop: 4, lineHeight: 1.6 }}>
          Ranked above {counterfactual.insteadOf.pattern
            ? `${patternLabelFor(counterfactual.insteadOf.pattern)} at ${counterfactual.insteadOf.angle}\u00b0`
            : counterfactual.insteadOf.exercises[0]?.name},
          which would normally win — {counterfactual.because} is at {counterfactual.fatigue}.
        </div>
      )}

      {plan && plan.results.length > 0 && (
        <div style={{ ...mono, fontSize: 8, color: 'var(--dim)', marginTop: 6, lineHeight: 1.5 }}>
          {plan.results.length} of {plan.consideredCount} configurations. Ranked on activation against your current fatigue —
          the fatigue weighting (λ {plan.lambda}) is a training preference, not a measurement.
        </div>
      )}
    </div>
  );
}

// One cell per solved day. Color is the bottom border only, not a filled
// background block or a ring — readiness is real signal from
// calendarSolver.js's own simulateSession output (see readinessFor there),
// not decoration.
const READINESS_COLOR = { green: 'var(--forest)', amber: 'var(--gold)', red: 'var(--red)' };
// Date#getDay convention (0=Sunday) — shared by CalendarGrid's date labels
// and Settings' day-of-week constraint pickers.
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// SPLIT_GROUPS keys are camelCase bucket names ('chestBack') for splits
// whose buckets aren't already single words — spaced out for display.
const bucketLabel = key => key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
function CalendarGrid({ days, expandedDate, onSelect, busyDates = [] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4, marginBottom: 10 }}>
      {days.map(d => {
        const dateObj = localDateFromYMD(d.date);
        const isOpen = expandedDate === d.date;
        const isBusy = busyDates.includes(d.date);
        return (
          <button key={d.date} onClick={() => onSelect(isOpen ? null : d.date)}
            aria-expanded={isOpen}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '6px 2px',
              minHeight: 44, cursor: 'pointer', background: isBusy ? 'rgba(255, 165, 0, 0.1)' : 'none', minWidth: 0, overflowWrap: 'anywhere',
              border: `1px solid ${isOpen ? 'var(--ink)' : isBusy ? 'var(--gold)' : 'var(--rule)'}`,
              borderBottom: `3px solid ${isBusy ? 'var(--gold)' : READINESS_COLOR[d.readiness] || 'var(--rule)'}`,
              fontFamily: "'JetBrains Mono',monospace",
            }}>
            <span style={{ fontSize: 8, color: 'var(--dim)', textTransform: 'uppercase' }}>
              {dateObj.toLocaleDateString('en-GB', { weekday: 'short' })}
            </span>
            <span style={{ fontSize: 10, color: 'var(--ink)' }}>{dateObj.getDate()}</span>
            <span style={{ fontSize: 7, color: isBusy ? 'var(--gold)' : 'var(--dim)', textTransform: 'capitalize', textAlign: 'center', lineHeight: 1.2 }}>
              {isBusy ? 'Busy' : d.type === 'rest' ? 'Rest' : (d.bucket || 'Full Body')}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function S3({ s, recommendation, performanceTrend, onStartWorkout, onImport, onHistory, refresh }) {
  const workouts = s?.workouts || [];
  const lifts = s?.lifts || [];
  const liftVol = s?.liftVolume || [];
  const lastSession = workouts[0] || null;
  const sessionLifts = lastSession ? lifts.filter(l => l.date === lastSession.date) : [];
  const [showGroupStart, setShowGroupStart] = useState(false);
  const [confirmDeleteLast, setConfirmDeleteLast] = useState(false);
  const [deletingLast, setDeletingLast] = useState(false);

  const deleteLastSession = async () => {
    if (!lastSession) return;
    setDeletingLast(true);
    await api(`workout/${lastSession.date}`, { method: 'DELETE' });
    await api('summary').then(refresh);
    setConfirmDeleteLast(false);
    setDeletingLast(false);
  };

  const exerciseMap = {};
  sessionLifts.forEach(l => {
    if (!exerciseMap[l.exercise] || l.kg > exerciseMap[l.exercise].kg) exerciseMap[l.exercise] = l;
  });
  const rows = Object.values(exerciseMap).slice(0, 5);
  const topLift = rows.reduce((a, b) => (b.kg > (a?.kg || 0) ? b : a), null);
  const sessionName = lastSession?.name ? lastSession.name[0].toUpperCase() + lastSession.name.slice(1) : 'Session';
  // Calendar-day difference against local midnight today, not a raw
  // Date.now() ms subtraction against UTC-midnight-parsed lastSession.date —
  // the latter can be off by a day in negative-UTC timezones.
  const daysAgo = lastSession?.date
    ? Math.round((new Date(new Date().setHours(0, 0, 0, 0)) - localDateFromYMD(lastSession.date)) / 86_400_000)
    : null;

  const experiments = s?.experiments || [];
  const activeExps = experiments.filter(e => e.active);
  const [showExpForm, setShowExpForm] = useState(false);
  const [expHyp, setExpHyp] = useState('');
  const [expMetric, setExpMetric] = useState('');
  const [expEnd, setExpEnd] = useState('');
  const [expSaving, setExpSaving] = useState(false);
  const [concludeId, setConcludeId] = useState(null);
  const [concludeOutcome, setConcludeOutcome] = useState('');

  const saveExperiment = async () => {
    if (!expHyp.trim()) return;
    setExpSaving(true);
    const hypothesis = expHyp.trim(), metric = expMetric.trim(), endDate = expEnd || null;
    const data = await api('experiments', { method: 'POST', body: JSON.stringify({ hypothesis, metric, endDate }) });
    setExpHyp(''); setExpMetric(''); setExpEnd(''); setShowExpForm(false);
    setExpSaving(false);
    refresh({ ...s, experiments: [...(s?.experiments || []), {
      id: data.id, hypothesis, startDate: todayLocalStr(), endDate, metric, notes: '', active: true, outcome: null, concludedAt: null,
    }] });
  };

  const concludeExperiment = async (id) => {
    await api(`experiments/${id}/conclude`, { method: 'POST', body: JSON.stringify({ outcome: concludeOutcome }) });
    setConcludeId(null); setConcludeOutcome('');
    refresh({ ...s, experiments: (s?.experiments || []).map(e => e.id === id ? { ...e, active: false, outcome: concludeOutcome || 'concluded', concludedAt: Date.now() } : e) });
  };

  const deleteExperiment = async (id) => {
    await api(`experiments/${id}`, { method: 'DELETE' });
    refresh({ ...s, experiments: (s?.experiments || []).filter(e => e.id !== id) });
  };

  const [targetPlannerOpen, setTargetPlannerOpen] = useState(false);
  const [togglingBusy, setTogglingBusy] = useState(false);
  const [savingDayDuration, setSavingDayDuration] = useState(false);
  // The same structural fatigue reading the Recovery panel shows — both the
  // target planner and (formerly) the sandbox rank against current state, so
  // they have to be looking at the same numbers the rest of the app is.
  const currentFatigue = useMemo(
    () => computeStructuralFatigue(s?.lifts, s?.musclePeaks, s?.soreness, s?.muscleSensitivity),
    [s?.lifts, s?.musclePeaks, s?.soreness, s?.muscleSensitivity],
  );

  // Phase 5 "Plan Ahead" — day-by-day forward solve, replacing both the old
  // advisory "This Week's Guidance" block and the live single-day picker.
  // Never stored client-side either: re-fetched on every mount/view change,
  // same "recomputed fresh, never a locked schedule" rule as the rest of the
  // planner — see functions/calendarSolver.js's header.
  const [calendarView, setCalendarView] = useState('week');
  const [calendar, setCalendar] = useState(null);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [expandedDate, setExpandedDate] = useState(null);
  // Bumped after saving a per-day duration override (or anything else that
  // changes what the solver would produce) to force a refetch without
  // touching calendarView itself.
  const [calendarRefreshNonce, setCalendarRefreshNonce] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setCalendarLoading(true);
    api(`plan/calendar?days=${calendarView === 'month' ? 30 : 7}`).then(data => {
      if (cancelled) return;
      setCalendar(data);
      setExpandedDate(prev => prev || data?.days?.[0]?.date || null);
      setCalendarLoading(false);
    }).catch(() => { if (!cancelled) setCalendarLoading(false); });
    return () => { cancelled = true; };
  }, [calendarView, calendarRefreshNonce]);
  // Today's cell specifically — the one Start Session/Other Ways/.ics export
  // act on. null when today is a rest day or nothing was fetched yet.
  const today0 = calendar?.days?.[0]?.type === 'session' ? calendar.days[0] : null;

  // null = never fetched, [] = fetched and there were no real alternatives.
  const [variants, setVariants] = useState(null);
  const [variantsOpen, setVariantsOpen] = useState(false);
  const [variantsLoading, setVariantsLoading] = useState(false);
  const [variantsError, setVariantsError] = useState('');
  useEffect(() => {
    if (!variantsOpen || !today0?.exercises?.length) return;
    let cancelled = false;
    setVariantsLoading(true);
    setVariantsError('');
    authFetch(`${API_BASE}/plan/session-variants`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetMuscles: today0.targetMuscles,
        backboneExercises: today0.exercises.map(e => e.name),
        exercises: today0.exercises,
        maxDurationMin: s?.profile?.maxSessionDurationMin ?? null,
      }),
    }).then(r => r.json()).then(data => {
      if (cancelled) return;
      setVariants(data.variants || []);
      setVariantsLoading(false);
    }).catch(() => {
      if (cancelled) return;
      setVariantsError('Could not load alternatives.');
      setVariantsLoading(false);
    });
    return () => { cancelled = true; };
  }, [variantsOpen, today0?.date, today0?.exercises?.length]);

  // Exports today's calendar session as a .ics the athlete can open in
  // whatever calendar they use. Scheduled for the next full hour today, which
  // is a placeholder they can drag — the app has no idea when they train, and
  // guessing a time from training history would be a fabricated preference.
  const addSessionToCalendar = () => {
    if (!today0?.exercises?.length) return;
    const start = new Date();
    start.setMinutes(0, 0, 0);
    start.setHours(start.getHours() + 1);

    const bucket = today0.bucket;
    const ics = buildSessionICS({
      title: `Press — ${bucket ? bucket[0].toUpperCase() + bucket.slice(1) : 'Training'}`,
      start,
      durationMin: today0.estimatedDurationMin || 60,
      exercises: today0.exercises,
      reasoning: recommendation?.reasoning || [],
      // Stable per day+bucket, so re-exporting updates the same event instead
      // of stacking duplicates in the calendar.
      uid: `press-${start.toISOString().slice(0, 10)}-${bucket || 'session'}`,
      note: 'Planned in Press. Times are a placeholder — move it to suit.',
    });
    if (!ics) return;

    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `press-${start.toISOString().slice(0, 10)}-${bucket || 'session'}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoked on the next tick rather than immediately — Safari can abort the
    // download if the object URL disappears before it has read it.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <section id="s3">
      {s?.travelMode && (
        <div className="travel-banner">
          <span>Travel Mode — bodyweight only</span>
          <button onClick={async () => { const data = await api('travel-mode', { method: 'POST', body: JSON.stringify({ enabled: false }) }); refresh({ ...s, travelMode: data.travelMode }); }}
            style={{ background: 'none', border: '1px solid rgba(255,255,255,.4)', color: 'var(--paper)', fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.1em', textTransform: 'uppercase', padding: '3px 8px', cursor: 'pointer' }}>
            Disable
          </button>
        </div>
      )}
      <div className="fade panel-head" data-tour="s3-headline">
        {/* paddingRight clears the .panel-toggle, which floats over the top-right
            corner — this is the only kicker with right-aligned content of its own. */}
        <div className="kicker" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingRight: 28 }}>
          <span>Performance · Strength · {daysAgo != null ? (daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo} Days Ago`) : '—'}</span>
          {lastSession && (
            confirmDeleteLast ? (
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.1em' }}>
                Delete this workout?{' '}
                <button onClick={deleteLastSession} disabled={deletingLast} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', textTransform: 'uppercase', padding: 0 }}>
                  {deletingLast ? 'Deleting…' : 'Yes'}
                </button>{' '}
                <button onClick={() => setConfirmDeleteLast(false)} disabled={deletingLast} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--dim)', textTransform: 'uppercase', padding: 0 }}>
                  No
                </button>
              </span>
            ) : (
              <button onClick={() => setConfirmDeleteLast(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--dim)', fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.1em', textTransform: 'uppercase', padding: 0 }}>
                Delete
              </button>
            )
          )}
        </div>
        <div className="headline">
          {topLift ? `${sessionName} Day —` : 'Quiet Gym —'}<br />
          {topLift ? `${topLift.kg > 0 ? `${topLift.kg} kg` : 'BW'} ${topLift.exercise[0].toUpperCase() + topLift.exercise.slice(1)}` : 'Nothing on the Card'}
        </div>
      </div>
      {rows.length > 0 && (
        <div className="fade">
          <table className="data-table">
            <thead><tr><th>Exercise</th><th>Weight</th><th>Reps</th></tr></thead>
            <tbody>
              {rows.map((l, i) => (
                <tr key={i}>
                  <td style={{ textTransform: 'capitalize' }}>{l.exercise}</td>
                  <td className="gld">{l.kg > 0 ? `${l.kg} kg` : 'BW'}</td>
                  <td className="hi">{l.reps}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {liftVol.filter(Boolean).length >= 2 && (
        <div className="chart-wrap fade" style={{ flex: 1, minHeight: 60, maxHeight: 90 }}>
          <BarChart data={liftVol} color="#0d0b08" />
        </div>
      )}
      <div className="fade">
        <div className={`stat-cols stat-cols-${s?.sessionLoad ? '4' : '3'}`} style={{ borderTop: '1px solid var(--rule)', paddingTop: 10 }} data-tour="s3-stats">
          <div className="stat-cell"><div className="sc-label">Duration</div><div className="sc-num" style={{ fontSize: 22 }}>{lastSession?.duration ?? '—'}<span style={{ fontSize: '.5em', color: 'var(--dim)' }}>min</span></div></div>
          <div className="stat-cell"><div className="sc-label">Output</div><div className="sc-num" style={{ fontSize: 22 }}>{lastSession?.kcal ?? '—'}<span style={{ fontSize: '.5em', color: 'var(--dim)' }}>kcal</span></div></div>
          <div className="stat-cell"><div className="sc-label">Month</div><div className="sc-num forest" style={{ fontSize: 22 }}>{s?.workoutsMonth ?? '—'}<span style={{ fontSize: '.5em', color: 'var(--dim)' }}> sessions</span></div></div>
          {/* #11: session-load headline number — a Relative-Effort-style 0-100
              figure for the most recent session, framed against this same
              athlete's own trailing average rather than an absolute scale. */}
          {s?.sessionLoad && (
            <div className="stat-cell">
              <div className="sc-label">Load</div>
              <div className="sc-num" style={{ fontSize: 22 }}>
                {s.sessionLoad.current}
                {s.sessionLoad.delta != null && (
                  <span style={{ fontSize: '.45em', color: s.sessionLoad.delta > 0 ? 'var(--ember)' : s.sessionLoad.delta < 0 ? 'var(--dim)' : 'var(--dim)', marginLeft: 3 }}>
                    {s.sessionLoad.delta > 0 ? `+${s.sessionLoad.delta}` : s.sessionLoad.delta} vs avg
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      {/* #12: fitness/fatigue/form trend. A deload nudge only ever appears
          here — this proposes, it never touches weeklyPlan itself. */}
      {performanceTrend?.trend?.length > 1 && (
        <div className="fade" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--rule)', paddingTop: 8 }}>
          <div>
            <div className="sc-label">Form</div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: performanceTrend.trend.at(-1).form < 0 ? 'var(--ember)' : 'var(--forest)' }}>
              {performanceTrend.trend.at(-1).form > 0 ? '+' : ''}{performanceTrend.trend.at(-1).form}
              {performanceTrend.deload && <span style={{ color: 'var(--ember)', marginLeft: 6 }}>— {performanceTrend.deload.reason}</span>}
            </div>
          </div>
          <Sparkline data={performanceTrend.trend.slice(-30).map(p => p.form)} color={performanceTrend.trend.at(-1).form < 0 ? 'var(--ember)' : 'var(--forest)'} width={64} height={26} />
        </div>
      )}
      <div className="fade" style={{ marginTop: 'auto' }} data-tour="s3-plan-ahead">
        <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 10 }}>
          <div className="kicker" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <span>Plan Ahead</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className={`prof-btn${calendarView === 'week' ? ' solid' : ''}`} style={{ fontSize: 8, padding: '3px 8px' }} onClick={() => setCalendarView('week')}>Week</button>
              <button className={`prof-btn${calendarView === 'month' ? ' solid' : ''}`} style={{ fontSize: 8, padding: '3px 8px' }} onClick={() => setCalendarView('month')}>Month</button>
            </div>
          </div>

          {calendarLoading && (
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', padding: '4px 0 10px' }}>Solving…</div>
          )}

          {!calendarLoading && calendar && (
            <CalendarGrid days={calendar.days} expandedDate={expandedDate} onSelect={setExpandedDate} busyDates={s?.profile?.busyDates || []} />
          )}
        </div>

        {!calendarLoading && calendar && expandedDate && (() => {
          const day = calendar.days.find(d => d.date === expandedDate);
          if (!day) return null;
          const isToday = day.date === calendar.days[0]?.date;
          const isBusy = (s?.profile?.busyDates || []).includes(expandedDate);

          const toggleBusy = async () => {
            setTogglingBusy(true);
            const updated = isBusy
              ? (s.profile.busyDates || []).filter(d => d !== expandedDate)
              : [...(s.profile.busyDates || []), expandedDate];
            try {
              await api('profile', { method: 'POST', body: JSON.stringify({ busyDates: updated }) });
              refresh({ ...s, profile: { ...s.profile, busyDates: updated } });
            } finally {
              setTogglingBusy(false);
            }
          };

          const dayDurationOverride = (s?.profile?.dayDurationOverrides || {})[expandedDate] ?? null;

          const setDayDuration = async (mins) => {
            setSavingDayDuration(true);
            const overrides = { ...(s.profile.dayDurationOverrides || {}) };
            if (mins == null) delete overrides[expandedDate]; else overrides[expandedDate] = mins;
            try {
              await api('profile', { method: 'POST', body: JSON.stringify({ dayDurationOverrides: overrides }) });
              refresh({ ...s, profile: { ...s.profile, dayDurationOverrides: overrides } });
              setCalendarRefreshNonce(n => n + 1);
            } finally {
              setSavingDayDuration(false);
            }
          };

          if (day.type === 'rest') {
            return (
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--dim)', fontStyle: 'italic', padding: '4px 0 8px' }}>
                {day.reason || 'Rest day'}
              </div>
            );
          }

          return (
          <div>
          {/* Split-day anchor (Settings) couldn't be honored this day — the
              muscle wasn't fresh enough, so the solver picked the next-best
              bucket instead of forcing a fatigued one through
              (TRAINING_ETHOS: autoregulated, never a rigid template). */}
          {day.bucketConflict && (
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--ember)', marginBottom: 6, lineHeight: 1.5, textTransform: 'capitalize' }}>
              {day.bucketConflict} was preferred for this day but wasn't fresh enough — {day.bucket} instead.
            </div>
          )}
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--gold)', textTransform: 'capitalize', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span>{day.bucket || 'Full Body'}</span>
            {day.estimatedDurationMin != null && <span style={{ color: 'var(--dim)' }}>~{day.estimatedDurationMin} min</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', marginRight: 2 }}>Length</span>
            {[30, 45, 60, 90].map(mins => (
              <button key={mins} type="button" disabled={savingDayDuration}
                className={`prof-btn${dayDurationOverride === mins ? ' solid' : ''}`}
                style={{ fontSize: 9, padding: '4px 8px' }}
                onClick={() => setDayDuration(dayDurationOverride === mins ? null : mins)}>
                {mins}m
              </button>
            ))}
            {dayDurationOverride != null && (
              <button type="button" disabled={savingDayDuration} className="prof-btn" style={{ fontSize: 9, padding: '4px 8px', color: 'var(--dim)' }}
                onClick={() => setDayDuration(null)}>
                Reset
              </button>
            )}
          </div>
          {day.exercises.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              {day.exercises.map((ex, i) => {
                // Exclude warmup sets ('W') from the summary — prog.suggestKg > 0
                // (real prior history) prepends 2 warmups ahead of the working
                // sets, and counting/describing those in the headline made the
                // preview show e.g. "6 sets · 10 reps" (2 warmups + 4 working,
                // reps from the first warmup) for an exercise genuinely
                // prescribing 4 working sets at a different rep target.
                const workingSets = ex.sets?.filter(s => s.type !== 'W') ?? [];
                // Which muscle(s) this specific pick is actually for — not
                // returned by the backend for a normal exercise
                // (generateSessionExercises sends {name, note, sets}), but
                // EXERCISE_DB is already bundled into the frontend, so a
                // lookup here is enough. An isAngleFamily pick (e.g. "Cable
                // Fly") DOES additionally carry its own family/pattern/
                // equipment/angle straight from the response — that's the
                // specific angle recommended for the muscle this pick was
                // actually credited for, shown below.
                const primaryMuscles = EXERCISE_DB.find(e => e.name === ex.name)?.primary || [];
                const chestSplit = chestSplitForExercise(ex.name);
                const flySplit = ex.family && ex.pattern === 'fly' ? flyHeadSplitForAngle(ex.angle) : null;
                const extensionSplit = ex.family && ex.pattern === 'extension' ? extensionHeadSplitForAngle(ex.angle) : null;
                const formTips = formCuesForExercise(ex);
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '3px 0', borderBottom: '1px solid var(--rule)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--ink)', textTransform: 'capitalize' }}>{ex.name}</span>
                      {primaryMuscles.length > 0 && (
                        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', textTransform: 'capitalize', marginTop: 1 }}>
                          {primaryMuscles.map(muscleDisplayLabel).join(', ')}
                        </div>
                      )}
                      {chestSplit && (
                        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', marginTop: 1 }}>
                          Lower {chestSplit.lower}% · Mid {chestSplit.mid}% · Upper {chestSplit.upper}%
                        </div>
                      )}
                      {ex.family && ex.angle != null && (
                        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--gold)', marginTop: 1 }}>
                          @ {ex.angle}° (recommended){flySplit ? ` — Lower ${flySplit.lower}% · Mid ${flySplit.mid}% · Upper ${flySplit.upper}%` : ''}{extensionSplit ? ` — Long ${extensionSplit.long}% · Lateral ${extensionSplit.lateral}% · Medial ${extensionSplit.medial}%` : ''}
                        </div>
                      )}
                      {formTips.map((tip, ti) => (
                        <div key={ti} style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', marginTop: 1, fontStyle: 'italic' }}>
                          {tip}
                        </div>
                      ))}
                    </div>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)' }}>{workingSets.length || ex.sets?.length || 3} sets · {workingSets[0]?.reps ?? ex.sets?.[0]?.reps ?? 8} reps</span>
                    {workingSets[0]?.kg ? <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--gold)' }}>{workingSets[0].kg}kg</span> : null}
                  </div>
                );
              })}
            </div>
          )}
          {day.exercises.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--dim)', fontStyle: 'italic', marginBottom: 8 }}>No fresh muscle group available right now — Freestyle, or rest and try again later.</div>
          )}
          {day.exercises.length > 0 && s?.profile?.warmupScheme?.length && (
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', marginBottom: 8, padding: '6px 8px', background: 'var(--paper-alt)', borderRadius: 4 }}>
              Warmup: {s.profile.warmupScheme.map(w => `${w.reps}@${w.pct}%`).join(' + ')}
            </div>
          )}

          {/* Starting, editing tools, and the .ics export only make sense
              against today's cell — a future day is a preview, not
              something to act on yet (it re-solves by the time it arrives
              anyway, per TRAINING_ETHOS's autoregulated-session-to-session
              stance). */}
          {isToday && (
            <>
              <div className="action-row-primary">
                <button className="action-btn primary" disabled={!day.exercises.length}
                  onClick={() => onStartWorkout({ sessions: [{ type: 'lift', targetMuscles: day.targetMuscles, backboneExercises: day.exercises.map(e => e.name) }], preloadedExercises: day.exercises })}>
                  Start Session
                </button>
                <button className="action-btn" onClick={() => onStartWorkout(null)}>Freestyle</button>
                <button className="action-btn" onClick={() => {
                  let existing = null;
                  try { existing = localStorage.getItem(GROUP_SESSION_KEY); } catch {}
                  if (existing) onStartWorkout(null); else setShowGroupStart(true);
                }}>Group Session</button>
              </div>

              <div className="session-tools">
                <button className="tool-btn" disabled={!day.exercises.length}
                  aria-expanded={variantsOpen} aria-controls="session-variants"
                  onClick={() => setVariantsOpen(o => !o)}>
                  Other Ways
                </button>
                {/* Intermediate-and-up: built on the fatigue numbers, which
                    Beginner doesn't show at all. */}
                <Detail min="intermediate">
                  <button className="tool-btn"
                    aria-expanded={targetPlannerOpen} aria-controls="target-planner"
                    onClick={() => setTargetPlannerOpen(o => !o)}>
                    Train A Muscle
                  </button>
                </Detail>

                <div className="session-tools-end">
                  <button className="tool-btn plain" disabled={!day.exercises.length} onClick={addSessionToCalendar}>
                    Add to Calendar
                  </button>
                  <button className={`tool-btn plain${isBusy ? ' solid' : ''}`} disabled={togglingBusy} onClick={toggleBusy} style={{ color: isBusy ? 'var(--gold)' : 'inherit' }}>
                    {isBusy ? 'Busy' : 'Mark Busy'}
                  </button>
                </div>
              </div>

              {targetPlannerOpen && (
                <div id="target-planner">
                  <TargetMusclePlannerPanel fatigue={currentFatigue} />
                </div>
              )}

              {variantsOpen && (
                <div id="session-variants" className="variants">
                  {variantsLoading && <div className="variants-status">Building alternatives…</div>}
                  {variantsError && <div className="variants-status variants-error">{variantsError}</div>}
                  {!variantsLoading && !variantsError && variants !== null && variants.length <= 1 && (
                    <div className="variants-status">
                      No meaningful alternative today — a shorter, machine-only or bodyweight version of this session comes out the same.
                    </div>
                  )}
                  {!variantsLoading && !variantsError && variants?.filter(v => v.key !== 'recommended').map(v => (
                    <div key={v.key} className="variant">
                      <div className="variant-head">
                        <span className="variant-label">{v.label}</span>
                        <span className="variant-stat">{v.durationMin} min · {v.workingSets} working sets</span>
                      </div>
                      <p className="variant-premise">{v.premise}</p>
                      {v.tradeoffs.length > 0 && (
                        <ul className="variant-tradeoffs">
                          {v.tradeoffs.map(t => (
                            <li key={t.key} className={t.direction === 'less' ? 'tradeoff-less' : 'tradeoff-more'}>{t.text}</li>
                          ))}
                        </ul>
                      )}
                      <div className="variant-exercises">{v.exercises.map(e => e.name).join(' · ')}</div>
                      <button className="action-btn" onClick={() => onStartWorkout({
                        sessions: [{ type: 'lift', targetMuscles: day.targetMuscles, backboneExercises: day.exercises.map(e => e.name) }],
                        preloadedExercises: v.exercises,
                      })}>
                        Start This
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {!isToday && (
            <div style={{ paddingTop: 10, borderTop: '1px solid var(--rule)', display: 'flex', gap: 8 }}>
              <button className={`tool-btn plain${isBusy ? ' solid' : ''}`} disabled={togglingBusy} onClick={toggleBusy} style={{ color: isBusy ? 'var(--gold)' : 'inherit', flex: 1 }}>
                {isBusy ? 'Busy' : 'Mark Busy'}
              </button>
            </div>
          )}
          </div>
          );
        })()}

        {!calendarLoading && calendar && !calendar.days.some(d => d.type === 'session') && (
          <div style={{ fontSize: 11, color: 'var(--dim)', fontStyle: 'italic', padding: '4px 0 8px' }}>
            No fresh muscle group available across this window right now — Freestyle, or rest and try again later.
          </div>
        )}

        {/* Week history strip — which days actually had a session, not a forward schedule */}
        {(() => {
          const now = new Date();
          const mondayOffset = (now.getDay() + 6) % 7;
          const monday = new Date(now); monday.setDate(now.getDate() - mondayOffset);
          const todayStr = toLocalDateStr(now);
          const DOW = ['M','T','W','T','F','S','S'];
          const workoutDates = new Set(workouts.map(w => w.date));
          return (
            <div className="week-strip" data-tour="s3-week">
              {DOW.map((label, i) => {
                const d = new Date(monday); d.setDate(monday.getDate() + i);
                const dateStr = toLocalDateStr(d);
                const isToday = dateStr === todayStr;
                const hasSession = workoutDates.has(dateStr);
                return (
                  <div key={i} className={`week-day${isToday ? ' today' : ''}${hasSession ? ' has-session' : ''}`} title={hasSession ? 'Trained' : ''}>
                    <div className="week-day-label">{label}</div>
                    {hasSession && <div className="week-day-dot" />}
                  </div>
                );
              })}
            </div>
          );
        })()}

        <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 8, marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }} data-tour="s3-tools">
          <button onClick={onImport} style={{ background: 'none', border: 'none', fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--dim)', cursor: 'pointer', padding: 0 }}>Import Hevy</button>
          <button onClick={onHistory} style={{ background: 'none', border: 'none', fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--dim)', cursor: 'pointer', padding: 0 }}>History</button>
          {s?.stravaConnected
            ? <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: '.08em', color: 'var(--forest)' }}>Strava</span>
            : <button onClick={() => { window.location.href = `${API_BASE}/strava/auth`; }} style={{ background: 'none', border: '1px solid var(--rule)', fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--dim)', cursor: 'pointer', padding: '4px 10px' }}>Connect Strava</button>
          }
        </div>
      </div>

      {/* Experiments */}
      <div className="fade" style={{ borderTop: '2px solid var(--ink)', paddingTop: 12, marginTop: 8, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: s?.dataMaturity?.hasEnoughData && activeExps.length === 0 ? 6 : 10 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <div className="kicker" style={{ margin: 0 }}>Experiments {activeExps.length > 0 ? `· ${activeExps.length} active` : ''}</div>
            {s?.dataMaturity?.hasEnoughData && activeExps.length === 0 && (
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--forest)', letterSpacing: '.05em' }}>PATTERN FOUND</span>
            )}
          </div>
          <button onClick={() => setShowExpForm(v => !v)}
            style={{ background: 'none', border: 'none', fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--dim)', cursor: 'pointer', padding: 0 }}>
            {showExpForm ? 'Cancel' : '+ New'}
          </button>
        </div>

        {s?.dataMaturity?.hasEnoughData && activeExps.length === 0 && !showExpForm && (
          <div style={{ fontFamily: 'Times New Roman,serif', fontSize: 12, color: 'var(--forest)', fontStyle: 'italic', padding: '4px 0 8px', lineHeight: 1.5 }}>
            {s.dataMaturity.exercisesWithPatterns} exercises show clear progression patterns across {s.dataMaturity.weeksCovered} weeks. Press is prescribing from your data — no experiments needed.
          </div>
        )}

        {showExpForm && (
          <div className="experiment-form" style={{ marginBottom: 14 }}>
            <input className="experiment-input" placeholder="Hypothesis (e.g. Creatine adds 5% to squat in 6 weeks)…"
              value={expHyp} onChange={e => setExpHyp(e.target.value)} />
            <input className="experiment-input" placeholder="Metric to track (e.g. squat e1RM)…"
              value={expMetric} onChange={e => setExpMetric(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)' }}>End date:</span>
              <input type="date" value={expEnd} onChange={e => setExpEnd(e.target.value)}
                style={{ border: 'none', borderBottom: '1px solid var(--rule)', background: 'transparent', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--ink)', outline: 'none', padding: '4px 0' }} />
            </div>
            <button className="prof-btn solid" onClick={saveExperiment} disabled={!expHyp.trim() || expSaving} style={{ alignSelf: 'flex-start', padding: '6px 18px' }}>
              {expSaving ? 'Saving…' : 'Start Experiment'}
            </button>
          </div>
        )}

        {!s?.dataMaturity?.hasEnoughData && experiments.length === 0 && !showExpForm && (
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--dim)', fontStyle: 'italic', padding: '4px 0 8px' }}>
            Track n=1 experiments. Test a protocol 4–8 weeks and record the outcome.
          </div>
        )}

        {experiments.map(exp => (
          <div key={exp.id} className="experiment-card" style={{ borderColor: exp.active ? 'var(--gold)' : 'var(--rule)', opacity: exp.active ? 1 : 0.7 }}>
            <div className="experiment-h">{exp.hypothesis}</div>
            <div className="experiment-meta">
              {exp.startDate}{exp.endDate ? ` → ${exp.endDate}` : ''}{exp.metric ? ` · ${exp.metric}` : ''}
              {!exp.active && exp.concludedAt ? ` · concluded ${new Date(exp.concludedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}
            </div>
            {exp.outcome && <div className="experiment-outcome">{exp.outcome}</div>}
            {exp.active && (
              concludeId === exp.id ? (
                <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                  <input style={{ flex: 1, border: 'none', borderBottom: '1px solid var(--rule)', background: 'transparent', fontFamily: 'Times New Roman,serif', fontSize: 13, outline: 'none', padding: '3px 0', color: 'var(--ink)' }}
                    placeholder="Outcome…" value={concludeOutcome} onChange={e => setConcludeOutcome(e.target.value)} />
                  <button className="prof-btn solid" onClick={() => concludeExperiment(exp.id)} style={{ fontSize: 8, padding: '4px 10px' }}>Done</button>
                  <button className="prof-btn" onClick={() => setConcludeId(null)} style={{ fontSize: 8, padding: '4px 10px' }}>×</button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <button className="prof-btn" onClick={() => setConcludeId(exp.id)} style={{ fontSize: 8, padding: '3px 8px' }}>Conclude</button>
                  <button onClick={() => deleteExperiment(exp.id)} style={{ background: 'none', border: 'none', fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', cursor: 'pointer', padding: 0 }}>× Delete</button>
                </div>
              )
            )}
          </div>
        ))}
      </div>
      {showGroupStart && (
        <GroupSessionStartModal
          onClose={() => setShowGroupStart(false)}
          onStarted={(sessionId) => {
            try { localStorage.setItem(GROUP_SESSION_KEY, sessionId); } catch {}
            setShowGroupStart(false);
            onStartWorkout(null); // lands in WorkoutLogger, which picks up the session from localStorage on mount
          }}
        />
      )}
    </section>
  );
}

// S4 lives in src/sections/S4.jsx
function S5({ s, recommendation, refresh }) {
  const antRef = useRef(), latRef = useRef(), postRef = useRef();
  const [svgsReady, setSvgsReady] = useState(false);
  // Ranking tab gets its own separate triptych/refs rather than sharing the
  // fatigue tab's — the fatigue triptych's div only mounts while tab ===
  // 'fatigue', so switching away and back would leave an empty container
  // (the SVG-fetch effect only runs once, deps=[]). Duplicating the small
  // fetch-and-inject pattern avoids risking that same issue here, at the
  // cost of one extra (browser-cached) fetch of the same 3 static files.
  const rankAntRef = useRef(), rankLatRef = useRef(), rankPostRef = useRef();
  const [rankSvgsReady, setRankSvgsReady] = useState(false);
  // Soreness tab's own triptych/refs, same reasoning as the Ranking tab's —
  // its container only mounts once the user switches to 'soreness'.
  const soreAntRef = useRef(), soreLatRef = useRef(), sorePostRef = useRef();
  const [soreSvgsReady, setSoreSvgsReady] = useState(false);
  // Adaptation tab's own triptych/refs, same reasoning again.
  const adaptAntRef = useRef(), adaptLatRef = useRef(), adaptPostRef = useRef();
  const [adaptSvgsReady, setAdaptSvgsReady] = useState(false);
  const { level: expertise } = useExpertise();
  const recoveryTabOrder = s?.profile?.recoveryTabOrder?.length ? s.profile.recoveryTabOrder : DEFAULT_RECOVERY_TAB_ORDER;
  const visibleRecoveryTabs = visibleRecoveryTabsFor(recoveryTabOrder, s?.profile?.hiddenRecoveryTabs, expertise);
  const [tab, setTab] = useState(() => (visibleRecoveryTabs.includes('fatigue') ? 'fatigue' : visibleRecoveryTabs[0]) || 'fatigue');
  // Dropping to a lower detail level can pull the tab you're on out from under
  // you; without this the section renders with no tab body at all.
  const activeTab = visibleRecoveryTabs.includes(tab) ? tab : visibleRecoveryTabs[0];
  const [selectedMuscle, setSelectedMuscle] = useState(null);
  const [sliderVal, setSliderVal] = useState(5);
  const [soreLogging, setSoreLogging] = useState(false);
  const [injuryArea, setInjuryArea] = useState('');
  const [injurySev, setInjurySev] = useState('mild');
  const [injuryNote, setInjuryNote] = useState('');
  const [injuryLogging, setInjuryLogging] = useState(false);
  const [adaptMuscle, setAdaptMuscle] = useState(null);
  const [atrophyRate, setAtrophyRate] = useState(DEFAULT_ATROPHY_RATE);
  const [atrophyCalibrated, setAtrophyCalibrated] = useState(false);

  const fatigue = useMemo(() => computeStructuralFatigue(s?.lifts, s?.musclePeaks, s?.soreness, s?.muscleSensitivity), [s?.lifts, s?.musclePeaks, s?.soreness, s?.muscleSensitivity]);
  const metabolic = useMemo(() => computeMetabolicFatigue(s?.lifts, s?.nutritionToday?.carbs || 0), [s?.lifts, s?.nutritionToday?.carbs]);
  const cns = useMemo(() => computeCNSFatigue(s?.lifts, s?.cnsSensitivity, s?.today?.recovery), [s?.lifts, s?.cnsSensitivity, s?.today?.recovery]);
  const fatigueVals = Object.values(fatigue);
  const overallFatigue = fatigueVals.length ? Math.round(fatigueVals.reduce((a,b)=>a+b,0)/fatigueVals.length) : null;
  const sortedFatigue = Object.entries(fatigue).filter(([,v]) => v > 0).sort(([,a],[,b]) => b-a);
  const fMax = sortedFatigue.length ? sortedFatigue[0][1] : 0;
  const topMuscles = sortedFatigue.slice(0,2).map(([m]) => m);

  const SORENESS_MUSCLES = ALL_MUSCLES;
  const recentSoreness = useMemo(() => (s?.soreness || []).filter(e => Date.now() - e.ts < 5 * 24 * 3600000), [s?.soreness]);
  const sorenessSet = new Set(recentSoreness.map(e => e.muscle));

  const patternFatigue = useMemo(() => computePatternFatigue(s?.lifts), [s?.lifts]);

  const adaptationSeries = useMemo(() => computeAdaptationSeries(s?.lifts), [s?.lifts]);
  const stimulusContributions = useMemo(() => computeStimulusContributions(s?.lifts), [s?.lifts]);
  // Default diagram view: colors every muscle by its current stimulus level
  // (not a slope/derivative — stimulus is already treated as the derivative
  // of ranking, so differentiating again isn't wanted), diverging red (near
  // zero -- effectively atrophying) to green (well above the single-session
  // peak -- actively adapting). "No data" is deliberately distinct from
  // "zero current stimulus": a muscle with an all-time ranked score
  // (s.muscleLevels) but nothing within the ~20-day contribution window has
  // genuinely decayed to near-zero and should read as red, not gray — gray
  // is reserved for a muscle that's never been trained at all.
  const adaptationFilterForMuscle = m => {
    const contribs = stimulusContributions[m];
    const everTrained = (contribs?.length > 0) || s?.muscleLevels?.[m];
    if (!everTrained) return 'url(#fm-dim)';
    const level = contribs ? computeAdaptationLevel(contribs, Date.now()) : 0;
    if (level < 0.15) return 'url(#fm-red)';
    if (level < 0.5) return 'url(#fm-ember)';
    if (level < 0.9) return 'url(#fm-gold)';
    return 'url(#fm-neutral)';
  };
  const adaptMuscles = Object.keys(adaptationSeries).sort();
  const activeAdaptMuscle = adaptMuscle || adaptMuscles[0] || null;
  const activeAdaptSeries = activeAdaptMuscle ? (adaptationSeries[activeAdaptMuscle] || []) : [];
  // Calibrated from the athlete's own real 14-90 day training gaps where
  // there's enough signal (estimateAtrophyRate); auto-applied once, then left
  // alone so a manual override via the slider below isn't silently
  // overwritten on every lift-history change.
  const estimatedAtrophyRate = useMemo(() => estimateAtrophyRate(s?.lifts), [s?.lifts]);
  useEffect(() => {
    if (estimatedAtrophyRate != null && !atrophyCalibrated) {
      setAtrophyRate(estimatedAtrophyRate.rate);
      setAtrophyCalibrated(true);
    }
  }, [estimatedAtrophyRate]);

  useEffect(() => {
    Promise.all([
      fetch(`${BODY_BASE}/body-anterior.svg`).then(r => r.text()),
      fetch(`${BODY_BASE}/body-lateral.svg`).then(r => r.text()),
      fetch(`${BODY_BASE}/body-posterior.svg`).then(r => r.text()),
    ]).then(([ant, lat, post]) => {
      if (antRef.current)  antRef.current.innerHTML  = ant;
      if (latRef.current)  latRef.current.innerHTML  = lat;
      if (postRef.current) postRef.current.innerHTML = post;
      setSvgsReady(true);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!svgsReady) return;
    const containers = [antRef.current, latRef.current, postRef.current].filter(Boolean);
    ALL_MUSCLES.forEach(m => {
      const p = fatigue[m] || 0;
      const band = p < 40 ? 'fresh' : p <= 65 ? 'moderate' : 'high';
      const f = p < 40 ? 'url(#fm-neutral)' : p <= 65 ? 'url(#fm-gold)' : 'url(#fm-ember)';
      containers.forEach(c => c.querySelectorAll(`[data-muscle="${m}"]`).forEach(el => {
        el.setAttribute('filter', f);
        el.setAttribute('data-fatigue', Math.round(p));
        // Colour alone isn't a safe status signal (PRODUCT.md: colour-blind
        // fatigue/status indicators must pair with value + label, not hue
        // alone) — a native <title> gives every muscle a real hover/focus/
        // screen-reader-accessible number, not just a filter.
        let title = el.querySelector('title');
        if (!title) {
          title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
          el.appendChild(title);
        }
        title.textContent = `${muscleDisplayLabel(m)}: ${Math.round(p)}% (${band})`;
      }));
    });
  }, [svgsReady, fatigue]);

  useEffect(() => {
    // Unlike the fatigue triptych above, this container only mounts (and
    // attaches its refs) once the user switches to the 'ranking' tab, which
    // happens strictly after a mount-time (deps=[]) effect would already
    // have resolved and found the refs null. Gate on tab and re-run when it
    // changes; rankSvgsReady guards against re-fetching once it's loaded.
    if (tab !== 'ranking' || rankSvgsReady) return;
    Promise.all([
      fetch(`${BODY_BASE}/body-anterior.svg`).then(r => r.text()),
      fetch(`${BODY_BASE}/body-lateral.svg`).then(r => r.text()),
      fetch(`${BODY_BASE}/body-posterior.svg`).then(r => r.text()),
    ]).then(([ant, lat, post]) => {
      if (rankAntRef.current)  rankAntRef.current.innerHTML  = ant;
      if (rankLatRef.current)  rankLatRef.current.innerHTML  = lat;
      if (rankPostRef.current) rankPostRef.current.innerHTML = post;
      setRankSvgsReady(true);
    }).catch(() => {});
  }, [tab, rankSvgsReady]);

  useEffect(() => {
    if (!rankSvgsReady) return;
    const containers = [rankAntRef.current, rankLatRef.current, rankPostRef.current].filter(Boolean);
    // Uses DIAGRAM_TIER_BANDS/diagramFilterForScore (declared alongside
    // TIER_COLOR above) so the diagram's buckets and the legend key's
    // colors can never drift apart the way they previously did — the old
    // inline brackets here were off by one tier against TIER_COLOR (e.g.
    // score 20-40, real "Beginner" range, rendered gold — Novice's color —
    // not ember) and merged Advanced and Elite into a single plum bucket.
    //
    // Iterates ALL_MUSCLES and explicitly clears anything without a score,
    // rather than only ever setting filters for muscles present in the
    // current s.muscleLevels — the previous version left whatever was last
    // painted on a muscle region in place once set, with no path to reset
    // it. Since this SVG DOM persists across re-renders (only injected once
    // via rankSvgsReady) and s.muscleLevels can legitimately change to have
    // fewer entries (a fresh account's mostly-empty data loading in, a
    // muscle dropping below the ranking eligibility threshold), that meant
    // the diagram could keep showing a previous snapshot's colors overlaid
    // on the current one instead of reflecting only the current data.
    ALL_MUSCLES.forEach(m => {
      const score = s?.muscleLevels?.[m]?.score;
      const f = score == null ? 'none' : diagramFilterForScore(score);
      containers.forEach(c => c.querySelectorAll(`[data-muscle="${m}"]`).forEach(el => el.setAttribute('filter', f)));
    });
  }, [rankSvgsReady, s?.muscleLevels]);

  useEffect(() => {
    if (tab !== 'soreness' || soreSvgsReady) return;
    Promise.all([
      fetch(`${BODY_BASE}/body-anterior.svg`).then(r => r.text()),
      fetch(`${BODY_BASE}/body-lateral.svg`).then(r => r.text()),
      fetch(`${BODY_BASE}/body-posterior.svg`).then(r => r.text()),
    ]).then(([ant, lat, post]) => {
      if (soreAntRef.current)  soreAntRef.current.innerHTML  = ant;
      if (soreLatRef.current)  soreLatRef.current.innerHTML  = lat;
      if (sorePostRef.current) sorePostRef.current.innerHTML = post;
      setSoreSvgsReady(true);
    }).catch(() => {});
  }, [tab, soreSvgsReady]);

  // Nearest-centroid matching rather than raw e.target hit-testing: these
  // muscle-region images are irregularly shaped and their *bounding boxes*
  // overlap heavily even where the drawn artwork doesn't (e.g. a wide
  // "forearms" cutout with a fully transparent gap over the torso where
  // abs/obliques actually are) — standard hit-testing/pointer-events
  // doesn't account for PNG alpha, so a click landing in that transparent
  // gap would hit whichever image paints on top there, not the muscle
  // actually drawn at that pixel. Verified directly: naive closest()
  // hit-testing mis-picked the wrong muscle on roughly a third of clicks
  // (e.g. clicking dead-center on biceps or obliques resolved to chest or
  // forearms instead). Comparing the click point against every region's
  // on-screen center sidesteps z-order entirely and got every muscle
  // right except two visually-thin ones (adductors, rear-delt) even at
  // their own bounding box's exact center — the worst case a real tap
  // (which lands on visible pixels, not a raw bbox center) should ever hit.
  useEffect(() => {
    if (!soreSvgsReady) return;
    const containers = [soreAntRef.current, soreLatRef.current, sorePostRef.current].filter(Boolean);
    const onClick = e => {
      const container = containers.find(c => c.contains(e.target));
      if (!container) return;
      let closest = null, closestDist = Infinity;
      container.querySelectorAll('[data-muscle]').forEach(el => {
        const m = el.getAttribute('data-muscle');
        if (!SORENESS_DIAGRAM_MUSCLES.includes(m)) return;
        const r = el.getBoundingClientRect();
        const dist = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
        if (dist < closestDist) { closestDist = dist; closest = m; }
      });
      if (!closest) return;
      setSelectedMuscle(prev => prev === closest ? null : closest);
      setSliderVal(5);
    };
    containers.forEach(c => c.addEventListener('click', onClick));
    return () => containers.forEach(c => c.removeEventListener('click', onClick));
  }, [soreSvgsReady]);

  useEffect(() => {
    if (!soreSvgsReady) return;
    const containers = [soreAntRef.current, soreLatRef.current, sorePostRef.current].filter(Boolean);
    SORENESS_DIAGRAM_MUSCLES.forEach(m => {
      const f = selectedMuscle === m ? 'url(#fm-ember)' : sorenessSet.has(m) ? 'url(#fm-navy)' : 'none';
      containers.forEach(c => c.querySelectorAll(`[data-muscle="${m}"]`).forEach(el => {
        el.setAttribute('filter', f);
        el.style.cursor = 'pointer';
      }));
    });
  }, [soreSvgsReady, selectedMuscle, sorenessSet]);

  useEffect(() => {
    if (tab !== 'adaptation' || adaptSvgsReady) return;
    Promise.all([
      fetch(`${BODY_BASE}/body-anterior.svg`).then(r => r.text()),
      fetch(`${BODY_BASE}/body-lateral.svg`).then(r => r.text()),
      fetch(`${BODY_BASE}/body-posterior.svg`).then(r => r.text()),
    ]).then(([ant, lat, post]) => {
      if (adaptAntRef.current)  adaptAntRef.current.innerHTML  = ant;
      if (adaptLatRef.current)  adaptLatRef.current.innerHTML  = lat;
      if (adaptPostRef.current) adaptPostRef.current.innerHTML = post;
      setAdaptSvgsReady(true);
    }).catch(() => {});
  }, [tab, adaptSvgsReady]);

  // Same nearest-centroid click matching as the Soreness picker above — see
  // that effect's comment for why raw hit-testing misattributes clicks on
  // these irregularly-shaped, alpha-transparent region images.
  useEffect(() => {
    if (!adaptSvgsReady) return;
    const containers = [adaptAntRef.current, adaptLatRef.current, adaptPostRef.current].filter(Boolean);
    const onClick = e => {
      const container = containers.find(c => c.contains(e.target));
      if (!container) return;
      let closest = null, closestDist = Infinity;
      container.querySelectorAll('[data-muscle]').forEach(el => {
        const m = el.getAttribute('data-muscle');
        if (!SORENESS_DIAGRAM_MUSCLES.includes(m)) return;
        const r = el.getBoundingClientRect();
        const dist = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
        if (dist < closestDist) { closestDist = dist; closest = m; }
      });
      if (closest) setAdaptMuscle(closest);
    };
    containers.forEach(c => c.addEventListener('click', onClick));
    return () => containers.forEach(c => c.removeEventListener('click', onClick));
  }, [adaptSvgsReady]);

  useEffect(() => {
    if (!adaptSvgsReady) return;
    const containers = [adaptAntRef.current, adaptLatRef.current, adaptPostRef.current].filter(Boolean);
    SORENESS_DIAGRAM_MUSCLES.forEach(m => {
      const f = adaptationFilterForMuscle(m);
      containers.forEach(c => c.querySelectorAll(`[data-muscle="${m}"]`).forEach(el => {
        el.setAttribute('filter', f);
        el.style.cursor = 'pointer';
      }));
    });
  }, [adaptSvgsReady, stimulusContributions, s?.muscleLevels]);

  const cap = str => str[0].toUpperCase() + str.slice(1);
  const hl1 = topMuscles[0] ? `${cap(topMuscles[0])} Loaded —` : 'Fresh —';
  // Was topMuscles[1] (the 2nd-most-fatigued muscle) mislabeled as a "Train
  // this" instruction — backwards, since fatigue ranking and training
  // priority are different things (see computeMusclePriority in
  // weeklyPlanner.js: priority favors LOW fatigue + staleness, not high
  // fatigue). Pull the real top pick from the same weekly guidance the
  // Training section already shows, so this headline agrees with it.
  const topPick = s?.weeklyPlan?.muscleFocus?.[0]?.name;
  const hl2 = topPick ? `Train ${cap(topPick)} Today` : 'All Systems Go';

  // The same weekly guidance the headline already reads, restated as a
  // sentence for Beginner. Deliberately derived from weeklyPlan.muscleFocus
  // and the fatigue map rather than recomputed — this is a rewording of the
  // engine's output, not a second opinion about what to train.
  // Excluding topMuscles matters: with only one or two muscles logged, the
  // most-loaded and least-loaded ends of the same short list are the same
  // muscle, and the sentence below would contradict itself.
  const freshest = [...sortedFatigue].reverse()
    .filter(([m]) => !topMuscles.includes(m)).slice(0, 2).map(([m]) => m);
  const recoveryExplainer = (() => {
    if (!sortedFatigue.length) return 'Nothing logged recently, so every muscle is treated as rested.';
    const loaded = topMuscles.map(cap).join(' and ');
    const rested = freshest.map(cap).join(' and ');
    const lead = topPick
      ? `${cap(topPick)} is today's pick because it has recovered more than anything else you've trained recently.`
      : `Nothing is carrying enough fatigue to steer today's session.`;
    return `${lead} ${loaded} ${topMuscles.length > 1 ? 'are' : 'is'} still carrying the most load from your last sessions${rested ? `, while ${rested} ${freshest.length > 1 ? 'have' : 'has'} had the longest to recover` : ''}.`;
  })();

  const logSoreness = async () => {
    if (!selectedMuscle) return;
    setSoreLogging(true);
    const data = await api('soreness', { method: 'POST', body: JSON.stringify({ muscle: selectedMuscle, score: sliderVal }) });
    // Update locally instead of a full /summary refetch — that recomputes hydration
    // curves, composition verdicts, and signed photo URLs, none of which changed here.
    refresh({
      ...s,
      soreness: [...(s?.soreness || []), { ts: Date.now(), muscle: selectedMuscle, score: sliderVal }],
      muscleSensitivity: data.muscleSensitivity ?? s?.muscleSensitivity,
    });
    setSelectedMuscle(null);
    setSoreLogging(false);
  };

  return (
    <section id="s5" style={{ padding: '18px 20px 12px', display: 'flex', flexDirection: 'column' }}>
      <div className="fade panel-head" style={{ flexShrink: 0 }} data-tour="s5-headline">
        <div className="kicker">Recovery · Recent Load · Post Session</div>
        <div className="headline" style={{ fontSize: 'clamp(24px,6vw,40px)', lineHeight: '.96', marginBottom: 0 }}>{hl1}<br />{hl2}</div>
        <Detail max="beginner">
          <div className="deck" style={{ marginTop: 10, marginBottom: 0 }}>{recoveryExplainer}</div>
        </Detail>
      </div>

      <div data-tour="s5-drivers" style={{ flexShrink: 0 }}><RecoveryDriversPanel drivers={s?.recoveryFactors} /></div>
      <div data-tour="s5-forecast" style={{ flexShrink: 0 }}><RecoveryForecastPanel forecast={recommendation?.recoveryForecast} /></div>

      <div className="fade tab-bar" style={{ flexShrink: 0 }} data-tour="s5-tabs">
        {visibleRecoveryTabs.map(id => (
          <button key={id} className={`tab-btn${activeTab === id ? ' active' : ''}`} onClick={() => setTab(id)}>
            {RECOVERY_TAB_LABELS[id]}{id === 'injuries' && s?.injuries?.length > 0 ? ` (${s.injuries.length})` : ''}
          </button>
        ))}
      </div>

      {/* Reachable by hiding tabs in Settings and then dropping to a detail
          level that gates away whatever's left — otherwise the section just
          renders an empty tab bar with no hint about where its content went. */}
      {!visibleRecoveryTabs.length && (
        <div className="fade" style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--dim)', fontStyle: 'italic', paddingTop: 12 }}>
          Every Recovery tab is either hidden or above your current detail level — check Settings → Dashboard Layout and Detail Level.
        </div>
      )}

      {activeTab === 'fatigue' && <>
        {/* Body triptych */}
        <div className="fade" style={{ flexShrink: 0, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', borderTop: '2px solid var(--ink)', borderBottom: '2px solid var(--ink)', margin: '6px 0' }} data-tour="s5-triptych">
          {[['Anterior', antRef], ['Lateral', latRef], ['Posterior', postRef]].map(([label, ref]) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ fontSize: 7, letterSpacing: '.20em', textTransform: 'uppercase', color: 'var(--dim)', padding: '5px 0', whiteSpace: 'nowrap' }}>{label}</div>
              <div className="body-view" ref={ref} />
            </div>
          ))}
        </div>

        {/* Stats row. Beginner gets the same two facts stated as words — which
            muscle is carrying the most load, and how recovered you are overall
            — without the /100 scores or the resting-HR readout behind them. */}
        <Detail max="beginner">
          <div className="fade" style={{ flexShrink: 0, display: 'flex', gap: 0 }}>
            <div className="stat-cell" style={{ flex: '0 0 auto', minWidth: 150 }}>
              <div className="sc-label">Most Loaded Muscle</div>
              <div className="sc-num" style={{ fontSize: 20, textTransform: 'capitalize' }}>{topMuscles[0] || '—'}</div>
            </div>
            <div style={{ width: '1px', background: 'var(--rule)', margin: '0 16px', flexShrink: 0 }} />
            <div className="stat-cell" style={{ flex: 1 }}>
              <div className="sc-label">Overall</div>
              <div className="sc-num" style={{ fontSize: 20, color: overallFatigue > 60 ? 'var(--ember)' : overallFatigue > 30 ? 'var(--gold)' : 'var(--forest)' }}>
                {recoveryWord(overallFatigue) || '—'}
              </div>
            </div>
          </div>
        </Detail>
        <Detail min="intermediate">
          <div className="fade" style={{ flexShrink: 0, display: 'flex', gap: 0 }}>
            <div className="stat-cell" style={{ flex: '0 0 auto', minWidth: 120 }}>
              <div className="sc-label">Most Loaded Muscle</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
                <div className="sc-num red" style={{ fontSize: 22 }}>{fMax || '—'}<span style={{ fontSize: '.5em', color: 'var(--dim)' }}>/100</span></div>
                {topMuscles[0] && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--ember)', textTransform: 'capitalize', letterSpacing: '.06em' }}>{topMuscles[0]}</div>}
              </div>
            </div>
            <div style={{ width: '1px', background: 'var(--rule)', margin: '0 16px', flexShrink: 0 }} />
            <div className="stat-cell" style={{ flex: 1 }}>
              <div className="sc-label">Avg Recent Load</div>
              <div className="sc-num" style={{ fontSize: 22, color: overallFatigue > 60 ? 'var(--ember)' : overallFatigue > 30 ? 'var(--gold)' : 'var(--forest)' }}>
                {overallFatigue ?? '—'}<span style={{ fontSize: '.5em', color: 'var(--dim)' }}>/100</span>
              </div>
            </div>
            <div style={{ width: '1px', background: 'var(--rule)', margin: '0 16px', flexShrink: 0 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
              <div className="stat-cell">
                <div className="sc-label">Recovery</div>
                <div className="sc-num forest" style={{ fontSize: 18 }}>{s?.recoveryTrend?.at(-1) ?? '—'}<span style={{ fontSize: '.5em', color: 'var(--dim)' }}>/100</span></div>
              </div>
              <div className="stat-cell">
                <div className="sc-label">Resting HR</div>
                <div className="sc-num" style={{ fontSize: 18 }}>{s?.rhrSeries?.at(-1) ?? '—'}<span style={{ fontSize: '.5em', color: 'var(--dim)' }}>bpm</span></div>
              </div>
            </div>
          </div>
        </Detail>

        {/* Scrollable muscle bars */}
        <div className="muscle-scroll fade" data-tour="s5-muscles">
          {sortedFatigue.map(([m, v]) => (
            <div key={m} className="muscle-row">
              <div className="muscle-name">{m}</div>
              <div className="muscle-bar-track">
                <div className="muscle-bar-fill" style={{ width: `${v}%`, background: v < 40 ? 'var(--forest)' : v < 70 ? 'var(--gold)' : 'var(--red)' }} />
              </div>
              {/* Same bar, same colour, same ordering at every level — only the
                  readout on the right changes from a number to a word. */}
              <Detail max="beginner"><div className="muscle-pct" style={{ minWidth: 68 }}>{recoveryWord(v)}</div></Detail>
              <Detail min="intermediate"><div className="muscle-pct">{v}%</div></Detail>
            </div>
          ))}
          {!sortedFatigue.length && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--dim)', paddingTop: 10, fontStyle: 'italic' }}>No recent sessions logged.</div>}
        </div>

        <div className="fade" style={{ display: 'flex', gap: 14, flexShrink: 0, marginTop: 8, fontFamily: "'JetBrains Mono',monospace", fontSize: 9 }}>
          {[['Recovered','#1a4f2a'],['Moderate','#6b5800'],['Fatigued','#7a3400']].map(([lbl, css]) => (
            <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: css }} />
              <span style={{ color: 'var(--dim)', letterSpacing: '.08em' }}>{lbl}</span>
            </div>
          ))}
        </div>
      </>}

      {activeTab === 'ranking' && <>
        {/* Body triptych, colored by strength-ranking tier instead of fatigue */}
        <div className="fade" style={{ flexShrink: 0, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', borderTop: '2px solid var(--ink)', borderBottom: '2px solid var(--ink)', margin: '6px 0' }}>
          {[['Anterior', rankAntRef], ['Lateral', rankLatRef], ['Posterior', rankPostRef]].map(([label, ref]) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ fontSize: 7, letterSpacing: '.20em', textTransform: 'uppercase', color: 'var(--dim)', padding: '5px 0', whiteSpace: 'nowrap' }}>{label}</div>
              <div className="body-view" ref={ref} />
            </div>
          ))}
        </div>

        <div className="fade" style={{ display: 'flex', gap: 12, flexShrink: 0, marginTop: 8, flexWrap: 'wrap', fontFamily: "'JetBrains Mono',monospace", fontSize: 9 }}>
          {DIAGRAM_TIER_BANDS.map(([, tier]) => (
            <div key={tier} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: TIER_COLOR[tier] }} />
              <span style={{ color: 'var(--dim)', letterSpacing: '.08em' }}>{tier}</span>
            </div>
          ))}
        </div>

        {/* Muscles this diagram has no body-map region for -- shown as text so
            "all of the muscles" actually means all of them, not just the 14
            of 19 ranked muscles the SVGs happen to have artwork for. */}
        {MUSCLES_WITHOUT_BODY_REGION.some(m => s?.muscleLevels?.[m]) && (
          <div className="fade" style={{ flexShrink: 0, marginTop: 10, borderTop: '1px solid var(--rule)', paddingTop: 8 }}>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', fontStyle: 'italic', marginBottom: 6 }}>
              Not shown on the diagram (no body-map region drawn for these yet):
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {MUSCLES_WITHOUT_BODY_REGION.filter(m => s?.muscleLevels?.[m]).map(m => {
                const v = s.muscleLevels[m];
                return (
                  <div key={m} style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10 }}>
                    <span style={{ textTransform: 'capitalize', color: 'var(--ink)' }}>{muscleDisplayLabel(m)}</span>
                    {' '}<span style={{ color: TIER_COLOR[v.tier] }}>{v.tier}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </>}

      {activeTab === 'types' && (
        <div className="fade" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', paddingTop: 8 }}>
          {[
            { label: 'Structural', value: overallFatigue, desc: 'Mechanical tissue damage — per muscle, decays 48–72h. Adjusted by logged soreness.', color: overallFatigue > 60 ? 'var(--red)' : overallFatigue > 30 ? 'var(--gold)' : 'var(--forest)' },
            { label: 'Metabolic', value: metabolic, desc: `Glycogen & energy system depletion — 12h half-life. Reduced by carb intake (${s?.nutritionToday?.carbs || 0}g today).`, color: metabolic > 60 ? 'var(--red)' : metabolic > 30 ? 'var(--gold)' : 'var(--forest)' },
            { label: 'CNS', value: cns, desc: 'Central nervous system load from heavy compounds (deadlift, squat, press) — 36h half-life.', color: cns > 60 ? 'var(--red)' : cns > 30 ? 'var(--gold)' : 'var(--forest)' },
          ].map(({ label, value, desc, color }) => (
            <div key={label} style={{ borderBottom: '1px solid var(--rule)', paddingBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
                <div className="sc-label" style={{ width: 80, flexShrink: 0 }}>{label}</div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 28, letterSpacing: '-.03em', color, lineHeight: 1 }}>
                  {value != null ? `${value}%` : '—'}
                </div>
              </div>
              {value != null && (
                <div style={{ height: 5, background: 'var(--paper2)', borderRadius: 1, margin: '6px 0', overflow: 'hidden' }}>
                  <div style={{ width: '100%', height: '100%', background: color, borderRadius: 1, transform: `scaleX(${value / 100})`, transformOrigin: 'left', transition: 'transform .4s ease' }} />
                </div>
              )}
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', lineHeight: 1.6 }}>{desc}</div>
            </div>
          ))}
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', fontStyle: 'italic', paddingBottom: 8 }}>
            Recovery times are defaults and will personalise as your data accumulates.
          </div>
        </div>
      )}

      {activeTab === 'adaptation' && (
        <div className="fade" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflowY: 'auto' }}>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', letterSpacing: '.08em', marginBottom: 10 }}>
            Colored by current stimulus level — red means it's effectively atrophying, green means it's actively adapting. Tap a muscle for its full continuous curve below.
          </div>

          {/* Body triptych — colored by adaptationFilterForMuscle by default;
              click a region to select it for the chart below, same
              tap-to-toggle behavior as the Soreness/Ranking pickers. */}
          <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', borderTop: '2px solid var(--ink)', borderBottom: '2px solid var(--ink)', margin: '6px 0' }}>
            {[['Anterior', adaptAntRef], ['Lateral', adaptLatRef], ['Posterior', adaptPostRef]].map(([label, ref]) => (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <div style={{ fontSize: 7, letterSpacing: '.20em', textTransform: 'uppercase', color: 'var(--dim)', padding: '5px 0', whiteSpace: 'nowrap' }}>{label}</div>
                <div className="body-view" ref={ref} />
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 12, flexShrink: 0, margin: '2px 0 10px', flexWrap: 'wrap', fontFamily: "'JetBrains Mono',monospace", fontSize: 9 }}>
            {[['Atrophying', 'var(--red)'], ['Low', 'var(--ember)'], ['Moderate', 'var(--gold)'], ['Adapting', 'var(--forest)'], ['No data', 'var(--dim)']].map(([lbl, css]) => (
              <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: css }} />
                <span style={{ color: 'var(--dim)', letterSpacing: '.08em' }}>{lbl}</span>
              </div>
            ))}
          </div>

          {/* Muscles the diagram has no region for (see SORENESS_DIAGRAM_MUSCLES) */}
          {adaptMuscles.some(m => !SORENESS_DIAGRAM_MUSCLES.includes(m)) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '10px 0' }}>
              {adaptMuscles.filter(m => !SORENESS_DIAGRAM_MUSCLES.includes(m)).map(m => (
                <button key={m} className="prof-btn" onClick={() => setAdaptMuscle(m)}
                  style={activeAdaptMuscle === m ? { background: 'var(--ink)', color: 'var(--paper)', borderColor: 'var(--ink)' } : {}}>
                  {muscleDisplayLabel(m)}
                </button>
              ))}
            </div>
          )}

          {adaptMuscles.length === 0 && (
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--dim)', fontStyle: 'italic', padding: '24px 0' }}>Log some lifts to see adaptation curves.</div>
          )}

          {activeAdaptMuscle && (
            <>
              <div className="kicker" style={{ marginTop: 12, marginBottom: 8 }}>{muscleDisplayLabel(activeAdaptMuscle)}</div>
              <AdaptationChart series={activeAdaptSeries} atrophyRate={atrophyRate} peakH={ADAPTATION_PEAK_H} />

              <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
                {estimatedAtrophyRate != null ? (
                  <button className="prof-btn" onClick={() => { setAtrophyRate(estimatedAtrophyRate.rate); setAtrophyCalibrated(true); }}
                    style={atrophyCalibrated ? { background: 'var(--ink)', color: 'var(--paper)', borderColor: 'var(--ink)' } : {}}
                    title={`Calibrated from ${estimatedAtrophyRate.gapCount} of your own training gap${estimatedAtrophyRate.gapCount === 1 ? '' : 's'} (14-90 days). ${estimatedAtrophyRate.gapCount === 1 ? 'Single gap — noisier than a median across several, but still real signal.' : 'Median'} 1RM drop = ${(estimatedAtrophyRate.rate * 24 * 100).toFixed(3)}%/day`}>
                    {atrophyCalibrated ? '✓ calibrated from your gaps' : 'calibrate from your gaps'}{estimatedAtrophyRate.gapCount === 1 ? ' (low confidence)' : ''}
                  </button>
                ) : (
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', fontStyle: 'italic' }}>Needs a 14+ day training gap to calibrate — using a default rate.</span>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 160 }}>
                  <input type="range" min="0.0005" max="0.015" step="0.0005" value={atrophyRate}
                    onChange={e => { setAtrophyRate(+e.target.value); setAtrophyCalibrated(false); }}
                    style={{ flex: 1, accentColor: 'var(--ink)' }} />
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', minWidth: 62, textAlign: 'right' }}>
                    {(atrophyRate * 24 * 100).toFixed(2)}%/day
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'patterns' && (
        <div className="fade" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', paddingTop: 8 }}>
          {!patternFatigue.length && (
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--dim)', fontStyle: 'italic', padding: '24px 0' }}>No movement pattern volume in the last 14 days.</div>
          )}
          {patternFatigue.map(p => {
            const color = p.fatigue > 60 ? 'var(--red)' : p.fatigue > 30 ? 'var(--gold)' : 'var(--forest)';
            return (
              <div key={p.pattern} style={{ borderBottom: '1px solid var(--rule)', paddingBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
                  <div className="sc-label" style={{ width: 80, flexShrink: 0, textTransform: 'capitalize' }}>{p.pattern}</div>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 28, letterSpacing: '-.03em', color, lineHeight: 1 }}>
                    {p.fatigue}%
                  </div>
                </div>
                <div style={{ height: 5, background: 'var(--paper2)', borderRadius: 1, margin: '6px 0', overflow: 'hidden' }}>
                  <div style={{ width: '100%', height: '100%', background: color, borderRadius: 1, transform: `scaleX(${p.fatigue / 100})`, transformOrigin: 'left', transition: 'transform .4s ease' }} />
                </div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', lineHeight: 1.6 }}>
                  {p.volume.toLocaleString()}kg over {p.sets} set{p.sets !== 1 ? 's' : ''} in the last 14 days · last trained {p.hoursSince != null ? `${Math.round(p.hoursSince / 24)}d ago` : '—'}
                </div>
              </div>
            );
          })}
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', fontStyle: 'italic', paddingBottom: 8 }}>
            Tracked alongside muscle fatigue — pressing, hinging, rowing, squatting — since two exercises can share a muscle and still tax a different movement pattern.
          </div>
        </div>
      )}

      {activeTab === 'soreness' && (
        <div className="fade" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflowY: 'auto' }}>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', letterSpacing: '.08em', marginBottom: 10 }}>
            Tap a muscle on the diagram (or in the list below it) to log soreness (1–10)
          </div>

          {/* Body triptych — click a region to select it, same tap-to-toggle
              behavior as the fallback buttons below. */}
          <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', borderTop: '2px solid var(--ink)', borderBottom: '2px solid var(--ink)', margin: '6px 0' }}>
            {[['Anterior', soreAntRef], ['Lateral', soreLatRef], ['Posterior', sorePostRef]].map(([label, ref]) => (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <div style={{ fontSize: 7, letterSpacing: '.20em', textTransform: 'uppercase', color: 'var(--dim)', padding: '5px 0', whiteSpace: 'nowrap' }}>{label}</div>
                <div className="body-view" ref={ref} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 14, flexShrink: 0, margin: '2px 0 10px', fontFamily: "'JetBrains Mono',monospace", fontSize: 9 }}>
            {[['Selected', 'var(--ember)'], ['Logged recently', 'var(--navy)']].map(([lbl, css]) => (
              <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: css }} />
                <span style={{ color: 'var(--dim)', letterSpacing: '.08em' }}>{lbl}</span>
              </div>
            ))}
          </div>

          {/* Muscles the diagram has no region for (see SORENESS_DIAGRAM_MUSCLES) */}
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', fontStyle: 'italic', marginBottom: 6 }}>
            Not shown above:
          </div>
          <div className="soreness-grid" style={{ flexShrink: 0 }}>
            {SORENESS_MUSCLES.filter(m => !SORENESS_DIAGRAM_MUSCLES.includes(m)).map(m => (
              <button key={m} className={`soreness-btn${sorenessSet.has(m) ? ' has-log' : ''}${selectedMuscle === m ? ' active' : ''}`}
                onClick={() => { setSelectedMuscle(selectedMuscle === m ? null : m); setSliderVal(5); }}
                aria-label={`${m}${sorenessSet.has(m) ? ', soreness logged' : ''}`}
                style={selectedMuscle === m ? { borderColor: 'var(--ink)', color: 'var(--ink)' } : {}}>
                {sorenessSet.has(m) && <span className="soreness-dot" />}
                {m}
              </button>
            ))}
          </div>
          {selectedMuscle && (
            <div className="soreness-slider-wrap">
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', marginBottom: 8, textTransform: 'capitalize' }}>
                {selectedMuscle} soreness: <strong style={{ color: 'var(--ink)' }}>{sliderVal}/10</strong>
              </div>
              <input type="range" min="1" max="10" value={sliderVal} onChange={e => setSliderVal(+e.target.value)}
                style={{ width: '100%', marginBottom: 10, accentColor: 'var(--ink)' }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="prof-btn solid" onClick={logSoreness} disabled={soreLogging} style={{ fontSize: 8, padding: '5px 14px' }}>
                  {soreLogging ? 'Logging…' : 'Log'}
                </button>
                <button className="prof-btn" onClick={() => setSelectedMuscle(null)} style={{ fontSize: 8, padding: '5px 14px' }}>Cancel</button>
              </div>
            </div>
          )}
          {recentSoreness.length > 0 && (
            <div style={{ marginTop: 12, borderTop: '1px solid var(--rule)', paddingTop: 8 }}>
              <div className="kicker" style={{ marginBottom: 6 }}>Recent Logs</div>
              {[...recentSoreness].reverse().slice(0, 5).map((e, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', padding: '3px 0', borderBottom: '1px solid var(--paper2)', textTransform: 'capitalize' }}>
                  <span>{e.muscle}</span><span style={{ color: 'var(--ink)' }}>{e.score}/10</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'injuries' && (
        <div className="fade" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflowY: 'auto' }}>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', letterSpacing: '.08em', marginBottom: 6 }}>
            Active injuries — logged to avoid overloading affected areas
          </div>

          {/* Active injuries list */}
          {(s?.injuries || []).length === 0 && (
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--dim)', fontStyle: 'italic', padding: '12px 0' }}>
              No active injuries. Log any pain or restriction below.
            </div>
          )}
          <div className="injury-list">
            {(s?.injuries || []).map(inj => (
              <div key={inj.id} className="injury-card">
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <div className="injury-area">{inj.area}</div>
                    <div className="injury-meta">
                      {inj.severity} · {new Date(inj.ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      {inj.clearance != null && ` · ${inj.clearance >= 100 ? 'fully healed' : `day ${inj.elapsedDays}/${inj.healingDays} — ${inj.clearance}% cleared`}`}
                    </div>
                    {inj.note && <div className="injury-note">{inj.note}</div>}
                  </div>
                  <button className="injury-resolve" onClick={async () => {
                    await api(`injuries/${inj.id}/resolve`, { method: 'POST' });
                    refresh({ ...s, injuries: (s?.injuries || []).filter(i => i.id !== inj.id) });
                  }}>Resolved</button>
                </div>
              </div>
            ))}
          </div>

          {/* Log new injury form */}
          <div className="injury-form">
            <div className="kicker" style={{ margin: 0 }}>Log an Injury</div>
            <input
              className="injury-input"
              placeholder="Area or movement affected (e.g. left knee, shoulder flexion)…"
              value={injuryArea}
              onChange={e => setInjuryArea(e.target.value)}
            />
            <div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 6 }}>Severity</div>
              <div className="injury-sev">
                {['mild','moderate','severe'].map(sev => (
                  <button key={sev} className={`injury-sev-btn${injurySev === sev ? ' active' : ''}`} onClick={() => setInjurySev(sev)}>
                    {sev}
                  </button>
                ))}
              </div>
            </div>
            <input
              className="injury-input"
              placeholder="Notes (optional)…"
              value={injuryNote}
              onChange={e => setInjuryNote(e.target.value)}
            />
            <button className="prof-btn solid" disabled={!injuryArea.trim() || injuryLogging}
              onClick={async () => {
                setInjuryLogging(true);
                const area = injuryArea.trim(), severity = injurySev, note = injuryNote.trim();
                const data = await api('injury', { method: 'POST', body: JSON.stringify({ area, severity, note }) });
                setInjuryArea(''); setInjuryNote(''); setInjurySev('mild');
                setInjuryLogging(false);
                refresh({ ...s, injuries: [...(s?.injuries || []), { id: data.id, ts: data.id, area, severity, note, muscles: [], resolved: false }] });
              }}
              style={{ alignSelf: 'flex-start', padding: '6px 18px' }}>
              {injuryLogging ? 'Logging…' : 'Log Injury'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}


// S6 lives in src/sections/S6.jsx
function S7({ s }) {
  const [search, setSearch] = useState('');
  const { prs, e1rmHistory } = useMemo(() => {
    const byEx = {};
    const history = {};
    const lifts = [...(s?.lifts || [])].sort((a,b) => a.date.localeCompare(b.date));
    for (const l of lifts) {
      const e1 = l.kg > 0 && l.reps > 0 ? Math.round(calcE1RM(l.kg, l.reps)) : 0;
      if (!e1 || !l.exercise) continue;
      // Case-insensitive key — CSV/bulk-imported history can carry different
      // casing than the app's own (always-lowercase) session logging, and
      // without this the same exercise would silently split into two
      // separate PR entries and sparkline histories.
      const key = l.exercise.toLowerCase();
      if (!history[key]) history[key] = [];
      history[key].push(e1);
      if (!byEx[key] || e1 > byEx[key].e1rm)
        byEx[key] = { exercise: l.exercise, kg: l.kg, reps: l.reps, e1rm: e1, date: l.date };
    }
    return {
      prs: Object.values(byEx).sort((a, b) => b.e1rm - a.e1rm),
      e1rmHistory: Object.fromEntries(Object.entries(history).map(([k, v]) => [byEx[k]?.exercise ?? k, v])),
    };
  }, [s?.lifts]);

  const cutoff14 = toLocalDateStr(new Date(Date.now() - 14 * 864e5));
  const filtered = search ? prs.filter(p => p.exercise.toLowerCase().includes(search.toLowerCase())) : prs;

  const grouped = useMemo(() => {
    const map = {};
    for (const pr of filtered) {
      const g = groupExercise(pr.exercise);
      if (!map[g]) map[g] = [];
      map[g].push(pr);
    }
    return map;
  }, [filtered]);

  const groupOrder = [...MOVEMENT_GROUPS.map(g => g.label), 'Other'].filter(g => grouped[g]);

  return (
    <section id="s7" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="fade panel-head" style={{ flexShrink: 0 }} data-tour="s7-headline">
        <div className="kicker">Personal Records · All Time</div>
        <div className="headline" style={{ fontSize: 'clamp(24px,6vw,44px)', lineHeight: '.96' }}>All-Time<br />Bests</div>
        <div className="deck">{prs.length} exercise{prs.length !== 1 ? 's' : ''} tracked</div>
      </div>
      <div className="fade" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <StrengthLevelPanel muscleLevels={s?.muscleLevels} hasSex={!!s?.profile?.sex} />
        <CardioScorePanel cardioScore={s?.cardioScore} hasSex={!!s?.profile?.sex} />
        <div style={{ marginTop: 12 }}>
          <input className="pr-search" placeholder="Filter exercise…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {!prs.length && (
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--dim)', fontStyle: 'italic', padding: '24px 0' }}>No records yet — log some lifts.</div>
        )}
        {prs.length > 0 && filtered.length === 0 && (
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--dim)', fontStyle: 'italic', padding: '12px 0' }}>No matches.</div>
        )}
        <div data-tour="s7-list">
          {groupOrder.map(group => (
            <div key={group}>
              <div className="pr-group-hdr">{group}</div>
              {grouped[group].map((pr, i) => {
                const hist = e1rmHistory[pr.exercise] || [];
                const sparkData = hist.slice(-10);
                const isNew = pr.date >= cutoff14;
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--rule)', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, textTransform: 'capitalize', color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pr.exercise}</span>
                        {isNew && <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, letterSpacing: '.1em', background: 'var(--gold)', color: 'var(--paper)', padding: '1px 4px', flexShrink: 0 }}>NEW</span>}
                      </div>
                      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)' }}>
                        {pr.kg}kg × {pr.reps} · {pr.date}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, fontWeight: 700, color: 'var(--gold)', lineHeight: 1 }}>{pr.e1rm}<span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', marginLeft: 2 }}>kg</span></div>
                      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: 'var(--dim)', marginTop: 1 }}>e1RM</div>
                    </div>
                    {sparkData.length >= 2 && (
                      <Sparkline data={sparkData} color={isNew ? 'var(--gold)' : 'var(--dim)'} width={48} height={20} />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── ONBOARDING ────────────────────────────────────────────────────────────────
const TRAINING_SPLITS = ['Full Body', 'Upper / Lower', 'Push / Pull / Legs', 'Arnold Split', 'PPL Arnold', 'Other'];

// GOAL_DEFS/GOAL_PRIORITIES/GOAL_METRIC_OPTIONS/buildGoalsPayload now live
// in Goals.jsx (imported above) — Onboarding, Settings' Training Goals
// editor, and the Goals panel's own Edit button all share the same defs
// and payload shape, no separate copies.
// FEATURES.md #24 -- 7 broad activities, same Primary/Secondary/Minor
// priority picker as goals (replaces the old single primaryActivity/
// secondaryActivity pair). One entry per real weeklyTargets bucket
// (lifting/running/sports -- see ACTIVITY_DEFAULTS, goalsAndActivities.js) --
// no composites like the old Hybrid/CrossFit/Endurance/Team Sports, which
// were just volume presets layered on the same 3 buckets and, being
// multi-select with independent priority already, were redundant with just
// picking the underlying activities directly.
const ACTIVITY_DEFS = [
  { key: 'strength', label: 'Strength' }, { key: 'running', label: 'Running' }, { key: 'cycling', label: 'Cycling' },
  { key: 'swimming', label: 'Swimming' }, { key: 'sport', label: 'Sport' },
  { key: 'aerobic', label: 'Aerobic' }, { key: 'other', label: 'Other' },
];
// Macro Targets -- a different question from trainingGoals above (what you
// eat, not what you train for). Settings-only (Onboarding step 3 dropped
// diet goal entirely — see the Step 3 comment below). Three named split
// ratios, not a goal/deficit picker — clicking one just fills the
// protein/carbs/fat sliders below with that ratio, same as dragging them by
// hand. Calories are a separate, explicit stepper (their own control, not
// derived from bodyweight or tied to any of these) — the old Cut/Maintain/
// Bulk picker conflated "how many calories" with "what ratio," so picking a
// split also silently changed the total; those are two different questions
// now, matching Custom's split-only behaviour.
const MACRO_SPLIT_PRESETS = [
  { key: 'high_carb', label: 'High Carb', split: { protein: 20, carbs: 55, fat: 25 } },
  { key: 'low_carb', label: 'Low Carb', split: { protein: 35, carbs: 20, fat: 45 } },
  { key: 'high_protein', label: 'High Protein', split: { protein: 40, carbs: 35, fat: 25 } },
];
// FEATURES.md #22 -- suggests a starting point for the sleep/water/frequency
// steppers on the Targets step from whatever training goals were just
// picked; still fully editable there. Weighted contributions rather than
// picking a single winning goal, so two conflicting Primary goals both
// nudge the number rather than one silently overriding the other.
function suggestTargets(goals) {
  const W = { primary: 1, secondary: 0.5, minor: 0.25 };
  let sleep = 8, water = 7, days = 4;
  for (const g of goals) {
    const w = W[g.priority] || 0;
    if (g.type === 'muscle') sleep += 0.5 * w;
    if (g.type === 'cardio') { water += 1 * w; days += 0.5 * w; }
    if (g.type === 'fatLoss') water += 0.5 * w;
  }
  return {
    sleepTarget: Math.min(9.5, Math.round(sleep * 2) / 2),
    waterTarget: Math.min(12, Math.round(water)),
    trainingDays: Math.min(6, Math.round(days)),
  };
}
// Sweat-loss addition on top of base intake — a range rather than a single
// number because a sedentary day and an extremely active one lose very
// different amounts of water to exercise, same idea as an activity
// multiplier on a calorie calculator. Values in mL, one glass = 250mL (the
// unit the app already tracks water in), so each tier is a whole number of
// glasses by construction.
const WATER_ACTIVITY_LEVELS = [
  { key: 'light', label: 'Light', addMl: 250 },
  { key: 'moderate', label: 'Moderate', addMl: 500 },
  { key: 'active', label: 'Active', addMl: 750 },
  { key: 'extreme', label: 'Extremely Active', addMl: 1000 },
];
// Base intake = bodyweight(kg) × 35mL, plus the exercise-driven sweat-loss
// tier above, plus a flat 500mL for a hot/humid climate's extra heat-driven
// loss. Returns glasses (250mL each), or null when weight isn't known yet —
// the Targets step falls back to suggestTargets()'s goal-based number in
// that case rather than showing a recommendation with no basis.
function recommendedWaterGlasses(weightKg, activityLevel, hotClimate) {
  if (!weightKg || weightKg <= 0) return null;
  const activityMl = WATER_ACTIVITY_LEVELS.find(l => l.key === activityLevel)?.addMl ?? WATER_ACTIVITY_LEVELS[1].addMl;
  const totalMl = weightKg * 35 + activityMl + (hotClimate ? 500 : 0);
  return Math.round(totalMl / 250);
}

// Settings' Custom macro split — percentage of calories from each macro,
// not the calorie total itself (that stays whatever the active preset or
// last save left it at; Custom only redistributes it). Reads the current
// split back out of stored grams rather than assuming they already sum to
// the stored calorie figure exactly — the split is "what fraction of
// calories each macro represents," which is well-defined even if rounding
// drift means the grams don't add up to the total to the last calorie.
function macroSplitFromTargets(targets) {
  const proteinCals = (targets?.protein || 0) * 4, carbsCals = (targets?.carbs || 0) * 4, fatCals = (targets?.fat || 0) * 9;
  const total = proteinCals + carbsCals + fatCals;
  if (!total) return { protein: 30, carbs: 40, fat: 30 };
  return {
    protein: Math.round(proteinCals / total * 100),
    carbs: Math.round(carbsCals / total * 100),
    fat: Math.round(fatCals / total * 100),
  };
}
// Dragging one macro's % slider takes the difference from the other two,
// split between them in proportion to their own current share — so pushing
// Protein up eats into Carbs and Fat by however much of the remainder each
// currently holds, rather than one absorbing the whole change. Whatever
// rounding remainder is left over always lands on the slider that wasn't
// just moved, keeping the three exactly summed to 100 rather than drifting
// to 99/101 over repeated drags.
function adjustMacroSplit(split, key, rawVal) {
  const val = Math.max(0, Math.min(100, Math.round(rawVal)));
  const others = Object.keys(split).filter(k => k !== key);
  const othersSum = others.reduce((sum, k) => sum + split[k], 0);
  const remainder = 100 - val;
  const next = { [key]: val };
  if (othersSum <= 0) {
    others.forEach((k, i) => { next[k] = i === 0 ? remainder : 0; });
  } else {
    others.forEach(k => { next[k] = Math.round(split[k] / othersSum * remainder); });
  }
  next[others[0]] += 100 - (next[key] + next[others[0]] + next[others[1]]);
  return next;
}
// Grams from a percentage split against the (unchanged) calorie total —
// protein/carbs 4 kcal/g, fat 9 kcal/g.
function macroGramsFromSplit(split, calories) {
  return {
    protein: Math.round((calories * split.protein / 100) / 4),
    carbs: Math.round((calories * split.carbs / 100) / 4),
    fat: Math.round((calories * split.fat / 100) / 9),
  };
}

// null once already running standalone (installed) — no point telling
// someone to add to their home screen when they launched it from there.
// iPadOS 13+ reports as 'MacIntel' with no touch-point signal beyond
// maxTouchPoints, so that combination is the standard iPad tell.
function homeScreenGuide() {
  const ua = navigator.userAgent || '';
  const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
  if (isStandalone) return null;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS) return { label: 'iPhone / iPad', steps: 'Tap the Share icon in Safari’s toolbar, then choose "Add to Home Screen".' };
  if (/Android/.test(ua)) return { label: 'Android', steps: 'Tap the ⋮ menu in Chrome, then choose "Install app" (or "Add to Home screen").' };
  return { label: 'Desktop', steps: 'Look for an install icon in your browser’s address bar, or open the browser menu and choose "Install Press".' };
}

// Onboarding is reopened, not just opened once — "Restart Setup" in
// Settings (SettingsOverlay's onRestartSetup) mounts this same component
// again on an account that already has real data. Every field below reads
// its starting value from `s` (the /summary payload) when one exists,
// falling back to the original blank/default otherwise, so a genuine
// brand-new account (s.profile is empty) sees exactly the same blank form
// as before — this only changes behaviour when there's something to prefill.
function Onboarding({ s, onComplete, onOpenImport }) {
  const [hsGuide] = useState(homeScreenGuide);
  const TOTAL = 10;
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  // Surfaced when a step's save genuinely fails — advance() previously
  // swallowed every save error and moved to the next step regardless (api()
  // only rejects on network failure, not on an HTTP error response, and
  // nothing here checked for either), so a real save failure looked
  // identical to success: "Saving…" then straight through to "You're set
  // up" with nothing actually written. Now it stops on the current step and
  // lets the athlete retry instead.
  const [stepError, setStepError] = useState('');

  // Step 1 — About You
  const [name, setName] = useState(() => s?.profile?.name || '');
  const [dob, setDob] = useState(() => s?.profile?.dob || '');
  const [heightUnit, setHeightUnit] = useState('cm'); // heightCm is always stored in cm; display starts there too
  const [heightVal, setHeightVal] = useState(() => s?.profile?.heightCm ? String(Math.round(s.profile.heightCm)) : '');
  const [weightUnit, setWeightUnit] = useState('kg'); // db.weight is always stored in kg
  const [weightVal, setWeightVal] = useState(() => s?.weights?.length ? String(s.weights.at(-1).value) : '');
  const [bodyFat, setBodyFat] = useState(() => {
    const pct = s?.bodyFatToday ?? s?.bodyFat30?.at(-1)?.pct;
    return pct != null ? String(pct) : '';
  });
  const [sex, setSex] = useState(() => s?.profile?.sex || '');

  // Step 2 — Training Goals -- each: { type, priority, concrete, metric?,
  // target?, targetDate?, exercise?, benchmarkLabel? }. See GOAL_DEFS above.
  const [trainingGoals, setTrainingGoals] = useState(() => (s?.profile?.goals || []).map(g => ({ ...g })));
  const goalFor = key => trainingGoals.find(g => g.type === key);
  const toggleGoal = key => setTrainingGoals(gs => gs.some(g => g.type === key)
    ? gs.filter(g => g.type !== key) : [...gs, { type: key, priority: 'secondary', concrete: false }]);
  const updateGoal = (key, patch) => setTrainingGoals(gs => gs.map(g => g.type === key ? { ...g, ...patch } : g));

  // Step 3 — Daily Targets. Macro targets (calorie stepper, split presets)
  // used to live here too — moved out entirely; it's Settings-only now
  // (MACRO_SPLIT_PRESETS below, rendered there). This step no longer reads
  // or writes profile.goal/macroTargets.
  const [sleepTarget, setSleepTarget] = useState(() => s?.profile?.sleepTarget || 8);
  const [waterTarget, setWaterTarget] = useState(() => s?.profile?.waterTarget || 7);
  const [trainingDays, setTrainingDays] = useState(() => s?.profile?.trainingDaysPerWeek || 4);
  // Water calculator inputs — see recommendedWaterGlasses above. waterTouched
  // stops the calculator from clobbering a manual +/- edit once the athlete's
  // made one; until then, changing weight/activity/climate keeps the target
  // in sync with the calculator, same "suggested, not locked" behaviour as
  // suggestTargets() gives sleep/water/days after Step 2's goals.
  const [waterActivityLevel, setWaterActivityLevel] = useState(() => s?.profile?.waterActivityLevel || 'moderate');
  const [waterHotClimate, setWaterHotClimate] = useState(() => !!s?.profile?.waterHotClimate);
  const [waterTouched, setWaterTouched] = useState(false);
  const weightKgForWater = weightVal ? (weightUnit === 'kg' ? parseFloat(weightVal) : parseFloat(weightVal) * 0.453592) : null;
  const waterCalc = recommendedWaterGlasses(weightKgForWater, waterActivityLevel, waterHotClimate);
  useEffect(() => {
    if (!waterTouched && waterCalc != null) setWaterTarget(waterCalc);
  }, [waterCalc, waterTouched]);

  // Step 4 — Activities -- each: { type, priority }. See ACTIVITY_DEFS above.
  const [activities, setActivities] = useState(() => (s?.profile?.activities || []).map(a => ({ ...a })));
  const activityFor = key => activities.find(a => a.type === key);
  const toggleActivity = key => setActivities(as => as.some(a => a.type === key)
    ? as.filter(a => a.type !== key) : [...as, { type: key, priority: 'secondary' }]);
  const updateActivity = (key, patch) => setActivities(as => as.map(a => a.type === key ? { ...a, ...patch } : a));

  // Step 5 — Tracking Level
  const [trackingCategories, setTrackingCategories] = useState(() => trackingCategoriesFor(s?.profile));

  // Step 6 — Training Background
  const bg = s?.profile?.trainingBackground;
  const [split, setSplit] = useState(() => bg?.split || '');
  const [usualSets, setUsualSets] = useState(() => bg?.usualSets != null ? String(bg.usualSets) : '');
  const [usualRepsLow, setUsualRepsLow] = useState(() => bg?.usualRepsLow != null ? String(bg.usualRepsLow) : '');
  const [usualRepsHigh, setUsualRepsHigh] = useState(() => bg?.usualRepsHigh != null ? String(bg.usualRepsHigh) : '');
  const [favoriteInput, setFavoriteInput] = useState('');
  const [favorites, setFavorites] = useState(() => bg?.favoriteExercises ? [...bg.favoriteExercises] : []);
  const [experienceLevel, setExperienceLevel] = useState(() => s?.profile?.experienceLevel || '');
  // FEATURES.md #23 -- only asked/used when experienceLevel is "Returning
  // after a break"; a brand-new lifter never sees this question.
  const [returningBreakWeeks, setReturningBreakWeeks] = useState(() => s?.profile?.returningBreakWeeks != null ? String(s.profile.returningBreakWeeks) : '');
  // FEATURES.md #33 -- split/sets/rep-range presuppose an existing habit, so
  // they're hidden behind a reveal for "New to training" rather than asked
  // of someone who has no "usual" to report. Starts open on a repeat setup
  // that already has one of these answered, rather than hiding real data
  // behind a click.
  const [showTrainingHabits, setShowTrainingHabits] = useState(() => !!(bg?.split || bg?.usualSets != null || bg?.usualRepsLow != null || bg?.usualRepsHigh != null));

  // Step 7 — Muscle Focus -- 'focus' | 'ignore', absent = normal. 'focus'
  // gives a real priority boost in session generation (FOCUS_MUSCLE_BONUS,
  // functions/weeklyPlanner.js); 'ignore' hard-excludes the muscle from
  // both fatigue/freshness scales and being a primary target in any
  // generated session (folded into offlineMuscles server-side, same
  // mechanism as an injury).
  const [muscleFocus, setMuscleFocus] = useState(() => ({ ...(s?.profile?.muscleFocus || {}) }));
  // Off by default -- MUSCLE_FOCUS_GROUPS' simplified picker, not the raw
  // 29-muscle PRIMARY_MUSCLES list. See MUSCLE_FOCUS_GROUPS' comment.
  const [showNicheMuscles, setShowNicheMuscles] = useState(() => !!s?.profile?.showNicheMuscles);
  const setGroupFocus = (group, value) => setMuscleFocus(p => {
    const next = { ...p };
    for (const m of group.muscles) { if (value === 'normal') delete next[m]; else next[m] = value; }
    return next;
  });

  // Step 8 — Connect Services. stravaStarted/hevyKeySaved start from the
  // real connection state on a repeat setup (s.stravaConnected/
  // profile.hevyApiKey) rather than blank — otherwise "Restart Setup" on an
  // account that connected both months ago showed neither as done anywhere
  // in this step, and Step 9's summary read them as never connected at all.
  // hevyKeyVal stays blank regardless — the saved key itself is a secret,
  // never worth re-populating into a plain text input just to prove it's set.
  const [stravaStarted, setStravaStarted] = useState(() => !!s?.stravaConnected);
  const [healthGuideOpen, setHealthGuideOpen] = useState(false);
  const [hevyKeyVal, setHevyKeyVal] = useState('');
  const [hevyKeyMode, setHevyKeyMode] = useState(null);
  const [hevyKeySaved, setHevyKeySaved] = useState(() => !!s?.profile?.hevyApiKey);
  const [urlCopied, setUrlCopied] = useState(false);
  const SHORTCUT_URL = `${API_BASE}/shortcut`;
  // Personal sync URL — each account gets its own token so its data lands
  // in its own account rather than everyone sharing the owner's URL (which
  // silently misrouted a second person's health data into the owner's own
  // account the first time this was actually tried). Falls back to the
  // untokened URL until the token's fetched. Fetched lazily (only once the
  // guide is actually opened) rather than on mount, so this doesn't cost
  // every onboarding user a round trip they may never need.
  const [syncUrl, setSyncUrl] = useState(SHORTCUT_URL);
  const [guideAdvanced, setGuideAdvanced] = useState(false);
  const openHealthGuide = () => {
    setHealthGuideOpen(v => {
      const next = !v;
      if (next && syncUrl === SHORTCUT_URL) {
        api('sync-token', { method: 'POST' }).then(({ token }) => {
          if (token) setSyncUrl(`${SHORTCUT_URL}?token=${token}`);
        }).catch(() => {});
      }
      return next;
    });
  };
  const copyUrl = () => {
    navigator.clipboard?.writeText(syncUrl).then(() => {
      setUrlCopied(true); setTimeout(() => setUrlCopied(false), 2000);
    });
  };

  // Step 9 — All Set -- already agreed once for a repeat setup (see the
  // file-level comment above); a genuinely new account still starts unchecked.
  const [agreedToTerms, setAgreedToTerms] = useState(() => !!s?.profile?.onboardingComplete);

  // throwOnError on every save below — api() otherwise only rejects on a
  // network-level failure, not an HTTP error response, so a genuine save
  // failure (auth hiccup, timeout, 500, whatever) would resolve normally
  // and look identical to success. advance()'s try/catch is the single
  // place that reacts to a real failure now. Named for what each one saves,
  // not its step number — steps have already been inserted/reordered once
  // (Training Goals/Activities split out of an older single primary/
  // secondary pair per FEATURES.md #21/#24) and a number in the name just
  // goes stale again the next time that happens.
  const saveAboutYou = async () => {
    const kg = weightUnit === 'kg' ? parseFloat(weightVal) : parseFloat(weightVal) * 0.453592;
    const cm = heightUnit === 'cm' ? parseFloat(heightVal) : parseFloat(heightVal) * 30.48;
    const age = dob ? Math.floor((Date.now() - new Date(dob)) / (365.25 * 24 * 3600 * 1000)) : null;
    const profileBody = { name: name || undefined, dob: dob || undefined, age, heightCm: cm || undefined, sex: sex || undefined };
    await api('profile', { method: 'POST', body: JSON.stringify(profileBody), throwOnError: true });
    if (kg > 0) await api('weight', { method: 'POST', body: JSON.stringify({ kg }), throwOnError: true });
    if (bodyFat) await api('bodyfat', { method: 'POST', body: JSON.stringify({ pct: parseFloat(bodyFat) }), throwOnError: true });
  };

  const saveTrainingGoals = async () => {
    await api('profile', { method: 'POST', body: JSON.stringify({ goals: buildGoalsPayload(trainingGoals) }), throwOnError: true });
  };

  const saveDailyTargets = async () => {
    await api('profile', { method: 'POST', body: JSON.stringify({ sleepTarget, waterTarget, trainingDaysPerWeek: trainingDays, waterActivityLevel, waterHotClimate }), throwOnError: true });
  };

  const saveActivities = async () => {
    await api('profile', { method: 'POST', body: JSON.stringify({ activities: activities.map(({ type, priority }) => ({ type, priority })) }), throwOnError: true });
  };

  const saveTrackingLevel = async () => {
    await api('profile', { method: 'POST', body: JSON.stringify({ trackingCategories }), throwOnError: true });
  };

  const saveTrainingBackground = async () => {
    const trainingBackground = {
      split: split || undefined,
      usualSets: usualSets ? parseInt(usualSets) : undefined,
      usualRepsLow: usualRepsLow ? parseInt(usualRepsLow) : undefined,
      usualRepsHigh: usualRepsHigh ? parseInt(usualRepsHigh) : undefined,
      favoriteExercises: favorites,
    };
    const body = { trainingBackground, experienceLevel: experienceLevel || undefined };
    if (experienceLevel === 'Returning after a break' && returningBreakWeeks) body.returningBreakWeeks = parseFloat(returningBreakWeeks);
    await api('profile', { method: 'POST', body: JSON.stringify(body), throwOnError: true });
  };

  const saveMuscleFocus = async () => {
    await api('profile', { method: 'POST', body: JSON.stringify({ muscleFocus: withHipFlexorDefault(muscleFocus, showNicheMuscles), showNicheMuscles }), throwOnError: true });
  };

  const advance = async () => {
    setSaving(true);
    setStepError('');
    try {
      if (step === 1) await saveAboutYou();
      if (step === 2) {
        await saveTrainingGoals();
        const sug = suggestTargets(trainingGoals);
        setSleepTarget(sug.sleepTarget); setWaterTarget(sug.waterTarget); setTrainingDays(sug.trainingDays);
      }
      if (step === 3) await saveDailyTargets();
      if (step === 4) await saveActivities();
      if (step === 5) await saveTrackingLevel();
      if (step === 6) await saveTrainingBackground();
      if (step === 7) await saveMuscleFocus();
      setStep(s => s + 1);
    } catch (e) {
      setStepError(`Something didn't save: ${e.message}`);
    }
    setSaving(false);
  };

  const progressPct = (step / (TOTAL - 1)) * 100;

  const inputStyle = { width: '100%', border: 'none', borderBottom: '2px solid var(--ink)', padding: '8px 0', background: 'transparent', fontFamily: 'Times New Roman,serif', fontSize: 16, outline: 'none', color: 'var(--ink)' };

  return (
    <div className="onboard-overlay">
      {/* Progress bar */}
      <div className="ob-progress"><div className="ob-progress-fill" style={{ width: `${progressPct}%` }} /></div>

      <div className="ob-wrap">
        {step > 0 && step < TOTAL - 1 && (
          <div className="ob-step-ind">Step {step} of {TOTAL - 2}</div>
        )}

        {/* ── STEP 0: WELCOME ── */}
        {step === 0 && (
          <>
            <div className="ob-logo">Press</div>
            <div className="ob-sub">Your personal health operating system.</div>
            <div className="ob-lede">Tell us about yourself and connect your services. Nothing here is mandatory — skip anything you'd rather set later from Settings.</div>
            <div style={{ borderTop: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)', margin: '0 0 32px' }}>
              {[
                ['Daily vitals', 'HRV, sleep, recovery, and readiness at a glance'],
                ['AI workout planner', 'Fatigue-aware sessions with progressive overload targets'],
                ['Nutrition logger', 'Photograph a meal for instant macro estimates'],
                ['Body & performance', 'PRs, muscle fatigue maps, Apple Health & Strava sync'],
              ].map(([t, d]) => (
                <div key={t} style={{ display: 'flex', gap: 14, padding: '12px 0', borderBottom: '1px solid var(--paper2)' }}>
                  <span style={{ color: 'var(--gold)', fontWeight: 700, flexShrink: 0, fontFamily: 'Times New Roman,serif' }}>—</span>
                  <div>
                    <div style={{ fontFamily: "'Playfair Display',serif", fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{t}</div>
                    <div style={{ fontSize: 12, color: 'var(--dim)', marginTop: 2 }}>{d}</div>
                  </div>
                </div>
              ))}
            </div>
            {hsGuide && (
              <div className="ob-guide" style={{ marginBottom: 32 }}>
                <strong>Save Press as an app ({hsGuide.label})</strong><br />
                {hsGuide.steps} It'll open full-screen from your home screen, just like a native app.
              </div>
            )}
            <button className="ob-next" style={{ width: '100%', padding: '14px 0' }} onClick={() => setStep(1)}>Get Started</button>
          </>
        )}

        {/* ── STEP 1: ABOUT YOU ── */}
        {step === 1 && (
          <>
            <div className="ob-h">About You</div>
            <div className="ob-deck">Tell us the basics so Press can calibrate your targets and progress.</div>

            <label className="ob-label">Name</label>
            <input style={inputStyle} placeholder="Your name" value={name} onChange={e => setName(e.target.value)} />

            <label className="ob-label">Date of Birth</label>
            <input style={inputStyle} type="date" value={dob} onChange={e => setDob(e.target.value)} />

            <label className="ob-label">Sex <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 9, color: 'var(--dim)' }}>(optional — used only to calibrate strength-level standards)</span></label>
            <div className="ob-unit-toggle" style={{ marginBottom: 14 }}>
              <button className={`ob-unit-btn${sex === 'male' ? ' active' : ''}`} onClick={() => setSex('male')}>Male</button>
              <button className={`ob-unit-btn${sex === 'female' ? ' active' : ''}`} onClick={() => setSex('female')}>Female</button>
            </div>

            <label className="ob-label">Height</label>
            <div className="ob-unit-row">
              <input style={{ ...inputStyle, flex: 1, width: 'auto' }}
                placeholder={heightUnit === 'cm' ? 'e.g. 180' : 'e.g. 5.11'}
                type="number" value={heightVal} onChange={e => setHeightVal(e.target.value)} inputMode="decimal" />
              <div className="ob-unit-toggle">
                <button className={`ob-unit-btn${heightUnit === 'cm' ? ' active' : ''}`} onClick={() => setHeightUnit('cm')}>cm</button>
                <button className={`ob-unit-btn${heightUnit === 'ft' ? ' active' : ''}`} onClick={() => setHeightUnit('ft')}>ft</button>
              </div>
            </div>

            <label className="ob-label">Current Weight</label>
            <div className="ob-unit-row">
              <input style={{ ...inputStyle, flex: 1, width: 'auto' }}
                placeholder={weightUnit === 'kg' ? 'e.g. 82' : 'e.g. 180'}
                type="number" value={weightVal} onChange={e => setWeightVal(e.target.value)} inputMode="decimal" />
              <div className="ob-unit-toggle">
                <button className={`ob-unit-btn${weightUnit === 'kg' ? ' active' : ''}`} onClick={() => setWeightUnit('kg')}>kg</button>
                <button className={`ob-unit-btn${weightUnit === 'lbs' ? ' active' : ''}`} onClick={() => setWeightUnit('lbs')}>lbs</button>
              </div>
            </div>

            <label className="ob-label">Body Fat % <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 9, color: 'var(--dim)' }}>(optional)</span></label>
            <input style={inputStyle} placeholder="Leave blank if unknown" type="number" step="0.1"
              value={bodyFat} onChange={e => setBodyFat(e.target.value)} inputMode="decimal" />

            {stepError && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--red)', marginBottom: 6 }}>{stepError}</div>}
            <div className="ob-nav">
              <button className="ob-back" onClick={() => { setStepError(''); setStep(0); }}>← Back</button>
              <button className="ob-next" onClick={advance} disabled={saving}>{saving ? 'Saving…' : stepError ? 'Retry' : 'Continue'}</button>
            </div>
          </>
        )}

        {/* ── STEP 2: TRAINING GOALS ── */}
        {step === 2 && (
          <>
            <div className="ob-h">What are you training for?</div>
            <div className="ob-deck">Pick any that apply, rank each one, and set a target if you have one — vague is fine too.</div>

            {GOAL_DEFS.map(gd => {
              const g = goalFor(gd.key);
              const metrics = GOAL_METRIC_OPTIONS[gd.key];
              const metricDef = metrics?.find(m => m.value === g?.metric);
              return (
                <div key={gd.key} style={{ marginBottom: 10 }}>
                  <button className={`ob-goal-card${g ? ' selected' : ''}`} style={{ width: '100%' }} onClick={() => toggleGoal(gd.key)}>
                    <div className="ob-goal-card-title">{gd.label}</div>
                    <div className="ob-goal-card-desc">{gd.desc}</div>
                  </button>
                  {g && (
                    <div style={{ padding: '10px 12px', border: '1px solid var(--rule)', borderTop: 'none' }}>
                      <div className="ob-label" style={{ marginTop: 0 }}>Priority</div>
                      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
                        {GOAL_PRIORITIES.map(p => (
                          <button key={p.value} className={`prof-btn${g.priority === p.value ? ' solid' : ''}`} onClick={() => updateGoal(gd.key, { priority: p.value })}>{p.label}</button>
                        ))}
                      </div>

                      <div className="ob-label">Target</div>
                      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
                        <button className={`prof-btn${!g.concrete ? ' solid' : ''}`} onClick={() => updateGoal(gd.key, { concrete: false })}>No specific target</button>
                        <button className={`prof-btn${g.concrete ? ' solid' : ''}`} onClick={() => updateGoal(gd.key, { concrete: true })}>Set a target</button>
                      </div>

                      {g.concrete && (
                        <>
                          {metrics && (
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
                              {metrics.map(m => (
                                <button key={m.value} className={`prof-btn${g.metric === m.value ? ' solid' : ''}`} onClick={() => updateGoal(gd.key, { metric: m.value })}>{m.label}</button>
                              ))}
                            </div>
                          )}
                          {g.metric === 'lift' && (
                            <input style={{ ...inputStyle, marginBottom: 10 }} placeholder="Exercise, e.g. Barbell Bench Press" autoComplete="off"
                              value={g.exercise || ''} onChange={e => updateGoal(gd.key, { exercise: e.target.value })} />
                          )}
                          {g.metric === 'benchmark' && (
                            <input style={{ ...inputStyle, marginBottom: 10 }} placeholder="What, e.g. 5k" autoComplete="off"
                              value={g.benchmarkLabel || ''} onChange={e => updateGoal(gd.key, { benchmarkLabel: e.target.value })} />
                          )}
                          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 4 }}>
                            {metrics ? (
                              <input style={{ ...inputStyle, flex: 1, width: 'auto' }} type="number" inputMode="decimal" autoComplete="off"
                                placeholder={`Target${metricDef?.unit ? ` (${metricDef.unit})` : ''}`} value={g.target || ''} onChange={e => updateGoal(gd.key, { target: e.target.value })} />
                            ) : (
                              <input style={{ ...inputStyle, flex: 1, width: 'auto' }} placeholder="Target, e.g. sub-25min 5k" autoComplete="off"
                                value={g.target || ''} onChange={e => updateGoal(gd.key, { target: e.target.value })} />
                            )}
                            <input style={{ ...inputStyle, flex: 1, width: 'auto' }} type="date" value={g.targetDate || ''} onChange={e => updateGoal(gd.key, { targetDate: e.target.value })} />
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {stepError && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--red)', marginBottom: 6 }}>{stepError}</div>}
            <div className="ob-nav">
              <button className="ob-back" onClick={() => { setStepError(''); setStep(1); }}>← Back</button>
              <button className="ob-next" onClick={advance} disabled={saving}>{saving ? 'Saving…' : stepError ? 'Retry' : 'Continue'}</button>
            </div>
          </>
        )}

        {/* ── STEP 3: DAILY TARGETS ── */}
        {step === 3 && (
          <>
            <div className="ob-h">Daily Targets</div>
            <div className="ob-deck">Prefilled from the training goals you just set — adjust freely. Diet goal (what you eat, for macro targets) lives in Settings instead.</div>

            <label className="ob-label" style={{ marginTop: 0 }}>Sleep Target</label>
            <div className="ob-stepper" style={{ margin: '10px 0 16px' }}>
              <button className="ob-stepper-btn" onClick={() => setSleepTarget(t => Math.max(5, t - 0.5))}>−</button>
              <div className="ob-stepper-val">{sleepTarget}<span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 12, color: 'var(--dim)', fontWeight: 400 }}>h</span></div>
              <button className="ob-stepper-btn" onClick={() => setSleepTarget(t => Math.min(12, t + 0.5))}>+</button>
              <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 9, color: 'var(--dim)', marginLeft: 6 }}>per night</span>
            </div>

            <label className="ob-label" style={{ marginTop: 0 }}>Water Target</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {WATER_ACTIVITY_LEVELS.map(l => (
                <button key={l.key} className={`prof-btn${waterActivityLevel === l.key ? ' solid' : ''}`}
                  onClick={() => { setWaterActivityLevel(l.key); setWaterTouched(false); }}>{l.label}</button>
              ))}
              <button className={`prof-btn${waterHotClimate ? ' solid' : ''}`}
                onClick={() => { setWaterHotClimate(v => !v); setWaterTouched(false); }}>Hot / humid climate</button>
            </div>
            <div className="ob-stepper" style={{ margin: '10px 0 4px' }}>
              <button className="ob-stepper-btn" onClick={() => { setWaterTouched(true); setWaterTarget(t => Math.max(2, t - 1)); }}>−</button>
              <div className="ob-stepper-val">{waterTarget}</div>
              <button className="ob-stepper-btn" onClick={() => { setWaterTouched(true); setWaterTarget(t => Math.min(16, t + 1)); }}>+</button>
              <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 9, color: 'var(--dim)', marginLeft: 6 }}>glasses / day</span>
            </div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', marginBottom: 16 }}>
              {waterCalc != null
                ? `Recommended ${waterCalc} glasses — ${Math.round(weightKgForWater)}kg × 35mL + ${waterActivityLevel} activity${waterHotClimate ? ' + hot climate' : ''}.`
                : 'Add your weight in About You for a recommended target — using your training goals for now.'}
            </div>

            <label className="ob-label" style={{ marginTop: 0 }}>Training Days per Week</label>
            <div className="ob-stepper" style={{ margin: '10px 0' }}>
              <button className="ob-stepper-btn" onClick={() => setTrainingDays(t => Math.max(1, t - 1))}>−</button>
              <div className="ob-stepper-val">{trainingDays}</div>
              <button className="ob-stepper-btn" onClick={() => setTrainingDays(t => Math.min(7, t + 1))}>+</button>
              <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 9, color: 'var(--dim)', marginLeft: 6 }}>days</span>
            </div>

            {stepError && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--red)', marginBottom: 6 }}>{stepError}</div>}
            <div className="ob-nav">
              <button className="ob-back" onClick={() => { setStepError(''); setStep(2); }}>← Back</button>
              <button className="ob-next" onClick={advance} disabled={saving}>{saving ? 'Saving…' : stepError ? 'Retry' : 'Continue'}</button>
            </div>
          </>
        )}

        {/* ── STEP 4: ACTIVITIES ── */}
        {step === 4 && (
          <>
            <div className="ob-h">What do you actually do?</div>
            <div className="ob-deck">Pick what you train and how much each one matters — this shapes weekly session and volume defaults.</div>

            {ACTIVITY_DEFS.map(ad => {
              const a = activityFor(ad.key);
              return (
                <div key={ad.key} style={{ marginBottom: 8 }}>
                  <button className={`ob-goal-card${a ? ' selected' : ''}`} style={{ width: '100%' }} onClick={() => toggleActivity(ad.key)}>
                    <div className="ob-goal-card-title">{ad.label}</div>
                  </button>
                  {a && (
                    <div style={{ display: 'flex', gap: 4, padding: '8px 12px', border: '1px solid var(--rule)', borderTop: 'none' }}>
                      {GOAL_PRIORITIES.map(p => (
                        <button key={p.value} className={`prof-btn${a.priority === p.value ? ' solid' : ''}`} onClick={() => updateActivity(ad.key, { priority: p.value })}>{p.label}</button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {stepError && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--red)', marginBottom: 6 }}>{stepError}</div>}
            <div className="ob-nav">
              <button className="ob-back" onClick={() => { setStepError(''); setStep(3); }}>← Back</button>
              <button className="ob-next" onClick={advance} disabled={saving}>{saving ? 'Saving…' : stepError ? 'Retry' : 'Continue'}</button>
            </div>
          </>
        )}

        {/* ── STEP 5: TRACKING LEVEL ── */}
        {step === 5 && (
          <>
            <div className="ob-h">How deep do you want to go?</div>
            <div className="ob-deck">Training is always tracked. Add Recovery and Nutrition independently — any combination, and you can always change this in Settings.</div>
            <div className="echelon-card" style={{ opacity: 0.6, cursor: 'default' }}>
              <div className="echelon-card-dot checkbox checked" />
              <div style={{ flex: 1 }}>
                <div className="echelon-card-title">Training — always on</div>
                <div className="echelon-card-desc">Workout logging, fatigue model, personal records, and AI-planned sessions.</div>
              </div>
            </div>
            {TRACKING_CATEGORIES.map(c => (
              <button key={c.key} className={`echelon-card${trackingCategories[c.key] ? ' selected' : ''}`}
                onClick={() => setTrackingCategories(prev => ({ ...prev, [c.key]: !prev[c.key] }))}>
                <div className={`echelon-card-dot checkbox${trackingCategories[c.key] ? ' checked' : ''}`} />
                <div style={{ flex: 1 }}>
                  <div className="echelon-card-title">{c.title}</div>
                  <div className="echelon-card-desc">{c.desc}</div>
                </div>
              </button>
            ))}
            {stepError && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--red)', marginBottom: 6 }}>{stepError}</div>}
            <div className="ob-nav">
              <button className="ob-back" onClick={() => { setStepError(''); setStep(4); }}>← Back</button>
              <button className="ob-next" onClick={advance} disabled={saving}>{saving ? 'Saving…' : stepError ? 'Retry' : 'Continue'}</button>
            </div>
          </>
        )}

        {/* ── STEP 6: TRAINING BACKGROUND ── */}
        {step === 6 && (
          <>
            <div className="ob-h">Your training so far</div>
            <div className="ob-deck">
              Nothing logged yet, so this gives the workout generator a real starting anchor instead of guessing — it'll shift toward your actual logged history the moment you start training.
            </div>

            <div className="ob-label">Experience</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
              {['New to training', 'Experienced', 'Returning after a break'].map(lvl => (
                <button key={lvl} className={`echelon-card${experienceLevel === lvl ? ' selected' : ''}`} style={{ flex: '1 1 30%', padding: '10px 12px' }}
                  onClick={() => setExperienceLevel(lvl)}>
                  <div style={{ flex: 1 }}><div className="echelon-card-title" style={{ fontSize: 13 }}>{lvl}</div></div>
                </button>
              ))}
            </div>
            {experienceLevel === 'Returning after a break' && (
              <>
                <label className="ob-label">How long was the break?</label>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20 }}>
                  <input style={{ ...inputStyle, flex: 1, width: 'auto' }} type="number" inputMode="decimal" placeholder="e.g. 8"
                    value={returningBreakWeeks} onChange={e => setReturningBreakWeeks(e.target.value)} />
                  <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 9, color: 'var(--dim)' }}>weeks</span>
                </div>
              </>
            )}

            {(experienceLevel !== 'New to training' || showTrainingHabits) ? (
              <>
                <div className="ob-label">Typical split</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
                  {TRAINING_SPLITS.map(sp => (
                    <button key={sp} className={`prof-btn${split === sp ? ' solid' : ''}`} onClick={() => setSplit(sp)}>{sp}</button>
                  ))}
                </div>

                <div className="ob-label">Usual working sets per exercise</div>
                <input style={inputStyle} type="number" inputMode="numeric" placeholder="e.g. 3" value={usualSets} onChange={e => setUsualSets(e.target.value)} />

                <div className="ob-label" style={{ marginTop: 16 }}>Usual rep range</div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20 }}>
                  <input style={{ ...inputStyle, width: 'auto', flex: 1 }} type="number" inputMode="numeric" placeholder="Low, e.g. 6" value={usualRepsLow} onChange={e => setUsualRepsLow(e.target.value)} />
                  <span style={{ color: 'var(--dim)' }}>–</span>
                  <input style={{ ...inputStyle, width: 'auto', flex: 1 }} type="number" inputMode="numeric" placeholder="High, e.g. 10" value={usualRepsHigh} onChange={e => setUsualRepsHigh(e.target.value)} />
                </div>
              </>
            ) : (
              <button onClick={() => setShowTrainingHabits(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 20, fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--dim)' }}>
                + Set a split / sets / rep range anyway
              </button>
            )}

            <div className="ob-label">Favorite / go-to exercises</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input style={{ ...inputStyle, width: 'auto', flex: 1 }} list="ob-exercise-options" placeholder="e.g. Barbell Bench Press" value={favoriteInput}
                onChange={e => setFavoriteInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key !== 'Enter' || !favoriteInput.trim()) return;
                  e.preventDefault();
                  setFavorites(p => p.includes(favoriteInput.trim()) ? p : [...p, favoriteInput.trim()]);
                  setFavoriteInput('');
                }} />
              <button className="prof-btn" onClick={() => {
                if (!favoriteInput.trim()) return;
                setFavorites(p => p.includes(favoriteInput.trim()) ? p : [...p, favoriteInput.trim()]);
                setFavoriteInput('');
              }}>Add</button>
            </div>
            <datalist id="ob-exercise-options">
              {BASE_EXERCISES.map(n => <option key={n} value={n} />)}
            </datalist>
            {favorites.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
                {favorites.map(f => (
                  <span key={f} className="prof-btn solid" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'default' }}>
                    {f}
                    <span style={{ cursor: 'pointer' }} onClick={() => setFavorites(p => p.filter(x => x !== f))}>×</span>
                  </span>
                ))}
              </div>
            )}

            {stepError && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--red)', marginBottom: 6 }}>{stepError}</div>}
            <div className="ob-nav">
              <button className="ob-back" onClick={() => { setStepError(''); setStep(5); }}>← Back</button>
              <button className="ob-next" onClick={advance} disabled={saving}>{saving ? 'Saving…' : stepError ? 'Retry' : 'Continue'}</button>
            </div>
          </>
        )}

        {/* ── STEP 7: MUSCLE FOCUS ── */}
        {step === 7 && (
          <>
            <div className="ob-h">Muscle focus</div>
            <div className="ob-deck">
              Priority gives a muscle extra weight when picking what's freshest to train. Lower does the opposite without dropping it — still fully modelled and fatigue-tracked, just chosen less often. Avoid excludes it from selection entirely, same as an injury — reserve it for muscles you shouldn't be training right now. Everything defaults to Maintain; only set what you actually want to change.
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, cursor: 'pointer' }}>
              <input type="checkbox" checked={showNicheMuscles} onChange={e => setShowNicheMuscles(e.target.checked)}
                style={{ width: 16, height: 16, flexShrink: 0 }} />
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: '.06em', color: 'var(--dim)' }}>
                Show scientific muscle names <span style={{ textTransform: 'none', letterSpacing: 'normal' }}>(splits regions like Traps or Upper Back into the individual muscles behind them, named anatomically)</span>
              </span>
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 20 }}>
              {(showNicheMuscles ? PRIMARY_MUSCLES.map(m => ({
                key: m, label: nicheMuscleLabel(m), value: muscleFocus[m] || 'normal', onSet: v => setMuscleFocus(p => v === 'normal' ? { ...p, [m]: undefined } : { ...p, [m]: v }),
              })) : MUSCLE_FOCUS_GROUPS.map(g => ({
                key: g.key, label: g.label, value: muscleGroupValue(g, muscleFocus), onSet: v => setGroupFocus(g, v),
              }))).map(row => (
                <div key={row.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--paper2)' }}>
                  <span style={{ flex: 1, fontFamily: "'JetBrains Mono',monospace", fontSize: 11, textTransform: 'capitalize' }}>{row.label}</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {MUSCLE_FOCUS_OPTIONS.map(opt => (
                      <button key={opt.value} className={`prof-btn${row.value === opt.value ? ' solid' : ''}`} style={{ fontSize: 8, padding: '4px 6px' }}
                        onClick={() => row.onSet(opt.value)}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {stepError && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--red)', marginBottom: 6 }}>{stepError}</div>}
            <div className="ob-nav">
              <button className="ob-back" onClick={() => { setStepError(''); setStep(6); }}>← Back</button>
              <button className="ob-next" onClick={advance} disabled={saving}>{saving ? 'Saving…' : stepError ? 'Retry' : 'Continue'}</button>
            </div>
          </>
        )}

        {/* ── STEP 8: CONNECT SERVICES ── */}
        {step === 8 && (
          <>
            <div className="ob-h">Connect Services</div>
            <div className="ob-deck">Optional — you can always connect these later from Settings.</div>

            {/* Strava */}
            <div className="ob-service-row">
              <div className="ob-svc-top">
                <div>
                  <div className="ob-svc-title">Strava</div>
                  <div className="ob-svc-desc">Import your runs, rides, and activities automatically</div>
                </div>
                <button className={`ob-svc-btn${(stravaStarted || s?.stravaConnected) ? ' done' : ''}`}
                  disabled={s?.stravaConnected}
                  onClick={() => { setStravaStarted(true); window.open(`${API_BASE}/strava/auth`, '_blank'); }}>
                  {s?.stravaConnected ? 'Connected' : stravaStarted ? 'Connecting…' : 'Connect'}
                </button>
              </div>
            </div>

            {/* Apple Health */}
            <div className="ob-service-row">
              <div className="ob-svc-top">
                <div>
                  <div className="ob-svc-title">Apple Health</div>
                  <div className="ob-svc-desc">Stream sleep, HRV, steps, and heart rate from your iPhone</div>
                </div>
                <button className={`ob-svc-btn${healthGuideOpen ? ' done' : ''}`} onClick={openHealthGuide}>
                  {healthGuideOpen ? 'Hide Guide' : 'Setup Guide'}
                </button>
              </div>
              {healthGuideOpen && (
                <div className="ob-guide">
                  <a href="https://www.icloud.com/shortcuts/f8fcfefdac47476081f8b92e8e03999c" target="_blank" rel="noopener noreferrer"
                    style={{ display: 'block', marginBottom: 8, fontWeight: 700, color: 'var(--gold)' }}>
                    Install the pre-built Shortcut →
                  </a>
                  Your personal sync link — after installing, open the Shortcut and make sure its URL matches this (replace it if it doesn't), so your data lands in your own account:
                  <div className="ob-copy-url" onClick={copyUrl}>
                    <span>{syncUrl}</span>
                    <button onClick={e => { e.stopPropagation(); copyUrl(); }}>{urlCopied ? 'Copied!' : 'Copy'}</button>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    Name your Shortcut <strong>Press Sync</strong> (rename it in the Shortcuts app if needed) and this link runs it directly, no need to open Shortcuts first: <a href="shortcuts://run-shortcut?name=Press%20Sync" style={{ color: 'var(--forest)', fontWeight: 700 }}>Sync Now →</a>
                  </div>
                  <button onClick={() => setGuideAdvanced(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 10, fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--dim)' }}>
                    {guideAdvanced ? '− Hide' : '+ Show'} manual build / sharing with others / unsupported sensors
                  </button>
                  {guideAdvanced && (
                    <div style={{ marginTop: 10 }}>
                      <strong>Blood Oxygen / Wrist Temperature — build one Shortcut variant per device, not one for everyone:</strong><br />
                      • <strong>Apple Watch Series 4/5, SE (1st/2nd gen):</strong> neither sensor — delete both blocks.<br />
                      • <strong>Series 6/7:</strong> Blood Oxygen only — delete the Wrist Temperature block.<br />
                      • <strong>Series 8/9/10/11, Ultra (any), SE 3:</strong> both — keep as-is.<br />
                      • <strong>Whoop 4.0:</strong> Blood Oxygen only (writes to the same "Blood Oxygen" Health type Apple Watch uses) — delete the Wrist Temperature block; Whoop never writes temperature to Apple Health, on any model. <strong>Whoop 3.0:</strong> neither — delete both.<br />
                      • <strong>Oura Gen 1/2:</strong> temperature only, no Blood Oxygen sensor — delete the Blood Oxygen block, and change the Wrist Temperature block's Find Health Samples type to "Body Temperature" (Oura writes there, never to "Wrist Temperature" — different HealthKit types).<br />
                      • <strong>Oura Gen 3 / Ring 4 / Ring 5:</strong> both — same Body Temperature swap as above, Blood Oxygen block works as-is (writes to the same "Blood Oxygen" type Apple Watch uses).<br /><br />
                      "Find Health Samples" errors (not empty) on a type your device never writes, which is why this needs per-device variants rather than one universal Shortcut. Everything else (HR, HRV, RHR, Steps, Sleep) works on every Watch and the iPhone alone.<br /><br />
                      <strong>Sharing this with someone else?</strong> Add these steps to the top of the Shortcut so it asks for their URL once and remembers it automatically, instead of everyone needing to manually edit it:<br />
                      <strong>a.</strong> Add <strong>Get File</strong> (iCloud Drive → Shortcuts folder → <code>press-sync-url.txt</code>), with "Error if Not Found" turned off — this file won't exist the first time<br />
                      <strong>b.</strong> Add an <strong>If</strong> checking whether that result has any value<br />
                      <strong>c.</strong> If yes → set variable <code>syncUrl</code> to the file's contents<br />
                      <strong>d.</strong> Otherwise → <strong>Ask for Input</strong> ("Paste your Press sync URL"), set <code>syncUrl</code> to the answer, then <strong>Save File</strong> it back to the same <code>press-sync-url.txt</code> path so every future run finds it already there<br />
                      <strong>e.</strong> Use <code>syncUrl</code> (not typed text) as the URL in Get Contents of URL<br /><br />
                      Or build it yourself from scratch:<br />
                      <strong>1.</strong> Open <strong>Shortcuts</strong> on your iPhone<br />
                      <strong>2.</strong> Create a new <strong>Personal Automation</strong><br />
                      <strong>3.</strong> Trigger: <strong>Daily</strong> — set up <strong>three</strong> automations (duplicate this one twice), one each in the morning, afternoon, and night, so your data is fresh for each of Press's Morning Briefing, Mid-Day Update, and Tonight's Report<br />
                      <strong>4.</strong> Add action: <strong>Get Contents of URL</strong><br />
                      <strong>5.</strong> URL — the same personal link shown above<br />
                      <strong>6.</strong> Method: <strong>POST</strong> · Body: <strong>JSON</strong><br />
                      <strong>7.</strong> Add a Dictionary with: <code>hr_values</code>/<code>hr_dates</code>, <code>rhr_values</code>/<code>rhr_dates</code>, <code>hrv_values</code>/<code>hrv_dates</code>, <code>bloodoxygen_values</code>/<code>bloodoxygen_dates</code>, <code>steps_values</code>/<code>steps_dates</code>, <code>wrist_values</code>/<code>wrist_dates</code>, and <code>sleep_start</code>/<code>sleep_end</code>/<code>sleep_types</code><br />
                      <strong>8.</strong> Each pair comes from its own "Find Health Samples" block — Value+Start Date for the first six, Start Date+End Date+Type for Sleep
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Hevy */}
            <div className="ob-service-row">
              <div className="ob-svc-top">
                <div>
                  <div className="ob-svc-title">Hevy</div>
                  <div className="ob-svc-desc">Import your lifting history from Hevy</div>
                </div>
              </div>
              <div className="ob-hevy-modes">
                <button className={`ob-svc-btn${hevyKeyMode === 'csv' ? ' done' : ''}`}
                  onClick={() => { onOpenImport(); }}>
                  Import CSV
                </button>
                <button className={`ob-svc-btn${(hevyKeyMode === 'api' || hevyKeySaved) ? ' done' : ''}`}
                  onClick={() => setHevyKeyMode(m => m === 'api' ? null : 'api')}>
                  {hevyKeyMode === 'api' ? 'Hide' : hevyKeySaved ? 'Key Saved' : 'API Key'}
                </button>
              </div>
              {hevyKeyMode === 'api' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input style={{ ...inputStyle, flex: 1, width: 'auto', fontSize: 12, fontFamily: 'JetBrains Mono,monospace' }}
                    placeholder="Hevy API key…" value={hevyKeyVal} onChange={e => setHevyKeyVal(e.target.value)} />
                  <button className="ob-svc-btn" style={hevyKeySaved ? { background: 'var(--forest)', borderColor: 'var(--forest)', color: 'var(--paper)' } : {}}
                    onClick={async () => {
                      if (!hevyKeyVal.trim()) return;
                      await api('hevy/key', { method: 'POST', body: JSON.stringify({ key: hevyKeyVal.trim() }) }).catch(() => {});
                      setHevyKeySaved(true);
                    }}>
                    {hevyKeySaved ? 'Saved' : 'Save'}
                  </button>
                </div>
              )}
            </div>

            <div className="ob-nav">
              <button className="ob-back" onClick={() => setStep(7)}>← Back</button>
              <button className="ob-next" onClick={() => setStep(9)}>Continue</button>
            </div>
          </>
        )}

        {/* ── STEP 9: ALL SET ── */}
        {step === 9 && (
          <>
            <div className="ob-logo" style={{ fontSize: 'clamp(36px,9vw,60px)' }}>You're set up.</div>
            <div className="ob-sub" style={{ marginBottom: 6 }}>Press is ready.</div>
            <div className="ob-lede">Your data will populate as you train, sleep, and log.</div>

            <div style={{ borderTop: '1px solid var(--ink)', borderBottom: '1px solid var(--ink)', margin: '8px 0 28px', padding: '4px 0' }}>
              {[
                [!!name, name || 'Profile skipped'],
                [!!trainingGoals.length, trainingGoals.length ? `${trainingGoals.length} training goal${trainingGoals.length === 1 ? '' : 's'}` : 'No training goals set'],
                [!!activities.length, activities.length ? `${activities.length} activit${activities.length === 1 ? 'y' : 'ies'}` : 'No activities set'],
                [true, `${sleepTarget}h sleep · ${waterTarget} glasses water · ${trainingDays} training days`],
                [true, `Training${trackingCategories.sleep ? ' + Recovery' : ''}${trackingCategories.nutrition ? ' + Nutrition' : ''}`],
                [!!(split || favorites.length), split ? `${split}${favorites.length ? ` · ${favorites.length} favorite${favorites.length === 1 ? '' : 's'}` : ''}` : 'Training background skipped'],
                [stravaStarted, 'Strava'],
                [healthGuideOpen, 'Apple Health setup viewed'],
                [hevyKeySaved, 'Hevy API key saved'],
              ].map(([done, lbl], i) => (
                <div key={i} className="ob-summary-row">
                  <div className={`ob-summary-check${done ? '' : ' empty'}`} />
                  <div className="ob-summary-lbl" style={{ color: done ? 'var(--ink)' : 'var(--dim)' }}>{lbl}</div>
                </div>
              ))}
            </div>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 12, color: 'var(--dim)', marginBottom: 16, cursor: 'pointer' }}>
              <input type="checkbox" checked={agreedToTerms} onChange={e => setAgreedToTerms(e.target.checked)}
                style={{ marginTop: 2, width: 16, height: 16, flexShrink: 0 }} />
              <span>
                I agree to Press's{' '}
                <a href="/terms.html" target="_blank" rel="noopener" style={{ color: 'var(--ink)' }}>Terms of Service</a>
                {' '}and{' '}
                <a href="/privacy.html" target="_blank" rel="noopener" style={{ color: 'var(--ink)' }}>Privacy Policy</a>.
              </span>
            </label>

            <button className="ob-next" style={{ width: '100%', padding: '14px 0' }} disabled={!agreedToTerms} onClick={onComplete}>Open Press</button>
          </>
        )}
      </div>
    </div>
  );
}

// ── SETTINGS OVERLAY ─────────────────────────────────────────────────────────
// Home-screen panel order/visibility, and Recovery tab order/visibility —
// both stored on the profile (panelOrder/hiddenPanels,
// recoveryTabOrder/hiddenRecoveryTabs) and consumed by App()/S5. Defaults
// here double as the fallback when a profile has never set a preference.
// Recommendation-first, not section-numbered: Dispatch carries today's
// limiting factor, Training carries the recommendation and the reasoning, and
// Recovery explains the fatigue behind both. Those three answer "what should I
// train today, and why" and so lead; sleep/nutrition/body/records are the
// supporting record and follow. Only affects accounts that have never
// reordered — a stored profile.panelOrder always wins.
const DEFAULT_PANEL_ORDER = ['s1', 's3', 's5', 's2', 's4', 's6', 's7', 's8', 's9', 's10', 's11', 's12', 's13', 's14', 's15'];
// A stored panelOrder always wins (see above), but it was captured at
// whatever point the account last touched Settings → Dashboard Layout —
// pre-dating panels added since then, which would otherwise never appear
// for that account (the render below only ever iterates ids that ARE in
// panelOrder, it doesn't add missing ones). Appending anything in
// DEFAULT_PANEL_ORDER the stored order is missing keeps a newly-shipped
// panel visible for existing accounts too, at the end, without disturbing
// any position that account has already chosen.
const withNewDefaultsAppended = order =>
  [...order, ...DEFAULT_PANEL_ORDER.filter(id => !order.includes(id))];
// Real per-panel default column-spanning (#13) rather than only the one
// manually-toggled 'expanded' state — Dispatch, Training and Recovery carry
// meaningfully more content than the others (the same lead-panel trio
// DEFAULT_PANEL_ORDER puts first), so they default wide once there's room
// (pressCss.js's panel-w2/panel-w3, 1380px/1800px+). Standard state spans 2;
// expanded spans 3 at the widest tier, 2 below it. Collapsed always forces
// span 1 regardless (see the panel className below).
const PANEL_WIDE = new Set(['s1', 's3', 's5']);
// Dashboard panel display states. 'standard' is the natural-height default and
// is never stored — an unset panel and an explicitly-standard one are the same
// thing, so nothing has to be migrated when a panel is added.
const PANEL_STATE_LABELS = { collapsed: 'Collapsed', standard: 'Standard', expanded: 'Wide' };
const PANEL_LABELS = { s1: 'Dispatch', s2: 'Sleep', s3: 'Training', s4: 'Nutrition', s5: 'Recovery', s6: 'Body & Supplements', s7: 'Personal Records', s8: 'Goals', s9: 'Social', s10: 'Cycle', s11: 'Running', s12: 'Cycling', s13: 'Swimming', s14: 'Sport', s15: 'Aerobic' };
const DOCK_LABELS = { s1: 'Dispatch', s2: 'Sleep', s3: 'Training', s4: 'Nutrition', s5: 'Recovery', s6: 'Body', s7: 'Records', s8: 'Goals', s9: 'Social', s10: 'Cycle', s11: 'Running', s12: 'Cycling', s13: 'Swimming', s14: 'Sport', s15: 'Aerobic' };
// One-click desktop layout presets (order + panelStates together) — not a
// new layout mechanism, just named combinations of the two settings above.
// Review and Retrospective are mirror images of the same lead/supporting
// split DEFAULT_PANEL_ORDER already draws; Dense ignores that split entirely
// in favour of fitting as many headline-only panels on screen as possible.
//
// grid4 is a hand-verified exact freeform-grid layout (x/y/w/h per item,
// see DashboardGrid.jsx) for the 4-column case — every column's cells sum to
// exactly the same total (see the arithmetic below each preset), which is
// what actually guarantees zero dead space now that the grid itself no
// longer auto-compacts (DashboardGrid.jsx's float:true — a real drag can
// leave gaps, so "no gap" for these three is a property of the hand-placed
// numbers, not of any live packing algorithm). Only 4 columns are hardcoded;
// 1/2/3-column falls back to the normal auto-placed default like any other
// layout, since 1-column is trivially flush (single stack, nothing to
// balance) and 2/3 weren't the reported problem. All heights here are
// deliberate, not measured content — two items (one 'collapsed' panel, one
// micro-widget) are nudged 1 row off their usual default specifically to
// make the arithmetic land exactly on a shared per-column total; that's a
// property of these hardcoded presets only, not a general rule.
const LAYOUT_PRESETS = [
  {
    id: 'review', label: 'Review',
    desc: 'Dispatch, Training and Recovery wide and first — today\'s decision, biggest.',
    order: ['s1', 's3', 's5', 's2', 's4', 's6', 's7', 's8', 's9', 's10', 's11', 's12', 's13', 's14', 's15'],
    states: { s1: 'expanded', s3: 'expanded', s5: 'expanded', s2: 'collapsed', s4: 'collapsed', s6: 'collapsed', s7: 'collapsed' },
    // Every column sums to 42. s8/s9 (unset -> 'standard', h=14) don't
    // divide evenly against everything else at their natural height, so s9
    // is nudged to h=13 here only — a property of this hardcoded layout,
    // not a general default. col0: s1(24)+2 nine-widgets(18)=42. col1/col2:
    // a lead(24)+one collapsed(3)+three 5-widgets(15)=42. col3: the two
    // remaining collapsed(3+3)+s8(14)+s9(13)+the last 9-widget=42.
    grid4: [
      { id: 's1', x: 0, y: 0, w: 1, h: 24 }, { id: 'mw-muscleFocus', x: 0, y: 24, w: 1, h: 9 }, { id: 'mw-weightDelta', x: 0, y: 33, w: 1, h: 9 },
      { id: 's3', x: 1, y: 0, w: 1, h: 24 }, { id: 's2', x: 1, y: 24, w: 1, h: 3 }, { id: 'mw-hydration', x: 1, y: 27, w: 1, h: 5 }, { id: 'mw-rhr', x: 1, y: 32, w: 1, h: 5 }, { id: 'mw-streak', x: 1, y: 37, w: 1, h: 5 },
      { id: 's5', x: 2, y: 0, w: 1, h: 24 }, { id: 's4', x: 2, y: 24, w: 1, h: 3 }, { id: 'mw-steps', x: 2, y: 27, w: 1, h: 5 }, { id: 'mw-insight', x: 2, y: 32, w: 1, h: 5 }, { id: 'mw-trainWindow', x: 2, y: 37, w: 1, h: 5 },
      { id: 's6', x: 3, y: 0, w: 1, h: 3 }, { id: 's7', x: 3, y: 3, w: 1, h: 3 }, { id: 's8', x: 3, y: 6, w: 1, h: 14 }, { id: 's9', x: 3, y: 20, w: 1, h: 13 }, { id: 'mw-volumePace', x: 3, y: 33, w: 1, h: 9 },
    ],
  },
  {
    id: 'dense', label: 'Dense',
    desc: 'Every panel collapsed to its headline — the most panels visible without scrolling.',
    order: DEFAULT_PANEL_ORDER,
    states: { s1: 'collapsed', s2: 'collapsed', s3: 'collapsed', s4: 'collapsed', s5: 'collapsed', s6: 'collapsed', s7: 'collapsed', s8: 'collapsed', s9: 'collapsed' },
    // Every column sums to 21, no nudging needed — 9 panels(h3 each) + 9
    // micro-widgets divides cleanly at this target. col0/col1: 2 panels(6)
    // + three 5-widgets(15)=21. col2: 1 panel(3) + two 9-widgets(18)=21.
    // col3: the remaining 4 panels(12) + the last 9-widget=21.
    grid4: [
      { id: 's1', x: 0, y: 0, w: 1, h: 3 }, { id: 's2', x: 0, y: 3, w: 1, h: 3 }, { id: 'mw-hydration', x: 0, y: 6, w: 1, h: 5 }, { id: 'mw-rhr', x: 0, y: 11, w: 1, h: 5 }, { id: 'mw-streak', x: 0, y: 16, w: 1, h: 5 },
      { id: 's3', x: 1, y: 0, w: 1, h: 3 }, { id: 's4', x: 1, y: 3, w: 1, h: 3 }, { id: 'mw-steps', x: 1, y: 6, w: 1, h: 5 }, { id: 'mw-insight', x: 1, y: 11, w: 1, h: 5 }, { id: 'mw-trainWindow', x: 1, y: 16, w: 1, h: 5 },
      { id: 's5', x: 2, y: 0, w: 1, h: 3 }, { id: 'mw-muscleFocus', x: 2, y: 3, w: 1, h: 9 }, { id: 'mw-weightDelta', x: 2, y: 12, w: 1, h: 9 },
      { id: 's6', x: 3, y: 0, w: 1, h: 3 }, { id: 's7', x: 3, y: 3, w: 1, h: 3 }, { id: 's8', x: 3, y: 6, w: 1, h: 3 }, { id: 's9', x: 3, y: 9, w: 1, h: 3 }, { id: 'mw-volumePace', x: 3, y: 12, w: 1, h: 9 },
    ],
  },
  {
    id: 'retrospective', label: 'Retrospective',
    desc: 'Sleep, Nutrition, Body and Records wide and first — the review, not the decision.',
    order: ['s2', 's4', 's6', 's7', 's1', 's3', 's5', 's8', 's9', 's10', 's11', 's12', 's13', 's14', 's15'],
    states: { s2: 'expanded', s4: 'expanded', s6: 'expanded', s7: 'expanded', s1: 'collapsed', s3: 'collapsed', s5: 'collapsed' },
    // Every column sums to 47. s9 is nudged to h=12 (unset -> 'standard'
    // h=14 otherwise) purely so the totals divide evenly here, same as
    // s9's nudge in Review — specific to this hardcoded layout. col0: an
    // expanded lead(24)+s8(14)+a 9-widget=47. col1: a lead(24)+one
    // collapsed(3)+four 5-widgets(20)=47. col2: a lead(24)+s9(12)+two
    // collapsed(6)+one 5-widget=47. col3: a lead(24)+two 9-widgets(18)+one
    // 5-widget=47.
    grid4: [
      { id: 's2', x: 0, y: 0, w: 1, h: 24 }, { id: 's8', x: 0, y: 24, w: 1, h: 14 }, { id: 'mw-muscleFocus', x: 0, y: 38, w: 1, h: 9 },
      { id: 's4', x: 1, y: 0, w: 1, h: 24 }, { id: 's1', x: 1, y: 24, w: 1, h: 3 }, { id: 'mw-hydration', x: 1, y: 27, w: 1, h: 5 }, { id: 'mw-rhr', x: 1, y: 32, w: 1, h: 5 }, { id: 'mw-streak', x: 1, y: 37, w: 1, h: 5 }, { id: 'mw-steps', x: 1, y: 42, w: 1, h: 5 },
      { id: 's6', x: 2, y: 0, w: 1, h: 24 }, { id: 's9', x: 2, y: 24, w: 1, h: 12 }, { id: 's3', x: 2, y: 36, w: 1, h: 3 }, { id: 's5', x: 2, y: 39, w: 1, h: 3 }, { id: 'mw-insight', x: 2, y: 42, w: 1, h: 5 },
      { id: 's7', x: 3, y: 0, w: 1, h: 24 }, { id: 'mw-weightDelta', x: 3, y: 24, w: 1, h: 9 }, { id: 'mw-volumePace', x: 3, y: 33, w: 1, h: 9 }, { id: 'mw-trainWindow', x: 3, y: 42, w: 1, h: 5 },
    ],
  },
];
const DEFAULT_RECOVERY_TAB_ORDER = ['fatigue', 'ranking', 'types', 'adaptation', 'patterns', 'soreness', 'injuries'];
const RECOVERY_TAB_LABELS = { fatigue: 'Structural', ranking: 'Ranking', types: 'Types', adaptation: 'Adaptation', patterns: 'Patterns', soreness: 'Soreness', injuries: 'Injuries' };

function PanelOrderEditor({ order, hidden, labels, states, expertise, onChange, onStateChange }) {
  const move = (id, dir) => {
    const idx = order.indexOf(id);
    const swap = idx + dir;
    if (swap < 0 || swap >= order.length) return;
    const next = [...order];
    [next[idx], next[swap]] = [next[swap], next[idx]];
    onChange(next, hidden);
  };
  const toggleHidden = id => onChange(order, hidden.includes(id) ? hidden.filter(h => h !== id) : [...hidden, id]);
  const stateOf = id => resolvePanelState(id, states, expertise);
  const cycleState = id => onStateChange(id, PANEL_STATES[(PANEL_STATES.indexOf(stateOf(id)) + 1) % PANEL_STATES.length]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {order.map((id, i) => (
        <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--paper2)', opacity: hidden.includes(id) ? 0.45 : 1 }}>
          <span style={{ flex: 1, fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--ink)' }}>{labels[id] || id}</span>
          {/* Only the home panels have display states — the same editor also
              drives the Recovery tab list, which has no notion of size. */}
          {onStateChange && (
            <button className="ol-btn ol-btn-ghost" style={{ fontSize: 9, padding: '5px 10px', minWidth: 74 }}
              onClick={() => cycleState(id)} disabled={hidden.includes(id)}
              aria-label={`${labels[id]} size: ${PANEL_STATE_LABELS[stateOf(id)]}. Change`}>
              {PANEL_STATE_LABELS[stateOf(id)]}
            </button>
          )}
          <button className="ol-btn ol-btn-ghost" style={{ fontSize: 10, padding: '5px 10px' }} disabled={i === 0} onClick={() => move(id, -1)} aria-label={`Move ${labels[id]} up`}>↑</button>
          <button className="ol-btn ol-btn-ghost" style={{ fontSize: 10, padding: '5px 10px' }} disabled={i === order.length - 1} onClick={() => move(id, 1)} aria-label={`Move ${labels[id]} down`}>↓</button>
          <button className="ol-btn ol-btn-ghost" style={{ fontSize: 9, padding: '5px 10px', minWidth: 48 }} onClick={() => toggleHidden(id)}>{hidden.includes(id) ? 'Show' : 'Hide'}</button>
        </div>
      ))}
    </div>
  );
}

// Single anterior-view body diagram, colored per-muscle by a caller-supplied
// filter function — factored out of S5's fatigue/ranking triptychs (same
// fetch-and-inject-innerHTML pattern) but deliberately anterior-only rather
// than a full triptych, since the comparison screen needs two of these
// (self + other) side by side and a full 3-view-times-2-people layout would
// be too much on a phone screen. The per-muscle table below covers every
// muscle regardless, including the ones with no body-map region at all.
function MiniBodyDiagram({ filterForMuscle }) {
  const ref = useRef();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    fetch(`${BODY_BASE}/body-anterior.svg`).then(r => r.text()).then(svg => {
      if (ref.current) ref.current.innerHTML = svg;
      setReady(true);
    }).catch(() => {});
  }, []);
  useEffect(() => {
    if (!ready || !ref.current) return;
    ALL_MUSCLES.forEach(m => {
      const f = filterForMuscle(m);
      ref.current.querySelectorAll(`[data-muscle="${m}"]`).forEach(el => el.setAttribute('filter', f));
    });
  }, [ready, filterForMuscle]);
  return <div className="body-view" ref={ref} />;
}

// Strength/Stimulus comparison against a mutually-followed, mutually-opted
// -in account — see USERNAME_AND_COMPARISON.md §6. Fetched fresh from
// GET /compare/:username on open and whenever the metric/window changes;
// no client caching, matching the backend's own no-caching design.
function ComparisonScreen({ username, otherDisplayNameFirstHint, onClose }) {
  const [metric, setMetric] = useState('strength');
  const [windowDays, setWindowDays] = useState(14);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    api(`compare/${encodeURIComponent(username)}?metric=${metric}${metric === 'stimulus' ? `&window=${windowDays}` : ''}`)
      .then(r => { if (r.error) setError(r.error); else setData(r); })
      .catch(e => setError(`Connection error: ${e.message}`))
      .finally(() => setLoading(false));
  }, [username, metric, windowDays]);

  const selfLevel = m => metric === 'strength' ? (data?.self?.[m]?.score ?? null) : (data?.self?.[m] ?? null);
  const otherLevel = m => metric === 'strength' ? (data?.other?.[m]?.score ?? null) : (data?.other?.[m] ?? null);
  // Stimulus has no fixed 0-100 ceiling like a strength score does — scale
  // its coloring off whichever of the two people's own values is highest
  // this render, so the diagram stays meaningful regardless of window size.
  const stimulusMax = metric === 'stimulus'
    ? Math.max(0.01, ...Object.values(data?.self || {}), ...Object.values(data?.other || {}))
    : null;
  const filterFor = getLevel => m => {
    const v = getLevel(m);
    if (v == null) return 'url(#fm-dim)';
    const score = metric === 'strength' ? v : (v / stimulusMax) * 100;
    return diagramFilterForScore(score);
  };

  const allMuscles = Array.from(new Set([...Object.keys(data?.self || {}), ...Object.keys(data?.other || {})])).sort();
  const otherName = data?.otherDisplayNameFirst || otherDisplayNameFirstHint || 'Them';

  return (
    <div className="onboard-overlay" style={{ zIndex: 10001 }}>
      <div className="ob-wrap">
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--dim)', fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', padding: 0, marginBottom: 20 }}>← Back</button>
        <div className="ob-h">Compare with {otherName}</div>

        <div style={{ display: 'flex', gap: 6, margin: '14px 0' }}>
          {['strength', 'stimulus'].map(mm => (
            <button key={mm} className={`ob-unit-btn${metric === mm ? ' active' : ''}`} onClick={() => setMetric(mm)} style={{ textTransform: 'capitalize' }}>{mm}</button>
          ))}
        </div>
        {metric === 'stimulus' && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {[7, 14, 30].map(d => (
              <button key={d} className={`ob-unit-btn${windowDays === d ? ' active' : ''}`} onClick={() => setWindowDays(d)}>{d}d</button>
            ))}
          </div>
        )}

        {loading && <div style={{ fontSize: 12, color: 'var(--dim)' }}>Loading…</div>}
        {error && <div style={{ fontSize: 12, color: 'var(--red)' }}>{error}</div>}

        {!loading && !error && data && (
          <>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', margin: '10px 0 18px' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 9, fontFamily: "'JetBrains Mono',monospace", letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 4 }}>You</div>
                <MiniBodyDiagram filterForMuscle={filterFor(selfLevel)} />
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 9, fontFamily: "'JetBrains Mono',monospace", letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 4 }}>{otherName}</div>
                <MiniBodyDiagram filterForMuscle={filterFor(otherLevel)} />
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--rule)' }}>
                  <th style={{ textAlign: 'left', padding: '4px 0', color: 'var(--dim)', fontFamily: "'JetBrains Mono',monospace", fontSize: 9, textTransform: 'uppercase' }}>Muscle</th>
                  <th style={{ textAlign: 'right', padding: '4px 0', color: 'var(--dim)', fontFamily: "'JetBrains Mono',monospace", fontSize: 9, textTransform: 'uppercase' }}>You</th>
                  <th style={{ textAlign: 'right', padding: '4px 0', color: 'var(--dim)', fontFamily: "'JetBrains Mono',monospace", fontSize: 9, textTransform: 'uppercase' }}>{otherName}</th>
                </tr>
              </thead>
              <tbody>
                {allMuscles.map(m => (
                  <tr key={m} style={{ borderBottom: '1px solid var(--paper2)' }}>
                    <td style={{ padding: '5px 0', textTransform: 'capitalize' }}>{m}</td>
                    <td style={{ padding: '5px 0', textAlign: 'right' }}>{selfLevel(m) != null ? Math.round(selfLevel(m) * 10) / 10 : '—'}</td>
                    <td style={{ padding: '5px 0', textAlign: 'right' }}>{otherLevel(m) != null ? Math.round(otherLevel(m) * 10) / 10 : '—'}</td>
                  </tr>
                ))}
                {!allMuscles.length && <tr><td colSpan={3} style={{ padding: '10px 0', color: 'var(--dim)', textAlign: 'center' }}>No data for either of you yet.</td></tr>}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}

// ── S9: SOCIAL ───────────────────────────────────────────────────────────────
// Front-page home for the follow/search/comparison system (FEATURES.md
// #135-139), previously reachable only via Settings → Social, plus the new
// activity feed (#144). Settings → Social stays in place as a secondary
// entry point (CLAUDE.md: additive, not a removal) — this panel reuses the
// exact same endpoints and the same ComparisonScreen/profile-overlay flow
// rather than rebuilding either, so there is exactly one implementation of
// each behind two entry points, not two implementations to drift apart.
function S9({ s, followBadge, reloadFollowBadge }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [followingPending, setFollowingPending] = useState({});
  const [viewingUsername, setViewingUsername] = useState(null);
  const [viewedProfile, setViewedProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [comparingUsername, setComparingUsername] = useState(null);
  const [feed, setFeed] = useState(null);
  const [feedError, setFeedError] = useState('');
  const [feedLoading, setFeedLoading] = useState(true);

  const feedVisible = s?.profile?.visibility?.feed === true;

  useEffect(() => {
    let cancelled = false;
    setFeedLoading(true);
    api('feed')
      .then(r => { if (!cancelled) setFeed(r.entries || []); })
      .catch(e => { if (!cancelled) setFeedError(`Connection error: ${e.message}`); })
      .finally(() => { if (!cancelled) setFeedLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const runSearch = (q) => {
    setSearchQuery(q);
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    api(`account/search?prefix=${encodeURIComponent(q.trim())}`)
      .then(r => setSearchResults(r.results || []))
      .catch(() => {})
      .finally(() => setSearching(false));
  };

  const openProfile = (username) => {
    setViewingUsername(username);
    setViewedProfile(null);
    setProfileLoading(true);
    api(`account/${encodeURIComponent(username)}`)
      .then(r => setViewedProfile(r))
      .catch(() => setViewedProfile({ error: true }))
      .finally(() => setProfileLoading(false));
  };

  const sendFollowRequest = async (username) => {
    setFollowingPending(p => ({ ...p, [username]: true }));
    try {
      await api('follow-request', { method: 'POST', body: JSON.stringify({ toUsername: username }) });
    } catch {
      setFollowingPending(p => ({ ...p, [username]: false }));
    }
  };

  const acceptFollowRequest = async (fromUid) => {
    await api(`follow-requests/${fromUid}/accept`, { method: 'POST' });
    reloadFollowBadge?.();
  };

  const ackAccepted = async () => {
    await api('follow-requests/ack-accepted', { method: 'POST' });
    reloadFollowBadge?.();
  };

  const requestCount = (followBadge?.incoming?.length || 0) + (followBadge?.recentlyAccepted?.length || 0);

  return (
    <section id="s9" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="fade panel-head" style={{ flexShrink: 0 }} data-tour="s9-headline">
        <div className="kicker">Social</div>
        <div className="headline" style={{ fontSize: 'clamp(24px,6vw,44px)', lineHeight: '.96' }}>Follow &amp;<br />Compare</div>
        <div className="deck">
          {feed ? `${feed.length} recent entr${feed.length !== 1 ? 'ies' : 'y'}` : '—'}
          {requestCount > 0 ? ` · ${requestCount} request${requestCount !== 1 ? 's' : ''}` : ''}
        </div>
      </div>
      <div className="fade" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>

        {followBadge?.recentlyAccepted?.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div className="pr-group-hdr">Accepted</div>
            {followBadge.recentlyAccepted.map(r => (
              <div key={r.toUid} className="notif-row">
                <span style={{ fontSize: 12 }}>{r.toDisplayNameFirst} accepted your follow request</span>
              </div>
            ))}
            <button className="prof-btn" onClick={ackAccepted} style={{ marginTop: 6 }}>Dismiss</button>
          </div>
        )}

        {followBadge?.incoming?.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div className="pr-group-hdr">Follow Requests</div>
            {followBadge.incoming.map(r => (
              <div key={r.fromUid} className="notif-row">
                <span style={{ fontSize: 12 }}>{r.fromDisplayNameFirst} <span style={{ color: 'var(--dim)', fontFamily: "'JetBrains Mono',monospace", fontSize: 9 }}>@{r.fromUsername}</span></span>
                <button className="prof-btn solid" style={{ fontSize: 9, padding: '4px 10px' }} onClick={() => acceptFollowRequest(r.fromUid)}>Accept</button>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginBottom: 16 }} data-tour="s9-search">
          <div className="pr-group-hdr">Find People</div>
          <input className="pr-search" value={searchQuery} onChange={e => runSearch(e.target.value)}
            placeholder="Search by username" autoCapitalize="none" autoCorrect="off" />
          {searching && <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 4 }}>Searching…</div>}
          {searchResults.map(r => (
            <div key={r.uid} className="notif-row">
              <button onClick={() => openProfile(r.username)} style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, fontSize: 12, color: 'var(--ink)' }}>
                {r.displayNameFirst} <span style={{ color: 'var(--dim)', fontFamily: "'JetBrains Mono',monospace", fontSize: 9 }}>@{r.username}</span>
              </button>
              <button className="prof-btn" style={{ fontSize: 9, padding: '4px 10px' }}
                disabled={followingPending[r.username]} onClick={() => sendFollowRequest(r.username)}>
                {followingPending[r.username] ? 'Requested' : 'Follow'}
              </button>
            </div>
          ))}
        </div>

        <div data-tour="s9-feed">
          <div className="pr-group-hdr">Activity</div>
          {!feedVisible && (
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--dim)', lineHeight: 1.5, padding: '6px 0 12px' }}>
              Your own sessions aren't included in anyone else's feed — turn on "Activity feed" in Settings → Social → Visibility to opt in.
            </div>
          )}
          {feedLoading && <div style={{ fontSize: 11, color: 'var(--dim)' }}>Loading…</div>}
          {feedError && <div style={{ fontSize: 11, color: 'var(--red)' }}>{feedError}</div>}
          {!feedLoading && !feedError && feed?.length === 0 && (
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--dim)', fontStyle: 'italic', padding: '12px 0' }}>
              Nothing yet — follow people with sessions and the activity feed both visible to see their training here.
            </div>
          )}
          {feed?.map((e, i) => (
            <div key={i} className="hist-row" style={{ cursor: 'default' }}>
              <div className="hist-row-hdr">
                <span className="hist-date">{e.date}</span>
                <button onClick={() => openProfile(e.username)} className="hist-name"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textTransform: 'none' }}>
                  {e.displayNameFirst}
                </button>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)' }}>
                  trained {e.name}{e.sets ? ` · ${e.sets} sets` : ''}{e.duration ? ` · ${e.duration}min` : ''}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {viewingUsername && (
        <div className="onboard-overlay" style={{ zIndex: 10000 }} onClick={() => setViewingUsername(null)}>
          <div className="ob-wrap" onClick={e => e.stopPropagation()}>
            <button onClick={() => setViewingUsername(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--dim)', fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', padding: 0, marginBottom: 20 }}>← Back</button>
            {profileLoading && <div style={{ fontSize: 12, color: 'var(--dim)' }}>Loading…</div>}
            {!profileLoading && viewedProfile?.error && <div style={{ fontSize: 12, color: 'var(--red)' }}>Couldn't load this profile.</div>}
            {!profileLoading && viewedProfile && !viewedProfile.error && (
              <>
                <div className="ob-h">{viewedProfile.displayNameFirst}</div>
                <div className="ob-deck">@{viewedProfile.username}</div>
                {!viewedProfile.isFollowing && !viewedProfile.isSelf && (
                  <button className="prof-btn solid" style={{ marginTop: 12 }}
                    disabled={followingPending[viewedProfile.username]}
                    onClick={() => sendFollowRequest(viewedProfile.username)}>
                    {followingPending[viewedProfile.username] ? 'Requested' : 'Follow'}
                  </button>
                )}
                {viewedProfile.isFollowing && !viewedProfile.workouts && (
                  <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 12 }}>Workout sessions aren't visible for this account.</div>
                )}
                {viewedProfile.canCompare && (
                  <button className="prof-btn" style={{ marginTop: 12, marginLeft: viewedProfile.isFollowing && !viewedProfile.workouts ? 0 : 8 }}
                    onClick={() => setComparingUsername(viewedProfile.username)}>
                    Compare
                  </button>
                )}
                {viewedProfile.workouts && (
                  <div style={{ marginTop: 16 }}>
                    <div className="settings-sh">Recent Workouts</div>
                    {viewedProfile.workouts.slice(-10).reverse().map((w, i) => (
                      <div key={i} style={{ fontSize: 12, padding: '6px 0', borderBottom: '1px solid var(--paper2)' }}>
                        {localDateFromYMD(w.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} — {w.name} ({w.sets} sets)
                      </div>
                    ))}
                  </div>
                )}
                {viewedProfile.rankedExercises?.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <div className="settings-sh">Ranked Favorite Exercises</div>
                    <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {viewedProfile.rankedExercises.slice(0, 10).map((r, i) => (
                        <li key={r.name} style={{ display: 'flex', gap: 8, fontSize: 12, padding: '6px 0', borderBottom: '1px solid var(--paper2)' }}>
                          <span style={{ color: 'var(--dim)', width: 16, textAlign: 'right', flexShrink: 0 }}>{i + 1}.</span>
                          <span>{r.name}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
      {comparingUsername && (
        <ComparisonScreen username={comparingUsername} otherDisplayNameFirstHint={viewedProfile?.displayNameFirst}
          onClose={() => setComparingUsername(null)} />
      )}
    </section>
  );
}

// Manual, lightweight cycle log (see functions/cycleTracking.js for the
// deterministic calibration math) — this component only owns the logging
// UI and plain-language summary; s.cycleStats is computed server-side.
const HEAVINESS_LABELS = ['None', 'Mild', 'Moderate', 'Significant', 'Severe'];
function cycleImpactWord(avg) {
  if (avg == null) return null;
  if (avg <= 1.5) return 'minimal';
  if (avg <= 2.5) return 'mild';
  if (avg <= 3.5) return 'moderate';
  if (avg <= 4.5) return 'significant';
  return 'severe';
}
function cycleConsistencyWord(confidence, variation) {
  if (confidence == null || confidence < 0.3) return null;
  return variation < 1 ? 'fairly consistent' : 'variable';
}
// Local (not UTC) YYYY-MM-DD — toISOString() shifts by a day near midnight
// for any non-UTC timezone, which would wrongly block "today" as a date
// input's max in half the world's timezones. Used for both date-input
// bounds and the calendar grid, so a stored moment and a grid cell always
// land on the same day for the same reason.
const cycleDayKey = ts => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
// Builds one calendar month's day cells, each tagged with the logged period
// (if any) covering that day, whether it falls in the single predicted
// next-period window, and whether it's today — the three states the
// calendar needs to distinguish, by fill/outline/border rather than color
// alone (WCAG colorblind-safe requirement).
function cycleMonthGrid(year, month, log, prediction) {
  const startOffset = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = cycleDayKey(Date.now());
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const key = cycleDayKey(new Date(year, month, d).getTime());
    const entry = log.find(c => {
      const s = cycleDayKey(c.startTs);
      const e = c.endTs != null ? cycleDayKey(c.endTs) : todayKey;
      return key >= s && key <= e;
    });
    const predicted = !entry && prediction && key >= cycleDayKey(prediction.startTs) && key < cycleDayKey(prediction.endTs);
    cells.push({ day: d, key, entry, predicted, today: key === todayKey });
  }
  return cells;
}
function S10({ s, refresh }) {
  const todayStr = cycleDayKey(Date.now());
  const [heaviness, setHeaviness] = useState(3);
  const [note, setNote] = useState('');
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [startError, setStartError] = useState('');
  const [endError, setEndError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editHeaviness, setEditHeaviness] = useState(3);
  const [loggingPast, setLoggingPast] = useState(false);
  const [pastStart, setPastStart] = useState('');
  const [pastEnd, setPastEnd] = useState('');
  const [pastHeaviness, setPastHeaviness] = useState(3);
  const [pastNote, setPastNote] = useState('');
  const [pastError, setPastError] = useState('');
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [selectedId, setSelectedId] = useState(null);

  const log = s?.cycle || [];
  const stats = s?.cycleStats || null;
  const prediction = s?.cyclePrediction || null;
  const open = log.find(c => c.endTs == null);
  const history = [...log].filter(c => c.endTs != null).sort((a, b) => b.startTs - a.startTs);
  const calCells = cycleMonthGrid(calMonth.y, calMonth.m, log, prediction);
  const calLabel = new Date(calMonth.y, calMonth.m, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const selectedEntry = log.find(c => c.id === selectedId) || null;

  // Bubble tracker's day count — current day of the open period, extended
  // to this user's own average logged period length (5 as the same
  // population default cycleTracking.js's averagePeriodLengthDays uses)
  // so a short-so-far period still shows where it's typically headed.
  // Capped so a period nobody's gotten around to ending yet can't grow the
  // row without bound.
  const closedLens = history.map(c => Math.round((c.endTs - c.startTs) / 86_400_000)).filter(d => d > 0);
  const avgPeriodLen = closedLens.length ? Math.round(closedLens.reduce((a, b) => a + b, 0) / closedLens.length) : 5;
  const bubbleCount = open && stats?.cycleDay ? Math.min(Math.max(stats.cycleDay, avgPeriodLen), 14) : 0;

  const setPeriodStart = async () => {
    setStartError('');
    setBusy(true);
    const data = await api('cycle/start', { method: 'POST', body: JSON.stringify({ start: startDate }) });
    setBusy(false);
    if (data.error) { setStartError(data.error); return; }
    setStartDate(todayStr);
    refresh({ ...s, cycle: [...log, { id: data.id, startTs: data.startTs, endTs: null, heaviness: null, note: '' }] });
  };

  const setPeriodEnd = async () => {
    setEndError('');
    setBusy(true);
    const data = await api(`cycle/${open.id}/end`, { method: 'POST', body: JSON.stringify({ end: endDate, heaviness, note: note.trim() }) });
    setBusy(false);
    if (data.error) { setEndError(data.error); return; }
    setEndDate(todayStr); setHeaviness(3); setNote('');
    refresh({ ...s, cycle: log.map(c => c.id === open.id ? { ...c, endTs: data.endTs, heaviness, note: note.trim() } : c) });
  };

  const submitPast = async () => {
    setPastError('');
    if (!pastStart || !pastEnd) { setPastError('Start and end dates are required.'); return; }
    if (pastEnd < pastStart) { setPastError('End must be on or after start.'); return; }
    setBusy(true);
    const data = await api('cycle/retro', { method: 'POST', body: JSON.stringify({ start: pastStart, end: pastEnd, heaviness: pastHeaviness, note: pastNote.trim() }) });
    setBusy(false);
    if (data.error) { setPastError(data.error); return; }
    refresh({ ...s, cycle: [...log, data.entry] });
    setLoggingPast(false); setPastStart(''); setPastEnd(''); setPastHeaviness(3); setPastNote('');
  };

  const saveEdit = async (id) => {
    await api(`cycle/${id}`, { method: 'PATCH', body: JSON.stringify({ heaviness: editHeaviness }) });
    setEditingId(null);
    refresh({ ...s, cycle: log.map(c => c.id === id ? { ...c, heaviness: editHeaviness } : c) });
  };

  const removeEntry = async (id) => {
    await api(`cycle/${id}`, { method: 'DELETE' });
    refresh({ ...s, cycle: log.filter(c => c.id !== id) });
  };

  const impactWord = cycleImpactWord(stats?.avgHeaviness);
  const consistencyWord = cycleConsistencyWord(stats?.confidence, stats?.variation);
  let summaryLine = 'Not enough history yet to calibrate.';
  if (s?.profile?.cycleIrregular && !stats?.onPeriod) {
    summaryLine = 'Irregular cycle — calibration resumes once a period is logged.';
  } else if (impactWord && consistencyWord) {
    summaryLine = `Training impact: ${impactWord}, ${consistencyWord}.`;
  } else if (impactWord) {
    summaryLine = `Training impact: ${impactWord}.`;
  }
  const rirOffset = stats?.rirOffset || 0;
  const rirLine = rirOffset > 0 ? `Today: RIR +${rirOffset} — stay a rep further from failure.`
    : rirOffset < 0 ? `Today: RIR ${rirOffset} — fine to push closer to failure.` : null;

  return (
    <section id="s10" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="fade panel-head" style={{ flexShrink: 0 }} data-tour="s10-headline">
        <div className="kicker">Cycle</div>
        <div className="headline" style={{ fontSize: 'clamp(24px,6vw,44px)', lineHeight: '.96' }}>Cycle-Aware<br />Recovery</div>
        <div className="deck">{open ? `Day ${stats?.cycleDay ?? '—'} of cycle` : 'No period currently logged'}</div>
      </div>
      <div className="fade" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {bubbleCount > 0 && (
          <div className="cycle-bubbles" aria-hidden="true">
            {Array.from({ length: bubbleCount }, (_, i) => i + 1).map(day => (
              <div key={day} className={`cycle-bubble${day < stats.cycleDay ? ' filled' : ''}${day === stats.cycleDay ? ' current' : ''}`}>
                {day}
              </div>
            ))}
          </div>
        )}
        <div className="cycle-status" data-tour="s10-status">
          <div className="cycle-summary">{summaryLine}</div>
          {rirLine && <div className="cycle-summary">{rirLine}</div>}
        </div>

        {open ? (
          <div className="cycle-form" data-tour="s10-form">
            <div className="kicker" style={{ margin: 0 }}>Set Period End Date</div>
            <input className="cycle-input" type="date" value={endDate} min={cycleDayKey(open.startTs)} max={todayStr} onChange={e => setEndDate(e.target.value)} />
            <div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 6 }}>Training impact this cycle</div>
              <div style={{ fontFamily: 'Times New Roman,serif', fontSize: 11, fontStyle: 'italic', color: 'var(--dim)', marginBottom: 8 }}>
                A starting estimate — refined automatically afterward from how training actually went.
              </div>
              <div className="cycle-heaviness">
                {HEAVINESS_LABELS.map((label, i) => (
                  <button key={label} className={`cycle-heaviness-btn${heaviness === i + 1 ? ' active' : ''}`} onClick={() => setHeaviness(i + 1)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <input className="cycle-input" placeholder="Notes (optional)…" value={note} onChange={e => setNote(e.target.value)} />
            {endError && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--red)' }}>{endError}</div>}
            <button className="prof-btn solid" disabled={busy} onClick={setPeriodEnd} style={{ alignSelf: 'flex-start', padding: '6px 18px' }}>
              {busy ? 'Saving…' : 'Save End Date'}
            </button>
          </div>
        ) : (
          <div className="cycle-form" data-tour="s10-form">
            <div className="kicker" style={{ margin: 0 }}>Set Period Start Date</div>
            <input className="cycle-input" type="date" value={startDate} max={todayStr} onChange={e => setStartDate(e.target.value)} />
            {startError && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--red)' }}>{startError}</div>}
            <button className="prof-btn solid" disabled={busy} onClick={setPeriodStart} style={{ alignSelf: 'flex-start', padding: '6px 18px' }}>
              {busy ? 'Saving…' : 'Save Start Date'}
            </button>
          </div>
        )}

        {loggingPast ? (
          <div className="cycle-form">
            <div className="kicker" style={{ margin: 0 }}>Log a Past Period</div>
            <div style={{ fontFamily: 'Times New Roman,serif', fontSize: 11, fontStyle: 'italic', color: 'var(--dim)' }}>
              Backfilling history sharpens the calibration — more logged cycles to learn from.
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 6 }}>Start</div>
                <input className="cycle-input" type="date" value={pastStart} max={todayStr} onChange={e => setPastStart(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 6 }}>End</div>
                <input className="cycle-input" type="date" value={pastEnd} max={todayStr} onChange={e => setPastEnd(e.target.value)} />
              </div>
            </div>
            <div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 6 }}>Training impact that cycle</div>
              <div className="cycle-heaviness">
                {HEAVINESS_LABELS.map((label, i) => (
                  <button key={label} className={`cycle-heaviness-btn${pastHeaviness === i + 1 ? ' active' : ''}`} onClick={() => setPastHeaviness(i + 1)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <input className="cycle-input" placeholder="Notes (optional)…" value={pastNote} onChange={e => setPastNote(e.target.value)} />
            {pastError && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--red)' }}>{pastError}</div>}
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="prof-btn solid" disabled={busy} onClick={submitPast} style={{ padding: '6px 18px' }}>
                {busy ? 'Saving…' : 'Add Period'}
              </button>
              <button className="cycle-edit" onClick={() => { setLoggingPast(false); setPastError(''); }}>Cancel</button>
            </div>
          </div>
        ) : (
          <button className="cycle-edit" style={{ marginTop: 12 }} onClick={() => setLoggingPast(true)}>Log a past period</button>
        )}

        {log.length > 0 && (
          <div className="cycle-cal" data-tour="s10-calendar">
            <div className="cycle-cal-head">
              <button className="cycle-cal-nav" onClick={() => setCalMonth(({ y, m }) => m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 })} aria-label="Previous month">‹</button>
              <div className="cycle-cal-label">{calLabel}</div>
              <button className="cycle-cal-nav" onClick={() => setCalMonth(({ y, m }) => m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 })} aria-label="Next month">›</button>
            </div>
            <div className="cycle-cal-grid">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i} className="cycle-cal-dow">{d}</div>)}
              {calCells.map((c, i) => c == null ? <div key={`pad${i}`} /> : (
                <div
                  key={c.key}
                  className={`cycle-cal-day${c.entry ? ' logged' : ''}${c.predicted ? ' predicted' : ''}${c.today ? ' today' : ''}${c.entry && c.entry.id === selectedId ? ' selected' : ''}`}
                  onClick={() => c.entry && setSelectedId(c.entry.id === selectedId ? null : c.entry.id)}
                >
                  {c.day}
                </div>
              ))}
            </div>
            <div className="cycle-cal-legend">
              <span><span className="cycle-cal-swatch logged" /> Logged</span>
              {prediction && <span><span className="cycle-cal-swatch predicted" /> Predicted next</span>}
            </div>
          </div>
        )}

        {selectedEntry && (
          <div className="cycle-card">
            <div className="cycle-meta">
              {new Date(selectedEntry.startTs).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – {selectedEntry.endTs != null ? new Date(selectedEntry.endTs).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'ongoing'}
              {selectedEntry.heaviness != null && ` · ${HEAVINESS_LABELS[selectedEntry.heaviness - 1]} impact`}
            </div>
            {selectedEntry.note && <div className="injury-note">{selectedEntry.note}</div>}
            {editingId === selectedEntry.id && (
              <div className="cycle-heaviness" style={{ marginTop: 6 }}>
                {HEAVINESS_LABELS.map((label, i) => (
                  <button key={label} className={`cycle-heaviness-btn${editHeaviness === i + 1 ? ' active' : ''}`} onClick={() => setEditHeaviness(i + 1)}>
                    {label}
                  </button>
                ))}
              </div>
            )}
            <div className="cycle-actions">
              {selectedEntry.endTs != null && (editingId === selectedEntry.id ? (
                <button className="cycle-edit" onClick={() => saveEdit(selectedEntry.id)}>Save</button>
              ) : (
                <button className="cycle-edit" onClick={() => { setEditingId(selectedEntry.id); setEditHeaviness(selectedEntry.heaviness || 3); }}>Edit</button>
              ))}
              <button className="cycle-remove" onClick={() => { removeEntry(selectedEntry.id); setSelectedId(null); }}>Remove</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// #95-#113 Standalone Running Subsystem (RUNNING_SCIENCE.md) — the frontend
// consumer for /run/recommendation (functions/runningRecommendation.js) and
// the VO2max trend/8-week forecast /summary already computes
// (runningPrediction). Both existed server-side with nothing rendering
// them; this is that missing panel. Only ever mounted for an account with
// Running listed as an activity — see App()'s hasRunningActivity gate,
// same "opt-in, not tracking-level" pattern s10's cycleTrackingEnabled uses.
const RUN_SESSION_LABELS = { rest: 'Rest Day', recovery: 'Recovery Run', easy: 'Easy Run', steady: 'Steady Run', tempo: 'Tempo Run', interval: 'Interval Session', long: 'Long Run' };
const VO2MAX_SOURCE_LABELS = {
  'apple-watch': 'Apple Watch', 'daniels-vdot': 'Estimated from pace',
  // Cycling/Swimming panels (S12/S13) below reuse this same lookup —
  // running only ever produces the two keys above, so adding these is inert
  // for S11.
  'cycling-ftp': 'Estimated from FTP', 'hr-ratio': 'Estimated from HR ratio',
};
// RUNNING_SCIENCE.md #107 (Williams et al. 2017) thresholds — the same zones
// buildRunningRecommendation's own cautions already check against, just
// labelled here for display rather than only surfacing as a caution string.
function runningAcwrZone(acwr) {
  if (acwr == null) return null;
  if (acwr > 1.5) return { label: 'High', color: 'var(--red)' };
  if (acwr > 1.3) return { label: 'Elevated', color: 'var(--ember)' };
  if (acwr < 0.8) return { label: 'Detraining', color: 'var(--dim)' };
  return { label: 'Safe range', color: 'var(--forest)' };
}
function S11({ s, runRecommendation }) {
  const mono = { fontFamily: "'JetBrains Mono',monospace" };
  const rec = runRecommendation;
  const prediction = s?.runningPrediction || null;
  const acwrZone = rec ? runningAcwrZone(rec.acwr) : null;
  const readinessColor = rec ? (rec.readiness >= 60 ? 'var(--forest)' : rec.readiness >= 40 ? 'var(--gold)' : 'var(--red)') : 'var(--ink)';

  return (
    <section id="s11" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="fade panel-head" style={{ flexShrink: 0 }} data-tour="s11-headline">
        <div className="kicker">Running</div>
        <div className="headline" style={{ fontSize: 'clamp(24px,6vw,44px)', lineHeight: '.96' }}>
          {rec ? (RUN_SESSION_LABELS[rec.sessionType] || 'Today’s Run') : 'Running'}
        </div>
        <div className="deck">{rec ? rec.readinessLabel : 'No runs logged yet'}</div>
      </div>
      <div className="fade" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {!rec ? (
          <div style={{ ...mono, fontSize: 11, color: 'var(--dim)', lineHeight: 1.6 }}>
            Sync a run from Strava or Apple Health to get a daily readiness-based prescription here.
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }} data-tour="s11-readiness">
              <span style={{ ...mono, fontSize: 10, color: 'var(--dim)' }}>Readiness</span>
              <span style={{ ...mono, fontSize: 16, fontWeight: 700, color: readinessColor }}>{Math.round(rec.readiness)}%</span>
            </div>

            {rec.sessionType !== 'rest' && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ ...mono, fontSize: 10, color: 'var(--dim)', marginBottom: 3 }}>Duration</div>
                <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 15, fontWeight: 700 }}>
                  {rec.duration.min}–{rec.duration.max} min <span style={{ ...mono, fontSize: 10, fontWeight: 400, color: 'var(--dim)' }}>(target {rec.duration.target})</span>
                </div>
                {!rec.workoutPrescription && rec.intensity && (
                  <div style={{ ...mono, fontSize: 10, color: 'var(--dim)', marginTop: 3 }}>{rec.intensity}</div>
                )}
              </div>
            )}

            {rec.workoutPrescription && (
              <div style={{ marginBottom: 10, borderTop: '1px solid var(--paper2)', paddingTop: 8 }}>
                <div style={{ ...mono, fontSize: 10, color: 'var(--dim)', marginBottom: 3 }}>{rec.workoutPrescription.hrZone}</div>
                <div style={{ ...mono, fontSize: 12, color: 'var(--ink)' }}>
                  {rec.workoutPrescription.hrRange}{rec.workoutPrescription.pace ? ` · ${rec.workoutPrescription.pace}` : ''}
                </div>
                <div style={{ fontFamily: 'Times New Roman,serif', fontSize: 11, fontStyle: 'italic', color: 'var(--dim)', marginTop: 3 }}>
                  {rec.workoutPrescription.purpose}
                </div>
              </div>
            )}

            {rec.alternatives?.length > 0 && (
              <div style={{ ...mono, fontSize: 9, color: 'var(--dim)', marginBottom: 10 }}>
                Alternatives: {rec.alternatives.map(a => RUN_SESSION_LABELS[a] || a).join(', ')}
              </div>
            )}

            <div style={{ fontFamily: 'Times New Roman,serif', fontSize: 12, lineHeight: 1.6, color: 'var(--ink)', marginBottom: 10 }}>
              {rec.reasoning}
            </div>

            {rec.cautions?.length > 0 && rec.cautions.map((c, i) => (
              <div key={i} style={{ ...mono, fontSize: 10, color: 'var(--ember)', lineHeight: 1.6, marginBottom: 4 }}>⚠ {c}</div>
            ))}

            <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 8, marginTop: 4 }} data-tour="s11-week">
              <div className="kicker" style={{ marginBottom: 6 }}>This Week</div>
              <div style={{ ...mono, fontSize: 10, color: 'var(--dim)', display: 'flex', justifyContent: 'space-between', lineHeight: 1.8 }}>
                <span>Runs logged</span><span style={{ color: 'var(--ink)' }}>{rec.weekSessionCount}</span>
              </div>
              {acwrZone && (
                <div style={{ ...mono, fontSize: 10, display: 'flex', justifyContent: 'space-between', lineHeight: 1.8 }}>
                  <span style={{ color: 'var(--dim)' }}>Acute:Chronic load</span>
                  <span style={{ color: acwrZone.color }}>{rec.acwr} — {acwrZone.label}</span>
                </div>
              )}
              {rec.efficiencyTrend?.trend4wk != null && (
                <div style={{ ...mono, fontSize: 10, display: 'flex', justifyContent: 'space-between', lineHeight: 1.8 }}>
                  <span style={{ color: 'var(--dim)' }}>Efficiency (4wk)</span>
                  <span style={{ color: rec.efficiencyTrend.trend4wk < -3 ? 'var(--ember)' : 'var(--ink)' }}>
                    {rec.efficiencyTrend.trend4wk > 0 ? '+' : ''}{Math.round(rec.efficiencyTrend.trend4wk * 10) / 10}%
                  </span>
                </div>
              )}
            </div>

            <Detail min="intermediate">
              {rec.paceZones && (
                <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 8, marginTop: 10 }}>
                  <div className="kicker" style={{ marginBottom: 6 }}>Pace Zones</div>
                  {Object.entries(rec.paceZones).map(([k, v]) => (
                    <div key={k} style={{ ...mono, fontSize: 9, color: 'var(--dim)', display: 'flex', justifyContent: 'space-between', lineHeight: 1.8, textTransform: 'capitalize' }}>
                      <span>{k}</span><span style={{ color: 'var(--ink)', textAlign: 'right' }}>{v}</span>
                    </div>
                  ))}
                </div>
              )}
              {rec.hrZones && (
                <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 8, marginTop: 10 }}>
                  <div className="kicker" style={{ marginBottom: 6 }}>Heart Rate Zones</div>
                  {Object.values(rec.hrZones).map(z => (
                    <div key={z.name} style={{ ...mono, fontSize: 9, color: 'var(--dim)', display: 'flex', justifyContent: 'space-between', lineHeight: 1.8 }}>
                      <span>{z.name}</span><span style={{ color: 'var(--ink)' }}>{z.range}</span>
                    </div>
                  ))}
                </div>
              )}
            </Detail>

            {(rec.vo2maxValue || prediction) && (
              <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 8, marginTop: 10 }} data-tour="s11-vo2max">
                <div className="kicker" style={{ marginBottom: 6 }}>VO₂max</div>
                {rec.vo2maxValue && (
                  <div style={{ ...mono, fontSize: 10, display: 'flex', justifyContent: 'space-between', lineHeight: 1.8 }}>
                    <span style={{ color: 'var(--dim)' }}>{VO2MAX_SOURCE_LABELS[rec.vo2maxSource] || 'Current'}</span>
                    <span style={{ color: 'var(--ink)' }}>{Math.round(rec.vo2maxValue * 10) / 10}</span>
                  </div>
                )}
                {prediction && (
                  <div style={{ fontFamily: 'Times New Roman,serif', fontSize: 11, fontStyle: 'italic', color: 'var(--dim)', marginTop: 4, lineHeight: 1.6 }}>
                    Projected {prediction.predictedVO2maxAfter8Weeks} in 8 weeks at this training load ({prediction.predictedGainPercent > 0 ? '+' : ''}{prediction.predictedGainPercent}%, {prediction.confidenceInterval.min}–{prediction.confidenceInterval.max}% range).
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

// Cycling & Swimming panels — same shape as S11 above, off
// /cycling/recommendation and /swim/recommendation
// (functions/enduranceRecommendation.js). A new shared component rather
// than a refactor of S11: deliberately not touching Running's working,
// shipped UI to add these two. See ENDURANCE_SCIENCE.md for what's reused
// vs. new server-side. Only ever mounted for an account with
// Cycling/Swimming listed as an activity — same hasCyclingActivity/
// hasSwimmingActivity gate hasRunningActivity uses for S11.
const CYCLING_SESSION_LABELS = { rest: 'Rest Day', recovery: 'Recovery Ride', easy: 'Endurance Ride', steady: 'Steady Ride', tempo: 'Tempo Ride', interval: 'Interval Session', long: 'Long Ride' };
const SWIM_SESSION_LABELS = { rest: 'Rest Day', recovery: 'Recovery Swim', easy: 'Easy Swim', steady: 'Steady Swim', tempo: 'Tempo Swim', interval: 'Interval Session', long: 'Long Swim' };

function EnduranceSportPanel({ id, kicker, sessionLabels, rec, noSessionsLabel, emptyDeck, emptyBody }) {
  const mono = { fontFamily: "'JetBrains Mono',monospace" };
  // runningAcwrZone's thresholds (Williams et al. 2017) are cross-sport, not
  // running-specific — same reuse RUNNING_SCIENCE.md documents for the ACWR
  // math itself.
  const acwrZone = rec ? runningAcwrZone(rec.acwr) : null;
  const readinessColor = rec ? (rec.readiness >= 60 ? 'var(--forest)' : rec.readiness >= 40 ? 'var(--gold)' : 'var(--red)') : 'var(--ink)';
  const avgDisplay = rec?.avgSpeedDisplay || rec?.avgPaceDisplay || null;

  return (
    <section id={id} style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="fade panel-head" style={{ flexShrink: 0 }}>
        <div className="kicker">{kicker}</div>
        <div className="headline" style={{ fontSize: 'clamp(24px,6vw,44px)', lineHeight: '.96' }}>
          {rec ? (sessionLabels[rec.sessionType] || kicker) : kicker}
        </div>
        <div className="deck">{rec ? rec.readinessLabel : emptyDeck}</div>
      </div>
      <div className="fade" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {!rec ? (
          <div style={{ ...mono, fontSize: 11, color: 'var(--dim)', lineHeight: 1.6 }}>
            {emptyBody}
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
              <span style={{ ...mono, fontSize: 10, color: 'var(--dim)' }}>Readiness</span>
              <span style={{ ...mono, fontSize: 16, fontWeight: 700, color: readinessColor }}>{Math.round(rec.readiness)}%</span>
            </div>

            {rec.sessionType !== 'rest' && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ ...mono, fontSize: 10, color: 'var(--dim)', marginBottom: 3 }}>Duration</div>
                <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 15, fontWeight: 700 }}>
                  {rec.duration.min}–{rec.duration.max} min <span style={{ ...mono, fontSize: 10, fontWeight: 400, color: 'var(--dim)' }}>(target {rec.duration.target})</span>
                </div>
                {!rec.workoutPrescription && rec.intensity && (
                  <div style={{ ...mono, fontSize: 10, color: 'var(--dim)', marginTop: 3 }}>{rec.intensity}</div>
                )}
                {avgDisplay && (
                  <div style={{ ...mono, fontSize: 10, color: 'var(--dim)', marginTop: 3 }}>Last logged: {avgDisplay}</div>
                )}
              </div>
            )}

            {rec.workoutPrescription && (
              <div style={{ marginBottom: 10, borderTop: '1px solid var(--paper2)', paddingTop: 8 }}>
                <div style={{ ...mono, fontSize: 10, color: 'var(--dim)', marginBottom: 3 }}>{rec.workoutPrescription.zoneName || rec.workoutPrescription.hrZone}</div>
                <div style={{ ...mono, fontSize: 12, color: 'var(--ink)' }}>
                  {rec.workoutPrescription.range || rec.workoutPrescription.hrRange}
                </div>
                <div style={{ fontFamily: 'Times New Roman,serif', fontSize: 11, fontStyle: 'italic', color: 'var(--dim)', marginTop: 3 }}>
                  {rec.workoutPrescription.purpose}
                </div>
              </div>
            )}

            {rec.alternatives?.length > 0 && (
              <div style={{ ...mono, fontSize: 9, color: 'var(--dim)', marginBottom: 10 }}>
                Alternatives: {rec.alternatives.map(a => sessionLabels[a] || a).join(', ')}
              </div>
            )}

            <div style={{ fontFamily: 'Times New Roman,serif', fontSize: 12, lineHeight: 1.6, color: 'var(--ink)', marginBottom: 10 }}>
              {rec.reasoning}
            </div>

            {rec.cautions?.length > 0 && rec.cautions.map((c, i) => (
              <div key={i} style={{ ...mono, fontSize: 10, color: 'var(--ember)', lineHeight: 1.6, marginBottom: 4 }}>⚠ {c}</div>
            ))}

            <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 8, marginTop: 4 }}>
              <div className="kicker" style={{ marginBottom: 6 }}>This Week</div>
              <div style={{ ...mono, fontSize: 10, color: 'var(--dim)', display: 'flex', justifyContent: 'space-between', lineHeight: 1.8 }}>
                <span>{noSessionsLabel}</span><span style={{ color: 'var(--ink)' }}>{rec.weekSessionCount}</span>
              </div>
              {acwrZone && (
                <div style={{ ...mono, fontSize: 10, display: 'flex', justifyContent: 'space-between', lineHeight: 1.8 }}>
                  <span style={{ color: 'var(--dim)' }}>Acute:Chronic load</span>
                  <span style={{ color: acwrZone.color }}>{rec.acwr} — {acwrZone.label}</span>
                </div>
              )}
              {rec.efficiencyTrend?.trend4wk != null && (
                <div style={{ ...mono, fontSize: 10, display: 'flex', justifyContent: 'space-between', lineHeight: 1.8 }}>
                  <span style={{ color: 'var(--dim)' }}>Efficiency (4wk)</span>
                  <span style={{ color: rec.efficiencyTrend.trend4wk < -3 ? 'var(--ember)' : 'var(--ink)' }}>
                    {rec.efficiencyTrend.trend4wk > 0 ? '+' : ''}{Math.round(rec.efficiencyTrend.trend4wk * 10) / 10}%
                  </span>
                </div>
              )}
            </div>

            <Detail min="intermediate">
              {rec.powerZones && (
                <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 8, marginTop: 10 }}>
                  <div className="kicker" style={{ marginBottom: 6 }}>Power Zones{rec.ftp ? ` (FTP ${rec.ftp}W)` : ''}</div>
                  {Object.values(rec.powerZones).map(z => (
                    <div key={z.name} style={{ ...mono, fontSize: 9, color: 'var(--dim)', display: 'flex', justifyContent: 'space-between', lineHeight: 1.8 }}>
                      <span>{z.name}</span><span style={{ color: 'var(--ink)' }}>{z.range}</span>
                    </div>
                  ))}
                </div>
              )}
              {rec.hrZones && (
                <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 8, marginTop: 10 }}>
                  <div className="kicker" style={{ marginBottom: 6 }}>Heart Rate Zones</div>
                  {Object.values(rec.hrZones).map(z => (
                    <div key={z.name} style={{ ...mono, fontSize: 9, color: 'var(--dim)', display: 'flex', justifyContent: 'space-between', lineHeight: 1.8 }}>
                      <span>{z.name}</span><span style={{ color: 'var(--ink)' }}>{z.range}</span>
                    </div>
                  ))}
                </div>
              )}
            </Detail>

            {rec.vo2maxValue && (
              <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 8, marginTop: 10 }}>
                <div className="kicker" style={{ marginBottom: 6 }}>VO₂max</div>
                <div style={{ ...mono, fontSize: 10, display: 'flex', justifyContent: 'space-between', lineHeight: 1.8 }}>
                  <span style={{ color: 'var(--dim)' }}>{VO2MAX_SOURCE_LABELS[rec.vo2maxSource] || 'Current'}</span>
                  <span style={{ color: 'var(--ink)' }}>{Math.round(rec.vo2maxValue * 10) / 10}</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function S12({ cyclingRecommendation }) {
  return (
    <EnduranceSportPanel id="s12" kicker="Cycling" sessionLabels={CYCLING_SESSION_LABELS}
      rec={cyclingRecommendation} noSessionsLabel="Rides logged"
      emptyDeck="No rides logged yet"
      emptyBody="Sync a ride from Strava to get a daily readiness-based prescription here." />
  );
}
function S13({ swimmingRecommendation }) {
  return (
    <EnduranceSportPanel id="s13" kicker="Swimming" sessionLabels={SWIM_SESSION_LABELS}
      rec={swimmingRecommendation} noSessionsLabel="Swims logged"
      emptyDeck="No swims logged yet"
      emptyBody="Sync a swim from Strava to get a daily readiness-based prescription here." />
  );
}

// Sport (S14) & Aerobic (S15) — same shared computation for both (see
// buildGeneralRecommendation, functions/enduranceRecommendation.js):
// Strava's sport_type can't distinguish these two activity choices in any
// principled way, so both panels render off the exact same
// generalRecommendation object, gated and labelled independently.
const GENERAL_SESSION_LABELS = { rest: 'Rest Day', recovery: 'Recovery Session', easy: 'Light Session', steady: 'Steady Session', tempo: 'Tempo Session', interval: 'Interval Session', long: 'Long Session' };

function S14({ generalRecommendation }) {
  return (
    <EnduranceSportPanel id="s14" kicker="Sport" sessionLabels={GENERAL_SESSION_LABELS}
      rec={generalRecommendation} noSessionsLabel="Sessions logged"
      emptyDeck="No sessions logged yet"
      emptyBody="Sync a session from Strava to get a daily readiness-based prescription here." />
  );
}
function S15({ generalRecommendation }) {
  return (
    <EnduranceSportPanel id="s15" kicker="Aerobic" sessionLabels={GENERAL_SESSION_LABELS}
      rec={generalRecommendation} noSessionsLabel="Sessions logged"
      emptyDeck="No sessions logged yet"
      emptyBody="Sync a session from Strava to get a daily readiness-based prescription here." />
  );
}

function SettingsOverlay({ s, onClose, refresh, onSignOut, onOpenImport, onOpenWiki, setBriefing, onRestartSetup, onReplayWalkthrough, followBadge, reloadFollowBadge, onOpenGridEdit, onOpenAdmin }) {
  const [nameVal, setNameVal] = useState(s?.profile?.name || '');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [nameError, setNameError] = useState('');
  const [usernameVal, setUsernameVal] = useState(s?.profile?.username || '');
  const [displayNameVal, setDisplayNameVal] = useState(s?.profile?.displayName || '');
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameSaved, setUsernameSaved] = useState(false);
  const [usernameError, setUsernameError] = useState('');
  const [trainingExpVal, setTrainingExpVal] = useState(s?.profile?.trainingExperienceYears ?? '');
  const [sleepTarget, setSleepTarget] = useState(s?.profile?.sleepTarget || 8);
  const [waterTarget, setWaterTarget] = useState(s?.profile?.waterTarget || 7);
  const [trainingDays, setTrainingDays] = useState(s?.profile?.trainingDaysPerWeek || 4);
  // Water calculator — mirrors Onboarding's Daily Targets step exactly
  // (recommendedWaterGlasses above) so the two pickers can't drift the way
  // the old diet-goal ones did. Weight comes straight from the athlete's own
  // logged weight (db.weight is always kg) rather than asking again here.
  const [waterActivityLevel, setWaterActivityLevel] = useState(s?.profile?.waterActivityLevel || 'moderate');
  const [waterHotClimate, setWaterHotClimate] = useState(!!s?.profile?.waterHotClimate);
  // Starts "touched" whenever a waterTarget is already saved — an explicit
  // stored preference always wins over the calculator until the athlete
  // actively picks a new activity level/climate here (same rule
  // compoundIsolationPref/stabilityPref below use). Onboarding's version of
  // this starts untouched instead, since there's no prior preference yet to
  // protect from being overwritten.
  const [waterTouched, setWaterTouched] = useState(s?.profile?.waterTarget != null);
  const weightKgForWater = s?.weights?.length ? s.weights.at(-1).value : null;
  const waterCalc = recommendedWaterGlasses(weightKgForWater, waterActivityLevel, waterHotClimate);
  useEffect(() => {
    if (!waterTouched && waterCalc != null) setWaterTarget(waterCalc);
  }, [waterCalc, waterTouched]);
  const [trackingCategories, setTrackingCategories] = useState(trackingCategoriesFor(s?.profile));
  const [warmupScheme, setWarmupScheme] = useState(s?.profile?.warmupScheme?.length ? s.profile.warmupScheme : DEFAULT_WARMUP_SCHEME);
  const [warmupSaving, setWarmupSaving] = useState(false);
  // Everything below mirrors a field originally only ever set once at
  // Onboarding (dob/height/training background/experience/muscle focus) —
  // pre-filled from whatever's already on the profile so re-opening
  // Settings shows the real current values, not blank inputs.
  const [dobVal, setDobVal] = useState(s?.profile?.dob || '');
  const [heightVal, setHeightVal] = useState(s?.profile?.heightCm ? String(Math.round(s.profile.heightCm)) : '');
  const [experienceLevel, setExperienceLevel] = useState(s?.profile?.experienceLevel || '');
  const [splitVal, setSplitVal] = useState(s?.profile?.trainingBackground?.split || '');
  const [usualSetsVal, setUsualSetsVal] = useState(s?.profile?.trainingBackground?.usualSets ?? '');
  const [usualRepsLowVal, setUsualRepsLowVal] = useState(s?.profile?.trainingBackground?.usualRepsLow ?? '');
  const [usualRepsHighVal, setUsualRepsHighVal] = useState(s?.profile?.trainingBackground?.usualRepsHigh ?? '');
  const [favoriteInputVal, setFavoriteInputVal] = useState('');
  const [favoritesVal, setFavoritesVal] = useState(s?.profile?.trainingBackground?.favoriteExercises || []);
  const [showMuscleFocus, setShowMuscleFocus] = useState(false);
  const [healthGuideOpen, setHealthGuideOpen] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  // Same "show the real connection state, not blank" fix as Onboarding's
  // Step 8 — Settings mounts fresh every time it's opened too.
  const [stravaStarted, setStravaStarted] = useState(() => !!s?.stravaConnected);
  const [hevyKeyMode, setHevyKeyMode] = useState(null);
  const [hevyKeyVal, setHevyKeyVal] = useState('');
  const [hevyKeySaved, setHevyKeySaved] = useState(() => !!s?.profile?.hevyApiKey);
  const [equipmentAvailable, setEquipmentAvailable] = useState(s?.profile?.equipmentAvailable || ['barbell', 'dumbbell', 'machine', 'cable']);
  const [savingEquipment, setSavingEquipment] = useState(false);
  // Plan Ahead calendar constraints (calendarSolver.js) — durable
  // preferences only; the day-by-day picks themselves are never stored.
  const [unavailableDaysOfWeek, setUnavailableDaysOfWeek] = useState(s?.profile?.unavailableDaysOfWeek || []);
  const [availableDaysOfWeek, setAvailableDaysOfWeek] = useState(s?.profile?.availableDaysOfWeek || []);
  const [weeklySessionTargetVal, setWeeklySessionTargetVal] = useState(s?.profile?.weeklySessionTarget ?? '');
  // Array.isArray guard: pre-multi-day accounts stored a single integer per
  // bucket, not an array — normalize on load rather than migrating stored data.
  const [splitDayAnchors, setSplitDayAnchors] = useState(() => {
    const raw = s?.profile?.splitDayAnchors || {};
    return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v : [v]]));
  });
  const [savingPlanConstraints, setSavingPlanConstraints] = useState(false);
  const [calendarWindows, setCalendarWindows] = useState([]);
  const [windowsLoading, setWindowsLoading] = useState(true);
  const [newWindowStart, setNewWindowStart] = useState('');
  const [newWindowEnd, setNewWindowEnd] = useState('');
  const [newWindowLevel, setNewWindowLevel] = useState('rest');
  const [newWindowEquipment, setNewWindowEquipment] = useState([]);
  const [newWindowReason, setNewWindowReason] = useState('');
  const [addingWindow, setAddingWindow] = useState(false);
  useEffect(() => {
    api('calendar-windows').then(data => { setCalendarWindows(data?.calendarWindows || []); setWindowsLoading(false); })
      .catch(() => setWindowsLoading(false));
  }, []);
  const [savingTargets, setSavingTargets] = useState(false);
  const [regenLoading, setRegenLoading] = useState(false);
  const [mergeFrom, setMergeFrom] = useState('');
  const [mergeTo, setMergeTo] = useState('');
  const [mergeStatus, setMergeStatus] = useState('');
  const [merging, setMerging] = useState(false);
  const [notifPermission, setNotifPermission] = useState(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );
  const [newSuppName, setNewSuppName] = useState('');
  const [newSuppDose, setNewSuppDose] = useState('');
  const [newSuppTiming, setNewSuppTiming] = useState('morning');
  const [savingSupp, setSavingSupp] = useState(false);
  const [sensMuscle, setSensMuscle] = useState(ALL_MUSCLES[0]);
  const [sensValue, setSensValue] = useState('1.0');
  const [savingSens, setSavingSens] = useState(false);
  const [newMemoryEntry, setNewMemoryEntry] = useState('');
  const [panelOrder, setPanelOrder] = useState(withNewDefaultsAppended(s?.profile?.panelOrder?.length ? s.profile.panelOrder : DEFAULT_PANEL_ORDER));
  const [hiddenPanels, setHiddenPanels] = useState(s?.profile?.hiddenPanels || []);
  const [microWidgetOrder, setMicroWidgetOrder] = useState(s?.profile?.microWidgetOrder?.length ? s.profile.microWidgetOrder : MICRO_WIDGET_IDS);
  const [hiddenMicroWidgets, setHiddenMicroWidgets] = useState(s?.profile?.hiddenMicroWidgets || []);
  const [recoveryTabOrder, setRecoveryTabOrder] = useState(s?.profile?.recoveryTabOrder?.length ? s.profile.recoveryTabOrder : DEFAULT_RECOVERY_TAB_ORDER);
  const [hiddenRecoveryTabs, setHiddenRecoveryTabs] = useState(s?.profile?.hiddenRecoveryTabs || []);

  // null (the default/"Auto" position) leaves the full-body auto-generator
  // detecting compound-vs-isolation leaning from the athlete's own last 90
  // days (see functions/fatigue.js's computeCompoundIsolationSplit) — this
  // slider only overrides that when explicitly moved off-center, same
  // "explicit choice always wins" rule as Preferred Split below.
  const compoundIsolationPref = s?.profile?.compoundIsolationPreference || null;
  const compoundIsolationVal = compoundIsolationPref === 'isolation' ? 0 : compoundIsolationPref === 'compound' ? 2 : 1;

  // Same explicit-setting-else-auto-detect pattern as compoundIsolationPref
  // above (functions/index.js's stableLeaning) — an account that mostly
  // logs machine/cable/smith work gets that reflected as the default going
  // forward.
  const stabilityPref = s?.profile?.stabilityPreference || null;
  const stabilityVal = stabilityPref === 'free' ? 0 : stabilityPref === 'stable' ? 2 : 1;

  const savePanels = async (order, hidden) => {
    setPanelOrder(order); setHiddenPanels(hidden);
    const profile = await api('profile', { method: 'POST', body: JSON.stringify({ panelOrder: order, hiddenPanels: hidden }) });
    refresh({ ...s, profile });
  };
  const applyLayoutPreset = async (preset) => {
    setPanelOrder(preset.order);
    // grid4 is the hand-verified exact layout for 4 columns (see
    // LAYOUT_PRESETS); other column counts have no hardcoded layout for
    // these presets, so clearing them lets the normal auto-placed default
    // fill in there instead — not a gap guarantee, just the same fallback
    // any other layout gets. gridLayoutVersion is what actually makes this
    // visible without a page reload — GridStack only reads positions once,
    // at mount, so DashboardGrid needs this in its key (see app render) to
    // know to remount rather than sit on whatever it already had live.
    const profile = await api('profile', {
      method: 'POST',
      body: JSON.stringify({
        panelOrder: preset.order, panelStates: preset.states,
        gridLayouts: { 4: preset.grid4 },
        gridLayoutVersion: (s?.profile?.gridLayoutVersion || 0) + 1,
      }),
    });
    refresh({ ...s, profile });
  };
  // Same regeneration path applyLayoutPreset uses (clear gridLayouts, let it
  // auto-place fresh) but keeping the current order/states — for re-packing
  // after a manual edit, not switching to a named preset.
  const resetGridLayout = async () => {
    const profile = await api('profile', { method: 'POST', body: JSON.stringify({ gridLayouts: {}, gridLayoutVersion: (s?.profile?.gridLayoutVersion || 0) + 1 }) });
    refresh({ ...s, profile });
  };
  const gridColumnModeVal = s?.profile?.gridColumnMode || 'auto';
  const saveGridColumnMode = async (mode) => {
    const profile = await api('profile', { method: 'POST', body: JSON.stringify({ gridColumnMode: mode }) });
    refresh({ ...s, profile });
  };
  const saveMicroWidgets = async (order, hidden) => {
    setMicroWidgetOrder(order); setHiddenMicroWidgets(hidden);
    const profile = await api('profile', { method: 'POST', body: JSON.stringify({ microWidgetOrder: order, hiddenMicroWidgets: hidden }) });
    refresh({ ...s, profile });
  };
  const expertiseLevel = normalizeExpertise(s?.profile?.expertiseLevel);
  const saveExpertiseLevel = async (lvl) => {
    const profile = await api('profile', { method: 'POST', body: JSON.stringify({ expertiseLevel: lvl }) });
    refresh({ ...s, profile });
  };
  const savePanelState = async (id, next) => {
    const merged = { ...(s?.profile?.panelStates || {}), [id]: next };
    const profile = await api('profile', { method: 'POST', body: JSON.stringify({ panelStates: merged }) });
    refresh({ ...s, profile });
  };
  const saveRecoveryTabs = async (order, hidden) => {
    setRecoveryTabOrder(order); setHiddenRecoveryTabs(hidden);
    const profile = await api('profile', { method: 'POST', body: JSON.stringify({ recoveryTabOrder: order, hiddenRecoveryTabs: hidden }) });
    refresh({ ...s, profile });
  };

  const SHORTCUT_URL = `${API_BASE}/shortcut`;
  const [syncUrl, setSyncUrl] = useState(SHORTCUT_URL);
  const [guideAdvanced, setGuideAdvanced] = useState(false);
  const [healthDevice, setHealthDevice] = useState(s?.profile?.healthDevice || '');
  const saveHealthDevice = async (key) => {
    setHealthDevice(key);
    const profile = await api('profile', { method: 'POST', body: JSON.stringify({ healthDevice: key }) });
    refresh({ ...s, profile });
  };
  const openHealthGuide = () => {
    setHealthGuideOpen(v => {
      const next = !v;
      if (next && syncUrl === SHORTCUT_URL) {
        api('sync-token', { method: 'POST' }).then(({ token }) => {
          if (token) setSyncUrl(`${SHORTCUT_URL}?token=${token}`);
        }).catch(() => {});
      }
      return next;
    });
  };
  const supplements = s?.supplements || [];
  const inputStyle = { width: '100%', border: 'none', borderBottom: '2px solid var(--ink)', padding: '8px 0', background: 'transparent', fontFamily: 'Times New Roman,serif', fontSize: 16, outline: 'none', color: 'var(--ink)', boxSizing: 'border-box' };

  const toggleTrackingCategory = async (key) => {
    const next = { ...trackingCategories, [key]: !trackingCategories[key] };
    setTrackingCategories(next);
    const profile = await api('profile', { method: 'POST', body: JSON.stringify({ trackingCategories: next }) });
    refresh({ ...s, profile });
  };

  const saveTargets = async () => {
    setSavingTargets(true);
    const profile = await api('profile', { method: 'POST', body: JSON.stringify({ sleepTarget, waterTarget, trainingDaysPerWeek: trainingDays, waterActivityLevel, waterHotClimate }) });
    setSavingTargets(false);
    refresh({ ...s, profile });
  };

  // Warmup ramp: an ordered list of {reps, pct} steps, applied to every
  // auto-generated session's warmup sets (functions/progression.js). Saved
  // as one array, not per-field, since the steps only make sense together —
  // there's no per-step save button, just one Save for the whole scheme.
  const saveWarmupScheme = async (scheme) => {
    setWarmupScheme(scheme);
    setWarmupSaving(true);
    const profile = await api('profile', { method: 'POST', body: JSON.stringify({ warmupScheme: scheme }) });
    setWarmupSaving(false);
    refresh({ ...s, profile });
  };
  const updateWarmupStep = (i, field, value) => {
    const next = warmupScheme.map((step, j) => j !== i ? step : { ...step, [field]: +value || 0 });
    setWarmupScheme(next);
  };
  const addWarmupStep = () => setWarmupScheme([...warmupScheme, { reps: 5, pct: 50 }]);
  const removeWarmupStep = (i) => setWarmupScheme(warmupScheme.filter((_, j) => j !== i));

  const addSupplement = async () => {
    if (!newSuppName.trim()) return;
    setSavingSupp(true);
    const name = newSuppName.trim(), dose = newSuppDose.trim(), timing = newSuppTiming;
    await api('supplements', { method: 'POST', body: JSON.stringify({ name, dose, timing }) });
    setNewSuppName(''); setNewSuppDose('');
    setSavingSupp(false);
    const entry = { name, dose, timing, notes: '' };
    const existing = supplements.findIndex(sp => sp.name.toLowerCase() === name.toLowerCase());
    const nextSupplements = existing >= 0 ? supplements.map((sp, i) => i === existing ? entry : sp) : [...supplements, entry];
    refresh({ ...s, supplements: nextSupplements });
  };

  const deleteSupp = async (name) => {
    await api(`supplements/${encodeURIComponent(name)}`, { method: 'DELETE' });
    refresh({ ...s, supplements: supplements.filter(sp => sp.name !== name) });
  };

  // mentorMemory lives on the profile (not a dedicated collection like
  // supplements) — it's automatically maintained by the Personal Journalist
  // itself turn to turn (see functions/index.js's /mentor), this is just a
  // manual override on the same field.
  const mentorMemory = s?.profile?.mentorMemory || [];
  const saveMentorMemory = async (next) => {
    const profile = await api('profile', { method: 'POST', body: JSON.stringify({ mentorMemory: next }) });
    refresh({ ...s, profile });
  };
  const addMemoryEntry = () => {
    const text = newMemoryEntry.trim();
    if (!text) return;
    setNewMemoryEntry('');
    saveMentorMemory([...mentorMemory, text]);
  };
  const removeMemoryEntry = (i) => saveMentorMemory(mentorMemory.filter((_, j) => j !== i));

  const saveName = async () => {
    if (nameVal === (s?.profile?.name || '')) return;
    setNameSaving(true);
    setNameError('');
    try {
      const profile = await api('profile', { method: 'POST', body: JSON.stringify({ name: nameVal }), throwOnError: true });
      refresh({ ...s, profile });
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 2000);
    } catch (e) {
      setNameError(`Save failed: ${e.message}`);
    }
    setNameSaving(false);
  };

  // username/displayName go through /account/username, not the generic
  // /profile save — that's the only endpoint that runs the uniqueness
  // transaction and the monthly rate-limit check (see functions/index.js).
  const usernameChangePending = usernameVal !== (s?.profile?.username || '');
  const usernameCooldownActive = usernameChangePending && !!s?.profile?.username
    && !canChangeUsername(s?.profile?.lastUsernameChangeAt);
  const usernameCooldownUntil = usernameCooldownActive ? usernameChangeAvailableAt(s?.profile?.lastUsernameChangeAt) : null;
  const saveUsername = async () => {
    const changed = usernameVal !== (s?.profile?.username || '') || displayNameVal !== (s?.profile?.displayName || '');
    if (!changed) return;
    const uErr = validateUsername(usernameVal);
    const dErr = validateDisplayName(displayNameVal);
    if (uErr) { setUsernameError(uErr); return; }
    if (dErr) { setUsernameError(dErr); return; }
    setUsernameSaving(true);
    setUsernameError('');
    try {
      const r = await api('account/username', { method: 'POST', body: JSON.stringify({ username: usernameVal, displayName: displayNameVal }) });
      if (r.error) {
        setUsernameError(r.error);
      } else {
        refresh({ ...s, profile: { ...s.profile, username: r.username, displayName: r.displayName, lastUsernameChangeAt: r.username !== (s?.profile?.username || '') ? new Date().toISOString() : s?.profile?.lastUsernameChangeAt } });
        setUsernameSaved(true);
        setTimeout(() => setUsernameSaved(false), 2000);
      }
    } catch (e) {
      setUsernameError(`Save failed: ${e.message}`);
    }
    setUsernameSaving(false);
  };

  const saveDob = () => {
    if (dobVal === (s?.profile?.dob || '')) return;
    const age = dobVal ? Math.floor((Date.now() - new Date(dobVal)) / (365.25 * 24 * 3600 * 1000)) : null;
    api('profile', { method: 'POST', body: JSON.stringify({ dob: dobVal || undefined, age }) }).then(profile => refresh({ ...s, profile }));
  };
  const saveHeight = () => {
    const cm = parseFloat(heightVal);
    if (!cm || cm === s?.profile?.heightCm) return;
    api('profile', { method: 'POST', body: JSON.stringify({ heightCm: cm }) }).then(profile => refresh({ ...s, profile }));
  };
  // Sends returningBreakWeeks alongside experienceLevel in the same request
  // when switching to "Returning after a break" — the backend only
  // seeds/reseeds the atrophy estimate (functions/goalsAndActivities.js's
  // seedReturningAthleteAtrophy) when both arrive together.
  const saveExperienceLevel = (lvl) => {
    setExperienceLevel(lvl);
    const body = { experienceLevel: lvl };
    if (lvl === 'Returning after a break' && returningBreakWeeksVal) body.returningBreakWeeks = parseFloat(returningBreakWeeksVal);
    api('profile', { method: 'POST', body: JSON.stringify(body) }).then(profile => refresh({ ...s, profile }));
  };
  const saveTrainingBackground = (patch) => {
    const trainingBackground = { split: splitVal || undefined, usualSets: usualSetsVal ? parseInt(usualSetsVal) : undefined, usualRepsLow: usualRepsLowVal ? parseInt(usualRepsLowVal) : undefined, usualRepsHigh: usualRepsHighVal ? parseInt(usualRepsHighVal) : undefined, favoriteExercises: favoritesVal, ...patch };
    api('profile', { method: 'POST', body: JSON.stringify({ trainingBackground }) }).then(profile => refresh({ ...s, profile }));
  };
  const addFavorite = () => {
    const name = favoriteInputVal.trim();
    if (!name || favoritesVal.includes(name)) return;
    const next = [...favoritesVal, name];
    setFavoritesVal(next);
    setFavoriteInputVal('');
    saveTrainingBackground({ favoriteExercises: next });
  };
  const removeFavorite = (name) => {
    const next = favoritesVal.filter(f => f !== name);
    setFavoritesVal(next);
    saveTrainingBackground({ favoriteExercises: next });
  };

  const muscleFocusMap = s?.profile?.muscleFocus || {};
  const showNicheMuscles = !!s?.profile?.showNicheMuscles;
  const saveMuscleFocusValue = (muscle, val) => {
    const next = { ...muscleFocusMap };
    if (val === 'normal') delete next[muscle]; else next[muscle] = val;
    api('profile', { method: 'POST', body: JSON.stringify({ muscleFocus: withHipFlexorDefault(next, showNicheMuscles) }) }).then(profile => refresh({ ...s, profile }));
  };
  const saveShowNicheMuscles = (val) => {
    const body = { showNicheMuscles: val };
    if (!val) body.muscleFocus = withHipFlexorDefault(muscleFocusMap, val);
    api('profile', { method: 'POST', body: JSON.stringify(body) }).then(profile => refresh({ ...s, profile }));
  };
  const saveGroupFocusValue = (group, val) => {
    const next = { ...muscleFocusMap };
    for (const m of group.muscles) { if (val === 'normal') delete next[m]; else next[m] = val; }
    api('profile', { method: 'POST', body: JSON.stringify({ muscleFocus: withHipFlexorDefault(next, showNicheMuscles) }) }).then(profile => refresh({ ...s, profile }));
  };

  const setMuscleSensitivity = async (muscle, value) => {
    setSavingSens(true);
    await api('muscle-sensitivity', { method: 'PUT', body: JSON.stringify({ muscle, value }) });
    setSavingSens(false);
    refresh({ ...s, muscleSensitivity: { ...(s?.muscleSensitivity || {}), [muscle]: value } });
  };

  const enableNotifications = async () => {
    if (typeof Notification === 'undefined') return;
    const perm = await Notification.requestPermission();
    setNotifPermission(perm);
    if (perm !== 'granted') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      const keyRes = await api('push/vapid-public-key');
      if (!keyRes.key) return;
      const urlBase64ToUint8Array = b64 => {
        const padding = '='.repeat((4 - b64.length % 4) % 4);
        const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
      };
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyRes.key),
      });
      await api('push/subscribe', { method: 'POST', body: JSON.stringify({ subscription: sub }) });
    } catch {}
  };

  // ── Social: search, follow requests, profile view ──────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [viewingUsername, setViewingUsername] = useState(null);
  const [comparingUsername, setComparingUsername] = useState(null);
  const [viewedProfile, setViewedProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [followingPending, setFollowingPending] = useState({}); // username -> true, while a request is in flight/sent this session
  const visibility = s?.profile?.visibility || {};
  const workoutSessionsVisible = visibility.workoutSessions !== false;
  const comparisonVisible = visibility.comparison === true;
  // Separate opt-in from workoutSessions above, off by default even when
  // that one is already on — a persistent feed of everything you log is a
  // bigger exposure step than a single session someone has to visit your
  // profile to see (FEATURES.md #144).
  const feedVisible = visibility.feed === true;

  const runSearch = (q) => {
    setSearchQuery(q);
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    api(`account/search?prefix=${encodeURIComponent(q.trim())}`)
      .then(r => setSearchResults(r.results || []))
      .catch(() => {})
      .finally(() => setSearching(false));
  };

  const openProfile = (username) => {
    setViewingUsername(username);
    setViewedProfile(null);
    setProfileLoading(true);
    api(`account/${encodeURIComponent(username)}`)
      .then(r => setViewedProfile(r))
      .catch(() => setViewedProfile({ error: true }))
      .finally(() => setProfileLoading(false));
  };

  const sendFollowRequest = async (username) => {
    setFollowingPending(p => ({ ...p, [username]: true }));
    try {
      await api('follow-request', { method: 'POST', body: JSON.stringify({ toUsername: username }) });
    } catch {
      setFollowingPending(p => ({ ...p, [username]: false }));
    }
  };

  const acceptFollowRequest = async (fromUid) => {
    await api(`follow-requests/${fromUid}/accept`, { method: 'POST' });
    reloadFollowBadge?.();
  };

  const ackAccepted = async () => {
    await api('follow-requests/ack-accepted', { method: 'POST' });
    reloadFollowBadge?.();
  };

  const saveVisibility = async (patch) => {
    const profile = await api('profile', { method: 'POST', body: JSON.stringify({ visibility: { workoutSessions: workoutSessionsVisible, comparison: comparisonVisible, feed: feedVisible, ...patch } }) });
    refresh({ ...s, profile });
  };

  // ── Training Goals editor (GOAL_DEFS, FEATURES.md #21) — previously only
  // ever set once, during Onboarding step 2, with no way to revisit it
  // afterward (S8's Goals panel has pointed at "Settings → Profile &
  // Training" for this the whole time, with nothing there to find). Local
  // draft + explicit save rather than autosaving every click, same as Plan
  // Ahead Constraints above — a concrete goal mid-edit (target typed,
  // targetDate not yet) would otherwise round-trip straight into
  // validateGoals' rejection.
  const [goalsDraft, setGoalsDraft] = useState(s?.profile?.goals || []);
  const [savingGoals, setSavingGoals] = useState(false);
  const [goalsError, setGoalsError] = useState('');
  const goalDraftFor = key => goalsDraft.find(g => g.type === key);
  const toggleGoalDraft = key => setGoalsDraft(gs => gs.some(g => g.type === key)
    ? gs.filter(g => g.type !== key) : [...gs, { type: key, priority: 'secondary', concrete: false }]);
  const updateGoalDraft = (key, patch) => setGoalsDraft(gs => gs.map(g => g.type === key ? { ...g, ...patch } : g));
  const saveGoalsDraft = async () => {
    setSavingGoals(true);
    setGoalsError('');
    try {
      const profile = await api('profile', { method: 'POST', body: JSON.stringify({ goals: buildGoalsPayload(goalsDraft) }), throwOnError: true });
      refresh({ ...s, profile });
    } catch {
      setGoalsError('Save failed — check every concrete goal has a target and date, then try again.');
    }
    setSavingGoals(false);
  };

  // ── Activities editor (ACTIVITY_DEFS, FEATURES.md #24) — same gap as
  // Training Goals above, same local-draft-plus-save pattern.
  const [activitiesDraft, setActivitiesDraft] = useState(s?.profile?.activities || []);
  const [savingActivities, setSavingActivities] = useState(false);
  const activityDraftFor = key => activitiesDraft.find(a => a.type === key);
  const toggleActivityDraft = key => setActivitiesDraft(as => as.some(a => a.type === key)
    ? as.filter(a => a.type !== key) : [...as, { type: key, priority: 'secondary' }]);
  const updateActivityDraft = (key, patch) => setActivitiesDraft(as => as.map(a => a.type === key ? { ...a, ...patch } : a));
  const saveActivitiesDraft = async () => {
    setSavingActivities(true);
    const profile = await api('profile', { method: 'POST', body: JSON.stringify({ activities: activitiesDraft.map(({ type, priority }) => ({ type, priority })) }) });
    refresh({ ...s, profile });
    setSavingActivities(false);
  };

  // ── Macro Targets — a calorie stepper (the only thing that sets the
  // total; nothing here derives it from bodyweight anymore) plus a
  // protein/carbs/fat split, always editable via the sliders below.
  // MACRO_SPLIT_PRESETS just fills the sliders with a named ratio — same as
  // dragging them by hand, doesn't touch macroCals. Everything commits
  // together via /macro-targets on Save (already existed server-side with
  // no frontend calling it).
  const [macroCals, setMacroCals] = useState(s?.profile?.macroTargets?.calories || 2400);
  const [macroSplit, setMacroSplit] = useState(() => macroSplitFromTargets(s?.profile?.macroTargets));
  const [savingMacros, setSavingMacros] = useState(false);
  const macroGrams = macroGramsFromSplit(macroSplit, macroCals);
  const applySplitPreset = (preset) => {
    setMacroSplit(preset.split);
    // Human-readable label, best-effort — Atlas's post-session prompt
    // (functions/index.js) reads profile.goal as free text with a 'build
    // muscle' fallback. Fire-and-forget: it's just AI context, not worth
    // blocking the slider fill on.
    api('profile', { method: 'POST', body: JSON.stringify({ goal: preset.label }) }).then(profile => refresh({ ...s, profile })).catch(() => {});
  };
  const saveMacros = async () => {
    setSavingMacros(true);
    const targets = await api('macro-targets', { method: 'POST', body: JSON.stringify({ calories: macroCals, ...macroGrams }) });
    setSavingMacros(false);
    refresh({ ...s, macroTargets: targets, macroMode: 'manual' });
  };

  // returningBreakWeeks: only meaningful alongside experienceLevel
  // "Returning after a break" (see functions/goalsAndActivities.js's
  // seedReturningAthleteAtrophy) — Settings previously didn't offer that
  // experience option at all, so there was no way to reach this after
  // Onboarding. Sent together with experienceLevel in one request, same as
  // Onboarding's saveTrainingBackground, since the backend only seeds/reseeds the
  // atrophy estimate when both arrive together.
  const [returningBreakWeeksVal, setReturningBreakWeeksVal] = useState(s?.profile?.returningBreakWeeks ?? '');
  const saveReturningBreakWeeks = () => {
    if (!returningBreakWeeksVal) return;
    api('profile', { method: 'POST', body: JSON.stringify({ experienceLevel: 'Returning after a break', returningBreakWeeks: parseFloat(returningBreakWeeksVal) }) })
      .then(profile => refresh({ ...s, profile }));
  };

  // ── Wiki-style left TOC — every group stays permanently expanded (no more
  // <details> accordion swallowing content), so the body is one continuous
  // document you can still just scroll top to bottom by hand; the TOC is a
  // shortcut on top of that, not a replacement for it. Accepted/Follow
  // Requests only appear here when their section will actually render
  // (below, in Social), so a link never points at nothing.
  const tocGroups = [
    { id: 'sec-grp-profile', label: 'Profile & Training', subs: [
      { id: 'sec-identity', label: 'Identity' },
      { id: 'sec-training-goals', label: 'Training Goals' },
      { id: 'sec-activities', label: 'Activities' },
      { id: 'sec-calorie-target', label: 'Calorie Target' },
      { id: 'sec-macro-split', label: 'Macro Split' },
      { id: 'sec-tracking-level', label: 'Tracking Level' },
      { id: 'sec-training-preferences', label: 'Training Preferences' },
      { id: 'sec-training-background', label: 'Training Background' },
      { id: 'sec-appearance', label: 'Appearance' },
      { id: 'sec-mentor-memory', label: 'Personal Journalist' },
    ] },
    { id: 'sec-grp-social', label: 'Social', subs: [
      ...(followBadge?.recentlyAccepted?.length > 0 ? [{ id: 'sec-accepted', label: 'Accepted' }] : []),
      ...(followBadge?.incoming?.length > 0 ? [{ id: 'sec-follow-requests', label: 'Follow Requests' }] : []),
      { id: 'sec-find-people', label: 'Find People' },
      { id: 'sec-visibility', label: 'Visibility' },
    ] },
    { id: 'sec-grp-layout', label: 'Dashboard Layout', subs: [
      { id: 'sec-presets', label: 'Presets' },
      { id: 'sec-panel-grid', label: 'Panel Grid' },
      { id: 'sec-home-order', label: 'Home Screen Order' },
      { id: 'sec-micro-widgets', label: 'Micro-Widgets' },
      { id: 'sec-recovery-tab-order', label: 'Recovery Tab Order' },
    ] },
    { id: 'sec-grp-targets', label: 'Targets & Nutrition', subs: [
      { id: 'sec-targets', label: 'Targets' },
      { id: 'sec-warmup-ramp', label: 'Warmup Ramp' },
      { id: 'sec-equipment', label: 'Equipment' },
      { id: 'sec-plan-constraints', label: 'Plan Ahead — Constraints' },
      { id: 'sec-plan-holidays', label: 'Plan Ahead — Holidays' },
      { id: 'sec-nutrition', label: 'Nutrition' },
    ] },
    { id: 'sec-grp-connected', label: 'Connected Data', subs: [
      { id: 'sec-connected-services', label: 'Connected Services' },
      { id: 'sec-supplement-stack', label: 'Supplement Stack' },
      { id: 'sec-muscle-sensitivity', label: 'Muscle Sensitivity' },
    ] },
    { id: 'sec-grp-tools', label: 'Tools', subs: [
      { id: 'sec-app', label: 'App' },
      { id: 'sec-data-export', label: 'Data Export' },
      { id: 'sec-merge-exercises', label: 'Merge Exercises' },
      { id: 'sec-learn', label: 'Learn' },
    ] },
    { id: 'sec-grp-account', label: 'Account', subs: [] },
    { id: 'sec-grp-whatsnew', label: "What's New", subs: [] },
  ];

  const settingsBodyRef = useRef(null);
  const [activeSecId, setActiveSecId] = useState(tocGroups[0].subs[0]?.id || tocGroups[0].id);
  const jumpToSection = (id) => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  };
  // Scrollspy: highlights whichever section is currently nearest the top of
  // the body as you scroll by hand — cosmetic only, jumpToSection above
  // never depends on this having run. Only observes the ids the TOC
  // actually links to (a group's subs, or the group itself when it has
  // none) — mixing those in with the tall group-wrapper elements too would
  // make a wrapper whose top scrolled off-screen ages ago outrank the sub
  // section genuinely at the top edge, since "intersecting" only means any
  // overlap with the top-30% band, not being closest to it.
  useEffect(() => {
    const root = settingsBodyRef.current;
    if (!root) return;
    const ids = tocGroups.flatMap(g => g.subs.length ? g.subs.map(sub => sub.id) : [g.id]);
    const targets = ids.map(id => document.getElementById(id)).filter(Boolean);
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setActiveSecId(visible[0].target.id);
    }, { root, rootMargin: '0px 0px -70% 0px', threshold: 0 });
    targets.forEach(t => observer.observe(t));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="settings-overlay" id="settings">
      <div className="settings-hdr" data-tour="settings-header">
        <div className="settings-hdr-title">Settings</div>
        <button className="settings-close" onClick={onClose}>Close ×</button>
      </div>
      <div className="settings-layout">
        <nav className="settings-toc" aria-label="Settings sections" data-tour="settings-toc">
          {tocGroups.map(grp => (
            <div key={grp.id} className="settings-toc-group">
              <button type="button"
                className={`settings-toc-group-h${grp.id === activeSecId || grp.subs.some(sub => sub.id === activeSecId) ? ' active' : ''}`}
                onClick={() => jumpToSection(grp.id)}>
                {grp.label}
              </button>
              {grp.subs.map(sub => (
                <button key={sub.id} type="button" className={`settings-toc-sub${sub.id === activeSecId ? ' active' : ''}`}
                  onClick={() => jumpToSection(sub.id)}>
                  {sub.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="settings-body" ref={settingsBodyRef}>

        <div className="settings-group" id="sec-grp-profile">
        <button type="button" className="settings-group-h" onClick={() => jumpToSection('sec-grp-profile')}>Profile &amp; Training</button>
        {/* ── IDENTITY ── */}
        <div className="settings-sec" id="sec-identity" data-tour="settings-identity">
          <div className="settings-sh">Identity</div>
          <div className="prof-field">
            <span className="prof-lbl">Name</span>
            <div style={{ display: 'flex', gap: 6, flex: 1, minWidth: 0 }}>
              <input className="prof-input" value={nameVal} onChange={e => { setNameVal(e.target.value); setNameError(''); }}
                onBlur={saveName} placeholder="Your name" style={{ flex: 1, minWidth: 0 }} />
              <button className="prof-btn" onClick={saveName} disabled={nameSaving || nameVal === (s?.profile?.name || '')}>
                {nameSaving ? 'Saving…' : nameSaved ? '✓ Saved' : 'Save'}
              </button>
            </div>
          </div>
          {nameError && <div style={{ fontSize: 9, fontFamily: "'JetBrains Mono',monospace", color: 'var(--red)', marginTop: -8, marginBottom: 8 }}>{nameError}</div>}
          <div className="prof-field">
            <span className="prof-lbl">Display name <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 9, color: 'var(--dim)' }}>(only your first name is shown to others)</span></span>
            <div style={{ display: 'flex', gap: 6, flex: 1, minWidth: 0 }}>
              <input className="prof-input" value={displayNameVal} maxLength={30}
                onChange={e => { setDisplayNameVal(e.target.value); setUsernameError(''); }}
                placeholder="Your name" style={{ flex: 1, minWidth: 0 }} />
            </div>
          </div>
          <div className="prof-field">
            <span className="prof-lbl">Username</span>
            <div style={{ display: 'flex', gap: 6, flex: 1, minWidth: 0 }}>
              <input className="prof-input" value={usernameVal} maxLength={USERNAME_MAX}
                onChange={e => { setUsernameVal(normalizeUsername(e.target.value)); setUsernameError(''); }}
                placeholder="lowercase-letters-numbers-hyphens" autoCapitalize="none" autoCorrect="off"
                style={{ flex: 1, minWidth: 0 }} />
              <button className="prof-btn" onClick={saveUsername}
                disabled={usernameSaving || (usernameVal === (s?.profile?.username || '') && displayNameVal === (s?.profile?.displayName || '')) || usernameCooldownActive}>
                {usernameSaving ? 'Saving…' : usernameSaved ? '✓ Saved' : 'Save'}
              </button>
            </div>
          </div>
          {usernameCooldownActive && (
            <div style={{ fontSize: 9, fontFamily: "'JetBrains Mono',monospace", color: 'var(--dim)', marginTop: -8, marginBottom: 8 }}>
              Username can only be changed once a month — next change available {usernameCooldownUntil ? new Date(usernameCooldownUntil).toLocaleDateString() : 'soon'}. Display name has no such limit.
            </div>
          )}
          {usernameError && <div style={{ fontSize: 9, fontFamily: "'JetBrains Mono',monospace", color: 'var(--red)', marginTop: -8, marginBottom: 8 }}>{usernameError}</div>}
          <div className="prof-field">
            <span className="prof-lbl">Sex <span style={{ fontSize: 8, color: 'var(--dim)', textTransform: 'none' }}>(for strength standards)</span></span>
            <div style={{ display: 'flex', gap: 6 }}>
              {['male','female'].map(sx => (
                <button key={sx} className="prof-btn"
                  onClick={() => {
                    refresh({ ...s, profile: { ...s.profile, sex: sx } });
                    api('profile', { method: 'POST', body: JSON.stringify({ sex: sx }) }).then(profile => refresh({ ...s, profile }));
                  }}
                  style={{ textTransform: 'capitalize', ...(s?.profile?.sex === sx ? { background: 'var(--ink)', color: 'var(--paper)', borderColor: 'var(--ink)' } : {}) }}>
                  {sx}
                </button>
              ))}
            </div>
          </div>
          <div className="prof-field">
            <span className="prof-lbl">Date of Birth</span>
            <input className="prof-input" type="date" value={dobVal} onChange={e => setDobVal(e.target.value)} onBlur={saveDob} style={{ flex: 1, minWidth: 0 }} />
          </div>
          <div className="prof-field">
            <span className="prof-lbl">Height <span style={{ fontSize: 8, color: 'var(--dim)', textTransform: 'none' }}>(cm)</span></span>
            <input className="prof-input" type="number" inputMode="decimal" value={heightVal} onChange={e => setHeightVal(e.target.value)} onBlur={saveHeight}
              placeholder="e.g. 180" style={{ flex: 1, minWidth: 0, maxWidth: 80 }} />
          </div>
          {s?.profile?.sex === 'female' && (
            <>
              <div className="prof-field">
                <span className="prof-lbl">Cycle-Aware Recovery <span style={{ fontSize: 8, color: 'var(--dim)', textTransform: 'none' }}>(manual period logging, no predictions)</span></span>
                <button className="prof-btn" onClick={() => {
                    const cycleTrackingEnabled = !s?.profile?.cycleTrackingEnabled;
                    refresh({ ...s, profile: { ...s.profile, cycleTrackingEnabled } });
                    api('profile', { method: 'POST', body: JSON.stringify({ cycleTrackingEnabled }) });
                  }}
                  style={s?.profile?.cycleTrackingEnabled ? { background: 'var(--ink)', color: 'var(--paper)', borderColor: 'var(--ink)' } : {}}>
                  {s?.profile?.cycleTrackingEnabled ? 'On' : 'Off'}
                </button>
              </div>
              {s?.profile?.cycleTrackingEnabled && (
                <div className="prof-field">
                  <span className="prof-lbl">I have an irregular cycle <span style={{ fontSize: 8, color: 'var(--dim)', textTransform: 'none' }}>(calibration only applies while a period is actively logged, not estimated between periods)</span></span>
                  <button className="prof-btn" onClick={() => {
                      const cycleIrregular = !s?.profile?.cycleIrregular;
                      refresh({ ...s, profile: { ...s.profile, cycleIrregular } });
                      api('profile', { method: 'POST', body: JSON.stringify({ cycleIrregular }) });
                    }}
                    style={s?.profile?.cycleIrregular ? { background: 'var(--ink)', color: 'var(--paper)', borderColor: 'var(--ink)' } : {}}>
                    {s?.profile?.cycleIrregular ? 'On' : 'Off'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── TRAINING GOALS ── */}
        <div className="settings-sec" id="sec-training-goals">
          <div className="settings-sh">Training Goals <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 9, color: 'var(--dim)' }}>(shown on the Goals panel, tracked against real data where Press has it)</span></div>
          {GOAL_DEFS.map(gd => {
            const g = goalDraftFor(gd.key);
            const metrics = GOAL_METRIC_OPTIONS[gd.key];
            const metricDef = metrics?.find(m => m.value === g?.metric);
            return (
              <div key={gd.key} style={{ marginBottom: 10 }}>
                <button className={`ob-goal-card${g ? ' selected' : ''}`} style={{ width: '100%' }} onClick={() => toggleGoalDraft(gd.key)}>
                  <div className="ob-goal-card-title">{gd.label}</div>
                  <div className="ob-goal-card-desc">{gd.desc}</div>
                </button>
                {g && (
                  <div style={{ padding: '10px 12px', border: '1px solid var(--rule)', borderTop: 'none' }}>
                    <div className="ob-label" style={{ marginTop: 0 }}>Priority</div>
                    <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
                      {GOAL_PRIORITIES.map(p => (
                        <button key={p.value} className={`prof-btn${g.priority === p.value ? ' solid' : ''}`} onClick={() => updateGoalDraft(gd.key, { priority: p.value })}>{p.label}</button>
                      ))}
                    </div>

                    <div className="ob-label">Target</div>
                    <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
                      <button className={`prof-btn${!g.concrete ? ' solid' : ''}`} onClick={() => updateGoalDraft(gd.key, { concrete: false })}>No specific target</button>
                      <button className={`prof-btn${g.concrete ? ' solid' : ''}`} onClick={() => updateGoalDraft(gd.key, { concrete: true })}>Set a target</button>
                    </div>

                    {g.concrete && (
                      <>
                        {metrics && (
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
                            {metrics.map(m => (
                              <button key={m.value} className={`prof-btn${g.metric === m.value ? ' solid' : ''}`} onClick={() => updateGoalDraft(gd.key, { metric: m.value })}>{m.label}</button>
                            ))}
                          </div>
                        )}
                        {g.metric === 'lift' && (
                          <input style={{ ...inputStyle, marginBottom: 10 }} placeholder="Exercise, e.g. Barbell Bench Press" autoComplete="off"
                            value={g.exercise || ''} onChange={e => updateGoalDraft(gd.key, { exercise: e.target.value })} />
                        )}
                        {g.metric === 'benchmark' && (
                          <input style={{ ...inputStyle, marginBottom: 10 }} placeholder="What, e.g. 5k" autoComplete="off"
                            value={g.benchmarkLabel || ''} onChange={e => updateGoalDraft(gd.key, { benchmarkLabel: e.target.value })} />
                        )}
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 4 }}>
                          {metrics ? (
                            <input style={{ ...inputStyle, flex: 1, width: 'auto' }} type="number" inputMode="decimal" autoComplete="off"
                              placeholder={`Target${metricDef?.unit ? ` (${metricDef.unit})` : ''}`} value={g.target || ''} onChange={e => updateGoalDraft(gd.key, { target: e.target.value })} />
                          ) : (
                            <input style={{ ...inputStyle, flex: 1, width: 'auto' }} placeholder="Target, e.g. sub-25min 5k" autoComplete="off"
                              value={g.target || ''} onChange={e => updateGoalDraft(gd.key, { target: e.target.value })} />
                          )}
                          <input style={{ ...inputStyle, flex: 1, width: 'auto' }} type="date" value={g.targetDate || ''} onChange={e => updateGoalDraft(gd.key, { targetDate: e.target.value })} />
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {goalsError && <div style={{ fontSize: 9, fontFamily: "'JetBrains Mono',monospace", color: 'var(--red)', marginBottom: 8 }}>{goalsError}</div>}
          <button className="prof-btn solid" style={{ fontSize: 10, padding: '6px 12px' }}
            onClick={saveGoalsDraft} disabled={savingGoals}>
            {savingGoals ? 'Saving…' : 'Save Training Goals'}
          </button>
        </div>

        {/* ── ACTIVITIES ── */}
        <div className="settings-sec" id="sec-activities">
          <div className="settings-sh">Activities <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 9, color: 'var(--dim)' }}>(sets default weekly session targets, blended across whatever's ranked Primary/Secondary/Minor)</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {ACTIVITY_DEFS.map(ad => {
              const a = activityDraftFor(ad.key);
              return (
                <div key={ad.key}>
                  <button className={`ob-goal-card${a ? ' selected' : ''}`} style={{ width: '100%' }} onClick={() => toggleActivityDraft(ad.key)}>
                    <div className="ob-goal-card-title">{ad.label}</div>
                  </button>
                  {a && (
                    <div style={{ padding: '10px 12px', border: '1px solid var(--rule)', borderTop: 'none', display: 'flex', gap: 4 }}>
                      {GOAL_PRIORITIES.map(p => (
                        <button key={p.value} className={`prof-btn${a.priority === p.value ? ' solid' : ''}`} onClick={() => updateActivityDraft(ad.key, { priority: p.value })}>{p.label}</button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <button className="prof-btn solid" style={{ fontSize: 10, padding: '6px 12px' }}
            onClick={saveActivitiesDraft} disabled={savingActivities}>
            {savingActivities ? 'Saving…' : 'Save Activities'}
          </button>
        </div>

        {/* ── CALORIE TARGET ── */}
        <div className="settings-sec" id="sec-calorie-target">
          <div className="settings-sh">Calorie Target</div>
          <div className="ob-stepper" style={{ margin: '8px 0 4px' }}>
            <button className="ob-stepper-btn" onClick={() => setMacroCals(v => Math.max(1200, v - 50))}>−</button>
            <div className="ob-stepper-val">{macroCals}<span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 12, color: 'var(--dim)', fontWeight: 400 }}> kcal</span></div>
            <button className="ob-stepper-btn" onClick={() => setMacroCals(v => Math.min(5000, v + 50))}>+</button>
          </div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)' }}>Saved together with the macro split below.</div>
        </div>

        {/* ── MACRO SPLIT ── */}
        <div className="settings-sec" id="sec-macro-split">
          <div className="settings-sh">Macro Split <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 9, color: 'var(--dim)' }}>(protein/carb/fat, at the calorie target above)</span></div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {MACRO_SPLIT_PRESETS.map(p => (
              <button key={p.key} className="prof-btn" onClick={() => applySplitPreset(p)}>{p.label}</button>
            ))}
          </div>

          {/* Segmented split bar — protein/carbs/fat proportional widths, same colors S4's macro rows already use. */}
          <div style={{ display: 'flex', height: 10, width: '100%', overflow: 'hidden', border: '1px solid var(--rule)' }}>
            <div style={{ width: `${macroSplit.protein}%`, background: 'var(--navy)' }} />
            <div style={{ width: `${macroSplit.carbs}%`, background: 'var(--forest)' }} />
            <div style={{ width: `${macroSplit.fat}%`, background: 'var(--ember)' }} />
          </div>

          {[
            ['Protein', 'protein', 'var(--navy)'],
            ['Carbs', 'carbs', 'var(--forest)'],
            ['Fat', 'fat', 'var(--ember)'],
          ].map(([label, key, color]) => (
            <div key={key} className="prof-field">
              <span className="prof-lbl" style={{ color }}>{label}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="range" min={0} max={100} step={1} value={macroSplit[key]}
                  onChange={e => setMacroSplit(sp => adjustMacroSplit(sp, key, +e.target.value))}
                  style={{ flex: 1, accentColor: color }} />
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--ink)', minWidth: 84, textAlign: 'right' }}>
                  {macroSplit[key]}% · {macroGrams[key]}g
                </span>
              </div>
            </div>
          ))}
          <button className="prof-btn solid" style={{ padding: '7px 20px', marginTop: 4 }}
            onClick={saveMacros} disabled={savingMacros}>
            {savingMacros ? 'Saving…' : 'Save Macro Targets'}
          </button>
        </div>

        {/* ── TRAINING PREFERENCES ── */}
        <div className="settings-sec" id="sec-training-preferences">
          <div className="settings-sh">Training Preferences <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 9, color: 'var(--dim)' }}>(shape auto-generated sessions)</span></div>
          <div className="prof-field">
            <span className="prof-lbl">Preferred Split <span style={{ fontSize: 8, color: 'var(--dim)', textTransform: 'none' }}>(shapes full-body auto-generated sessions)</span></span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {['Full Body', 'Upper / Lower', 'Push / Pull / Legs', 'Arnold Split', 'PPL Arnold'].map(sp => (
                <button key={sp} className="prof-btn"
                  onClick={() => {
                    refresh({ ...s, profile: { ...s.profile, preferredSplit: sp } });
                    api('profile', { method: 'POST', body: JSON.stringify({ preferredSplit: sp }) }).then(profile => refresh({ ...s, profile }));
                  }}
                  style={{ fontSize: 10, ...((s?.profile?.preferredSplit || 'Full Body') === sp ? { background: 'var(--ink)', color: 'var(--paper)', borderColor: 'var(--ink)' } : {}) }}>
                  {sp}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 8, color: 'var(--dim)', marginTop: 4, lineHeight: 1.4 }}>
              Full Body ranks every muscle by freshness directly, no fixed categories — sessions can lean push- or pull-heavy on a given day if that's genuinely what's freshest. If you've never set this, the app looks at your real logged history and starts you on whatever you're already doing.
            </div>
          </div>
          <div className="prof-field">
            <span className="prof-lbl">Compound / Isolation <span style={{ fontSize: 8, color: 'var(--dim)', textTransform: 'none' }}>(shapes accessory picks in auto-generated sessions)</span></span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)' }}>Isolation</span>
              <input type="range" min="0" max="2" step="1" value={compoundIsolationVal}
                onChange={e => {
                  const v = +e.target.value;
                  const pref = v === 0 ? 'isolation' : v === 2 ? 'compound' : null;
                  refresh({ ...s, profile: { ...s.profile, compoundIsolationPreference: pref } });
                  api('profile', { method: 'POST', body: JSON.stringify({ compoundIsolationPreference: pref }) }).then(profile => refresh({ ...s, profile }));
                }}
                style={{ flex: 1, accentColor: 'var(--ink)' }} />
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)' }}>Compound</span>
            </div>
            <div style={{ fontSize: 8, color: 'var(--dim)', marginTop: 4, lineHeight: 1.4 }}>
              {compoundIsolationPref ? `Locked to ${compoundIsolationPref} accessories.` : 'Auto — follows whichever you\'ve actually leaned toward over your last 90 days.'} Only affects the accessory slot on freshest-picked muscles; backbone lifts stay compound-first regardless.
            </div>
          </div>
          <div className="prof-field">
            <span className="prof-lbl">Free-Weight / Stable <span style={{ fontSize: 8, color: 'var(--dim)', textTransform: 'none' }}>(equipment lean in auto-generated sessions)</span></span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)' }}>Free-weight</span>
              <input type="range" min="0" max="2" step="1" value={stabilityVal}
                onChange={e => {
                  const v = +e.target.value;
                  const pref = v === 0 ? 'free' : v === 2 ? 'stable' : null;
                  refresh({ ...s, profile: { ...s.profile, stabilityPreference: pref } });
                  api('profile', { method: 'POST', body: JSON.stringify({ stabilityPreference: pref }) }).then(profile => refresh({ ...s, profile }));
                }}
                style={{ flex: 1, accentColor: 'var(--ink)' }} />
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)' }}>Stable</span>
            </div>
            <div style={{ fontSize: 8, color: 'var(--dim)', marginTop: 4, lineHeight: 1.4 }}>
              {stabilityPref ? `Locked to ${stabilityPref === 'stable' ? 'machine/cable/Smith' : 'free-weight'}-leaning picks.` : 'Auto — follows whichever you\'ve actually leaned toward over your last 90 days.'} A soft preference, not a hard filter — a free-weight (or machine) exercise can still get picked when it's clearly the best option.
            </div>
          </div>
        </div>

        {/* ── TRAINING BACKGROUND ── */}
        <div className="settings-sec" id="sec-training-background">
          <div className="settings-sh">Training Background <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 9, color: 'var(--dim)' }}>(a starting anchor before Press has your real logged history)</span></div>
          <div className="prof-field">
            <span className="prof-lbl">Experience Level <span style={{ fontSize: 8, color: 'var(--dim)', textTransform: 'none' }}>(new-lifter fatigue budget — unrelated to Detail Level below)</span></span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {['New to training', 'Experienced', 'Returning after a break'].map(lvl => (
                <button key={lvl} className="prof-btn" onClick={() => saveExperienceLevel(lvl)}
                  style={experienceLevel === lvl ? { background: 'var(--ink)', color: 'var(--paper)', borderColor: 'var(--ink)' } : {}}>
                  {lvl}
                </button>
              ))}
            </div>
          </div>
          {experienceLevel === 'Returning after a break' && (
            <div className="prof-field">
              <span className="prof-lbl">Break Length</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input className="prof-input" type="number" inputMode="decimal" value={returningBreakWeeksVal}
                  onChange={e => setReturningBreakWeeksVal(e.target.value)} onBlur={saveReturningBreakWeeks}
                  placeholder="e.g. 8" style={{ maxWidth: 80 }} />
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)' }}>weeks</span>
              </div>
            </div>
          )}
          <div className="prof-field">
            <span className="prof-lbl">Training Experience <span style={{ fontSize: 8, color: 'var(--dim)', textTransform: 'none' }}>(years — used for recovery pacing)</span></span>
            <input className="prof-input" type="number" min="0" step="0.5" inputMode="decimal"
              value={trainingExpVal} onChange={e => setTrainingExpVal(e.target.value)}
              onBlur={() => {
                const v = trainingExpVal === '' ? null : parseFloat(trainingExpVal);
                if (v !== (s?.profile?.trainingExperienceYears ?? null)) {
                  api('profile', { method: 'POST', body: JSON.stringify({ trainingExperienceYears: v }) }).then(profile => refresh({ ...s, profile }));
                }
              }}
              placeholder="e.g. 2" style={{ flex: 1, minWidth: 0, maxWidth: 80 }} />
          </div>
          <div className="prof-field">
            <span className="prof-lbl">Typical Split <span style={{ fontSize: 8, color: 'var(--dim)', textTransform: 'none' }}>(a starting anchor, not the auto-generator's Preferred Split above)</span></span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {TRAINING_SPLITS.map(sp => (
                <button key={sp} className="prof-btn" onClick={() => { setSplitVal(sp); saveTrainingBackground({ split: sp }); }}
                  style={splitVal === sp ? { background: 'var(--ink)', color: 'var(--paper)', borderColor: 'var(--ink)' } : {}}>
                  {sp}
                </button>
              ))}
            </div>
          </div>
          <div className="prof-field">
            <span className="prof-lbl">Usual Working Sets Per Exercise</span>
            <input className="prof-input" type="number" inputMode="numeric" value={usualSetsVal}
              onChange={e => setUsualSetsVal(e.target.value)}
              onBlur={() => saveTrainingBackground({ usualSets: usualSetsVal ? parseInt(usualSetsVal) : undefined })}
              placeholder="e.g. 3" style={{ flex: 1, minWidth: 0, maxWidth: 80 }} />
          </div>
          <div className="prof-field">
            <span className="prof-lbl">Usual Rep Range</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input className="prof-input" type="number" inputMode="numeric" value={usualRepsLowVal}
                onChange={e => setUsualRepsLowVal(e.target.value)}
                onBlur={() => saveTrainingBackground({ usualRepsLow: usualRepsLowVal ? parseInt(usualRepsLowVal) : undefined })}
                placeholder="Low" style={{ width: 60 }} />
              <span style={{ color: 'var(--dim)' }}>–</span>
              <input className="prof-input" type="number" inputMode="numeric" value={usualRepsHighVal}
                onChange={e => setUsualRepsHighVal(e.target.value)}
                onBlur={() => saveTrainingBackground({ usualRepsHigh: usualRepsHighVal ? parseInt(usualRepsHighVal) : undefined })}
                placeholder="High" style={{ width: 60 }} />
            </div>
          </div>
          <div className="prof-field">
            <span className="prof-lbl">Favorite / Go-To Exercises</span>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, width: '100%' }}>
              <input className="prof-input" list="settings-exercise-options" placeholder="e.g. Barbell Bench Press" value={favoriteInputVal}
                onChange={e => setFavoriteInputVal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addFavorite(); } }}
                style={{ flex: 1, minWidth: 0 }} />
              <button className="prof-btn" onClick={addFavorite} disabled={!favoriteInputVal.trim()}>Add</button>
            </div>
            <datalist id="settings-exercise-options">
              {BASE_EXERCISES.map(n => <option key={n} value={n} />)}
            </datalist>
            {(() => {
              // FEATURES.md #142: shown ranked, not as an unordered pile of
              // pills — built from real pairwise comparisons (finish-workout
              // prompts) and import/frequency seeding, not just this
              // manually-typed list. A hand-added favorite with no
              // comparisons yet still shows, at the unrated baseline, so
              // adding one doesn't make it vanish until it happens to get
              // compared. favoriteExercises itself is untouched underneath —
              // Add/× still only ever edit that list, same as before.
              const ratings = s?.profile?.exerciseRatings || {};
              const merged = { ...ratings };
              for (const f of favoritesVal) if (!merged[f]) merged[f] = { rating: DEFAULT_EXERCISE_RATING, comparisons: 0 };
              const ranked = rankExercises(merged);
              if (!ranked.length) return null;
              return (
                <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {ranked.map((r, i) => (
                    <li key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                      <span style={{ color: 'var(--dim)', width: 18, textAlign: 'right', flexShrink: 0 }}>{i + 1}.</span>
                      <span style={{ flex: 1 }}>{r.name}</span>
                      {expertiseAtLeast(expertiseLevel, 'scientist') && (
                        <span style={{ color: 'var(--dim)', fontSize: 9 }}>{Math.round(r.rating)} · {r.comparisons}×</span>
                      )}
                      {favoritesVal.includes(r.name) && (
                        <span style={{ cursor: 'pointer', color: 'var(--dim)' }} onClick={() => removeFavorite(r.name)}>×</span>
                      )}
                    </li>
                  ))}
                </ol>
              );
            })()}
          </div>
          <div className="prof-field">
            <span className="prof-lbl">Muscle Focus <span style={{ fontSize: 8, color: 'var(--dim)', textTransform: 'none' }}>(Priority/Lower/Avoid per muscle)</span></span>
            <button className="prof-btn" onClick={() => setShowMuscleFocus(v => !v)} style={{ marginBottom: showMuscleFocus ? 8 : 0 }}>
              {showMuscleFocus ? 'Hide' : 'Show'} muscle list
            </button>
            {showMuscleFocus && (
              <div style={{ width: '100%' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={showNicheMuscles} onChange={e => saveShowNicheMuscles(e.target.checked)}
                    style={{ width: 14, height: 14, flexShrink: 0 }} />
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)' }}>
                    Show scientific muscle names (splits regions like Traps or Upper Back into the individual muscles behind them, named anatomically)
                  </span>
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%' }}>
                  {(showNicheMuscles ? PRIMARY_MUSCLES.map(m => ({
                    key: m, label: nicheMuscleLabel(m), value: muscleFocusMap[m] || 'normal', onSet: v => saveMuscleFocusValue(m, v),
                  })) : MUSCLE_FOCUS_GROUPS.map(g => ({
                    key: g.key, label: g.label, value: muscleGroupValue(g, muscleFocusMap), onSet: v => saveGroupFocusValue(g, v),
                  }))).map(row => (
                    <div key={row.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--paper2)' }}>
                      <span style={{ flex: 1, fontFamily: "'JetBrains Mono',monospace", fontSize: 10, textTransform: 'capitalize' }}>{row.label}</span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {MUSCLE_FOCUS_OPTIONS.map(opt => (
                          <button key={opt.value} className={`prof-btn${row.value === opt.value ? ' solid' : ''}`} style={{ fontSize: 8, padding: '4px 6px' }}
                            onClick={() => row.onSet(opt.value)}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── APPEARANCE ── */}
        <div className="settings-sec" id="sec-appearance">
          <div className="settings-sh">Appearance</div>
          <div className="prof-field">
            <span className="prof-lbl">Dark Mode</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {[['off', false], ['on', true]].map(([label, val]) => (
                <button key={label} className="prof-btn"
                  onClick={() => {
                    refresh({ ...s, profile: { ...s.profile, darkMode: val } });
                    api('profile', { method: 'POST', body: JSON.stringify({ darkMode: val }) }).then(profile => refresh({ ...s, profile }));
                  }}
                  style={{ textTransform: 'capitalize', ...(!!s?.profile?.darkMode === val ? { background: 'var(--ink)', color: 'var(--paper)', borderColor: 'var(--ink)' } : {}) }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="prof-field" style={{ display: 'block' }}>
            <span className="prof-lbl" style={{ display: 'block', marginBottom: 8 }}>Detail Level <span style={{ fontSize: 8, color: 'var(--dim)', textTransform: 'none' }}>(how much of the model is shown — never changes what's recommended)</span></span>
            {EXPERTISE_LEVELS.map(lvl => (
              <button key={lvl} className={`echelon-card${expertiseLevel === lvl ? ' selected' : ''}`}
                onClick={() => saveExpertiseLevel(lvl)}>
                <div className="echelon-card-dot" />
                <div style={{ flex: 1 }}>
                  <div className="echelon-card-title">{EXPERTISE_LABELS[lvl]}</div>
                  <div className="echelon-card-desc">{EXPERTISE_BLURBS[lvl]}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── TRACKING LEVEL ── */}
        <div className="settings-sec" id="sec-tracking-level">
          <div className="settings-sh">Tracking Level</div>
          <div className="echelon-card" style={{ opacity: 0.6, cursor: 'default' }}>
            <div className="echelon-card-dot checkbox checked" />
            <div style={{ flex: 1 }}>
              <div className="echelon-card-title">Training — always on</div>
              <div className="echelon-card-desc">Workout logging, fatigue model, personal records, and AI-planned sessions.</div>
            </div>
          </div>
          {TRACKING_CATEGORIES.map(c => (
            <button key={c.key} className={`echelon-card${trackingCategories[c.key] ? ' selected' : ''}`}
              onClick={() => toggleTrackingCategory(c.key)}>
              <div className={`echelon-card-dot checkbox${trackingCategories[c.key] ? ' checked' : ''}`} />
              <div style={{ flex: 1 }}>
                <div className="echelon-card-title">{c.title}</div>
                <div className="echelon-card-desc">{c.desc}</div>
              </div>
            </button>
          ))}
        </div>

        {/* ── PERSONAL JOURNALIST MEMORY ── */}
        <div className="settings-sec" id="sec-mentor-memory">
          <div className="settings-sh">Personal Journalist Memory <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 9, color: 'var(--dim)' }}>(facts it remembers across chats)</span></div>
          {mentorMemory.length === 0 && (
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', fontStyle: 'italic' }}>Nothing saved yet — it fills in as you chat.</div>
          )}
          {mentorMemory.map((m, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 4 }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, flex: 1 }}>{m}</span>
              <button className="prof-btn" onClick={() => removeMemoryEntry(i)} style={{ fontSize: 8, padding: '2px 8px', flexShrink: 0 }}>✕</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <input className="prof-input" placeholder="Add a fact manually…" value={newMemoryEntry}
              onChange={e => setNewMemoryEntry(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addMemoryEntry(); }}
              style={{ flex: 1 }} />
            <button className="prof-btn" onClick={addMemoryEntry} disabled={!newMemoryEntry.trim()} style={{ fontSize: 8, padding: '5px 14px', flexShrink: 0 }}>Add</button>
          </div>
        </div>
        </div>

        <div className="settings-group" id="sec-grp-social">
        <button type="button" className="settings-group-h" onClick={() => jumpToSection('sec-grp-social')}>Social{followBadge && (followBadge.incoming.length + followBadge.recentlyAccepted.length) > 0 ? ` (${followBadge.incoming.length + followBadge.recentlyAccepted.length})` : ''}</button>

        {followBadge?.recentlyAccepted?.length > 0 && (
          <div className="settings-sec" id="sec-accepted">
            <div className="settings-sh">Accepted</div>
            {followBadge.recentlyAccepted.map(r => (
              <div key={r.toUid} style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 4 }}>
                {r.toDisplayNameFirst} accepted your follow request
              </div>
            ))}
            <button className="prof-btn" onClick={ackAccepted} style={{ marginTop: 4 }}>Dismiss</button>
          </div>
        )}

        {followBadge?.incoming?.length > 0 && (
          <div className="settings-sec" id="sec-follow-requests">
            <div className="settings-sh">Follow Requests</div>
            {followBadge.incoming.map(r => (
              <div key={r.fromUid} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12 }}>{r.fromDisplayNameFirst} <span style={{ color: 'var(--dim)', fontFamily: "'JetBrains Mono',monospace", fontSize: 9 }}>@{r.fromUsername}</span></span>
                <button className="prof-btn solid" style={{ fontSize: 9, padding: '4px 10px' }} onClick={() => acceptFollowRequest(r.fromUid)}>Accept</button>
              </div>
            ))}
          </div>
        )}

        <div className="settings-sec" id="sec-find-people">
          <div className="settings-sh">Find People</div>
          <input className="prof-input" style={{ width: '100%', boxSizing: 'border-box' }} value={searchQuery}
            onChange={e => runSearch(e.target.value)} placeholder="Search by username" autoCapitalize="none" autoCorrect="off" />
          {searching && <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 6 }}>Searching…</div>}
          {searchResults.map(r => (
            <div key={r.uid} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
              <button onClick={() => openProfile(r.username)} style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, fontSize: 12, color: 'var(--ink)' }}>
                {r.displayNameFirst} <span style={{ color: 'var(--dim)', fontFamily: "'JetBrains Mono',monospace", fontSize: 9 }}>@{r.username}</span>
              </button>
              <button className="prof-btn" style={{ fontSize: 9, padding: '4px 10px' }}
                disabled={followingPending[r.username]} onClick={() => sendFollowRequest(r.username)}>
                {followingPending[r.username] ? 'Requested' : 'Follow'}
              </button>
            </div>
          ))}
        </div>

        <div className="settings-sec" id="sec-visibility">
          <div className="settings-sh">Visibility</div>
          <div className="prof-field">
            <span className="prof-lbl">Workout sessions visible to followers</span>
            <button className={`prof-btn${workoutSessionsVisible ? ' solid' : ''}`} onClick={() => saveVisibility({ workoutSessions: !workoutSessionsVisible })}>
              {workoutSessionsVisible ? 'On' : 'Off'}
            </button>
          </div>
          <div className="prof-field">
            <span className="prof-lbl">Strength/stimulus comparison <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 9, color: 'var(--dim)' }}>(requires mutual follow + both people opted in)</span></span>
            <button className={`prof-btn${comparisonVisible ? ' solid' : ''}`} onClick={() => saveVisibility({ comparison: !comparisonVisible })}>
              {comparisonVisible ? 'On' : 'Off'}
            </button>
          </div>
          <div className="prof-field">
            <span className="prof-lbl">Activity feed <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 9, color: 'var(--dim)' }}>(includes your sessions in followers' feeds — off by default even if sessions above are visible)</span></span>
            <button className={`prof-btn${feedVisible ? ' solid' : ''}`} onClick={() => saveVisibility({ feed: !feedVisible })}>
              {feedVisible ? 'On' : 'Off'}
            </button>
          </div>
        </div>
        </div>

        <div className="settings-group" id="sec-grp-layout">
        <button type="button" className="settings-group-h" onClick={() => jumpToSection('sec-grp-layout')}>Dashboard Layout</button>
        {/* ── LAYOUT ── */}
        <div className="settings-sec" id="sec-presets">
          <div className="settings-sh">Presets <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 9, color: 'var(--dim)' }}>(desktop only — resets the panel grid below to one of these starting layouts)</span></div>
          {LAYOUT_PRESETS.map(preset => (
            <button key={preset.id} className="echelon-card" onClick={() => applyLayoutPreset(preset)}>
              <div className="echelon-card-dot" />
              <div style={{ flex: 1 }}>
                <div className="echelon-card-title">{preset.label}</div>
                <div className="echelon-card-desc">{preset.desc}</div>
              </div>
            </button>
          ))}
        </div>

        <div className="settings-sec" id="sec-panel-grid">
          <div className="settings-sh">Panel Grid <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 9, color: 'var(--dim)' }}>(desktop only)</span></div>
          <div style={{ fontSize: 11, color: 'var(--dim)', lineHeight: 1.5, marginBottom: 10 }}>
            Drag panels to reposition, drag a corner to resize — the grid auto-packs so there's no empty space. Columns can track your window width, or stay a fixed count (panels resize in pixels instead).
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {['auto', 1, 2, 3, 4].map(mode => (
              <button key={mode} className={`prof-btn${gridColumnModeVal === mode ? ' solid' : ''}`}
                onClick={() => saveGridColumnMode(mode)}>
                {mode === 'auto' ? 'Auto' : `${mode} col`}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="prof-btn solid" onClick={() => { onClose(); onOpenGridEdit(); }}>
              Rearrange Panels
            </button>
            <button className="prof-btn" onClick={resetGridLayout}>
              Reset Layout
            </button>
          </div>
        </div>

        <div className="settings-sec" id="sec-home-order">
          <div className="settings-sh">Home Screen Order <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 9, color: 'var(--dim)' }}>(mobile order; also seeds a freshly-added desktop panel's starting spot)</span></div>
          <PanelOrderEditor order={panelOrder} hidden={hiddenPanels} labels={PANEL_LABELS}
            states={s?.profile?.panelStates} expertise={expertiseLevel} onChange={savePanels} onStateChange={savePanelState} />
        </div>

        <div className="settings-sec" id="sec-micro-widgets">
          <div className="settings-sh">Micro-Widgets <span style={{ fontWeight: 400, textTransform: 'none', fontSize: 9, color: 'var(--dim)' }}>(fill gaps left by the panels above, desktop only)</span></div>
          <PanelOrderEditor order={microWidgetOrder} hidden={hiddenMicroWidgets} labels={MICRO_WIDGET_LABELS} onChange={saveMicroWidgets} />
        </div>

        <div className="settings-sec" id="sec-recovery-tab-order">
          <div className="settings-sh">Recovery Tab Order</div>
          <PanelOrderEditor order={recoveryTabOrder} hidden={hiddenRecoveryTabs} labels={RECOVERY_TAB_LABELS} onChange={saveRecoveryTabs} />
        </div>
        </div>

        <div className="settings-group" id="sec-grp-targets">
        <button type="button" className="settings-group-h" onClick={() => jumpToSection('sec-grp-targets')}>Targets &amp; Nutrition</button>
        {/* ── TARGETS ── */}
        <div className="settings-sec" id="sec-targets">
          <div className="settings-sh">Targets</div>
          {[
            ['Sleep Target', sleepTarget, v => setSleepTarget(v), .5, 5, 12, v => `${v}h`],
          ].map(([label, val, set, step, min, max, fmt]) => (
            <div key={label} style={{ marginBottom: 14 }}>
              <label className="ob-label" style={{ marginTop: 0 }}>{label}</label>
              <div className="ob-stepper" style={{ margin: '8px 0' }}>
                <button className="ob-stepper-btn" onClick={() => set(v => Math.max(min, parseFloat((v - step).toFixed(1))))}>−</button>
                <div className="ob-stepper-val">{fmt(val)}</div>
                <button className="ob-stepper-btn" onClick={() => set(v => Math.min(max, parseFloat((v + step).toFixed(1))))}>+</button>
              </div>
            </div>
          ))}

          <div style={{ marginBottom: 14 }}>
            <label className="ob-label" style={{ marginTop: 0 }}>Water Target</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {WATER_ACTIVITY_LEVELS.map(l => (
                <button key={l.key} className={`prof-btn${waterActivityLevel === l.key ? ' solid' : ''}`}
                  onClick={() => { setWaterActivityLevel(l.key); setWaterTouched(false); }}>{l.label}</button>
              ))}
              <button className={`prof-btn${waterHotClimate ? ' solid' : ''}`}
                onClick={() => { setWaterHotClimate(v => !v); setWaterTouched(false); }}>Hot / humid climate</button>
            </div>
            <div className="ob-stepper" style={{ margin: '8px 0 4px' }}>
              <button className="ob-stepper-btn" onClick={() => { setWaterTouched(true); setWaterTarget(v => Math.max(2, v - 1)); }}>−</button>
              <div className="ob-stepper-val">{waterTarget} gl</div>
              <button className="ob-stepper-btn" onClick={() => { setWaterTouched(true); setWaterTarget(v => Math.min(16, v + 1)); }}>+</button>
            </div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)' }}>
              {waterCalc != null
                ? `Recommended ${waterCalc} glasses — ${Math.round(weightKgForWater)}kg × 35mL + ${waterActivityLevel} activity${waterHotClimate ? ' + hot climate' : ''}.`
                : 'Log a weight entry for a recommended target.'}
            </div>
          </div>

          {[
            ['Training Days / Week', trainingDays, v => setTrainingDays(v), 1, 1, 7, v => `${v} days`],
          ].map(([label, val, set, step, min, max, fmt]) => (
            <div key={label} style={{ marginBottom: 14 }}>
              <label className="ob-label" style={{ marginTop: 0 }}>{label}</label>
              <div className="ob-stepper" style={{ margin: '8px 0' }}>
                <button className="ob-stepper-btn" onClick={() => set(v => Math.max(min, parseFloat((v - step).toFixed(1))))}>−</button>
                <div className="ob-stepper-val">{fmt(val)}</div>
                <button className="ob-stepper-btn" onClick={() => set(v => Math.min(max, parseFloat((v + step).toFixed(1))))}>+</button>
              </div>
            </div>
          ))}
          <button className="prof-btn solid" style={{ padding: '7px 20px' }}
            onClick={saveTargets} disabled={savingTargets}>
            {savingTargets ? 'Saving…' : 'Save Targets'}
          </button>
        </div>

        {/* ── WARMUP RAMP ── */}
        <div className="settings-sec" id="sec-warmup-ramp">
          <div className="settings-sh">Warmup Ramp</div>
          <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 10, lineHeight: 1.5 }}>
            Applied to every auto-generated session's warmup sets, as a percentage of that session's suggested working weight.
          </div>
          {warmupScheme.map((step, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <input className="prof-input" style={{ width: 44 }} type="number" inputMode="numeric"
                value={step.reps} onChange={e => updateWarmupStep(i, 'reps', e.target.value)} />
              <span style={{ fontSize: 10, color: 'var(--dim)' }}>reps @</span>
              <input className="prof-input" style={{ width: 44 }} type="number" inputMode="numeric"
                value={step.pct} onChange={e => updateWarmupStep(i, 'pct', e.target.value)} />
              <span style={{ fontSize: 10, color: 'var(--dim)' }}>%</span>
              <button onClick={() => removeWarmupStep(i)} style={{ background: 'none', border: 'none', color: 'var(--dim)', cursor: 'pointer', fontSize: 14, marginLeft: 'auto', padding: '0 4px' }}>×</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button className="prof-btn" style={{ fontSize: 9, padding: '4px 10px' }} onClick={addWarmupStep}>+ Step</button>
            <button className="prof-btn solid" style={{ fontSize: 9, padding: '4px 10px' }} onClick={() => saveWarmupScheme(warmupScheme)} disabled={warmupSaving || !warmupScheme.length}>
              {warmupSaving ? 'Saving…' : 'Save Ramp'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {WARMUP_SCHEME_PRESETS.map(p => (
              <button key={p.label} className="prof-btn" style={{ fontSize: 8, padding: '3px 8px' }} onClick={() => saveWarmupScheme(p.scheme)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── EQUIPMENT ── */}
        <div className="settings-sec" id="sec-equipment">
          <div className="settings-sh">Equipment Availability</div>
          <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 10, lineHeight: 1.5 }}>
            Select which equipment you have access to. Used to filter session recommendations.
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {['barbell', 'dumbbell', 'machine', 'cable', 'smith', 'bodyweight'].map(eq => (
              <button key={eq} className={`prof-btn${equipmentAvailable.includes(eq) ? ' solid' : ''}`}
                onClick={() => {
                  setEquipmentAvailable(prev =>
                    prev.includes(eq) ? prev.filter(e => e !== eq) : [...prev, eq]
                  );
                }}
                style={{ fontSize: 10, padding: '6px 12px', textTransform: 'capitalize' }}>
                {eq}
              </button>
            ))}
          </div>
          <button className="prof-btn solid" style={{ fontSize: 10, padding: '6px 12px' }}
            onClick={async () => {
              setSavingEquipment(true);
              await api('profile', { method: 'POST', body: JSON.stringify({ equipmentAvailable }) });
              refresh({ ...s, profile: { ...s.profile, equipmentAvailable } });
              setSavingEquipment(false);
            }} disabled={savingEquipment}>
            {savingEquipment ? 'Saving…' : 'Save Equipment'}
          </button>
        </div>

        {/* ── PLAN AHEAD CONSTRAINTS ── */}
        <div className="settings-sec" id="sec-plan-constraints">
          <div className="settings-sh">Plan Ahead — Constraints</div>
          <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 10, lineHeight: 1.5 }}>
            The forward calendar (Home → Plan Ahead) solves fully optimal to your goal by default. These layer in constraints it has to work around — none of them force a fatigued muscle through; the calendar falls back and shows the conflict instead.
          </div>
          <div style={{ fontSize: 8, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 6 }}>
            Recurring Days Off <span style={{ textTransform: 'none' }}>(never scheduled, indefinite)</span>
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
            {WEEKDAY_LABELS.map((lbl, i) => (
              <button key={i} className={`prof-btn${unavailableDaysOfWeek.includes(i) ? ' solid' : ''}`}
                onClick={() => setUnavailableDaysOfWeek(prev => prev.includes(i) ? prev.filter(d => d !== i) : [...prev, i])}
                style={{ fontSize: 10, padding: '6px 10px' }}>
                {lbl}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 8, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 6 }}>
            Allow-List Training Days <span style={{ textTransform: 'none' }}>(only these — leave empty for no restriction)</span>
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
            {WEEKDAY_LABELS.map((lbl, i) => (
              <button key={i} className={`prof-btn${availableDaysOfWeek.includes(i) ? ' solid' : ''}`}
                onClick={() => setAvailableDaysOfWeek(prev => prev.includes(i) ? prev.filter(d => d !== i) : [...prev, i])}
                style={{ fontSize: 10, padding: '6px 10px' }}>
                {lbl}
              </button>
            ))}
          </div>
          <div className="prof-field">
            <span className="prof-lbl">Weekly Session Target <span style={{ fontSize: 8, color: 'var(--dim)', textTransform: 'none' }}>(blank = auto, from current fatigue)</span></span>
            <input className="prof-input" type="number" inputMode="numeric" min="0" max="14" value={weeklySessionTargetVal}
              onChange={e => setWeeklySessionTargetVal(e.target.value)} placeholder="Auto" style={{ maxWidth: 80 }} />
          </div>
          {SPLIT_GROUPS[s?.profile?.preferredSplit] && (
            <>
              <div style={{ fontSize: 8, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--dim)', margin: '12px 0 6px' }}>
                Split-Day Anchors <span style={{ textTransform: 'none' }}>(soft — honored only when fresh)</span>
              </div>
              {Object.keys(SPLIT_GROUPS[s.profile.preferredSplit]).map(bucket => {
                const anchorDays = splitDayAnchors[bucket] || [];
                return (
                  <div key={bucket} style={{ padding: '6px 0', borderBottom: '1px solid var(--rule)' }}>
                    <span style={{ fontSize: 11, color: 'var(--ink)' }}>{bucketLabel(bucket)}</span>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                      {WEEKDAY_LABELS.map((lbl, i) => (
                        <button key={i} type="button" className={`prof-btn${anchorDays.includes(i) ? ' solid' : ''}`}
                          style={{ fontSize: 9, padding: '4px 8px' }}
                          onClick={() => setSplitDayAnchors(prev => {
                            const next = { ...prev };
                            const cur = next[bucket] || [];
                            const updated = cur.includes(i) ? cur.filter(d => d !== i) : [...cur, i];
                            if (updated.length === 0) delete next[bucket]; else next[bucket] = updated;
                            return next;
                          })}>
                          {lbl}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          )}
          <button className="prof-btn solid" style={{ fontSize: 10, padding: '6px 12px', marginTop: 12 }}
            onClick={async () => {
              setSavingPlanConstraints(true);
              const weeklySessionTarget = weeklySessionTargetVal === '' ? null : Math.max(0, Math.min(14, Math.round(+weeklySessionTargetVal)));
              const profile = await api('profile', {
                method: 'POST',
                body: JSON.stringify({ unavailableDaysOfWeek, availableDaysOfWeek, weeklySessionTarget, splitDayAnchors }),
              });
              refresh({ ...s, profile });
              setSavingPlanConstraints(false);
            }} disabled={savingPlanConstraints}>
            {savingPlanConstraints ? 'Saving…' : 'Save Plan Ahead Constraints'}
          </button>
        </div>

        {/* ── PLAN AHEAD HOLIDAYS/TRAVEL ── */}
        <div className="settings-sec" id="sec-plan-holidays">
          <div className="settings-sh">Plan Ahead — Holidays &amp; Travel</div>
          <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 10, lineHeight: 1.5 }}>
            One-off date ranges the calendar should treat differently — a holiday, a trip with only a hotel gym, a week off entirely.
          </div>
          {(s?.profile?.busyDates || []).length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 8, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 6 }}>
                Busy Days <span style={{ textTransform: 'none' }}>(quick-marked from Plan Ahead)</span>
              </div>
              {[...s.profile.busyDates].sort().map(d => (
                <div key={d} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--rule)' }}>
                  <div style={{ fontSize: 10, color: 'var(--ink)' }}>
                    {d}<span style={{ color: 'var(--dim)', marginLeft: 6 }}>Marked busy</span>
                  </div>
                  <button className="prof-btn" style={{ fontSize: 9, padding: '4px 8px' }}
                    onClick={async () => {
                      const updated = s.profile.busyDates.filter(x => x !== d);
                      await api('profile', { method: 'POST', body: JSON.stringify({ busyDates: updated }) });
                      refresh({ ...s, profile: { ...s.profile, busyDates: updated } });
                    }}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
          {windowsLoading ? (
            <div style={{ fontSize: 10, color: 'var(--dim)' }}>Loading…</div>
          ) : (
            <>
              {calendarWindows.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  {calendarWindows.map(w => (
                    <div key={w.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--rule)' }}>
                      <div style={{ fontSize: 10, color: 'var(--ink)' }}>
                        {w.start === w.end ? w.start : `${w.start} → ${w.end}`}
                        <span style={{ color: 'var(--dim)', marginLeft: 6, textTransform: 'capitalize' }}>
                          {w.level === 'rest' ? 'Full rest' : w.level === 'bodyweight' ? 'Bodyweight only' : `Restricted: ${(w.equipment || []).join(', ')}`}
                          {w.reason ? ` — ${w.reason}` : ''}
                        </span>
                      </div>
                      <button className="prof-btn" style={{ fontSize: 9, padding: '4px 8px' }}
                        onClick={async () => {
                          await api(`calendar-windows/${w.id}`, { method: 'DELETE' });
                          setCalendarWindows(prev => prev.filter(x => x.id !== w.id));
                        }}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <div className="prof-field" style={{ flex: 'none', border: 'none', padding: 0 }}>
                  <span className="prof-lbl" style={{ marginRight: 8 }}>Start</span>
                  <input className="prof-input" type="date" value={newWindowStart} onChange={e => setNewWindowStart(e.target.value)} style={{ width: 130 }} />
                </div>
                <div className="prof-field" style={{ flex: 'none', border: 'none', padding: 0 }}>
                  <span className="prof-lbl" style={{ marginRight: 8 }}>End</span>
                  <input className="prof-input" type="date" value={newWindowEnd} onChange={e => setNewWindowEnd(e.target.value)} style={{ width: 130 }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, margin: '10px 0' }}>
                {[['rest', 'Full Rest'], ['bodyweight', 'Bodyweight Only'], ['restricted', 'Restricted Equipment']].map(([lvl, lbl]) => (
                  <button key={lvl} className={`prof-btn${newWindowLevel === lvl ? ' solid' : ''}`}
                    onClick={() => setNewWindowLevel(lvl)} style={{ fontSize: 9, padding: '5px 8px' }}>
                    {lbl}
                  </button>
                ))}
              </div>
              {newWindowLevel === 'restricted' && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
                  {['barbell', 'dumbbell', 'machine', 'cable', 'smith', 'bodyweight'].map(eq => (
                    <button key={eq} className={`prof-btn${newWindowEquipment.includes(eq) ? ' solid' : ''}`}
                      onClick={() => setNewWindowEquipment(prev => prev.includes(eq) ? prev.filter(e => e !== eq) : [...prev, eq])}
                      style={{ fontSize: 9, padding: '4px 8px', textTransform: 'capitalize' }}>
                      {eq}
                    </button>
                  ))}
                </div>
              )}
              <input className="prof-input" value={newWindowReason} onChange={e => setNewWindowReason(e.target.value)}
                placeholder="Reason (optional)" style={{ width: '100%', textAlign: 'left', marginBottom: 10 }} />
              <button className="prof-btn solid" style={{ fontSize: 10, padding: '6px 12px' }}
                disabled={addingWindow || !newWindowStart || !newWindowEnd || (newWindowLevel === 'restricted' && !newWindowEquipment.length)}
                onClick={async () => {
                  setAddingWindow(true);
                  const result = await api('calendar-windows', {
                    method: 'POST',
                    body: JSON.stringify({
                      start: newWindowStart, end: newWindowEnd, level: newWindowLevel,
                      equipment: newWindowLevel === 'restricted' ? newWindowEquipment : undefined,
                      reason: newWindowReason || undefined,
                    }),
                  });
                  if (result?.ok) {
                    setCalendarWindows(prev => [...prev, {
                      id: result.id, start: newWindowStart, end: newWindowEnd, level: newWindowLevel,
                      equipment: newWindowLevel === 'restricted' ? newWindowEquipment : null, reason: newWindowReason || null,
                    }]);
                    setNewWindowStart(''); setNewWindowEnd(''); setNewWindowLevel('rest'); setNewWindowEquipment([]); setNewWindowReason('');
                  }
                  setAddingWindow(false);
                }}>
                {addingWindow ? 'Adding…' : 'Add Window'}
              </button>
            </>
          )}
        </div>

        {/* ── NUTRITION ── */}
        <div className="settings-sec" id="sec-nutrition">
          <div className="settings-sh">Nutrition</div>
          <div className="prof-field">
            <span className="prof-lbl">Exact Calories <span style={{ fontSize: 8, color: 'var(--dim)', textTransform: 'none' }}>(default: exact)</span></span>
            <button className="prof-btn" onClick={() => {
                const exactCalories = s?.profile?.exactCalories === false;
                refresh({ ...s, profile: { ...s.profile, exactCalories } });
                api('profile', { method: 'POST', body: JSON.stringify({ exactCalories }) });
              }}
              style={s?.profile?.exactCalories !== false ? { background: 'var(--ink)', color: 'var(--paper)', borderColor: 'var(--ink)' } : {}}>
              {s?.profile?.exactCalories !== false ? 'On' : 'Off'}
            </button>
          </div>
        </div>
        </div>

        <div className="settings-group" id="sec-grp-connected">
        <button type="button" className="settings-group-h" onClick={() => jumpToSection('sec-grp-connected')}>Connected Data</button>
        {/* ── CONNECTED SERVICES ── */}
        <div className="settings-sec" id="sec-connected-services">
          <div className="settings-sh">Connected Services</div>

          <div className="ob-service-row">
            <div className="ob-svc-top">
              <div>
                <div className="ob-svc-title">Apple Health</div>
                <div className="ob-svc-desc">Stream sleep, HRV, steps, and heart rate from your iPhone</div>
              </div>
              <button className={`ob-svc-btn${healthGuideOpen ? ' done' : ''}`} onClick={openHealthGuide}>
                {healthGuideOpen ? 'Hide' : 'Setup'}
              </button>
            </div>
            {healthGuideOpen && (
              <div className="ob-guide">
                <label style={{ display: 'block', fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: 4 }}>
                  Your device
                </label>
                <select value={healthDevice} onChange={e => saveHealthDevice(e.target.value)} style={{ ...inputStyle, marginBottom: 10 }}>
                  <option value="">Select your watch, band, or ring…</option>
                  <optgroup label="Apple Watch">
                    {HEALTH_SHORTCUT_DEVICES.filter(d => d.key.startsWith('aw')).map(d => (
                      <option key={d.key} value={d.key}>{d.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Whoop">
                    {HEALTH_SHORTCUT_DEVICES.filter(d => d.key.startsWith('whoop')).map(d => (
                      <option key={d.key} value={d.key}>{d.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Oura">
                    {HEALTH_SHORTCUT_DEVICES.filter(d => d.key.startsWith('oura')).map(d => (
                      <option key={d.key} value={d.key}>{d.label}</option>
                    ))}
                  </optgroup>
                </select>
                {healthDevice && (() => {
                  const device = HEALTH_SHORTCUT_DEVICES.find(d => d.key === healthDevice);
                  return device.url ? (
                    <a href={device.url} target="_blank" rel="noopener noreferrer"
                      style={{ display: 'block', marginBottom: 8, fontWeight: 700, color: 'var(--gold)' }}>
                      Install the {device.label} Shortcut →
                    </a>
                  ) : (
                    <div style={{ marginBottom: 8, fontSize: 11, color: 'var(--dim)' }}>
                      The {device.label} Shortcut isn't published yet — check back soon.
                    </div>
                  );
                })()}
                Your personal sync link — after installing, open the Shortcut and make sure its URL matches this (replace it if it doesn't), so your data lands in your own account:
                <div className="ob-copy-url" onClick={() => navigator.clipboard?.writeText(syncUrl).then(() => { setUrlCopied(true); setTimeout(() => setUrlCopied(false), 2000); })}>
                  <span>{syncUrl}</span>
                  <button>{urlCopied ? 'Copied!' : 'Copy'}</button>
                </div>
                {healthDevice && (
                  <div style={{ marginTop: 8 }}>
                    This link runs your Shortcut directly, no need to open Shortcuts first: <a href={`shortcuts://run-shortcut?name=${encodeURIComponent(`pressnewsletter-${healthDevice}`)}`} style={{ color: 'var(--forest)', fontWeight: 700 }}>Sync Now →</a>
                  </div>
                )}
                <button onClick={() => setGuideAdvanced(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 10, fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--dim)' }}>
                  {guideAdvanced ? '− Hide' : '+ Show'} manual build / sharing with others / unsupported sensors
                </button>
                {guideAdvanced && (
                  <div style={{ marginTop: 10 }}>
                    <strong>Blood Oxygen / Wrist Temperature — build one Shortcut variant per device, not one for everyone:</strong><br />
                    • <strong>Apple Watch Series 4/5, SE (1st/2nd gen):</strong> neither sensor — delete both blocks.<br />
                    • <strong>Series 6/7:</strong> Blood Oxygen only — delete the Wrist Temperature block.<br />
                    • <strong>Series 8/9/10/11, Ultra (any), SE 3:</strong> both — keep as-is.<br />
                    • <strong>Whoop 4.0:</strong> Blood Oxygen only (writes to the same "Blood Oxygen" Health type Apple Watch uses) — delete the Wrist Temperature block; Whoop never writes temperature to Apple Health, on any model. <strong>Whoop 3.0:</strong> neither — delete both.<br />
                    • <strong>Oura Gen 1/2:</strong> temperature only, no Blood Oxygen sensor — delete the Blood Oxygen block, and change the Wrist Temperature block's Find Health Samples type to "Body Temperature" (Oura writes there, never to "Wrist Temperature" — different HealthKit types).<br />
                    • <strong>Oura Gen 3 / Ring 4 / Ring 5:</strong> both — same Body Temperature swap as above, Blood Oxygen block works as-is (writes to the same "Blood Oxygen" type Apple Watch uses).<br /><br />
                    "Find Health Samples" errors (not empty) on a type your device never writes, which is why this needs per-device variants rather than one universal Shortcut. Everything else (HR, HRV, RHR, Steps, Sleep) works on every Watch and the iPhone alone.<br /><br />
                    <strong>Sharing this with someone else?</strong> Add these steps to the top of the Shortcut so it asks for their URL once and remembers it automatically, instead of everyone needing to manually edit it:<br />
                    <strong>a.</strong> Add <strong>Get File</strong> (iCloud Drive → Shortcuts folder → <code>press-sync-url.txt</code>), with "Error if Not Found" turned off — this file won't exist the first time<br />
                    <strong>b.</strong> Add an <strong>If</strong> checking whether that result has any value<br />
                    <strong>c.</strong> If yes → set variable <code>syncUrl</code> to the file's contents<br />
                    <strong>d.</strong> Otherwise → <strong>Ask for Input</strong> ("Paste your Press sync URL"), set <code>syncUrl</code> to the answer, then <strong>Save File</strong> it back to the same <code>press-sync-url.txt</code> path so every future run finds it already there<br />
                    <strong>e.</strong> Use <code>syncUrl</code> (not typed text) as the URL in Get Contents of URL<br /><br />
                    Or build it yourself from scratch:<br />
                    <strong>1.</strong> Open <strong>Shortcuts</strong> on your iPhone<br />
                    <strong>2.</strong> Create a new <strong>Personal Automation</strong><br />
                    <strong>3.</strong> Trigger: <strong>Daily</strong> — set up <strong>three</strong> automations (duplicate this one twice), one each in the morning, afternoon, and night, so your data is fresh for each of Press's Morning Briefing, Mid-Day Update, and Tonight's Report<br />
                    <strong>4.</strong> Add action: <strong>Get Contents of URL</strong><br />
                    <strong>5.</strong> URL — the same personal link shown above<br />
                    <strong>6.</strong> Method: <strong>POST</strong> · Body: <strong>JSON</strong><br />
                    <strong>7.</strong> Add a Dictionary with: <code>hr_values</code>/<code>hr_dates</code>, <code>rhr_values</code>/<code>rhr_dates</code>, <code>hrv_values</code>/<code>hrv_dates</code>, <code>bloodoxygen_values</code>/<code>bloodoxygen_dates</code>, <code>steps_values</code>/<code>steps_dates</code>, <code>wrist_values</code>/<code>wrist_dates</code>, and <code>sleep_start</code>/<code>sleep_end</code>/<code>sleep_types</code><br />
                    <strong>8.</strong> Each pair comes from its own "Find Health Samples" block — Value+Start Date for the first six, Start Date+End Date+Type for Sleep
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="ob-service-row">
            <div className="ob-svc-top">
              <div>
                <div className="ob-svc-title">Strava</div>
                <div className="ob-svc-desc">Import runs, rides, and activities automatically</div>
              </div>
              <button className={`ob-svc-btn${(stravaStarted || s?.stravaConnected) ? ' done' : ''}`}
                disabled={s?.stravaConnected}
                onClick={() => { setStravaStarted(true); window.open(`${API_BASE}/strava/auth`, '_blank'); }}>
                {s?.stravaConnected ? 'Connected' : stravaStarted ? 'Connecting…' : 'Connect'}
              </button>
            </div>
          </div>

          <div className="ob-service-row">
            <div className="ob-svc-top">
              <div>
                <div className="ob-svc-title">Hevy</div>
                <div className="ob-svc-desc">Import your lifting history from Hevy</div>
              </div>
            </div>
            <div className="ob-hevy-modes">
              <button className="ob-svc-btn" onClick={() => { onOpenImport(); onClose(); }}>Import CSV</button>
              <button className={`ob-svc-btn${(hevyKeyMode === 'api' || hevyKeySaved) ? ' done' : ''}`}
                onClick={() => setHevyKeyMode(m => m === 'api' ? null : 'api')}>{hevyKeyMode === 'api' ? 'Hide' : hevyKeySaved ? 'Key Saved' : 'API Key'}</button>
            </div>
            {hevyKeyMode === 'api' && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <input style={{ ...inputStyle, flex: 1, width: 'auto', fontSize: 12, fontFamily: 'JetBrains Mono,monospace' }}
                  placeholder="Hevy API key…" value={hevyKeyVal} onChange={e => setHevyKeyVal(e.target.value)} />
                <button className="ob-svc-btn"
                  style={hevyKeySaved ? { background: 'var(--forest)', borderColor: 'var(--forest)', color: 'var(--paper)' } : {}}
                  onClick={async () => {
                    if (!hevyKeyVal.trim()) return;
                    await api('hevy/key', { method: 'POST', body: JSON.stringify({ key: hevyKeyVal.trim() }) }).catch(() => {});
                    setHevyKeySaved(true);
                  }}>{hevyKeySaved ? 'Saved' : 'Save'}</button>
              </div>
            )}
          </div>
        </div>

        {/* ── SUPPLEMENT STACK ── */}
        <div className="settings-sec" id="sec-supplement-stack">
          <div className="settings-sh">Supplement Stack</div>
          {supplements.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              {supplements.map(sup => (
                <div key={sup.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--rule)' }}>
                  <div>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--ink)' }}>{sup.name}</div>
                    {(sup.dose || sup.timing) && (
                      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: 'var(--dim)', marginTop: 1 }}>{[sup.dose, sup.timing].filter(Boolean).join(' · ')}</div>
                    )}
                  </div>
                  <button onClick={() => deleteSupp(sup.name)} style={{ background: 'none', border: 'none', color: 'var(--dim)', cursor: 'pointer', fontFamily: "'JetBrains Mono',monospace", fontSize: 11, padding: '4px 8px' }}>✕</button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input style={inputStyle} placeholder="Supplement name" value={newSuppName} onChange={e => setNewSuppName(e.target.value)} />
            <input style={inputStyle} placeholder="Dose (optional)" value={newSuppDose} onChange={e => setNewSuppDose(e.target.value)} />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {['morning','evening','pre-workout','post-workout'].map(t => (
                <button key={t} className={`prof-btn${newSuppTiming === t ? ' solid' : ''}`} onClick={() => setNewSuppTiming(t)}
                  style={{ fontSize: 8, padding: '4px 8px', textTransform: 'capitalize' }}>{t}</button>
              ))}
            </div>
            <button className="prof-btn solid" style={{ alignSelf: 'flex-start', padding: '7px 20px' }}
              onClick={addSupplement} disabled={savingSupp || !newSuppName.trim()}>
              {savingSupp ? 'Adding…' : 'Add'}
            </button>
          </div>
        </div>

        {/* ── MUSCLE SENSITIVITY ── */}
        <div className="settings-sec" id="sec-muscle-sensitivity">
          <div className="settings-sh">Muscle Sensitivity</div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', lineHeight: 1.6, marginBottom: 12 }}>
            Fatigue tracking auto-tunes per muscle from soreness logs. Override a muscle directly here if it's drifted wrong — 1.0 is neutral, higher means it fatigues faster than average.
          </div>
          {Object.entries(s?.muscleSensitivity || {}).filter(([, v]) => v !== 1.0).length > 0 && (
            <div style={{ marginBottom: 14 }}>
              {Object.entries(s?.muscleSensitivity || {}).filter(([, v]) => v !== 1.0).map(([muscle, value]) => (
                <div key={muscle} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--rule)' }}>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--ink)', textTransform: 'capitalize' }}>{muscle} — {value.toFixed(2)}×</div>
                  <button onClick={() => setMuscleSensitivity(muscle, 1.0)} style={{ background: 'none', border: 'none', color: 'var(--dim)', cursor: 'pointer', fontFamily: "'JetBrains Mono',monospace", fontSize: 9, padding: '4px 8px' }}>Reset</button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={sensMuscle} onChange={e => setSensMuscle(e.target.value)}
              style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, padding: '7px 8px', border: '1px solid var(--rule)', background: 'var(--paper)', color: 'var(--ink)', textTransform: 'capitalize' }}>
              {ALL_MUSCLES.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <input type="number" min="0.3" max="3.0" step="0.1" value={sensValue} onChange={e => setSensValue(e.target.value)}
              style={{ width: 60, fontFamily: "'JetBrains Mono',monospace", fontSize: 11, padding: '7px 8px', border: '1px solid var(--rule)', background: 'var(--paper)', color: 'var(--ink)' }} />
            <button className="prof-btn solid" style={{ padding: '7px 16px' }}
              onClick={() => setMuscleSensitivity(sensMuscle, +sensValue)} disabled={savingSens || !sensValue}>
              {savingSens ? 'Saving…' : 'Set'}
            </button>
          </div>
        </div>
        </div>

        <div className="settings-group" id="sec-grp-tools">
        <button type="button" className="settings-group-h" onClick={() => jumpToSection('sec-grp-tools')}>Tools</button>
        {/* ── APP ── */}
        <div className="settings-sec" id="sec-app">
          <div className="settings-sh">App</div>
          <div className="prof-field" style={{ marginBottom: 14 }}>
            <span className="prof-lbl">Morning Briefing</span>
            <button className="prof-btn" style={{ padding: '5px 14px' }}
              onClick={async () => {
                setRegenLoading(true);
                const r = await api('briefing/generate', { method: 'POST' }).catch(() => null);
                if (r?.briefing) setBriefing(r.briefing);
                setRegenLoading(false);
              }} disabled={regenLoading}>
              {regenLoading ? 'Generating…' : 'Regenerate'}
            </button>
          </div>
          <div className="prof-field" style={{ marginBottom: 14 }}>
            <span className="prof-lbl">Push Notifications</span>
            {notifPermission === 'granted'
              ? <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--forest)' }}>Enabled</span>
              : notifPermission === 'unsupported'
              ? <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--dim)' }}>Not supported</span>
              : <button className="prof-btn" style={{ padding: '5px 14px' }} onClick={enableNotifications}>Enable</button>
            }
          </div>
          {s?.profile?.travelMode && (
            <div className="prof-field">
              <span className="prof-lbl">Travel Mode</span>
              <button className="prof-btn" onClick={() => {
                  refresh({ ...s, profile: { ...s.profile, travelMode: false }, travelMode: false });
                  api('profile', { method: 'POST', body: JSON.stringify({ travelMode: false }) });
                }}>Disable</button>
            </div>
          )}
        </div>

        {/* ── DATA EXPORT ── */}
        <div className="settings-sec" id="sec-data-export">
          <div className="settings-sh">Data Export</div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', lineHeight: 1.6, marginBottom: 12 }}>
            Download your data as CSV, readable in Excel, Numbers, Sheets, or any spreadsheet tool.
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[['lifts','Lifts'],['workouts','Workouts'],['weight','Weight'],['metrics','Health Metrics'],['nutrition','Nutrition Log'],['measurements','Measurements']].map(([type, label]) => (
              <button key={type} className="prof-btn" style={{ fontSize: 9, padding: '6px 10px' }}
                onClick={async () => {
                  const r = await authFetch(`${API_BASE}/export/csv?type=${type}`);
                  const blob = await r.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url; a.download = `press-${type}.csv`; a.click();
                  URL.revokeObjectURL(url);
                }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── MERGE EXERCISES ── */}
        <div className="settings-sec" id="sec-merge-exercises">
          <div className="settings-sh">Merge Exercises</div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', lineHeight: 1.6, marginBottom: 12 }}>
            For two entries that are really the same exercise but got logged under different names (a typo, or an import source that didn't match) — folds all history from the first into the second.
          </div>
          <datalist id="merge-exercise-options">
            {[...new Set([...(s?.lifts || []).map(l => l.exercise), ...BASE_EXERCISES])].sort().map(n => <option key={n} value={n} />)}
          </datalist>
          <div className="prof-field">
            <span className="prof-lbl">Merge from</span>
            <input className="prof-input" list="merge-exercise-options" value={mergeFrom} onChange={e => setMergeFrom(e.target.value)} placeholder="e.g. bench press (barbell)" style={{ flex: 1, minWidth: 0 }} />
          </div>
          <div className="prof-field">
            <span className="prof-lbl">Into</span>
            <input className="prof-input" list="merge-exercise-options" value={mergeTo} onChange={e => setMergeTo(e.target.value)} placeholder="e.g. Barbell Bench Press" style={{ flex: 1, minWidth: 0 }} />
          </div>
          <button className="prof-btn solid" style={{ marginTop: 8 }} disabled={!mergeFrom.trim() || !mergeTo.trim() || merging}
            onClick={async () => {
              setMerging(true); setMergeStatus('');
              const res = await api('exercises/merge', { method: 'POST', body: JSON.stringify({ from: mergeFrom.trim(), to: mergeTo.trim() }) });
              setMerging(false);
              if (res.error) { setMergeStatus(res.error); return; }
              setMergeStatus(`Merged ${res.mergedSets} set${res.mergedSets === 1 ? '' : 's'} into "${mergeTo.trim()}".`);
              setMergeFrom(''); setMergeTo('');
              api('summary').then(refresh);
            }}>
            {merging ? 'Merging…' : 'Merge'}
          </button>
          {mergeStatus && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', marginTop: 8 }}>{mergeStatus}</div>}
        </div>

        {/* ── WIKI ── */}
        <div className="settings-sec" id="sec-learn">
          <div className="settings-sh">Learn</div>
          <button className="settings-open-btn" onClick={onOpenWiki}>
            <span>Exercise & Training Wiki</span><span>→</span>
          </button>
        </div>

        </div>

        <div className="settings-group" id="sec-grp-account">
        <button type="button" className="settings-group-h" onClick={() => jumpToSection('sec-grp-account')}>Account</button>
        {/* ── ACCOUNT ── */}
        <div className="settings-sec" id="sec-account-fields">
          <div className="settings-sh">Account</div>
          <button className="prof-btn" style={{ width: '100%', padding: '11px', textAlign: 'center', marginTop: 4 }} onClick={onRestartSetup}>Restart Setup</button>
          <button className="prof-btn" style={{ width: '100%', padding: '11px', textAlign: 'center', marginTop: 8 }} onClick={onReplayWalkthrough}>Replay Walkthrough</button>
          {auth.currentUser?.email === ADMIN_EMAIL && (
            <button className="prof-btn" style={{ width: '100%', padding: '11px', textAlign: 'center', marginTop: 8 }} onClick={onOpenAdmin}>Admin</button>
          )}
          <button className="prof-btn" style={{ width: '100%', padding: '11px', textAlign: 'center', marginTop: 8 }} onClick={onSignOut}>Sign Out</button>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 14, fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: '.06em' }}>
            <a href="/privacy.html" target="_blank" rel="noopener" style={{ color: 'var(--dim)' }}>Privacy Policy</a>
            <a href="/terms.html" target="_blank" rel="noopener" style={{ color: 'var(--dim)' }}>Terms of Service</a>
          </div>
        </div>
        </div>

        <div className="settings-group" id="sec-grp-whatsnew">
        <button type="button" className="settings-group-h" onClick={() => jumpToSection('sec-grp-whatsnew')}>v{CHANGELOG[0].version} · What's New</button>
        {/* ── WHAT'S NEW ── */}
        <div className="settings-sec">
          {CHANGELOG.map(entry => (
            <div key={entry.version} style={{ marginBottom: 14 }}>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', marginBottom: 6 }}>
                v{entry.version} — {localDateFromYMD(entry.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontFamily: "'Times New Roman',serif", fontSize: 13, lineHeight: 1.6, color: 'var(--ink)' }}>
                {entry.features.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            </div>
          ))}
        </div>
        </div>

        </div>
      </div>
      {viewingUsername && (
        <div className="onboard-overlay" style={{ zIndex: 10000 }} onClick={() => setViewingUsername(null)}>
          <div className="ob-wrap" onClick={e => e.stopPropagation()}>
            <button onClick={() => setViewingUsername(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--dim)', fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', padding: 0, marginBottom: 20 }}>← Back</button>
            {profileLoading && <div style={{ fontSize: 12, color: 'var(--dim)' }}>Loading…</div>}
            {!profileLoading && viewedProfile?.error && <div style={{ fontSize: 12, color: 'var(--red)' }}>Couldn't load this profile.</div>}
            {!profileLoading && viewedProfile && !viewedProfile.error && (
              <>
                <div className="ob-h">{viewedProfile.displayNameFirst}</div>
                <div className="ob-deck">@{viewedProfile.username}</div>
                {!viewedProfile.isFollowing && !viewedProfile.isSelf && (
                  <button className="prof-btn solid" style={{ marginTop: 12 }}
                    disabled={followingPending[viewedProfile.username]}
                    onClick={() => sendFollowRequest(viewedProfile.username)}>
                    {followingPending[viewedProfile.username] ? 'Requested' : 'Follow'}
                  </button>
                )}
                {viewedProfile.isFollowing && !viewedProfile.workouts && (
                  <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 12 }}>Workout sessions aren't visible for this account.</div>
                )}
                {viewedProfile.canCompare && (
                  <button className="prof-btn" style={{ marginTop: 12, marginLeft: viewedProfile.isFollowing && !viewedProfile.workouts ? 0 : 8 }}
                    onClick={() => setComparingUsername(viewedProfile.username)}>
                    Compare
                  </button>
                )}
                {viewedProfile.workouts && (
                  <div style={{ marginTop: 16 }}>
                    <div className="settings-sh">Recent Workouts</div>
                    {viewedProfile.workouts.slice(-10).reverse().map((w, i) => (
                      <div key={i} style={{ fontSize: 12, padding: '6px 0', borderBottom: '1px solid var(--paper2)' }}>
                        {localDateFromYMD(w.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} — {w.name} ({w.sets} sets)
                      </div>
                    ))}
                  </div>
                )}
                {/* FEATURES.md #142: same visibility gate as Recent Workouts
                    above — see index.js's /account/:username comment. */}
                {viewedProfile.rankedExercises?.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <div className="settings-sh">Ranked Favorite Exercises</div>
                    <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {viewedProfile.rankedExercises.slice(0, 10).map((r, i) => (
                        <li key={r.name} style={{ display: 'flex', gap: 8, fontSize: 12, padding: '6px 0', borderBottom: '1px solid var(--paper2)' }}>
                          <span style={{ color: 'var(--dim)', width: 16, textAlign: 'right', flexShrink: 0 }}>{i + 1}.</span>
                          <span>{r.name}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
      {comparingUsername && (
        <ComparisonScreen username={comparingUsername} otherDisplayNameFirstHint={viewedProfile?.displayNameFirst}
          onClose={() => setComparingUsername(null)} />
      )}
    </div>
  );
}

// ── MENTOR CHAT ───────────────────────────────────────────────────────────────
// Plain-language explanations matching this app's own training philosophy
// (TRAINING_ETHOS, functions/index.js) — not generic fitness content, since
// several mainstream conventions (deload weeks, RPE-only without a rep
// range) don't apply the way Press actually works.
const WIKI_CONCEPTS = [
  {
    term: 'RIR (Reps in Reserve)',
    plain: 'How many more reps you could have done before failing. RIR 2 means you stopped with 2 good reps left in the tank.',
    detail: 'This app plans sets around a target RIR, decreasing set to set — the first working set leaves more in reserve, the last set lands at RIR 0-1 (true or near-true failure). This is the primary lever the app uses, not RPE.',
  },
  {
    term: 'RPE (Rate of Perceived Exertion)',
    plain: 'The same idea as RIR, flipped: a 0-10 scale of how hard a set felt, where 10 = true failure. RPE 10 = RIR 0, RPE 8 = RIR 2, and so on.',
    detail: 'The app converts between the two internally (RIR ≈ 10 − RPE). If you\'re new to training, Effort logging shows Easy / Medium / Failure instead of a number — those map to RPE 6 / 8 / 10.',
  },
  {
    term: 'Mechanical Tension',
    plain: 'The force a muscle produces against resistance through a real range of motion — the main thing that actually drives strength and muscle growth.',
    detail: 'This is why the app heavily favors exercises with a normal, progressively-loadable range of motion, and disincentivizes isometric holds (planks, static presses) — a static hold doesn\'t give the app\'s progressive-overload system (adding weight or reps over time) anything to work with.',
  },
  {
    term: 'Double Progression',
    plain: 'Climb reps to the top of your target rep range first, then add weight and drop back to the bottom of the range.',
    detail: 'e.g. target range 6-9 reps: once you hit 9 reps at a given weight, the app suggests adding weight next session and dropping back to ~6 reps, then climbing again.',
  },
  {
    term: 'Structural Fatigue',
    plain: 'Mechanical tissue damage from training — decays over 48-72 hours per muscle. This is what makes a muscle feel "not ready" the day after a hard session.',
    detail: 'Distinct from metabolic fatigue (glycogen depletion, ~12h half-life) and CNS fatigue (nervous system load from heavy compounds, ~36h half-life) — the app tracks all three separately since they recover at different rates.',
  },
  {
    term: 'Stimulus / Adaptation',
    plain: 'How much productive training effect is currently "banked" for a muscle from recent sessions — separate from fatigue. A muscle can be fatigued and well-stimulated at the same time, or fresh and under-stimulated.',
    detail: 'Each session contributes a rise-and-decay curve — a fast inflammatory-resolution phase peaking around 12 hours, plus a slower, larger tissue-remodeling phase peaking around 48 hours, combining to a peak around 45 hours — and several sessions in a week stack together. Left untouched for long enough, this decays toward atrophy — the Adaptation tab shows this per muscle.',
  },
  {
    term: 'Frequency over Volume',
    plain: 'This app\'s core training philosophy: fewer working sets per session, spread more often across the week, rather than a few huge sessions.',
    detail: 'Full-body sessions 2-4x/week are the default shape, not a body-part split. If your logged history leans toward low reps-per-session but high frequency, the app is designed to recognize that as correctly-dosed, not under-dosed.',
  },
  {
    term: 'Why no "deload weeks"',
    plain: 'Press doesn\'t suggest scheduled deload weeks.',
    detail: 'Every generated session is already calibrated against your live fatigue numbers, so volume and exercise selection back off automatically as fatigue accumulates — a blunt whole-week deload on top of that would be redundant.',
  },
];

// FEATURES.md #62 ("Scientific Evidence Library"): every entry here quotes a
// citation that already existed somewhere in the codebase — a code comment
// or RUNNING_SCIENCE.md's References section — verbatim or near-verbatim.
// Nothing here is invented or reconstructed from partial memory of a paper;
// an algorithm with no real citation in its source comments simply isn't
// listed, rather than getting a fabricated one. RIR effectiveness (below)
// is the one deliberate exception to "always a peer-reviewed citation" —
// it's labelled as a named practitioner heuristic because that's honestly
// what the source comment says it is, not a study.
const EVIDENCE_LIBRARY = [
  {
    topic: 'Two-Phase Stimulus/Adaptation Curve',
    source: 'functions/adaptation.js',
    note: 'Fast inflammatory-resolution phase (~30% of the response, peaks ~12h) plus a slower tissue-remodeling phase (~70%, peaks ~48h) — replaces an earlier single-phase model. This is what "Stimulus / Adaptation" above describes.',
    citations: [
      'Clarkson, P. M., & Hubal, M. J. (2002). Exercise-induced muscle damage in humans. American Journal of Physical Medicine & Rehabilitation, 81(11 Suppl), S52-69.',
      'MacDougall, J. D., et al. (1995). Muscle damage following repeated bouts of eccentric exercise. Canadian Journal of Applied Physiology, 20(4), 480-486.',
    ],
  },
  {
    topic: 'RIR Effectiveness Curve',
    source: 'functions/adaptation.js',
    note: 'How much a set "counts" toward stimulus as a function of reps-in-reserve — high near failure, dipping around RIR 5-6. Named a "Niv Zinder RIR effectiveness" curve in source — a practitioner heuristic, not a peer-reviewed study, and shown as such rather than dressed up as one.',
    citations: [],
  },
  {
    topic: 'Running Load (TRIMP)',
    source: 'functions/runningLoad.js, RUNNING_SCIENCE.md §#106',
    note: 'Training Impulse — duration × heart-rate-response — the underlying daily running load figure feeding ACWR and the recommendation engine.',
    citations: [
      'Banister, E. W. (1991). Modeling elite athletic performance. Journal of Applied Physiology, 69(3), 1171-1177.',
      'Morton, R. H., Fitz-Clarke, J. R., & Banister, E. W. (1990). Modeling human performance in running. Journal of Applied Physiology, 69(3), 1171-1177.',
      'Validated against competitive runner cohorts in Lucia, A., Esteve-Lanao, J., et al. (2006). High-intensity physical training in the elderly. Journal of Applied Physiology, 100(1), 130-140.',
    ],
  },
  {
    topic: 'Acute:Chronic Workload Ratio (ACWR)',
    source: 'functions/fatigue.js, RUNNING_SCIENCE.md §#107',
    note: '7-day acute / 28-day chronic exponentially-weighted load ratio — one function shared by lifting and running load, deliberately not sport-specific constants.',
    citations: [
      'Williams, S., West, S., Cross, M. J., & Stokes, K. A. (2017). Better way to determine the acute:chronic workload ratio? British Journal of Sports Medicine, 51(4), 209-210.',
    ],
  },
  {
    topic: 'Single-Session Distance Spike (Running Injury Risk)',
    source: 'functions/runningLoad.js, RUNNING_SCIENCE.md §#102',
    note: 'This app\'s primary running-injury signal — a session more than 110% of your longest run in the past 30 days — used ahead of ACWR for running specifically, per this study\'s own finding that ACWR (validated mainly in team sports) was not significant for running injury while single-session spike was.',
    citations: [
      'Aarhus University / Garmin-RUNSAFE study (2024–2025), unpublished pre-print. N = 5,205 runners, 18 months, 588,071 sessions tracked.',
    ],
  },
  {
    topic: 'Long-Run Percentage Guidance',
    source: 'RUNNING_SCIENCE.md §#102',
    note: 'Safe range for your longest run as a share of weekly distance (25-30%, caution above 50%).',
    citations: [
      'Van Gent, R. N., Siem, D., et al. (2007). Incidence and determinants of lower-extremity running injuries. Journal of the American Podiatric Medical Association, 97(3), 229-237.',
    ],
  },
  {
    topic: 'Pace-to-HR Efficiency Factor',
    source: 'functions/runningLoad.js, RUNNING_SCIENCE.md §#99/#108',
    note: 'The trend used to detect real aerobic-fitness change from your own runs — pace per heart-rate-beat, tracked over 3-4+ runs rather than any single session.',
    citations: [
      'TrainingPeaks method — validated against lab-measured running economy (r = 0.7-0.85).',
      'Aerobic decoupling concept from Friel & Palladino\'s endurance-training literature.',
    ],
  },
  {
    topic: 'VO₂max Estimation (Daniels VDOT)',
    source: 'functions/vo2max.js, RUNNING_SCIENCE.md §#100',
    note: 'Pace-based VO₂max proxy used whenever a direct Apple Watch reading isn\'t available, and to generate training paces per intensity zone.',
    citations: [
      'Daniels, J., & Gilbert, J. C. (1979). Oxygen power: Performance tables for distance runners. Physician and Sportsmedicine, 7(12), 45-62.',
      'Daniels, J. (2014). Daniels\' Running Formula (3rd ed.). Human Kinetics.',
    ],
  },
  {
    topic: 'Karvonen Heart-Rate Zones & Max HR Estimate',
    source: 'functions/runningPrescription.js, RUNNING_SCIENCE.md §#97',
    note: 'Individualized HR training zones accounting for resting heart rate, rather than a flat percent-of-max. Max HR itself defaults to the Åstrand aging curve (more conservative than the commonly-cited 220-age Fox formula) when no measured max is available.',
    citations: [
      'Karvonen formula validated in Lucia, A., et al. (2006). High-intensity physical training in the elderly. Journal of Applied Physiology, 100(1), 130-140.',
      'Åstrand, P.-O. (1952). Experimental studies of physical working capacity in relation to sex and age.',
    ],
  },
  {
    topic: 'Chest EMG Split by Bench Angle',
    source: 'functions/chestHeadSplit.js',
    note: 'Informational lower/mid/upper pec breakdown shown per exercise — directional estimates interpolated across studies, not one continuous measurement across the full angle range.',
    citations: [
      'Trebs, A. A., et al. (2010); Rocha Jr., E. S., et al. (2007); Barnett, C., et al. (1995); Solstad, T. E., et al. (2020) — EMG comparisons of bench-press incline angle and pec activation.',
    ],
  },
  {
    topic: 'Triceps Long-Head EMG Split by Elbow-Extension Angle',
    source: 'functions/tricepsHeadSplit.js, functions/emgActivation.js',
    note: 'The long head is biarticular (crosses the shoulder as well as the elbow), so it\'s genuinely more stretched, and grows more, trained overhead vs. neutral — the lateral/medial heads are monoarticular and not meaningfully affected by arm position.',
    citations: [
      'Maeo, S., et al. (2023). European Journal of Sport Science — overhead vs. neutral triceps extension: +28.5% vs +19.6% long-head hypertrophy, +19.9% vs +13.9% whole-triceps growth over the trial.',
    ],
  },
  {
    topic: 'Hamstring EMG Split by Leg-Curl Hip Angle',
    source: 'functions/emgActivation.js',
    note: 'The biarticular hamstrings (semimembranosus, semitendinosus, long head of biceps femoris) are lengthened more, and significantly outgrew, in the hip-flexed seated position vs. lying — calves showed no comparable angle-sensitivity.',
    citations: [
      'Maeo, S., et al. (2020) — 12-week trial comparing seated vs. lying leg-curl hamstring hypertrophy.',
    ],
  },
  {
    topic: 'Self-Calibrating Endurance Model (Dose-Response)',
    source: 'RUNNING_SCIENCE.md §#112/#113',
    note: 'How the 8-week VO₂max-gain forecast learns from your own actual outcomes rather than a fixed formula — predicted vs. measured gain feeds back into the model\'s own weights.',
    citations: [
      'Bouchard, C., Rankinen, T., et al. (2011). Genomic predictors of maximal O₂ uptake. Journal of Applied Physiology, 110(5), 1160-1170.',
      'Banister, E. W., Calvert, T. W., Savage, M. V., & Bach, T. (1975). A systems model of training for athletic performance. Australian Journal of Sports Medicine, 7(3), 57-61.',
      'Gabbett, T. J. (2016). The training-injury prevention paradox. British Journal of Sports Medicine, 50(5), 273-274.',
    ],
  },
];

function WikiOverlay({ onClose }) {
  const [tab, setTab] = useState('concepts');
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const exercises = q
    ? EXERCISE_DB.filter(e => (EXERCISE_SEARCH_TAGS.get(e.name.toLowerCase()) || '').includes(q) || e.name.toLowerCase().includes(q))
    : EXERCISE_DB;

  return (
    <div className="settings-overlay">
      <div className="settings-hdr">
        <div className="settings-hdr-title">Wiki</div>
        <button className="settings-close" onClick={onClose}>Close ×</button>
      </div>
      <div className="settings-body">
        <div className="fade tab-bar" style={{ flexShrink: 0, marginBottom: 12 }}>
          <button className={`tab-btn${tab === 'concepts' ? ' active' : ''}`} onClick={() => setTab('concepts')}>Concepts</button>
          <button className={`tab-btn${tab === 'evidence' ? ' active' : ''}`} onClick={() => setTab('evidence')}>Evidence</button>
          <button className={`tab-btn${tab === 'exercises' ? ' active' : ''}`} onClick={() => setTab('exercises')}>Exercises</button>
        </div>

        {/* FEATURES.md #62: real citations only — see EVIDENCE_LIBRARY's own
            header comment for what "real" means here. */}
        {tab === 'evidence' && (
          <>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', marginBottom: 10, lineHeight: 1.6 }}>
              What backs the numbers Press shows you — every entry cites a real source. Where an algorithm is a named heuristic rather than a published study, that's said plainly instead of dressed up as one.
            </div>
            {EVIDENCE_LIBRARY.map(e => (
              <div key={e.topic} className="settings-sec" style={{ paddingTop: 12 }}>
                <div style={{ fontFamily: "'Playfair Display',serif", fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{e.topic}</div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', marginBottom: 6 }}>{e.source}</div>
                <div style={{ fontFamily: "'Times New Roman',serif", fontSize: 14, lineHeight: 1.6, marginBottom: 6 }}>{e.note}</div>
                {e.citations.length > 0 ? (
                  <ul style={{ margin: '4px 0 0 18px', fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--dim)', lineHeight: 1.7 }}>
                    {e.citations.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                ) : (
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--ember)', fontStyle: 'italic' }}>
                    Named practitioner heuristic — not a peer-reviewed citation.
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        {tab === 'concepts' && WIKI_CONCEPTS.map(c => (
          <div key={c.term} className="settings-sec" style={{ paddingTop: 12 }}>
            <div style={{ fontFamily: "'Playfair Display',serif", fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{c.term}</div>
            <div style={{ fontFamily: "'Times New Roman',serif", fontSize: 14, lineHeight: 1.6, marginBottom: 6 }}>{c.plain}</div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--dim)', lineHeight: 1.6 }}>{c.detail}</div>
          </div>
        ))}

        {tab === 'exercises' && (
          <>
            <input className="pr-search" placeholder="Search exercises or muscles…" value={search} onChange={e => setSearch(e.target.value)} style={{ marginBottom: 10 }} />
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', marginBottom: 10 }}>{exercises.length} exercise{exercises.length === 1 ? '' : 's'}</div>
            {exercises.slice(0, 60).map(e => (
              <div key={e.id} style={{ borderBottom: '1px solid var(--rule)', padding: '10px 0' }}>
                <div style={{ fontFamily: "'Playfair Display',serif", fontWeight: 700, fontSize: 15 }}>{e.name}</div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', textTransform: 'capitalize', marginBottom: 4 }}>
                  {e.equipment} · {[...e.primary].join(', ')}{e.secondary?.length ? ` (+ ${e.secondary.join(', ')})` : ''}
                </div>
                {e.form?.length > 0 && (
                  <ul style={{ margin: '4px 0 0 18px', fontFamily: "'Times New Roman',serif", fontSize: 12, lineHeight: 1.6, color: 'var(--ink)' }}>
                    {e.form.map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                )}
              </div>
            ))}
            {exercises.length > 60 && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--dim)', fontStyle: 'italic', padding: '10px 0' }}>Showing first 60 — narrow your search to see more.</div>}
          </>
        )}
      </div>
    </div>
  );
}

function MentorChat({ onClose }) {
  const [msgs, setMsgs] = useState([
    { role: 'assistant', content: 'I\'m your Personal Journalist. Ask me anything about your training, recovery, or nutrition.' }
  ]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const msgsEndRef = useRef();

  useEffect(() => {
    msgsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs, thinking]);

  const send = async () => {
    const text = input.trim();
    if (!text || thinking) return;
    const newMsgs = [...msgs, { role: 'user', content: text }];
    setMsgs(newMsgs);
    setInput('');
    setThinking(true);
    try {
      const data = await Promise.race([
        api('mentor', {
          method: 'POST',
          body: JSON.stringify({ messages: newMsgs.filter(m => m.role !== 'assistant' || newMsgs.indexOf(m) > 0).map(m => ({ role: m.role, content: m.content })) }),
        }),
        // 130s, not 60s: the backend's Gemini retry chain (callGeminiResilient
        // — up to 3 attempts at 25s each, ~10s backoff between them, plus one
        // fallback-model call on persistent 503s) can legitimately take ~120s
        // in the worst case. A shorter client timeout was giving up on
        // requests that were still going to succeed server-side.
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 130_000)),
      ]);
      setMsgs(p => [...p, { role: 'assistant', content: data.reply || 'No reply.' }]);
    } catch (e) {
      setMsgs(p => [...p, { role: 'assistant', content: `Connection error: ${e.message}` }]);
    }
    setThinking(false);
  };

  return (
    <div className="chat-panel">
      <div className="chat-hdr">
        <div>
          <div className="kicker" style={{ margin: 0 }}>Your Personal Journalist</div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'JetBrains Mono',monospace", fontSize: 13, color: 'var(--dim)' }}>×</button>
      </div>
      <div className="chat-msgs">
        {msgs.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'chat-msg-user' : 'chat-msg-asst'}>
            {m.content}
          </div>
        ))}
        {thinking && <div className="chat-msg-thinking">Personal Journalist is thinking…</div>}
        <div ref={msgsEndRef} />
      </div>
      <div className="chat-input-row">
        <input
          className="chat-input"
          placeholder="Ask your personal journalist…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          disabled={thinking}
        />
        <button className="chat-send" onClick={send} disabled={thinking || !input.trim()}>Send</button>
      </div>
    </div>
  );
}

// ── TIMELINE OVERLAY ─────────────────────────────────────────────────────────
// Fetched on open rather than bundled into /summary — buildUnifiedTimeline
// (functions/analyticsEngine.js) sorts and merges 6 differently-shaped log
// types, and nothing else on the dashboard needs that on every load.
const TIMELINE_TYPE_LABELS = { workout: 'Workout', lift: 'Lift', sleep: 'Sleep', injury: 'Injury', soreness: 'Soreness', thought: 'Thought' };

function timelineEntryLine(e) {
  const d = e.data || {};
  switch (e.type) {
    case 'workout': return `${d.name || 'Session'} — ${d.exercises?.length || 0} exercise${d.exercises?.length === 1 ? '' : 's'}`;
    case 'lift': return `${d.exercise} · ${d.kg}kg × ${d.reps}`;
    case 'sleep': return `${fmtHoursMins(d.hours)}${d.efficiency != null ? ` · ${d.efficiency}% efficiency` : ''}`;
    case 'injury': return `${d.area} — ${d.severity}${d.resolved ? ' (resolved)' : ''}`;
    case 'soreness': return `${d.muscle} · ${d.score}/10`;
    case 'thought': return `"${d.text}"`;
    default: return '';
  }
}

function TimelineOverlay({ onClose }) {
  const [entries, setEntries] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api('timeline').then(d => { if (!cancelled) setEntries(d?.entries || []); }).catch(() => { if (!cancelled) setEntries([]); });
    return () => { cancelled = true; };
  }, []);

  const grouped = useMemo(() => {
    const map = {};
    for (const e of entries || []) {
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    }
    return map;
  }, [entries]);
  const dates = Object.keys(grouped).sort().reverse();

  return (
    <div className="settings-overlay">
      <div className="settings-hdr">
        <div className="settings-hdr-title">Timeline</div>
        <button className="settings-close" onClick={onClose}>Close ×</button>
      </div>
      <div className="settings-body">
        {entries === null && (
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--dim)', fontStyle: 'italic', padding: '24px 0' }}>Loading…</div>
        )}
        {entries?.length === 0 && (
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--dim)', fontStyle: 'italic', padding: '24px 0' }}>Nothing logged yet.</div>
        )}
        {dates.map(date => (
          <div key={date}>
            <div className="pr-group-hdr">{date}</div>
            {grouped[date].map((e, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--rule)' }}>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--dim)', width: 62, flexShrink: 0 }}>
                  {TIMELINE_TYPE_LABELS[e.type] || e.type}
                </span>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--ink)' }}>{timelineEntryLine(e)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── ADMIN OVERLAY ────────────────────────────────────────────────────────────
// Dev-only raw data editor. Hidden here for anyone but the admin email, but
// that's cosmetic — the real gate is server-side (see functions/index.js's
// /admin middleware), since a client-side-only check would leave the routes
// reachable by anyone who found them.
const ADMIN_EMAIL = 'georgevcronin@gmail.com';

function AdminOverlay({ onClose }) {
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState(null);
  const [usernames, setUsernames] = useState(null);
  const [selectedUid, setSelectedUid] = useState(null);
  const [docText, setDocText] = useState('');
  const [status, setStatus] = useState('');

  const loadUsers = () => api('admin/users').then(setUsers).catch(e => setStatus('Failed to load: ' + e.message));
  const loadUsernames = () => api('admin/usernames').then(setUsernames).catch(e => setStatus('Failed to load: ' + e.message));
  useEffect(() => { loadUsers(); loadUsernames(); }, []);

  const openUser = (uid) => {
    setSelectedUid(uid);
    setStatus('');
    api(`admin/users/${uid}`).then(d => setDocText(JSON.stringify(d, null, 2))).catch(e => setStatus('Failed to load doc: ' + e.message));
  };

  const saveUser = async () => {
    let parsed;
    try { parsed = JSON.parse(docText); } catch (e) { setStatus('Invalid JSON: ' + e.message); return; }
    if (!confirm(`Overwrite users/${selectedUid} with this JSON? A backup of the current doc is saved first.`)) return;
    try {
      await api(`admin/users/${selectedUid}`, { method: 'PUT', body: JSON.stringify({ data: parsed }), throwOnError: true });
      setStatus('Saved.');
      loadUsers();
    } catch (e) { setStatus('Save failed: ' + e.message); }
  };

  const deleteUser = async () => {
    const typed = prompt(`Type the uid to permanently delete this doc (backed up first):\n${selectedUid}`);
    if (typed !== selectedUid) { if (typed !== null) setStatus('uid did not match — nothing deleted.'); return; }
    try {
      await api(`admin/users/${selectedUid}`, { method: 'DELETE', body: JSON.stringify({ confirmUid: selectedUid }), throwOnError: true });
      setStatus('Deleted.');
      setSelectedUid(null); setDocText('');
      loadUsers();
    } catch (e) { setStatus('Delete failed: ' + e.message); }
  };

  const editUsername = async (username, current) => {
    const uid = prompt(`uid for username "${username}"`, current?.uid || '');
    if (uid === null) return;
    const displayNameFirst = prompt('displayNameFirst', current?.displayNameFirst || '') || '';
    try {
      await api(`admin/usernames/${username}`, { method: 'PUT', body: JSON.stringify({ uid, displayNameFirst }), throwOnError: true });
      loadUsernames();
    } catch (e) { setStatus('Save failed: ' + e.message); }
  };

  const addUsername = async () => {
    const username = prompt('New username (will be lowercased)');
    if (!username) return;
    await editUsername(username.toLowerCase(), null);
  };

  const deleteUsername = async (username) => {
    if (!confirm(`Delete usernames/${username}? This frees it up for anyone to claim.`)) return;
    try {
      await api(`admin/usernames/${username}`, { method: 'DELETE', throwOnError: true });
      loadUsernames();
    } catch (e) { setStatus('Delete failed: ' + e.message); }
  };

  const mono = { fontFamily: "'JetBrains Mono',monospace", fontSize: 11 };

  return (
    <div className="settings-overlay">
      <div className="settings-hdr">
        <div className="settings-hdr-title">Admin</div>
        <button className="settings-close" onClick={onClose}>Close ×</button>
      </div>
      <div className="settings-body">
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button className="prof-btn" onClick={() => setTab('users')} style={{ fontWeight: tab === 'users' ? 700 : 400 }}>Users</button>
          <button className="prof-btn" onClick={() => setTab('usernames')} style={{ fontWeight: tab === 'usernames' ? 700 : 400 }}>Usernames</button>
        </div>
        {status && <div style={{ ...mono, color: 'var(--dim)', marginBottom: 10 }}>{status}</div>}

        {tab === 'users' && (
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ width: 220, flexShrink: 0, maxHeight: 480, overflowY: 'auto' }}>
              {(users || []).map(u => (
                <div key={u.uid} onClick={() => openUser(u.uid)}
                  style={{ ...mono, fontSize: 10, padding: '6px 4px', cursor: 'pointer', borderBottom: '1px solid var(--rule)', background: selectedUid === u.uid ? 'var(--rule)' : 'transparent' }}>
                  <div>{u.username || '(no username)'}</div>
                  <div style={{ color: 'var(--dim)' }}>{u.uid}</div>
                </div>
              ))}
            </div>
            <div style={{ flex: 1 }}>
              {selectedUid ? (
                <>
                  <textarea value={docText} onChange={e => setDocText(e.target.value)}
                    style={{ ...mono, width: '100%', height: 400, boxSizing: 'border-box' }} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button className="prof-btn" onClick={saveUser}>Save</button>
                    <button className="prof-btn" onClick={deleteUser} style={{ color: 'var(--bad, red)' }}>Delete</button>
                  </div>
                </>
              ) : <div style={{ ...mono, color: 'var(--dim)' }}>Select a user.</div>}
            </div>
          </div>
        )}

        {tab === 'usernames' && (
          <div>
            <button className="prof-btn" onClick={addUsername} style={{ marginBottom: 10 }}>+ Add username</button>
            {(usernames || []).map(u => (
              <div key={u.username} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--rule)' }}>
                <span style={{ ...mono, width: 140 }}>{u.username}</span>
                <span style={{ ...mono, fontSize: 10, color: 'var(--dim)', flex: 1 }}>{u.uid} · {u.displayNameFirst}</span>
                <button className="prof-btn" onClick={() => editUsername(u.username, u)}>Edit</button>
                <button className="prof-btn" onClick={() => deleteUsername(u.username)}>Delete</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── NEWSCAST OVERLAY ─────────────────────────────────────────────────────────
function NewscastOverlay({ newscast, onClose }) {
  const period = newscast?.period;
  const label = period === 'afternoon' ? 'Mid-Day Update' : "Tonight's Report";
  const dateStr = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();
  const numbers = newscast?.bullets?.numbers || [];

  return (
    <div className="briefing-overlay">
      <div className="briefing-hdr">
        <div>
          <div className="briefing-masthead">THE PRESS</div>
          <div className="briefing-edition">{label} · {dateStr}</div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--paper)', cursor: 'pointer', fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', opacity: .7 }}>Close ×</button>
      </div>
      <div className="briefing-body">
        <div className="briefing-top">
          <div className="briefing-headline">{newscast?.headline || label.toUpperCase()}</div>
          <div className="briefing-sub">{newscast?.subheading}</div>
        </div>
        <div className="briefing-columns">
          {numbers.length > 0 && (
            <div className="briefing-section">
              <div className="briefing-kicker">At a Glance</div>
              <div className="briefing-stat-grid">
                {numbers.map((n, i) => (
                  <div key={i} className="briefing-stat">
                    <div className="briefing-stat-val">{n.value}</div>
                    <div className="briefing-stat-lbl">{n.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {newscast?.pullQuote && (
            <div className="briefing-section"><div className="briefing-pull">{newscast.pullQuote}</div></div>
          )}

          <div className="briefing-section">
            <div className="briefing-byline">V</div>
            <div className="briefing-byline-role">Health &amp; Performance</div>
            <div className="briefing-prose">{newscast?.v}</div>
          </div>

          {newscast?.atlas && (
            <div className="briefing-section">
              <div className="briefing-byline">Atlas</div>
              <div className="briefing-byline-role">Training</div>
              <div className="briefing-prose">{newscast.atlas}</div>
            </div>
          )}

          {newscast?.nutritionNote && (
            <div className="briefing-section">
              <div className="briefing-byline" style={{ borderTopColor: 'var(--gold)' }}>Fuel</div>
              <div className="briefing-byline-role">Nutrition</div>
              <div className="briefing-prose" style={{ fontStyle: 'italic', color: 'var(--gold)' }}>{newscast.nutritionNote}</div>
            </div>
          )}
        </div>
        <button className="briefing-open-btn" onClick={onClose}>Back to Press</button>
      </div>
    </div>
  );
}

// ── WEEKLY REVIEW OVERLAY ────────────────────────────────────────────────────
// Phase 8: separate from NewscastOverlay (which stays generic across the
// afternoon/night periods) since this shape carries three deterministic
// sections — goal check, working/needs attention, fatigue trend — that only
// ever apply to the weekly digest.
function WeeklyReviewOverlay({ review, onClose }) {
  const dateStr = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();
  const numbers = review?.bullets?.numbers || [];
  const goalCheck = review?.goalCheck || [];
  const working = review?.workingAttention?.working || [];
  const needsAttention = review?.workingAttention?.needsAttention || [];
  const fatigue = review?.fatigueTrend;
  const fatigueDrivers = fatigue ? [
    ...(fatigue.topFatigued || []),
    fatigue.cns != null ? `CNS ${fatigue.cns}%` : null,
    fatigue.metabolic != null ? `Metabolic ${fatigue.metabolic}%` : null,
  ].filter(Boolean) : [];

  return (
    <div className="briefing-overlay">
      <div className="briefing-hdr">
        <div>
          <div className="briefing-masthead">THE PRESS</div>
          <div className="briefing-edition">Weekly Review · {dateStr}</div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--paper)', cursor: 'pointer', fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', opacity: .7 }}>Close ×</button>
      </div>
      <div className="briefing-body">
        <div className="briefing-top">
          <div className="briefing-headline">{review?.headline || 'WEEKLY REVIEW'}</div>
          <div className="briefing-sub">{review?.subheading}</div>
        </div>
        <div className="briefing-columns">
          {numbers.length > 0 && (
            <div className="briefing-section">
              <div className="briefing-kicker">At a Glance</div>
              <div className="briefing-stat-grid">
                {numbers.map((n, i) => (
                  <div key={i} className="briefing-stat">
                    <div className="briefing-stat-val">{n.value}</div>
                    <div className="briefing-stat-lbl">{n.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {goalCheck.length > 0 && (
            <div className="briefing-section">
              <div className="briefing-kicker">Goal Check</div>
              {goalCheck.map((line, i) => <div key={i} className="briefing-goal-line">{line}</div>)}
            </div>
          )}

          {(working.length > 0 || needsAttention.length > 0) && (
            <div className="briefing-section">
              <div className="briefing-kicker">What's Working / Needs Attention</div>
              <div className="briefing-bullets">
                <div>{working.map((w, i) => <div key={i} className="briefing-win">+ {w}</div>)}</div>
                <div>{needsAttention.map((m, i) => <div key={i} className="briefing-miss">- {m}</div>)}</div>
              </div>
            </div>
          )}

          {fatigue && (
            <div className="briefing-section">
              <div className="briefing-kicker">Fatigue Trend</div>
              <div className="briefing-fatigue-headline">
                Recovery {fatigue.recoveryThisWeek != null ? `${fatigue.recoveryThisWeek}%` : '—'}
                {fatigue.recoveryLastWeek != null && ` (${fatigue.recoveryThisWeek >= fatigue.recoveryLastWeek ? '+' : ''}${fatigue.recoveryThisWeek - fatigue.recoveryLastWeek} vs last week)`}
              </div>
              {fatigueDrivers.length > 0 && (
                <div className="briefing-fatigue-detail">Driven by: {fatigueDrivers.join(', ')}</div>
              )}
            </div>
          )}

          {review?.pullQuote && (
            <div className="briefing-section"><div className="briefing-pull">{review.pullQuote}</div></div>
          )}

          <div className="briefing-section">
            <div className="briefing-byline">V</div>
            <div className="briefing-byline-role">Health &amp; Performance</div>
            <div className="briefing-prose">{review?.v}</div>
          </div>

          {review?.atlas && (
            <div className="briefing-section">
              <div className="briefing-byline">Atlas</div>
              <div className="briefing-byline-role">Training</div>
              <div className="briefing-prose">{review.atlas}</div>
            </div>
          )}

          {review?.nutritionNote && (
            <div className="briefing-section">
              <div className="briefing-byline" style={{ borderTopColor: 'var(--gold)' }}>Fuel</div>
              <div className="briefing-byline-role">Nutrition</div>
              <div className="briefing-prose" style={{ fontStyle: 'italic', color: 'var(--gold)' }}>{review.nutritionNote}</div>
            </div>
          )}
        </div>
        <button className="briefing-open-btn" onClick={onClose}>Back to Press</button>
      </div>
    </div>
  );
}

// ── BRIEFING OVERLAY ─────────────────────────────────────────────────────────
function BriefingOverlay({ briefing, onClose }) {
  const dateStr = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase();
  const wins = briefing?.bullets?.wins || [];
  const misses = briefing?.bullets?.misses || [];
  const numbers = briefing?.bullets?.numbers || [];

  return (
    <div className="briefing-overlay">
      <div className="briefing-hdr">
        <div>
          <div className="briefing-masthead">THE PRESS</div>
          <div className="briefing-edition">Morning Edition · {dateStr}</div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--paper)', cursor: 'pointer', fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', opacity: .7 }}>Close ×</button>
      </div>

      <div className="briefing-body">
        <div className="briefing-top">
          <div className="briefing-headline">{briefing?.headline || 'YOUR MORNING BRIEFING'}</div>
          <div className="briefing-sub">{briefing?.subheading}</div>
        </div>

        <div className="briefing-columns">
          {(wins.length > 0 || misses.length > 0 || numbers.length > 0) && (
            <div className="briefing-section">
              <div className="briefing-kicker">At a Glance</div>
              {(wins.length > 0 || misses.length > 0) && (
                <div className="briefing-bullets">
                  <div>{wins.map((w, i) => <div key={i} className="briefing-win">+ {w}</div>)}</div>
                  <div>{misses.map((m, i) => <div key={i} className="briefing-miss">- {m}</div>)}</div>
                </div>
              )}
              {numbers.length > 0 && (
                <div className="briefing-stat-grid">
                  {numbers.map((n, i) => (
                    <div key={i} className="briefing-stat">
                      <div className="briefing-stat-val">{n.value}</div>
                      <div className="briefing-stat-lbl">{n.label}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {briefing?.pullQuote && (
            <div className="briefing-section"><div className="briefing-pull">{briefing.pullQuote}</div></div>
          )}

          <div className="briefing-section">
            <div className="briefing-byline">V</div>
            <div className="briefing-byline-role">Health &amp; Performance</div>
            <div className="briefing-prose">{briefing?.v}</div>
          </div>

          {briefing?.atlas && (
            <div className="briefing-section">
              <div className="briefing-byline">Atlas</div>
              <div className="briefing-byline-role">Training</div>
              <div className="briefing-prose">{briefing.atlas}</div>
            </div>
          )}

          {briefing?.fuel && (
            <div className="briefing-section">
              <div className="briefing-byline" style={{ borderTopColor: 'var(--gold)' }}>Fuel</div>
              <div className="briefing-byline-role">Nutrition</div>
              <div className="briefing-prose" style={{ fontStyle: 'italic' }}>{briefing.fuel}</div>
            </div>
          )}
        </div>

        <button className="briefing-open-btn" onClick={onClose}>Open Press</button>
      </div>
    </div>
  );
}

// ── APP ──────────────────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div style={{ minHeight: '100svh', background: 'var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--dim)' }}>Loading…</div>
    </div>
  );
}

function LoginScreen() {
  const [showEmail, setShowEmail] = useState(false);
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const redirectErr = sessionStorage.getItem('auth_redirect_error') || '';
  const [err, setErr] = useState(redirectErr ? `Google sign-in failed: ${redirectErr}` : '');
  useEffect(() => { sessionStorage.removeItem('auth_redirect_error'); }, []);


  // Called synchronously from tap — no await before signInWithPopup so iOS
  // Safari recognises it as a user-gesture and allows the popup to open.
  const google = () => {
    setErr(''); setBusy(true);
    signInWithPopup(auth, googleProvider)
      .catch(e => { setErr(e.code || e.message || 'Sign-in failed'); setBusy(false); });
  };

  const submit = async e => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      if (mode === 'signin') await signInWithEmailAndPassword(auth, email.trim(), password);
      else await createUserWithEmailAndPassword(auth, email.trim(), password);
    } catch (ex) {
      setErr(
        ex.code === 'auth/invalid-credential' ? 'Wrong email or password.' :
        ex.code === 'auth/email-already-in-use' ? 'Account already exists — sign in instead.' :
        ex.code === 'auth/weak-password' ? 'Password must be at least 6 characters.' :
        ex.code === 'auth/invalid-email' ? 'Invalid email address.' : ex.message
      );
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-rule" />
      <div className="auth-logo">PRESS</div>
      <div className="auth-tag">Personal Health Operating System</div>
      <div className="auth-form">
        <button className="auth-submit" onClick={google} disabled={busy} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#fff" fillOpacity=".9"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#fff" fillOpacity=".75"/>
            <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#fff" fillOpacity=".6"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z" fill="#fff" fillOpacity=".45"/>
          </svg>
          {busy ? 'Signing in…' : 'Continue with Google'}
        </button>

        {!showEmail && (
          <div className="auth-toggle" style={{ marginTop: 16 }}>
            <span onClick={() => setShowEmail(true)}>Use email &amp; password instead</span>
          </div>
        )}

        {showEmail && <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0 12px' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
            <span style={{ fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--dim)' }}>or</span>
            <div style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
          </div>
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="auth-field">
              <label className="auth-lbl">Email</label>
              <input className="auth-input" type="email" placeholder="you@example.com"
                value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            <div className="auth-field">
              <label className="auth-lbl">Password</label>
              <input className="auth-input" type="password" placeholder="••••••••"
                value={password} onChange={e => setPassword(e.target.value)} required
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />
            </div>
            <button className="auth-submit" type="submit" disabled={busy} style={{ background: 'none', color: 'var(--ink)', border: '1px solid var(--ink)' }}>
              {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
            <div className="auth-toggle">
              {mode === 'signin'
                ? <>New? <span onClick={() => { setMode('register'); setErr(''); }}>Create account</span></>
                : <>Have an account? <span onClick={() => { setMode('signin'); setErr(''); }}>Sign in</span></>}
            </div>
          </form>
        </>}

        {err && <div className="auth-err" style={{ marginTop: 12 }}>{err}</div>}
      </div>
      <div className="auth-rule-bottom" />
    </div>
  );
}

// Mandatory before the rest of the app renders — gated in App() on
// `!s.profile?.username`, which catches both brand-new signups and
// accounts that existed before this feature shipped (see
// .design/feature-brainstorm/USERNAME_AND_COMPARISON.md, "every account
// must have a username"). Reuses Onboarding's overlay/input styling
// (onboard-overlay, ob-* classes) rather than inventing new CSS for a
// single-step form.
function UsernameSetup({ user, onComplete }) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api(`account/username-suggestion?name=${encodeURIComponent(user?.displayName || '')}`)
      .then(r => { if (!cancelled && r.username) setUsername(r.username); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const usernameErr = username ? validateUsername(username) : null;
  const displayNameErr = displayName ? validateDisplayName(displayName) : null;

  const submit = async () => {
    if (usernameErr || displayNameErr || !username || !displayName) return;
    setSaving(true);
    setError('');
    try {
      const r = await api('account/username', {
        method: 'POST',
        body: JSON.stringify({ username, displayName }),
      });
      if (r.error) { setError(r.error); setSaving(false); return; }
      onComplete();
    } catch (e) {
      setError(`Connection error: ${e.message}`);
      setSaving(false);
    }
  };

  const inputStyle = { width: '100%', border: 'none', borderBottom: '2px solid var(--ink)', padding: '8px 0', background: 'transparent', fontFamily: 'Times New Roman,serif', fontSize: 16, outline: 'none', color: 'var(--ink)' };

  return (
    <div className="onboard-overlay">
      <div className="ob-wrap">
        <div className="ob-logo">Press</div>
        <div className="ob-h">Choose a username</div>
        <div className="ob-deck">Every Press account needs a unique username — we've suggested one below, keep it or change it. Your display name is what other people actually see; only your first name is ever shown to them.</div>

        <label className="ob-label">Display name</label>
        <input style={inputStyle} value={displayName} maxLength={30}
          onChange={e => { setDisplayName(e.target.value); setError(''); }} placeholder="Your name" />
        {displayNameErr && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--red)', marginTop: 6 }}>{displayNameErr}</div>}

        <label className="ob-label">Username</label>
        <input style={inputStyle} value={username} maxLength={USERNAME_MAX}
          onChange={e => { setUsername(normalizeUsername(e.target.value)); setError(''); }}
          placeholder="lowercase-letters-numbers-hyphens" autoCapitalize="none" autoCorrect="off" />
        {usernameErr && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--red)', marginTop: 6 }}>{usernameErr}</div>}

        {error && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--red)', marginTop: 16 }}>{error}</div>}

        <div className="ob-nav" style={{ justifyContent: 'flex-end' }}>
          <button className="ob-next" onClick={submit} disabled={saving || !username || !displayName || !!usernameErr || !!displayNameErr}>
            {saving ? 'Saving…' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Interactive section walkthrough (FEATURES.md #145) — a deliberate, scoped
// exception to PRODUCT.md Design Principle #5 ("no onboarding copy, no
// empty-state evangelism"); see that file's note under Design Principle #5
// for why this exists and what it does NOT change elsewhere in the app.
//
// Covers every dock section (s1-s11) plus Settings itself — the 'settings'
// key auto-fires the same first-encounter way the sections do (see
// useWalkthroughEncounter('settings', ...) in App), which is a further,
// explicit extension of the Design Principle #5 exception beyond what
// PRODUCT.md originally scoped it to; that doc's note has been updated to
// match. Every target is a `data-tour="..."` attribute placed directly in
// that section's own JSX, scoped to that section's markup so there's never a
// collision with another section's identically-styled element (several
// sections share a `.panel-head`, for instance).
const WALKTHROUGH_CONTENT = {
  s1: {
    label: 'Dispatch',
    steps: [
      { target: '[data-tour="s1-headline"]', title: "Today's Edition",
        body: "The masthead states today's readiness verdict — clear for heavy load, moderate, or rest — derived from last night's recovery score. It updates as new HRV, resting heart rate, and sleep data lands, so it's worth a glance before planning the day, not just after." },
      { target: '[data-tour="s1-limiting-factor"]', title: "Today's Limiting Factor",
        body: "When one thing is capping today's output — a fatigued muscle, accumulated CNS load, poor sleep — this names it and states the expected effect, rather than leaving you to infer it from several separate numbers." },
      { target: '[data-tour="s1-vitals"]', title: 'Recovery & Vitals',
        body: 'Recovery out of 100 on the left; HRV, resting heart rate, sleep, and average muscle fatigue on the right. Each is read against your own rolling baseline, not a population norm — a 2ms HRV swing means something different for you than for someone else.' },
      { target: '[data-tour="s1-progress"]', title: 'Daily Progress',
        body: "Five bars against today's targets. Fatigue is the only one where filling the bar isn't the goal — it's tracked against a ceiling, not a target." },
      { target: '[data-tour="s1-streaks"]', title: 'Streaks',
        body: 'Consecutive days of training, hydration, and sleep-target adherence. Descriptive only — nothing changes because of a streak; it exists so a lapse is visible, not to gamify consistency.' },
      { target: '[data-tour="s1-timeline"]', title: 'Timeline',
        body: 'Every workout, sleep night, injury, and logged thought in one chronological feed — the fastest way to see how today connects to the last few weeks.' },
    ],
  },
  s3: {
    label: 'Training',
    steps: [
      { target: '[data-tour="s3-headline"]', title: 'Last Session',
        body: "The most recent workout's headline lift and volume — a record of what happened, not a plan for what's next. The plan is below, in Plan Ahead." },
      { target: '[data-tour="s3-stats"]', title: 'Session Vitals',
        body: "Duration, an estimated energy output, and this month's session count. Output is a rough figure from load and volume, not a wearable-measured one." },
      { target: '[data-tour="s3-plan-ahead"]', title: 'Plan Ahead',
        body: 'An auto-generated calendar built from your current per-muscle recovery, weekly targets, and any blackout days set in Settings. It re-solves itself session to session rather than following a fixed template.' },
      { target: '[data-tour="s3-week"]', title: 'This Week',
        body: 'Which days actually had a session logged, Monday to Sunday — a consistency check independent of the plan above.' },
      { target: '[data-tour="s3-tools"]', title: 'Import & History',
        body: 'Pull sets in from Hevy, or open the full logged history. Neither is required — the session logger works standalone.' },
    ],
  },
  s5: {
    label: 'Recovery',
    steps: [
      { target: '[data-tour="s5-headline"]', title: 'Recovery',
        body: 'The state of your structural, metabolic, and CNS recovery right now, in one line — the same verdict driving the Dispatch readiness score, explained here at the level of individual factors.' },
      { target: '[data-tour="s5-drivers"]', title: 'Recovery Drivers',
        body: "The exact factors composing today's recovery score, ranked by how many points each is costing you against its own maximum — not by raw contribution, which would put HRV first every day purely for its weight." },
      { target: '[data-tour="s5-forecast"]', title: 'Recovery Forecast',
        body: "Predicted date each muscle group clears its current fatigue, inverted from the same decay model behind today's numbers — a forecast, not a new measurement." },
      { target: '[data-tour="s5-tabs"]', title: 'Views',
        body: "Structural fatigue by muscle, strength ranking, fatigue type, and more. Switch tabs rather than scrolling past what you don't need today." },
      { target: '[data-tour="s5-triptych"]', title: 'Body Map',
        body: "Colour maps every tracked muscle onto anterior, lateral, and posterior views. Colour is paired with position and a numeric readout below, so it still reads correctly if you can't distinguish red from green." },
      { target: '[data-tour="s5-muscles"]', title: 'Per-Muscle Detail',
        body: 'Every tracked muscle, most fatigued first, with the exact recovery percentage next to each bar from Intermediate detail level up.' },
    ],
  },
  s2: {
    label: 'Sleep',
    steps: [
      { target: '[data-tour="s2-headline"]', title: 'Sleep',
        body: "Last night's hours and efficiency, plus running sleep debt. The target underneath is learned from your recent nights once there's enough history — a plain default until then." },
      { target: '[data-tour="s2-chart"]', title: 'Nightly Trend',
        body: 'Hours per night over the tracked window, with the target drawn in as a dashed line.' },
      { target: '[data-tour="s2-stats"]', title: 'Night Stats',
        body: 'High, low, and average across the same window, plus sleep debt — hours short of target that still need clearing.' },
      { target: '[data-tour="s2-score"]', title: 'Sleep Score',
        body: 'A composite out of 100 from whichever components you have data for — efficiency and duration always, deep/REM/light split and overnight HR dip once your device reports them.' },
      { target: '[data-tour="s2-alcohol"]', title: 'Alcohol',
        body: "Log last night's units here — it factors into how HRV and sleep readings are read against your baseline, not just a separate note." },
    ],
  },
  s4: {
    label: 'Nutrition',
    steps: [
      { target: '[data-tour="s4-headline"]', title: 'Nutrition',
        body: "Today's calories against target, and how far short (or on target) you are." },
      { target: '[data-tour="s4-macros"]', title: 'Macros & Water',
        body: 'Protein, carbs, and fat against their own targets, plus water — logged separately with the +/− buttons.' },
      { target: '[data-tour="s4-scan"]', title: 'Photo & Barcode Scan',
        body: 'Photograph a meal or a nutrition label, scan a barcode, or just describe what you ate in a sentence — any of the three gets an estimate you can still edit before logging.' },
      { target: '[data-tour="s4-log"]', title: 'Manual Entry',
        body: 'Type in a meal directly, or fill it from a scan above — either way it lands in the same form, editable before you log it.' },
      { target: '[data-tour="s4-tabs"]', title: 'Recent, Templates & History',
        body: 'Re-log something you\'ve eaten before, save a combination as a reusable template, or look back over the last 7 days.' },
    ],
  },
  s6: {
    label: 'Body',
    steps: [
      { target: '[data-tour="s6-headline"]', title: 'Profile',
        body: "Your profile name, and everything below tracks the body itself — supplements, weight, measurements, and progress photos." },
      { target: '[data-tour="s6-supplements"]', title: "Today's Supplements",
        body: 'Whatever you\'ve added to your stack in Settings, with a check-off for whether it\'s been taken today.' },
      { target: '[data-tour="s6-bodydata"]', title: 'Weight & Body Fat',
        body: 'Log either or both — the delta against your last entry shows once there\'s a previous one to compare against.' },
      { target: '[data-tour="s6-trends"]', title: 'Long-Term Trends',
        body: 'Any tracked metric — weight, HRV, e1RM on a given lift, and more — charted over 14 days to a year.' },
      { target: '[data-tour="s6-measurements"]', title: 'Measurements',
        body: 'Tape-measure tracking by body part, in cm or inches, with the delta against your last logged reading for that part.' },
      { target: '[data-tour="s6-photos"]', title: 'Progress Photos',
        body: 'A dated photo strip with an optional note — visual record alongside the numbers above.' },
    ],
  },
  s7: {
    label: 'Records',
    steps: [
      { target: '[data-tour="s7-headline"]', title: 'All-Time Bests',
        body: "Every exercise you've logged a lift for, tracked by estimated one-rep max (e1RM), not just the heaviest single set." },
      { target: '[data-tour="s7-strength"]', title: 'Strength Level',
        body: 'Per-muscle strength ranked against published bodyweight standards (Beginner through Elite) — needs sex set in Settings to calibrate, and enough logged lifts to rank a given muscle at all.' },
      { target: '[data-tour="s7-list"]', title: 'Records by Movement',
        body: 'Every PR grouped by movement pattern, most recent first within each — NEW marks anything set in the last 14 days.' },
    ],
  },
  s8: {
    label: 'Goals',
    steps: [
      { target: '[data-tour="s8-headline"]', title: 'Your Goals',
        body: 'Whatever training goals you set — in Onboarding or here — with Edit to add, change, or remove one.' },
      { target: '[data-tour="s8-list"]', title: 'Progress Against Target',
        body: 'A concrete goal (a target weight, a specific lift, a target date) tracks your current value against it wherever Press already has the data — no target just tracks the trend, no fabricated numbers either way.' },
    ],
  },
  s9: {
    label: 'Social',
    steps: [
      { target: '[data-tour="s9-headline"]', title: 'Follow & Compare',
        body: 'Follow requests, search, and the activity feed from people you follow — the same social tools also reachable from Settings → Social.' },
      { target: '[data-tour="s9-search"]', title: 'Find People',
        body: 'Search by username and send a follow request — profiles stay private until accepted.' },
      { target: '[data-tour="s9-feed"]', title: 'Activity',
        body: "Recent sessions from people you follow who've also opted their own activity feed on — it's a separate opt-in from workout visibility, off by default even if that one is on." },
    ],
  },
  s10: {
    label: 'Cycle',
    steps: [
      { target: '[data-tour="s10-headline"]', title: 'Cycle-Aware Recovery',
        body: 'Current cycle day if a period is open, otherwise a prompt to log one starting — this feeds a training-impact adjustment, not just a log.' },
      { target: '[data-tour="s10-status"]', title: 'Training Impact',
        body: "A plain-language read of how much this cycle is affecting training, refined automatically from how sessions actually go rather than staying a fixed guess." },
      { target: '[data-tour="s10-form"]', title: 'Log a Period',
        body: 'Set a start or end date directly — including a past period entirely, to backfill history the calibration can learn from.' },
      { target: '[data-tour="s10-calendar"]', title: 'History',
        body: 'Logged periods marked solid, one predicted next-period window as an outline — tap a logged day to see, edit, or remove it.' },
    ],
  },
  s11: {
    label: 'Running',
    steps: [
      { target: '[data-tour="s11-headline"]', title: 'Running',
        body: "Today's prescribed session type, from a readiness score built the same way as Dispatch's — only shown once you've synced a run." },
      { target: '[data-tour="s11-readiness"]', title: "Today's Prescription",
        body: 'Readiness percentage, duration range, and — for a workout day — the specific pace or heart-rate zone and why, all in one read.' },
      { target: '[data-tour="s11-week"]', title: 'This Week',
        body: "Runs logged, acute:chronic training load (a standard injury-risk ratio), and 4-week efficiency trend." },
      { target: '[data-tour="s11-vo2max"]', title: 'VO₂max',
        body: 'Current estimate and, where there\'s enough training load to project from, a forecast 8 weeks out.' },
    ],
  },
  settings: {
    label: 'Settings',
    steps: [
      { target: '[data-tour="settings-header"]', title: 'Settings',
        body: 'Every account, training, and app preference lives here in one continuous page rather than behind separate screens — Close returns you to the dashboard.' },
      { target: '[data-tour="settings-toc"]', title: 'Section Index',
        body: "Jumps straight to any section, and highlights whichever one you're currently scrolled to — but everything is also just a normal page you can scroll by hand." },
      { target: '[data-tour="settings-identity"]', title: 'Identity',
        body: 'Name, username, and the basics that calibrate the rest of the app — the first of several groups laid out below, in the same order as the index.' },
    ],
  },
};

// Fires `onEncounter(sectionId)` the first time #<sectionId> actually has
// on-screen geometry after becoming eligible. Covers both navigation styles
// the app has: on mobile, every dock section sits in one .mobile-track
// carousel and is always mounted, just shifted off-screen by a transform
// when it isn't the active one — a plain viewport IntersectionObserver still
// only reports it intersecting once it's actually scrolled into place, same
// as a tap or swipe would produce; on desktop's simultaneous masonry/grid
// layout, every section is mounted at once, so "first encountered" means
// "first scrolled into view" instead. Same observer, same callback, no
// branch needed for which layout is active. (beginWalkthrough in App has
// its own mobile-only fix for the inverse case — a *forced* start, e.g.
// Replay Walkthrough, that isn't gated by this observer at all and so needs
// to swipe the carousel itself before it can trust any geometry it reads.)
//
// Deliberately no local "already fired" ref here — App's own
// walkthroughFiredRef is the one source of truth for "already auto-shown
// this session", and it's the thing "Replay Walkthrough" clears. A local
// ref here would never get cleared by that reset, silently disabling
// re-encounter for the rest of the session even after a reset.
function useWalkthroughEncounter(sectionId, disabled, onEncounter) {
  const cbRef = useRef(onEncounter);
  useEffect(() => { cbRef.current = onEncounter; });
  useEffect(() => {
    if (disabled || !WALKTHROUGH_CONTENT[sectionId]) return;
    const el = document.getElementById(sectionId);
    if (!el) return;
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) {
        io.disconnect();
        cbRef.current(sectionId);
      }
    }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, [disabled, sectionId]);
}

function WalkthroughOverlay({ sectionId, stepIndex, onNext, onBack, onClose }) {
  const content = WALKTHROUGH_CONTENT[sectionId];
  const step = content?.steps?.[stepIndex];
  const [rect, setRect] = useState(null);
  const tooltipRef = useRef(null);
  const onNextRef = useRef(onNext);
  useEffect(() => { onNextRef.current = onNext; });

  useLayoutEffect(() => {
    if (!step) return;
    let cancelled = false;
    const measure = () => {
      const el = document.querySelector(step.target);
      const r = el?.getBoundingClientRect();
      if (r && r.width > 0 && r.height > 0) { if (!cancelled) setRect(r); return; }
      if (!cancelled) setRect(null);
    };
    // Bring the target into view before measuring it — a tall panel (S7's PR
    // list, Settings' scrollable body) can easily put the next step below
    // the fold, where the spotlight would otherwise land on real-but-
    // off-screen coordinates. scrollIntoView walks up through any nested
    // scroll container on its own, so this covers a plain page scroll and a
    // scrollable overlay body the same way. The resize/scroll listeners and
    // interval below already re-measure continuously, so a smooth scroll's
    // async settle just gets picked up on its own, no extra sequencing.
    const initialEl = document.querySelector(step.target);
    if (initialEl) {
      const r = initialEl.getBoundingClientRect();
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (r.top < 0 || r.bottom > window.innerHeight) {
        initialEl.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center', inline: 'nearest' });
      }
    }
    measure();
    // A step whose target never rendered (e.g. no Limiting Factor active
    // today) skips itself forward one tick after mounting rather than
    // showing a spotlight with nothing to point at — begin-time filtering
    // in App already guarantees at least one step in the tour resolves.
    const skipIfEmpty = setTimeout(() => {
      const el = document.querySelector(step.target);
      const r = el?.getBoundingClientRect();
      if (!cancelled && (!r || r.width === 0 || r.height === 0)) onNextRef.current();
    }, 60);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    const interval = setInterval(measure, 400);
    return () => {
      cancelled = true;
      clearTimeout(skipIfEmpty);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      clearInterval(interval);
    };
  }, [step, sectionId, stepIndex]);

  useEffect(() => { tooltipRef.current?.focus(); }, [stepIndex, sectionId]);

  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') onNext();
      else if (e.key === 'ArrowLeft' && stepIndex > 0) onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onNext, onBack, onClose, stepIndex]);

  if (!content || !step) return null;

  const PAD = 6;
  const spotStyle = rect
    ? { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2, opacity: 1 }
    : { top: -9999, left: -9999, width: 0, height: 0, opacity: 0 };

  const TT_W = 300;
  const spaceBelow = rect ? window.innerHeight - rect.bottom : 0;
  const placeAbove = !!rect && spaceBelow < 200 && rect.top > 200;
  const tooltipStyle = rect ? {
    ...(placeAbove ? { bottom: Math.max(12, window.innerHeight - rect.top + 14) } : { top: Math.min(rect.bottom + 14, window.innerHeight - 60) }),
    left: Math.min(Math.max(12, rect.left), Math.max(12, window.innerWidth - TT_W - 12)),
  } : { top: '50%', left: '50%', transform: 'translate(-50%,-50%)' };

  return (
    <div className="tour-overlay">
      <div className="tour-spotlight" style={spotStyle} />
      <div className="tour-tooltip" style={tooltipStyle} role="dialog" aria-modal="false"
        aria-label={`${content.label} walkthrough — step ${stepIndex + 1} of ${content.steps.length}`}
        tabIndex={-1} ref={tooltipRef}>
        <button className="tour-close" aria-label="Close walkthrough" onClick={onClose}>×</button>
        <div className="tour-kicker">{content.label} · {stepIndex + 1} / {content.steps.length}</div>
        <div className="tour-title">{step.title}</div>
        <div className="tour-body">{step.body}</div>
        <div className="tour-actions">
          <button className="tour-skip" onClick={onClose}>Skip</button>
          <div className="tour-actions-end">
            {stepIndex > 0 && <button className="tour-btn" onClick={onBack}>Back</button>}
            <button className="tour-btn solid" onClick={onNext}>{stepIndex === content.steps.length - 1 ? 'Done' : 'Next'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Packs the desktop dashboard's panels into the grid masonry described in
// PRESS_CSS's .scroll block: measure each panel's natural height, express it
// as a span of 1px grid rows, then redraw the column hairlines from the grid's
// resolved track widths.
//
// Whether masonry is on is read back from the computed grid rather than a JS
// breakpoint — .scroll is only display:grid above 480px, so gridTemplateColumns
// is "none" on mobile, and there's no second copy of the breakpoint to drift
// out of sync with the media query.
function layoutMasonry() {
  const scroll = document.getElementById('press-scroll');
  if (!scroll) return;
  const panels = [...scroll.querySelectorAll(':scope > .panel')];
  const tracks = getComputedStyle(scroll).gridTemplateColumns;
  const host = document.getElementById('col-rules');

  if (!tracks || tracks === 'none') {
    panels.forEach(panel => { panel.style.gridRowEnd = ''; });
    if (host) host.replaceChildren();
    return;
  }

  panels.forEach(panel => {
    panel.style.gridRowEnd = `span ${Math.max(1, Math.ceil(panel.getBoundingClientRect().height))}`;
  });

  if (!host) return;
  const widths = tracks.split(' ').map(parseFloat).filter(w => w > 0);
  const wanted = Math.max(0, widths.length - 1);
  while (host.children.length > wanted) host.lastChild.remove();
  while (host.children.length < wanted) {
    const rule = document.createElement('div');
    rule.className = 'col-rule';
    host.appendChild(rule);
  }
  let x = 0;
  for (let i = 0; i < wanted; i++) {
    x += widths[i];
    host.children[i].style.left = `${x}px`;
  }
}

function App() {
  const [user, setUser] = useState(undefined); // undefined = checking, null = signed out
  const [s, setS] = useState(null);
  const [loggerPlanDay, setLoggerPlanDay] = useState(() => {
    const restored = loadActiveSession();
    return restored ? restored.planDay : undefined;
  });
  const loggerOpen = loggerPlanDay !== undefined;
  const [showImport, setShowImport] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [onboarded, setOnboarded] = useState(() => !!localStorage.getItem('press_onboarded'));
  const [briefing, setBriefing] = useState(null);
  const [recommendation, setRecommendation] = useState(null);
  const [performanceTrend, setPerformanceTrend] = useState(null);
  const [showBriefing, setShowBriefing] = useState(false);
  const [afternoonNewscast, setAfternoonNewscast] = useState(null);
  const [nightNewscast, setNightNewscast] = useState(null);
  const [weeklyReview, setWeeklyReview] = useState(null);
  const [showAfternoonNewscast, setShowAfternoonNewscast] = useState(false);
  const [showNightNewscast, setShowNightNewscast] = useState(false);
  const [showWeeklyReview, setShowWeeklyReview] = useState(false);
  const [loadingPeriod, setLoadingPeriod] = useState(null);
  const [newscastError, setNewscastError] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showWiki, setShowWiki] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const [bubblePos, setBubblePos] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('press_pj_bubble_pos'));
      return saved && typeof saved.x === 'number' && typeof saved.y === 'number' ? saved : null;
    } catch { return null; }
  });
  const bubbleDrag = useRef({ dragging: false, moved: false, offsetX: 0, offsetY: 0 });
  const BUBBLE_SIZE = 44;
  const clampBubblePos = (x, y) => {
    const dockEl = document.querySelector('.dock');
    const dockH = dockEl && getComputedStyle(dockEl).display !== 'none' ? dockEl.getBoundingClientRect().height : 0;
    const maxX = Math.max(8, window.innerWidth - BUBBLE_SIZE - 8);
    const maxY = Math.max(8, window.innerHeight - BUBBLE_SIZE - 8 - dockH);
    return { x: Math.min(Math.max(8, x), maxX), y: Math.min(Math.max(8, y), maxY) };
  };
  useEffect(() => {
    const onResize = () => setBubblePos(pos => pos ? clampBubblePos(pos.x, pos.y) : pos);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const onBubblePointerDown = e => {
    const rect = e.currentTarget.getBoundingClientRect();
    bubbleDrag.current = { dragging: true, moved: false, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onBubblePointerMove = e => {
    if (!bubbleDrag.current.dragging) return;
    bubbleDrag.current.moved = true;
    setBubblePos(clampBubblePos(e.clientX - bubbleDrag.current.offsetX, e.clientY - bubbleDrag.current.offsetY));
  };
  const onBubblePointerUp = () => {
    if (!bubbleDrag.current.dragging) return;
    bubbleDrag.current.dragging = false;
    if (bubbleDrag.current.moved) {
      setBubblePos(pos => {
        if (pos) { try { localStorage.setItem('press_pj_bubble_pos', JSON.stringify(pos)); } catch {} }
        return pos;
      });
    }
  };
  const onBubbleClick = () => {
    if (bubbleDrag.current.moved) { bubbleDrag.current.moved = false; return; }
    setChatOpen(true);
  };
  // Below 480px .scroll drops out of the masonry grid entirely and becomes a
  // horizontal one-section-at-a-time track (see PRESS_CSS's .mobile-track
  // block): every section sits side by side, and only the active one is on
  // screen. The dock jumps straight to any section; a left/right swipe on
  // the track (onSwipeStart/Move/End/Cancel below) moves to the neighbouring
  // one. Both write the same activeSection state, so whichever one you used
  // to get there, the other stays in sync. Above 480px the multi-column
  // scroll layout stays as-is.
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width:480px)').matches);
  const [activeSection, setActiveSection] = useState(null);
  // Plain mutable drag state, not React state — mutated straight from touch
  // handlers so a swipe can move the track every frame without going through
  // a re-render (matches bubbleDrag's pattern above). axis stays null until
  // the gesture has moved enough to tell a horizontal swipe from a vertical
  // scroll apart; only 'x' ever drives the track.
  const swipeDrag = useRef({ tracking: false, axis: null, startX: 0, startY: 0, dx: 0, base: 0 });
  // Separate from `onboarded` (which gates first-run access and is never
  // reset once true) -- this only forces the Onboarding overlay open again
  // for someone who already finished setup and explicitly asked to redo it
  // from Settings. Not persisted: a reload drops back out of it safely if
  // it's ever abandoned mid-way.
  const [forceOnboarding, setForceOnboarding] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width:480px)');
    const onChange = e => setIsMobile(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Desktop dashboard grid (DashboardGrid.jsx) — column count is either fixed
  // (profile.gridColumnMode 1-4) or tracks window width in the same 900/1380/
  // 1800 breakpoints the old masonry .scroll grid used. DashboardGrid remounts
  // (losing any live drag state) on every count change, so this only actually
  // updates state when the computed count crosses a breakpoint — a resize
  // event fires continuously while dragging the window edge, but re-deriving
  // the same number back out is a no-op React bails out of, not a re-render.
  const gridColumnMode = s?.profile?.gridColumnMode || 'auto';
  const [columnCount, setColumnCount] = useState(() => computeColumnCount(gridColumnMode, window.innerWidth));
  useEffect(() => {
    if (isMobile) return;
    const recompute = () => setColumnCount(computeColumnCount(gridColumnMode, window.innerWidth));
    recompute();
    window.addEventListener('resize', recompute);
    return () => window.removeEventListener('resize', recompute);
  }, [isMobile, gridColumnMode]);
  const [gridEditMode, setGridEditMode] = useState(false);
  // { sectionId, stepIndex } for the currently-showing section walkthrough,
  // or null. See useWalkthroughEncounter/WalkthroughOverlay above.
  const [activeWalkthrough, setActiveWalkthrough] = useState(null);
  const saveGridLayoutTimer = useRef(null);
  const saveGridLayout = layout => {
    if (saveGridLayoutTimer.current) clearTimeout(saveGridLayoutTimer.current);
    saveGridLayoutTimer.current = setTimeout(() => {
      const gridLayouts = { ...(s?.profile?.gridLayouts || {}), [columnCount]: layout };
      setS(cur => cur ? { ...cur, profile: { ...cur.profile, gridLayouts } } : cur);
      api('profile', { method: 'POST', body: JSON.stringify({ gridLayouts }) }).catch(() => {});
    }, 300);
  };

  const [syncingShortcut, setSyncingShortcut] = useState(false);
  const syncShortcut = () => {
    const shortcutName = s?.profile?.healthDevice ? `pressnewsletter-${s.profile.healthDevice}` : 'pressnewsletter';
    window.location.href = `shortcuts://run-shortcut?name=${encodeURIComponent(shortcutName)}`;
    setSyncingShortcut(true);
    setTimeout(() => { loadSummary(); setSyncingShortcut(false); }, 5000);
  };

  const loadSummary = () => api('summary', { throwOnError: true })
    .then(data => {
      setS(data);
      setSummaryError('');
      // Backend-driven, not just localStorage: onboarded state previously
      // relied entirely on press_onboarded in this browser's localStorage,
      // so a real, fully-set-up account showed Onboarding again from
      // scratch on any new browser/device or cleared storage, with no way
      // to tell "genuinely new" from "just a new browser" apart. See
      // onboardingGate.js's isAccountAlreadyOnboarded for the actual check.
      if (!onboarded && isAccountAlreadyOnboarded(data?.profile, data?.lifts?.length)) {
        localStorage.setItem('press_onboarded', '1');
        setOnboarded(true);
      }
    })
    .catch(e => setSummaryError(`Failed to load: ${e.message}`));

  const fetchNewscast = async (period) => {
    if (loadingPeriod) return;
    setLoadingPeriod(period);
    setNewscastError('');
    try {
      const data = await api(`newscast?period=${period}`);
      if (data.newscast) {
        if (period === 'afternoon') { setAfternoonNewscast(data.newscast); setShowAfternoonNewscast(true); }
        else { setNightNewscast(data.newscast); setShowNightNewscast(true); }
      } else {
        setNewscastError(data.error || 'Generation failed — Gemini may be overloaded. Try again in a moment.');
      }
    } catch (e) {
      setNewscastError(`Connection error: ${e.message}`);
    }
    setLoadingPeriod(null);
  };

  const fetchWeeklyReview = async () => {
    if (loadingPeriod) return;
    setLoadingPeriod('weekly');
    setNewscastError('');
    try {
      const data = await api('weekly-review');
      if (data.review) { setWeeklyReview(data.review); setShowWeeklyReview(true); }
      else setNewscastError(data.error || 'Generation failed — Gemini may be overloaded. Try again in a moment.');
    } catch (e) {
      setNewscastError(`Connection error: ${e.message}`);
    }
    setLoadingPeriod(null);
  };

  const handleOnboardDone = () => {
    localStorage.setItem('press_onboarded', '1');
    setOnboarded(true);
    // Explicit, permanent signal on the account itself — belt-and-braces
    // alongside the profile-name/lift-history checks in loadSummary above,
    // for the case where someone finishes onboarding without ever setting
    // a name and hasn't logged anything yet either.
    api('profile', { method: 'POST', body: JSON.stringify({ onboardingComplete: true }) }).catch(() => {});
  };

  // Applies the synced preference once real profile data loads, and caches it
  // so index.html's bootstrap script (which runs before this JS even loads)
  // can apply the right theme immediately on the next visit without a flash.
  // Skipped entirely while darkMode is unset (undefined, not just false) --
  // that's "never chosen yet," so whatever the bootstrap script/CSS default
  // already applied stands rather than being forced back to light.
  useEffect(() => {
    if (s?.profile?.darkMode == null) return;
    document.documentElement.dataset.theme = s.profile.darkMode ? 'dark' : 'light';
    try { localStorage.setItem('press_dark_mode', s.profile.darkMode ? '1' : '0'); } catch {}
  }, [s?.profile?.darkMode]);

  useEffect(() => {
    getRedirectResult(auth)
      .then(result => { if (result?.user) setUser(result.user); })
      .catch(e => {
        // Store error so LoginScreen can display it after redirect
        sessionStorage.setItem('auth_redirect_error', e?.code || e?.message || 'unknown');
      });
    return onAuthStateChanged(auth, u => setUser(u ?? null));
  }, []);

  const refresh = data => { if (data) setS(data); else loadSummary(); };

  // Fetched separately from /summary and after it, so the fatigue pass this
  // needs never delays the first paint — the "Why This" block fills in a beat
  // later rather than holding up the whole dashboard. Re-runs when the stored
  // plan is regenerated or new lifts land, since both change the reasoning.
  // A failure leaves it null, which RecommendationPanel renders as nothing.
  const planStamp = s?.weeklyPlan?.generatedAt || null;
  const liftCount = s?.lifts?.length ?? 0;
  useEffect(() => {
    if (!s || !planStamp) { setRecommendation(null); return; }
    let cancelled = false;
    api('plan/recommendation')
      .then(data => { if (!cancelled) setRecommendation(data); })
      .catch(() => { if (!cancelled) setRecommendation(null); });
    return () => { cancelled = true; };
  }, [planStamp, liftCount]);

  // #95's /run/recommendation (functions/runningRecommendation.js) — only
  // fetched for an account that actually listed Running as one of its
  // activities (profile.activities, Onboarding step 4/Settings), same gate
  // S11 itself renders behind below. The endpoint already returns null with
  // no runs logged, so this is cheap to call speculatively once that's true.
  const hasRunningActivity = (s?.profile?.activities || []).some(a => a.type === 'running');
  const [runRecommendation, setRunRecommendation] = useState(null);
  useEffect(() => {
    if (!s || !hasRunningActivity) { setRunRecommendation(null); return; }
    let cancelled = false;
    api('run/recommendation')
      .then(data => { if (!cancelled) setRunRecommendation(data); })
      .catch(() => { if (!cancelled) setRunRecommendation(null); });
    return () => { cancelled = true; };
  }, [hasRunningActivity, s?.today?.recovery, s?.workouts?.length]);

  // Same pattern as hasRunningActivity/runRecommendation above, for
  // /cycling/recommendation and /swim/recommendation
  // (functions/enduranceRecommendation.js) — S12/S13 render behind the same
  // gate below.
  const hasCyclingActivity = (s?.profile?.activities || []).some(a => a.type === 'cycling');
  const [cyclingRecommendation, setCyclingRecommendation] = useState(null);
  useEffect(() => {
    if (!s || !hasCyclingActivity) { setCyclingRecommendation(null); return; }
    let cancelled = false;
    api('cycling/recommendation')
      .then(data => { if (!cancelled) setCyclingRecommendation(data); })
      .catch(() => { if (!cancelled) setCyclingRecommendation(null); });
    return () => { cancelled = true; };
  }, [hasCyclingActivity, s?.today?.recovery, s?.workouts?.length]);

  const hasSwimmingActivity = (s?.profile?.activities || []).some(a => a.type === 'swimming');
  const [swimmingRecommendation, setSwimmingRecommendation] = useState(null);
  useEffect(() => {
    if (!s || !hasSwimmingActivity) { setSwimmingRecommendation(null); return; }
    let cancelled = false;
    api('swim/recommendation')
      .then(data => { if (!cancelled) setSwimmingRecommendation(data); })
      .catch(() => { if (!cancelled) setSwimmingRecommendation(null); });
    return () => { cancelled = true; };
  }, [hasSwimmingActivity, s?.today?.recovery, s?.workouts?.length]);

  // Sport (S14) and Aerobic (S15) share one fetch/one recommendation object
  // — both pull from the same catch-all 'other' db.sports bucket
  // (functions/sportClassifier.js), so there's nothing sport-specific to
  // fetch twice. Each panel still gates independently on its own activity
  // flag, same as every other endurance panel.
  const hasSportActivity = (s?.profile?.activities || []).some(a => a.type === 'sport');
  const hasAerobicActivity = (s?.profile?.activities || []).some(a => a.type === 'aerobic');
  const [generalRecommendation, setGeneralRecommendation] = useState(null);
  useEffect(() => {
    if (!s || !(hasSportActivity || hasAerobicActivity)) { setGeneralRecommendation(null); return; }
    let cancelled = false;
    api('general/recommendation')
      .then(data => { if (!cancelled) setGeneralRecommendation(data); })
      .catch(() => { if (!cancelled) setGeneralRecommendation(null); });
    return () => { cancelled = true; };
  }, [hasSportActivity, hasAerobicActivity, s?.today?.recovery, s?.workouts?.length]);

  // #12: fitness/fatigue/form trend. Same fetch-after-summary pattern; only
  // re-fires on session load like the run recommendation above (db.lifts
  // isn't in /summary's payload either, so liftCount here is /summary's own
  // lifts field, already fetched — a reasonable enough proxy for "new lift
  // landed" since finishing a workout always refreshes s via refresh()).
  useEffect(() => {
    if (!s) { setPerformanceTrend(null); return; }
    let cancelled = false;
    api('performance/trend')
      .then(data => { if (!cancelled) setPerformanceTrend(data); })
      .catch(() => { if (!cancelled) setPerformanceTrend(null); });
    return () => { cancelled = true; };
  }, [!!s, liftCount]);

  const expertise = normalizeExpertise(s?.profile?.expertiseLevel);
  const panelStates = s?.profile?.panelStates || {};
  // Optimistic: the panel resizes on click rather than after the round trip,
  // and layoutMasonry's ResizeObserver repacks off the resulting height change.
  const setPanelState = async (id, next) => {
    const merged = { ...panelStates, [id]: next };
    setS(cur => cur ? { ...cur, profile: { ...cur.profile, panelStates: merged } } : cur);
    const profile = await api('profile', { method: 'POST', body: JSON.stringify({ panelStates: merged }) });
    setS(cur => cur ? { ...cur, profile } : cur);
  };

  useEffect(() => {
    if (user) loadSummary();
    else setS(null);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    api('briefing').then(r => { if (r.briefing) setBriefing(r.briefing); }).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!briefing?.date) return;
    // localStorage, not sessionStorage — mobile PWAs routinely discard a
    // backgrounded tab's session state and reload on reopen (same issue
    // ACTIVE_SESSION_KEY works around above), so a per-tab-session "seen"
    // flag kept popping the briefing back up multiple times a day.
    const key = `briefing_seen_${briefing.date}`;
    if (!localStorage.getItem(key)) {
      setShowBriefing(true);
      try { localStorage.setItem(key, '1'); } catch {}
    }
  }, [briefing]);

  // Register SW silently on login (permission prompt happens via S6 button)
  useEffect(() => {
    if (!user || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, [user]);

  // Follow-request badge (incoming pending + accepted-but-unseen-by-me) —
  // shown as a count on the Settings button per the design doc's "badge on
  // the profile/settings nav icon" note. Reloaded on login and whenever
  // Settings closes (accept/ack actions happen inside it).
  const [followBadge, setFollowBadge] = useState({ incoming: [], recentlyAccepted: [] });
  const loadFollowRequests = () => {
    if (!user) return;
    api('follow-requests').then(r => setFollowBadge({ incoming: r.incoming || [], recentlyAccepted: r.recentlyAccepted || [] })).catch(() => {});
  };
  useEffect(loadFollowRequests, [user]);
  const socialBadgeCount = followBadge.incoming.length + followBadge.recentlyAccepted.length;

  useEffect(() => {
    const el = document.createElement('style');
    el.id = 'press-css';
    el.textContent = PRESS_CSS + GRIDSTACK_CSS;
    document.head.appendChild(el);
    return () => el.remove();
  }, []);

  // Scrollspy: reveal each section's .fade content once it enters the viewport, and mark its
  // nav dot active while visible.
  //
  // Was keyed to [user] alone on the assumption that "the section DOM exists
  // as soon as the user is signed in" — true before the loading-screen gate
  // below (s === null && !summaryError -> <LoadingScreen/>) existed, since
  // the page used to render immediately with s still null. Now #press-scroll
  // doesn't mount until s is populated, but user was already set well before
  // that (during the LoadingScreen phase) and never changes again, so this
  // effect's first (and only) run found no #press-scroll yet, bailed via the
  // early return below, and never got a second chance to attach — no section
  // ever got .visible, so every .fade block stayed opacity:0 forever past
  // the spinner, indistinguishable from "dismissed too early." !!s flips
  // false->true exactly once on the initial load (then stays true across
  // ordinary refresh() calls, so this doesn't re-attach on every data
  // refresh) — enough to give the effect a second, now-successful run right
  // when the real page actually mounts.
  //
  // threshold was 0.35 (35% of the section's own height visible at once) — fine for
  // roughly viewport-sized sections, but S7 (All-Time Bests) grows with logged PR
  // history and easily exceeds 2500-3500px. On a mobile viewport (~700px tall) the
  // max possible visible fraction of a 3000px section is ~23%, so .visible never got
  // added and the whole section (Strength Level panel included) stayed opacity:0
  // forever — reproducible on any device short enough relative to that section's
  // height, which in practice meant mobile only. A near-zero threshold fires as soon
  // as any part of a section enters view, independent of how tall it grows.
  useEffect(() => {
    const scroll = document.getElementById('press-scroll');
    if (!scroll) return;
    const sections = [...scroll.querySelectorAll('section')];

    // Dock mode shows one section at a time via display:none, not scroll
    // position, so there's nothing for an IntersectionObserver to key off —
    // just reveal whichever section is current immediately.
    if (isMobile) {
      sections.forEach(sec => sec.classList.add('visible'));
      return;
    }

    const dots = [...document.querySelectorAll('#sec-nav .sn-dot')];

    sections[0]?.classList.add('visible');
    dots[0]?.classList.add('active');

    // Desktop lays sections into a multi-column GridStack grid (not the
    // single-column stack these dots were originally written for), so at
    // any scroll position several non-adjacent sections can be intersecting
    // at once. Toggling each dot independently on isIntersecting lit up
    // several scattered dots instead of tracking "where you are" — only the
    // single most-visible section's dot lights up now. A wider threshold
    // list gives intersectionRatio enough resolution to compare sections by;
    // .visible still fires off the first (near-zero) crossing, same as before.
    const ratios = new Map();
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        const idx = sections.indexOf(e.target);
        if (e.isIntersecting) e.target.classList.add('visible');
        ratios.set(idx, e.isIntersecting ? e.intersectionRatio : 0);
      });
      let bestIdx = -1, bestRatio = 0;
      ratios.forEach((ratio, idx) => { if (ratio > bestRatio) { bestRatio = ratio; bestIdx = idx; } });
      if (bestIdx >= 0) dots.forEach((dot, idx) => dot.classList.toggle('active', idx === bestIdx));
    }, { threshold: [0, .1, .2, .3, .4, .5, .6, .7, .8, .9, 1] });
    sections.forEach(sec => obs.observe(sec));

    return () => obs.disconnect();
  }, [user, !!s, isMobile, activeSection]);

  // Re-pack the masonry whenever anything that changes a section's height
  // changes. A ResizeObserver on each section covers the cases a dependency
  // list can't see — a panel expanding, a chart finishing its first render, an
  // image or the webfont landing — and observing .scroll itself catches the
  // viewport width crossing a column-count boundary.
  //
  // Writing gridRowEnd back is safe inside a ResizeObserver only because
  // .panel is align-self:start: the span sizes the grid area, never the
  // panel, so the observer can't be re-triggered by its own callback.
  // The rAF still batches the burst of callbacks a resize produces into one
  // pass, and (running before paint) keeps the repack off-screen.
  useLayoutEffect(() => {
    // Desktop now packs via DashboardGrid/GridStack instead — this masonry
    // pass is mobile-only (see PRESS_CSS's .scroll block, still used there).
    if (!isMobile) return;
    const scroll = document.getElementById('press-scroll');
    if (!scroll) return;

    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; layoutMasonry(); });
    };

    layoutMasonry();
    const obs = new ResizeObserver(schedule);
    obs.observe(scroll);
    scroll.querySelectorAll(':scope > .panel').forEach(panel => obs.observe(panel));
    // Webfonts land after first paint and reflow every headline; without this
    // every section stays packed at its fallback-font height.
    document.fonts?.ready.then(schedule).catch(() => {});

    // A hidden tab never runs rAF, so every repack the observer queues while
    // backgrounded is dropped — and becoming visible fires no new resize to
    // re-request one. Without this, opening Press in a background tab leaves
    // the panels packed at their pre-data heights, overlapping, until the
    // window happens to be resized.
    const onVisible = () => { if (document.visibilityState === 'visible') layoutMasonry(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      obs.disconnect();
      document.removeEventListener('visibilitychange', onVisible);
      if (frame) cancelAnimationFrame(frame);
    };
    // Keyed off what the rendered section list is derived from further down
    // (panelOrder/hiddenPanels/trackingLevel) rather than sectionIds itself,
    // which is declared below the early returns and would be in its TDZ here.
  }, [user, !!s, isMobile, s?.profile?.panelOrder?.join(','), s?.profile?.hiddenPanels?.join(','), s?.profile?.trackingLevel, JSON.stringify(s?.profile?.trackingCategories)]);

  // Mobile swipe carousel: #press-scroll's own height is pinned to the
  // active panel's height, not the tallest of every section, since all
  // sections now sit side by side in a flex row (.mobile-track) instead of
  // the old one-at-a-time display:none. Without this, switching to a short
  // section (Sleep) would leave whichever section is tallest (Records, once
  // PR history grows) as blank space below it. Box-sizing is border-box
  // (global reset), so the panel's own offsetHeight has to be padded back
  // out by #press-scroll's own top/bottom padding (the fixed-header offset)
  // to land on the right box height rather than squeezing the content into
  // too little room.
  useLayoutEffect(() => {
    if (!isMobile) return;
    const viewport = document.getElementById('press-scroll');
    const active = viewport?.querySelector('.mobile-track > .panel-active');
    if (!viewport || !active) return;
    const sync = () => {
      const cs = getComputedStyle(viewport);
      const vPad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      viewport.style.height = `${active.offsetHeight + vPad}px`;
    };
    sync();
    const obs = new ResizeObserver(sync);
    obs.observe(active);
    return () => obs.disconnect();
  }, [isMobile, activeSection, s?.profile?.panelOrder?.join(','), s?.profile?.hiddenPanels?.join(','), s?.profile?.trackingLevel, JSON.stringify(s?.profile?.trackingCategories)]);

  // Walkthrough queue: at most one WalkthroughOverlay shows at a time. If a
  // second section is encountered (e.g. two panels above the fold on a
  // short desktop window) while one's already showing, it's queued rather
  // than dropped or overlapped, and starts the moment the current one
  // closes. walkthroughFiredRef guards against the same section queuing
  // itself twice in one session (its own IntersectionObserver only ever
  // fires once anyway, but a second mount — e.g. DashboardGrid remounting —
  // would otherwise re-arm it before the seen-state POST lands).
  const walkthroughActiveRef = useRef(null);
  const walkthroughQueueRef = useRef([]);
  const walkthroughFiredRef = useRef(new Set());
  const markWalkthroughSeen = sectionId => {
    api('profile', { method: 'POST', body: JSON.stringify({ walkthroughSeen: sectionId }) })
      .then(profile => { if (profile && !profile.error) setS(prev => prev ? { ...prev, profile } : prev); });
  };
  // `forced` distinguishes a genuine forced start (Replay Walkthrough,
  // re-arming a section while you're sitting on a different one) from a
  // natural encounter (the IntersectionObserver in useWalkthroughEncounter
  // actually seeing the section on screen). This used to be inferred from
  // `activeSection !== sectionId` instead of being passed explicitly, on the
  // assumption that a natural encounter only ever fires once the panel is
  // truly the active one — true for a tap (setActiveSection runs synchronously
  // in the click handler, before any transform changes) but not for a swipe:
  // onSwipeMove drags .mobile-track's transform directly via a ref, live,
  // frame by frame, well before onSwipeEnd finally calls setActiveSection.
  // The IntersectionObserver's 0.15 threshold routinely crosses mid-drag,
  // while `activeSection` still names the section you're swiping *away*
  // from — so this branch used to fire on an ordinary swipe, force
  // `activeSection` to the not-yet-committed target, and only spotlight it
  // 360ms later, sometimes after the drag had already continued past it (or
  // been released short of the swipe threshold and snapped back). That
  // showed the tour for a section you'd only skimmed past, and — since nothing
  // ever un-marks a section already added to walkthroughFiredRef — going back
  // to that section normally afterward never gets a second chance to show it
  // correctly, no matter how many more times you swipe through it. Scoping
  // the branch to `forced` only removes the false positive: a natural
  // encounter always measures the DOM immediately, using the same
  // IntersectionObserver-confirmed visibility that triggered it in the
  // first place, no swipe or delay of its own required.
  const beginWalkthrough = (sectionId, forced = false) => {
    const content = WALKTHROUGH_CONTENT[sectionId];
    if (!content) return;
    const startTour = () => {
      const hasVisibleStep = content.steps.some(st => {
        const el = document.querySelector(st.target);
        return el && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
      });
      // Nothing to spotlight yet (e.g. data still loading) — leave it unseen
      // so the encounter observer gets another chance once it re-mounts.
      if (!hasVisibleStep) { walkthroughFiredRef.current.delete(sectionId); return; }
      walkthroughActiveRef.current = sectionId;
      setActiveWalkthrough({ sectionId, stepIndex: 0 });
      markWalkthroughSeen(sectionId);
    };
    // Mobile lays every dock section into one .mobile-track carousel, shifted
    // sideways with a transform rather than unmounted — an inactive section
    // still has real (just off-screen) geometry, so hasVisibleStep's own
    // width/height check can't tell "not the active panel" from "genuinely
    // visible." `activeSection` starts null until the first manual tap/swipe
    // (the dock's own fallback for that is effectiveActiveId, not this), so
    // `!= null` here is what stops the very first-ever forced start (s1,
    // already on screen by default) from swiping to itself and eating a
    // needless 360ms. DOCK_LABELS[sectionId] excludes 'settings', which
    // isn't part of the mobile-track carousel at all.
    if (forced && isMobile && DOCK_LABELS[sectionId] && activeSection != null && activeSection !== sectionId) {
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      setActiveSection(sectionId);
      // .mobile-track's own slide transition is 320ms (skipped entirely
      // under reduced motion, see PRESS_CSS) — wait it out so the tour's
      // first measurement lands on the settled position, not mid-slide.
      setTimeout(startTour, reduceMotion ? 30 : 360);
    } else {
      startTour();
    }
  };
  const queueOrBeginWalkthrough = sectionId => {
    if (walkthroughFiredRef.current.has(sectionId)) return;
    walkthroughFiredRef.current.add(sectionId);
    if (walkthroughActiveRef.current) { walkthroughQueueRef.current.push(sectionId); return; }
    beginWalkthrough(sectionId);
  };
  const advanceWalkthroughQueue = () => {
    walkthroughActiveRef.current = null;
    const next = walkthroughQueueRef.current.shift();
    if (next) beginWalkthrough(next); else setActiveWalkthrough(null);
  };
  const nextWalkthroughStep = () => {
    if (!activeWalkthrough) return;
    const total = WALKTHROUGH_CONTENT[activeWalkthrough.sectionId].steps.length;
    if (activeWalkthrough.stepIndex + 1 >= total) advanceWalkthroughQueue();
    else setActiveWalkthrough({ ...activeWalkthrough, stepIndex: activeWalkthrough.stepIndex + 1 });
  };
  const backWalkthroughStep = () => {
    if (activeWalkthrough && activeWalkthrough.stepIndex > 0) setActiveWalkthrough({ ...activeWalkthrough, stepIndex: activeWalkthrough.stepIndex - 1 });
  };
  const closeWalkthrough = () => advanceWalkthroughQueue();
  // Settings → Account → "Replay Walkthrough" (mirrors "Restart Setup"
  // directly above it). Resets every section's seen-state, not just one —
  // simpler than a per-section replay list, and matches "Restart Setup"
  // being one button for the whole onboarding rather than one per step.
  const replayWalkthrough = () => {
    api('profile', { method: 'POST', body: JSON.stringify({ resetWalkthroughs: true }) }).then(profile => {
      if (!profile || profile.error) return;
      // s1 is claimed here directly (not via queueOrBeginWalkthrough) so it
      // shows immediately rather than waiting on s1's own IntersectionObserver
      // to notice it's on-screen — marking it fired up front avoids a race
      // where that observer's own encounter fires a second, redundant start
      // for the same section once `disabled` flips false below.
      walkthroughFiredRef.current = new Set(['s1']);
      setS(prev => prev ? { ...prev, profile } : prev);
      setShowSettings(false);
      setTimeout(() => beginWalkthrough('s1', true), 50);
    });
  };
  // Auto-trigger is suppressed while anything else covers the screen — an
  // IntersectionObserver has no concept of "occluded by a modal", only
  // geometric overlap, so without this a walkthrough could start firing
  // behind Settings or the onboarding wizard.
  const walkthroughsBlocked = !s || showSettings || showWiki || showHistory || chatOpen || showBriefing
    || showAfternoonNewscast || showNightNewscast || showWeeklyReview || showImport || showTimeline || showAdmin
    || forceOnboarding || !onboarded || loggerOpen || gridEditMode;
  useWalkthroughEncounter('s1', walkthroughsBlocked || !!s?.profile?.walkthroughsSeen?.s1, queueOrBeginWalkthrough);
  useWalkthroughEncounter('s2', walkthroughsBlocked || !!s?.profile?.walkthroughsSeen?.s2, queueOrBeginWalkthrough);
  useWalkthroughEncounter('s3', walkthroughsBlocked || !!s?.profile?.walkthroughsSeen?.s3, queueOrBeginWalkthrough);
  useWalkthroughEncounter('s4', walkthroughsBlocked || !!s?.profile?.walkthroughsSeen?.s4, queueOrBeginWalkthrough);
  useWalkthroughEncounter('s5', walkthroughsBlocked || !!s?.profile?.walkthroughsSeen?.s5, queueOrBeginWalkthrough);
  useWalkthroughEncounter('s6', walkthroughsBlocked || !!s?.profile?.walkthroughsSeen?.s6, queueOrBeginWalkthrough);
  useWalkthroughEncounter('s7', walkthroughsBlocked || !!s?.profile?.walkthroughsSeen?.s7, queueOrBeginWalkthrough);
  useWalkthroughEncounter('s8', walkthroughsBlocked || !!s?.profile?.walkthroughsSeen?.s8, queueOrBeginWalkthrough);
  useWalkthroughEncounter('s9', walkthroughsBlocked || !!s?.profile?.walkthroughsSeen?.s9, queueOrBeginWalkthrough);
  useWalkthroughEncounter('s10', walkthroughsBlocked || !!s?.profile?.walkthroughsSeen?.s10, queueOrBeginWalkthrough);
  useWalkthroughEncounter('s11', walkthroughsBlocked || !!s?.profile?.walkthroughsSeen?.s11, queueOrBeginWalkthrough);
  // Settings gets its own blocked condition rather than reusing
  // walkthroughsBlocked above — that one deliberately includes showSettings
  // (so s1/s3/s5/... don't fire behind the Settings overlay), but the
  // Settings tour's whole trigger IS showSettings becoming true, so it must
  // stay eligible while Settings is open, only blocked by genuinely
  // unrelated overlays stacking on top of it.
  const settingsWalkthroughBlocked = !s || showWiki || showHistory || chatOpen || showBriefing
    || showAfternoonNewscast || showNightNewscast || showWeeklyReview || showImport || showTimeline || showAdmin
    || forceOnboarding || !onboarded || loggerOpen || gridEditMode;
  useWalkthroughEncounter('settings', settingsWalkthroughBlocked || !!s?.profile?.walkthroughsSeen?.settings, queueOrBeginWalkthrough);

  if (user === undefined) return <LoadingScreen />;

  if (!user) return <LoginScreen />;

  // Without this, the app shell (header, tabs, sections) rendered immediately
  // with s still null, so every section showed its own empty state for the
  // ~3s /summary round trip instead of one clean loading screen. Only gates
  // the very first load — refresh()/loadSummary() calls after that update s
  // in place without ever setting it back to null, so switching tabs or
  // pulling to refresh doesn't re-trigger this.
  if (s === null && !summaryError) return <LoadingScreen />;

  // Mandatory for every account, not just brand-new signups — an account
  // that existed before this feature shipped has no db.profile.username
  // either, and gets caught here on its next load exactly the same way.
  // Blocks the whole app shell, not just an overlay on top of it, since a
  // username is required before anything else is meaningful (follow,
  // group sessions, etc. all key off it).
  if (s && !s.profile?.username) {
    return <UsernameSetup user={user} onComplete={refresh} />;
  }

  const { sleep: showSleep, nutrition: showFuel } = trackingCategoriesFor(s?.profile);
  const panelOrder = withNewDefaultsAppended(s?.profile?.panelOrder?.length ? s.profile.panelOrder : DEFAULT_PANEL_ORDER);
  const hiddenPanelSet = new Set(s?.profile?.hiddenPanels || []);
  // trackingLevel's own s2/s4 gating still applies on top of the user's own
  // order/hide preference — a "workout" tracking level shouldn't show Sleep
  // just because it isn't in hiddenPanels. s10 (Cycle) is gated the same
  // way, on the opt-in profile toggle instead of tracking level. s11
  // (Running)/s12 (Cycling)/s13 (Swimming)/s14 (Sport)/s15 (Aerobic) are
  // gated on hasRunningActivity/hasCyclingActivity/hasSwimmingActivity/
  // hasSportActivity/hasAerobicActivity (computed above, alongside the
  // recommendation fetches they drive) instead — none of the five has a
  // separate opt-in toggle, just whether it's one of the athlete's listed
  // activities (Onboarding step 4 / Settings).
  const sectionIds = panelOrder.filter(id =>
    !hiddenPanelSet.has(id) && (id !== 's2' || showSleep) && (id !== 's4' || showFuel)
    && (id !== 's10' || s?.profile?.cycleTrackingEnabled) && (id !== 's11' || hasRunningActivity)
    && (id !== 's12' || hasCyclingActivity) && (id !== 's13' || hasSwimmingActivity)
    && (id !== 's14' || hasSportActivity) && (id !== 's15' || hasAerobicActivity)
  );
  // Same "fall back to the first section" rule the dock buttons already used
  // (activeSection can be null on first render, or point at a section that
  // was since hidden/reordered out) — shared by the dock's active state and
  // the swipe track's resting position so the two can never disagree about
  // which section is current.
  const effectiveActiveId = sectionIds.includes(activeSection) ? activeSection : sectionIds[0];
  const activeIdx = sectionIds.indexOf(effectiveActiveId);
  // Swipe handlers for .mobile-track. Direction is undecided until the
  // gesture clears an 8px slop (onSwipeMove's axis===null branch): once it
  // resolves to 'y' the rest of the gesture is left alone so the page's
  // normal vertical scroll (or a nested horizontal scroller like
  // .week-strip, exempted below) still works untouched. Only a resolved 'x'
  // gesture calls preventDefault and drives the track — never before the
  // axis is known, so a vertical scroll never stutters waiting on this.
  const onSwipeStart = e => {
    const t = e.touches[0];
    const ignore = e.touches.length !== 1 || e.target.closest('.week-strip');
    swipeDrag.current = { tracking: !ignore, axis: null, startX: t?.clientX || 0, startY: t?.clientY || 0, dx: 0, base: activeIdx };
  };
  const onSwipeMove = e => {
    const drag = swipeDrag.current;
    if (!drag.tracking) return;
    const t = e.touches[0];
    const dx = t.clientX - drag.startX;
    const dy = t.clientY - drag.startY;
    if (drag.axis === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      drag.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (drag.axis === 'x') e.currentTarget.style.transition = 'none';
    }
    if (drag.axis !== 'x') return;
    e.preventDefault();
    drag.dx = dx;
    const width = e.currentTarget.parentElement.getBoundingClientRect().width || 1;
    let pct = (dx / width) * 100;
    if (drag.base === 0) pct = Math.min(pct, 0);
    if (drag.base === sectionIds.length - 1) pct = Math.max(pct, 0);
    e.currentTarget.style.transform = `translateX(${-drag.base * 100 + pct}%)`;
  };
  const onSwipeEnd = e => {
    const drag = swipeDrag.current;
    drag.tracking = false;
    if (drag.axis !== 'x') return;
    e.currentTarget.style.transition = '';
    const width = e.currentTarget.parentElement.getBoundingClientRect().width || 1;
    const threshold = width * 0.18;
    let nextIdx = drag.base;
    if (drag.dx <= -threshold && drag.base < sectionIds.length - 1) nextIdx = drag.base + 1;
    else if (drag.dx >= threshold && drag.base > 0) nextIdx = drag.base - 1;
    if (nextIdx === drag.base) e.currentTarget.style.transform = `translateX(${-drag.base * 100}%)`;
    else setActiveSection(sectionIds[nextIdx]);
  };
  const onSwipeCancel = e => {
    const drag = swipeDrag.current;
    drag.tracking = false;
    if (drag.axis !== 'x') return;
    e.currentTarget.style.transition = '';
    e.currentTarget.style.transform = `translateX(${-drag.base * 100}%)`;
  };
  // Desktop-only structural filler (FEATURES.md #125-134) — mobile has no
  // multi-column grid for these to fill gaps in, just the dock's one-section
  // stack, so they're left out entirely rather than rendered hidden.
  const microWidgetOrderIds = s?.profile?.microWidgetOrder?.length ? s.profile.microWidgetOrder : MICRO_WIDGET_IDS;
  const hiddenMicroWidgetSet = new Set(s?.profile?.hiddenMicroWidgets || []);
  const visibleMicroWidgets = isMobile ? [] : microWidgetOrderIds.filter(id => !hiddenMicroWidgetSet.has(id));
  const weeklyGuidance = s?.weeklyPlan;
  const sectionEls = {
    s1: <S1 key="s1" s={s} recommendation={recommendation} briefing={briefing} onShowBriefing={() => setShowBriefing(true)}
            onShowAfternoon={() => afternoonNewscast ? setShowAfternoonNewscast(true) : fetchNewscast('afternoon')}
            onShowNight={() => nightNewscast ? setShowNightNewscast(true) : fetchNewscast('night')}
            onShowWeekly={() => weeklyReview ? setShowWeeklyReview(true) : fetchWeeklyReview()}
            afternoonLoaded={!!afternoonNewscast} nightLoaded={!!nightNewscast} weeklyLoaded={!!weeklyReview}
            loadingPeriod={loadingPeriod} newscastError={newscastError} onShowTimeline={() => setShowTimeline(true)} />,
    s2: <S2 key="s2" s={s} refresh={refresh} />,
    s3: <S3 key="s3" s={s} recommendation={recommendation} performanceTrend={performanceTrend} onStartWorkout={planDay => setLoggerPlanDay(planDay ?? null)} onImport={() => setShowImport(true)} onHistory={() => setShowHistory(true)} refresh={refresh} />,
    s4: <S4 key="s4" s={s} refresh={refresh} />,
    s5: <S5 key="s5" s={s} recommendation={recommendation} refresh={refresh} />,
    s6: <S6 key="s6" s={s} refresh={refresh} />,
    s7: <S7 key="s7" s={s} />,
    s8: <S8 key="s8" s={s} refresh={refresh} />,
    s9: <S9 key="s9" s={s} followBadge={followBadge} reloadFollowBadge={loadFollowRequests} />,
    s10: <S10 key="s10" s={s} refresh={refresh} />,
    s11: <S11 key="s11" s={s} runRecommendation={runRecommendation} />,
    s12: <S12 key="s12" cyclingRecommendation={cyclingRecommendation} />,
    s13: <S13 key="s13" swimmingRecommendation={swimmingRecommendation} />,
    s14: <S14 key="s14" generalRecommendation={generalRecommendation} />,
    s15: <S15 key="s15" generalRecommendation={generalRecommendation} />,
  };
  // Default grid size for an item that has no saved x/y/w/h yet — mirrors the
  // old CSS span logic (PANEL_WIDE + expanded state) so a fresh account's
  // first-ever layout looks like today's, not an arbitrary 1x1 grid of tiles.
  const gridItems = isMobile ? [] : [
    ...sectionIds.map(id => {
      const state = resolvePanelState(id, panelStates, expertise);
      const collapsed = state === 'collapsed';
      const wide = PANEL_WIDE.has(id) && !collapsed;
      return {
        id, element: sectionEls[id],
        w: collapsed ? 1 : wide ? (state === 'expanded' ? 3 : 2) : 1,
        h: collapsed ? 3 : state === 'expanded' ? 24 : 14,
      };
    }),
    ...visibleMicroWidgets.map(id => ({
      id: `mw-${id}`, element: <MicroWidget id={id} s={s} briefing={briefing} guidance={weeklyGuidance} />,
      w: 1, h: MICRO_WIDGET_UNITS[id] === 2 ? 9 : 5,
    })),
  ];
  const savedGridLayout = s?.profile?.gridLayouts?.[columnCount];

  return (
    <ExpertiseContext.Provider value={expertise}>
      {(!onboarded || forceOnboarding) && (
        <Onboarding
          s={s}
          onComplete={() => { handleOnboardDone(); setForceOnboarding(false); }}
          onOpenImport={() => { handleOnboardDone(); setForceOnboarding(false); setShowImport(true); }}
        />
      )}
      <Header s={s} onSignOut={() => signOut(auth)} onOpenSettings={() => setShowSettings(true)} socialBadgeCount={socialBadgeCount} onSyncShortcut={syncShortcut} syncingShortcut={syncingShortcut} />
      {summaryError && !s && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 16px', background: '#7a1414', color: '#f5f0e2', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '.06em' }}>
          <span>{summaryError}</span>
          <button onClick={loadSummary} style={{ background: 'none', border: '1px solid rgba(245,240,226,.5)', color: '#f5f0e2', fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', padding: '3px 10px', cursor: 'pointer', flexShrink: 0 }}>Retry</button>
        </div>
      )}
      {isMobile ? (
        <div className="scroll" id="press-scroll">
          {/* .mobile-track holds every section side by side (flex row) and its
              own transform slides between them — resting position tracks
              activeIdx, dragging moves it 1:1 with the finger via the touch
              handlers. Off-screen panels stay mounted (so a swipe always has
              a real neighbour to reveal) but are aria-hidden/inert so they
              can't be tabbed or read into while off screen. */}
          <div className="mobile-track" style={{ transform: `translateX(${-activeIdx * 100}%)` }}
            onTouchStart={onSwipeStart} onTouchMove={onSwipeMove} onTouchEnd={onSwipeEnd} onTouchCancel={onSwipeCancel}>
            {sectionIds.map(id => {
              const active = id === effectiveActiveId;
              const state = resolvePanelState(id, panelStates, expertise);
              const wideClass = PANEL_WIDE.has(id) && state !== 'collapsed'
                ? (state === 'expanded' ? ' panel-w2 panel-w3' : ' panel-w2') : '';
              return (
                <div key={id} className={`panel panel-${state}${wideClass}${active ? ' panel-active' : ''}`}
                  aria-hidden={active ? undefined : 'true'} inert={!active}>
                  {sectionEls[id]}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <>
          {/* Freeform drag/resize dashboard (DashboardGrid.jsx) — desktop only.
              Arch-widget-editor-style: static until "Rearrange Panels" (Settings)
              turns dragging/resizing on; positions save per column count as you go. */}
          <nav className="sec-nav" id="sec-nav" aria-hidden="true">
            {sectionIds.map(id => <div key={id} className="sn-dot" />)}
          </nav>
          {gridEditMode && (
            <div className="grid-edit-banner">
              <span>Editing layout — drag to move, drag a corner to resize</span>
              <button onClick={() => setGridEditMode(false)}>Done</button>
            </div>
          )}
          {/* Remounted (not just re-rendered) whenever the column count, the
              set of visible items, or gridLayoutVersion changes — GridStack
              owns live position/size imperatively once mounted and has no
              way to learn about a panel React added/removed underneath it,
              or that Settings just reset/replaced the saved layout entirely,
              so those need a fresh GridStack instance, not a prop update.
              Ordinary drag/resize saves don't bump gridLayoutVersion (only
              applyLayoutPreset/resetGridLayout do), so a normal interaction
              doesn't remount out from under itself mid-drag. */}
          <DashboardGrid key={`${columnCount}-${gridItems.map(i => i.id).join(',')}-${s?.profile?.gridLayoutVersion || 0}`} items={gridItems} columnCount={columnCount}
            savedLayout={savedGridLayout} editMode={gridEditMode} onLayoutChange={saveGridLayout} />
        </>
      )}
      {isMobile && (
        <nav className="dock" aria-label="Sections">
          {sectionIds.map(id => {
            const active = id === effectiveActiveId;
            return (
              <button key={id} className={'dock-btn' + (active ? ' active' : '')}
                onClick={() => { setActiveSection(id); window.scrollTo(0, 0); }}>
                {DOCK_LABELS[id]}
              </button>
            );
          })}
        </nav>
      )}
      {/* Floating personal journalist chat bubble — draggable, position persisted in localStorage */}
      {!chatOpen && (
        <button className="chat-bubble" aria-label="Open personal journalist chat"
          style={bubblePos ? { left: bubblePos.x, top: bubblePos.y, right: 'auto', bottom: 'auto' } : undefined}
          onPointerDown={onBubblePointerDown} onPointerMove={onBubblePointerMove}
          onPointerUp={onBubblePointerUp} onPointerCancel={onBubblePointerUp}
          onClick={onBubbleClick}>PJ</button>
      )}
      {chatOpen && <MentorChat onClose={() => setChatOpen(false)} />}
      {activeWalkthrough && (
        <WalkthroughOverlay sectionId={activeWalkthrough.sectionId} stepIndex={activeWalkthrough.stepIndex}
          onNext={nextWalkthroughStep} onBack={backWalkthroughStep} onClose={closeWalkthrough} />
      )}
      {showSettings && <SettingsOverlay s={s} onClose={() => { setShowSettings(false); loadFollowRequests(); }} refresh={refresh} onSignOut={() => signOut(auth)} onOpenImport={() => { setShowSettings(false); setShowImport(true); }} onOpenWiki={() => { setShowSettings(false); setShowWiki(true); }} setBriefing={setBriefing} onRestartSetup={() => { setForceOnboarding(true); setShowSettings(false); }} onReplayWalkthrough={replayWalkthrough} followBadge={followBadge} reloadFollowBadge={loadFollowRequests} onOpenGridEdit={() => setGridEditMode(true)} onOpenAdmin={() => { setShowSettings(false); setShowAdmin(true); }} />}
      {showWiki && <WikiOverlay onClose={() => setShowWiki(false)} />}
      {showTimeline && <TimelineOverlay onClose={() => setShowTimeline(false)} />}
      {showAdmin && <AdminOverlay onClose={() => setShowAdmin(false)} />}
      {showBriefing && briefing && <BriefingOverlay briefing={briefing} onClose={() => setShowBriefing(false)} />}
      {showAfternoonNewscast && afternoonNewscast && <NewscastOverlay newscast={afternoonNewscast} onClose={() => setShowAfternoonNewscast(false)} />}
      {showNightNewscast && nightNewscast && <NewscastOverlay newscast={nightNewscast} onClose={() => setShowNightNewscast(false)} />}
      {showWeeklyReview && weeklyReview && <WeeklyReviewOverlay review={weeklyReview} onClose={() => setShowWeeklyReview(false)} />}
      {loggerOpen && (
        <WorkoutLogger
          planDay={loggerPlanDay}
          lifts={s?.lifts || []}
          customExercises={s?.customExercises || []}
          experienceLevel={s?.profile?.experienceLevel}
          cycleRirOffset={s?.cycleStats?.rirOffset || 0}
          onClose={() => setLoggerPlanDay(undefined)}
          refresh={setS}
        />
      )}
      {showImport && <HevyImport onClose={() => setShowImport(false)} refresh={setS} />}
      {showHistory && <WorkoutHistory s={s} onClose={() => setShowHistory(false)} refresh={setS} />}
    </ExpertiseContext.Provider>
  );
}

createRoot(document.getElementById('root')).render(<App />);
