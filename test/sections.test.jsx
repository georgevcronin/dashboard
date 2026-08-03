import React from 'react';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom';

// The bug this exists for: `e84c8cf` split app.jsx into src/sections/, and both
// extracted sections ended up rendering a component that stayed behind —
// S6 used <TrendsPanel /> (defined in app.jsx), S4 used <AreaChart /> (defined
// in charts.jsx). Neither was imported. esbuild emits an unresolved identifier
// as a global rather than failing, so `npm run build` passed, the whole backend
// suite passed, and every user got "ReferenceError: TrendsPanel is not defined"
// on first render with the app stuck on LOADING.
//
// test/sectionScope.test.js catches the same class statically. This catches it
// the only way that is actually conclusive: by rendering the thing.

jest.mock('../src/shared.js', () => ({
  api: jest.fn(() => Promise.resolve({ series: [] })),
  authFetch: jest.fn(() => Promise.resolve({ ok: true, json: () => ({}) })),
  API_BASE: 'http://test.invalid/api',
  pct: (a, b) => (b ? Math.round((a / b) * 100) : 0),
  roundCal: n => Math.round(n || 0),
  todayLocalStr: () => '2026-08-03',
}));

const { S4 } = require('../src/sections/S4.jsx');
const { S6 } = require('../src/sections/S6.jsx');

// Enough shape to exercise the render paths without pretending to be real data.
const summary = {
  nutritionToday: { calories: 1800, protein: 120, carbs: 200, fat: 60 },
  macroTargets: { calories: 2400, protein: 160, carbs: 250, fat: 80 },
  nutritionLog: [],
  waterToday: 3,
  hydrationCurve: [1, 2, 3, 4, 5],
  supplements: [],
  supplementLogToday: [],
  measurements: [],
  profile: { waterTarget: 7 },
};

describe('section modules render without unresolved identifiers', () => {
  test('S4 renders', () => {
    expect(() => render(<S4 s={summary} refresh={() => {}} />)).not.toThrow();
  });

  test('S6 renders', () => {
    expect(() => render(<S6 s={summary} refresh={() => {}} />)).not.toThrow();
  });

  // Empty state is the first thing a new account hits, and `s` arrives
  // undefined for a tick on every load before /summary resolves.
  test('both survive an absent summary', () => {
    expect(() => render(<S4 s={undefined} refresh={() => {}} />)).not.toThrow();
    expect(() => render(<S6 s={undefined} refresh={() => {}} />)).not.toThrow();
  });
});
