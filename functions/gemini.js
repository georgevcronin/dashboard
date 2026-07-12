// Shared Gemini helper, used by every LLM-backed endpoint (morning briefing,
// newscast, weekly review, macro-analysis, coach notes). No dependency on
// app/db state — a pure API client keyed on environment variables.

// gemini-2.0-flash was retired June 1, 2026; gemini-2.5-flash-lite hit widely-reported
// capacity-constrained 503s; gemini-2.5-flash itself has since stopped accepting new
// callers ahead of its official Oct 16, 2026 shutdown. On gemini-3.5-flash — Google's
// current production-recommended default — with gemini-3.1-flash-lite as fallback.
const GEMINI_MODEL = "gemini-3.5-flash";
const GEMINI_FALLBACK_MODEL = "gemini-3.1-flash-lite";

async function callGemini({ messages, maxTokens = 800, jsonMode = false, image = null, temperature, model = GEMINI_MODEL }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, status: 0, error: { message: "GEMINI_API_KEY not set" } };

  const systemText = messages.filter(m => m.role === "system").map(m => m.content).join("\n\n");
  const turns = messages.filter(m => m.role !== "system").map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  if (image && turns.length) {
    turns[turns.length - 1].parts.push({ inline_data: { mime_type: image.mimeType, data: image.data } });
  }

  // Gemini 2.5+/3.x models default to an internal "thinking" pass before responding,
  // costing latency for no benefit on short replies like these. Minimized — but the
  // config field differs by generation: Gemini 3.x uses thinkingLevel (LOW/MEDIUM/HIGH),
  // 2.5-and-earlier uses a numeric thinkingBudget. Using the wrong one for the model's
  // generation produces malformed output rather than a clean error.
  const generationConfig = {
    maxOutputTokens: maxTokens,
    thinkingConfig: model.startsWith("gemini-3") ? { thinkingLevel: "LOW" } : { thinkingBudget: 0 },
  };
  if (jsonMode) generationConfig.responseMimeType = "application/json";
  if (temperature != null) generationConfig.temperature = temperature;

  const body = { contents: turns, generationConfig };
  if (systemText) body.systemInstruction = { parts: [{ text: systemText }] };

  let r, data;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    data = await r.json();
  } catch (e) {
    return { ok: false, status: 0, error: { message: e.name === "AbortError" ? "Gemini request timed out after 25s" : e.message } };
  } finally {
    clearTimeout(timeout);
  }
  if (!r.ok) return { ok: false, status: r.status, error: data.error || { message: `Gemini returned ${r.status}` } };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return { ok: false, status: r.status, error: { message: "Gemini returned no content" } };
  return { ok: true, status: r.status, content: text };
}

// Parses Gemini's rate-limit retry hint (RetryInfo.retryDelay, e.g. "13s") when present.
function geminiRetryDelaySec(error) {
  const detail = error?.details?.find(d => d["@type"]?.includes("RetryInfo"));
  const match = detail?.retryDelay?.match(/^([\d.]+)s$/);
  return match ? parseFloat(match[1]) : null;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Retries on 429 (quota) and 503 (overloaded) with backoff, then falls back to
// GEMINI_FALLBACK_MODEL once if the primary model stays overloaded through the
// retries — a capacity issue is usually specific to one model, not Gemini as a
// whole. Used by every Gemini-backed generator so a transient overload doesn't
// just fail outright.
async function callGeminiResilient(opts) {
  let result;
  for (let attempt = 0; attempt < 3; attempt++) {
    result = await callGemini(opts);
    if (result.ok) return result;
    if (result.status !== 429 && result.status !== 503) break;
    const waitSec = geminiRetryDelaySec(result.error) || (2 * (attempt + 1));
    await sleep(Math.min(waitSec, 10) * 1000 + 250);
  }
  if (result.status === 503) {
    const fallback = await callGemini({ ...opts, model: GEMINI_FALLBACK_MODEL });
    if (fallback.ok) return fallback;
    result = fallback;
  }
  return result;
}

module.exports = { callGemini, callGeminiResilient, geminiRetryDelaySec, GEMINI_MODEL, GEMINI_FALLBACK_MODEL };
