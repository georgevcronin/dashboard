const { test } = require('node:test');
const assert = require('node:assert/strict');
const { callGeminiResilient, geminiRetryDelaySec, parseGeminiJSON } = require('../functions/gemini');

process.env.GEMINI_API_KEY = 'test-key';

// Swaps global.fetch for the duration of one test, restoring it after —
// there's no mocking library in this project, and this is the only module
// that talks to an external API directly (everything else is dependency-free
// pure functions), so a tiny manual stub is simpler than adding one.
function withFetch(impl, fn) {
  const original = global.fetch;
  global.fetch = impl;
  return fn().finally(() => { global.fetch = original; });
}

const geminiResponse = ({ text, finishReason = 'STOP' }) => ({
  ok: true,
  json: async () => ({ candidates: [{ content: { parts: [{ text }] }, finishReason }] }),
});

test('callGeminiResilient returns the reply as-is when it finishes normally', () => withFetch(
  async () => geminiResponse({ text: 'A complete reply.' }),
  async () => {
    const result = await callGeminiResilient({ messages: [{ role: 'user', content: 'hi' }], maxTokens: 100 });
    assert.equal(result.ok, true);
    assert.equal(result.content, 'A complete reply.');
    assert.equal(result.truncated, false);
  }
));

test('callGeminiResilient retries with a larger token budget when the reply was cut off by MAX_TOKENS, and succeeds once it fits', () => {
  const seenTokens = [];
  return withFetch(
    async (url, opts) => {
      const body = JSON.parse(opts.body);
      seenTokens.push(body.generationConfig.maxOutputTokens);
      // First call: still truncated, thinking ate the small budget. Second
      // call (after the budget triples): finishes cleanly.
      return seenTokens.length === 1
        ? geminiResponse({ text: 'Drop the weight and add a', finishReason: 'MAX_TOKENS' })
        : geminiResponse({ text: 'Drop the weight and add a rep next time.' });
    },
    async () => {
      const result = await callGeminiResilient({ messages: [{ role: 'user', content: 'thoughts?' }], maxTokens: 100 });
      assert.equal(result.ok, true);
      assert.equal(result.truncated, false);
      assert.equal(result.content, 'Drop the weight and add a rep next time.');
      assert.deepEqual(seenTokens, [100, 300], 'second attempt should use a tripled token budget, not the same one that just failed');
    }
  );
});

test('callGeminiResilient does not silently return a truncated reply as if it were complete', () => withFetch(
  async () => geminiResponse({ text: 'Cut off mid', finishReason: 'MAX_TOKENS' }),
  async () => {
    const result = await callGeminiResilient({ messages: [{ role: 'user', content: 'hi' }], maxTokens: 50 });
    // Still truncated after exhausting retries (worst case) -- the caller can
    // at least tell, rather than this looking identical to a real answer.
    assert.equal(result.truncated, true);
  }
));

test('callGeminiResilient retries on 429/503 with backoff, unrelated to the truncation path', () => {
  let calls = 0;
  return withFetch(
    async () => {
      calls++;
      if (calls === 1) {
        return {
          ok: false, status: 503,
          json: async () => ({ error: { details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '0.01s' }] } }),
        };
      }
      return geminiResponse({ text: 'Recovered.' });
    },
    async () => {
      const result = await callGeminiResilient({ messages: [{ role: 'user', content: 'hi' }], maxTokens: 100 });
      assert.equal(result.ok, true);
      assert.equal(result.content, 'Recovered.');
      assert.ok(calls >= 2);
    }
  );
});

test('callGeminiResilient switches to the fallback key immediately on a 429, without waiting through backoff', () => {
  process.env.GEMINI_API_KEY_FALLBACK = 'fallback-key';
  const seenKeys = [];
  return withFetch(
    async (url) => {
      const key = new URL(url).searchParams.get('key');
      seenKeys.push(key);
      if (key === 'test-key') return { ok: false, status: 429, json: async () => ({ error: {} }) };
      return geminiResponse({ text: 'Answered on the fallback key.' });
    },
    async () => {
      const result = await callGeminiResilient({ messages: [{ role: 'user', content: 'hi' }], maxTokens: 100 });
      assert.equal(result.ok, true);
      assert.equal(result.content, 'Answered on the fallback key.');
      assert.deepEqual(seenKeys, ['test-key', 'fallback-key'], 'should switch keys on the very next attempt, not retry the exhausted key first');
    }
  ).finally(() => { delete process.env.GEMINI_API_KEY_FALLBACK; });
});

test('callGeminiResilient falls through to normal backoff retry once the fallback key is also rate-limited', () => {
  process.env.GEMINI_API_KEY_FALLBACK = 'fallback-key';
  let calls = 0;
  const rateLimited = { ok: false, status: 429, json: async () => ({ error: { details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '0.01s' }] } }) };
  return withFetch(
    async () => {
      calls++;
      return calls <= 2 ? rateLimited : geminiResponse({ text: 'Recovered on retry.' });
    },
    async () => {
      const result = await callGeminiResilient({ messages: [{ role: 'user', content: 'hi' }], maxTokens: 100 });
      assert.equal(result.ok, true);
      assert.equal(result.content, 'Recovered on retry.');
      assert.equal(calls, 3, 'primary key 429s once (switches key), fallback key 429s once (backoff retry), then succeeds');
    }
  ).finally(() => { delete process.env.GEMINI_API_KEY_FALLBACK; });
});

test('callGeminiResilient still tries the fallback key even when the 429 lands on the final loop iteration', () => {
  // Two MAX_TOKENS truncations burn through the first two of the 3 allowed
  // attempts before the primary key ever 429s on the third — the exact edge
  // case where switching keys would previously exit the loop before ever
  // calling the fallback key.
  process.env.GEMINI_API_KEY_FALLBACK = 'fallback-key';
  let calls = 0;
  const seenKeys = [];
  return withFetch(
    async (url) => {
      calls++;
      seenKeys.push(new URL(url).searchParams.get('key'));
      if (calls <= 2) return geminiResponse({ text: 'cut off', finishReason: 'MAX_TOKENS' });
      if (calls === 3) return { ok: false, status: 429, json: async () => ({ error: {} }) };
      return geminiResponse({ text: 'Answered on the fallback key.' });
    },
    async () => {
      const result = await callGeminiResilient({ messages: [{ role: 'user', content: 'hi' }], maxTokens: 100 });
      assert.equal(result.ok, true);
      assert.equal(result.content, 'Answered on the fallback key.');
      assert.deepEqual(seenKeys, ['test-key', 'test-key', 'test-key', 'fallback-key'], 'two truncation retries use up two of the three attempts, then the 429 on the third should still switch keys and actually try the fallback, not just flag it and exit');
    }
  ).finally(() => { delete process.env.GEMINI_API_KEY_FALLBACK; });
});

test('callGeminiResilient never attempts a second key when no fallback is configured', () => {
  delete process.env.GEMINI_API_KEY_FALLBACK;
  let calls = 0;
  const rateLimited = { ok: false, status: 429, json: async () => ({ error: { details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '0.01s' }] } }) };
  return withFetch(
    async (url) => {
      calls++;
      assert.equal(new URL(url).searchParams.get('key'), 'test-key', 'every attempt should use the only configured key');
      return rateLimited;
    },
    async () => {
      const result = await callGeminiResilient({ messages: [{ role: 'user', content: 'hi' }], maxTokens: 100 });
      assert.equal(result.ok, false);
      assert.equal(result.status, 429);
      assert.equal(calls, 3);
    }
  );
});

test('geminiRetryDelaySec parses RetryInfo.retryDelay', () => {
  const error = { details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '13s' }] };
  assert.equal(geminiRetryDelaySec(error), 13);
});

test('geminiRetryDelaySec returns null when no RetryInfo is present', () => {
  assert.equal(geminiRetryDelaySec({}), null);
  assert.equal(geminiRetryDelaySec(undefined), null);
});

test('parseGeminiJSON parses clean JSON as-is', () => {
  assert.deepEqual(parseGeminiJSON('{"headline":"Recovery Day","score":72}'), { headline: 'Recovery Day', score: 72 });
});

test('parseGeminiJSON strips a markdown code fence', () => {
  assert.deepEqual(parseGeminiJSON('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseGeminiJSON('```\n{"a":1}\n```'), { a: 1 });
});

test('parseGeminiJSON recovers from trailing content after a complete JSON value — the actual reported production bug', () => {
  assert.deepEqual(parseGeminiJSON('{"a":1,"b":2} \n\nLet me know if you\'d like anything else!'), { a: 1, b: 2 });
});

test('parseGeminiJSON correctly finds the closing brace even with braces/quotes inside string values', () => {
  const obj = { headline: 'A "quoted" phrase with a } fake brace', nested: { x: 1 } };
  assert.deepEqual(parseGeminiJSON(JSON.stringify(obj) + ' trailing junk'), obj);
});

test('parseGeminiJSON handles a top-level array the same way', () => {
  assert.deepEqual(parseGeminiJSON('[1,2,3] trailing'), [1, 2, 3]);
});

test('parseGeminiJSON still throws on genuinely malformed JSON, not just noisy-but-valid JSON', () => {
  assert.throws(() => parseGeminiJSON('{"a": 1, "b":}'));
});
