// Loaded into the Functions emulator process via NODE_OPTIONS=--require, so
// every `Date.now()`/`new Date()` in functions/*.js (134 call sites, none of
// them accept an injected time) sees a fast-forwardable clock instead of
// real wall time. No code in functions/*.js changes.
//
// The offset (ms added to real time) lives in a small file that run.js
// rewrites as the simulation advances day by day — cheap to poll since real
// request volume here is a script, not production traffic.
'use strict';
const fs = require('fs');
const offsetFile = process.env.SIM_CLOCK_FILE;
if (offsetFile) {
  const RealDate = Date;
  const readOffset = () => {
    try { return Number(fs.readFileSync(offsetFile, 'utf8')) || 0; } catch { return 0; }
  };
  class FakeDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(RealDate.now() + readOffset());
      else super(...args);
    }
    static now() { return RealDate.now() + readOffset(); }
  }
  global.Date = FakeDate;
}
