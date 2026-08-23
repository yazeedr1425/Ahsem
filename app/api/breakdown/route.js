import { GoogleGenAI, Type } from "@google/genai";
import { MAX_OPTIONS, MIN_OPTIONS } from "@/lib/engine/score";
import { normalizeArabic } from "@/lib/voice/match";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "gemini-3.6-flash";
const TIMEOUT_MS = 25000;
const MAX_LABEL_LENGTH = 60;
const MIN_QUESTIONS = 3;
const MAX_QUESTIONS = 5;
const ATTEMPTS = 2;
const RETRY_DELAY_MS = 700;

const SLUG = /^[a-z][a-z0-9_]{0,23}$/;

// تفكيك القرار الكبير.
//
// "أستقيل؟" سؤال ما ينحسم بالمزاج — ينحسم بوقائع: كم عندك مدخرات؟
// فيه عميل يدفع؟ جربته جنب الوظيفة؟ المرحلة الأولى تحوّل السؤال
// الكبير لفحوصات صغيرة لها جواب اليوم، والثانية تركّب من الإجابات
// حكماً: اقدم، أو "مو الحين — وهذا اللي ينقصك".
const QUESTIONS_PROMPT = `Someone faces a decision too big to settle by gut feel. Your job: break it into ${MIN_QUESTIONS} to ${MAX_QUESTIONS} small questions that ARE answerable — factual checks about their situation today, not the big question rephrased.

For "أستقيل / أكمل بالوظيفة" good checks are: "عندك مدخرات تكفيك ٦ أشهر؟" · "فيه عميل أو دخل أول من مشروعك؟" · "جربت تشتغل عليه جنب الوظيفة؟" — each one answerable with نعم or لا TODAY, from facts the person already knows.

HARD RULES:

1. FIRST, JUDGE THE SIZE. If the decision is actually small — two meals, tonight's plan, which movie — set oversized to false, give a one-line Arabic reason, and return NO questions. Solemnly breaking down برجر ولا سوشي embarrasses everyone. Big means: hard to reverse, months of consequences, reshapes money, work, study, family, or where they live.

2. FACT-CHECKS, NOT FEELINGS. Every question asks about something verifiable in their life right now: money, income, dependents, deadlines, a tested alternative, a concrete backup. "تحس إنك جاهز؟" is the big question wearing a costume. The words تبي, تبغى, تحس, ودك must not appear in any question.

3. EVERY QUESTION CARRIES "favors": which option (copied VERBATIM from their list) a نعم answer supports. Spread them — if every نعم favors the same option, the quiz is a lecture, not a decision. At least one question must favor each of the two leading options.

4. "why" is one short Arabic clause naming what this fact changes: "المدخرات تحدد كم تصبر بلا دخل".

5. SHORT SPOKEN SAUDI ARABIC. "key" is a lowercase English slug.`;

const QUESTIONS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    oversized: {
      type: Type.BOOLEAN,
      description: "False if this decision is small enough for the normal flow.",
    },
    reason: {
      type: Type.STRING,
      description: "One short Arabic line explaining the size judgment.",
    },
    questions: {
      type: Type.ARRAY,
      description: `${MIN_QUESTIONS} to ${MAX_QUESTIONS} factual checks. Empty when oversized is false.`,
      items: {
        type: Type.OBJECT,
        properties: {
          key: { type: Type.STRING, description: "lowercase english slug" },
          label: {
            type: Type.STRING,
            description: "Arabic question answerable with نعم or لا today",
          },
          why: {
            type: Type.STRING,
            description: "Short Arabic clause: what this fact changes.",
          },
          favors: {
            type: Type.STRING,
            description: "The option, verbatim, that a نعم answer supports.",
          },
        },
        required: ["key", "label", "why", "favors"],
        propertyOrdering: ["key", "label", "why", "favors"],
      },
    },
  },
  required: ["oversized", "reason", "questions"],
  propertyOrdering: ["oversized", "reason", "questions"],
};

const VERDICT_PROMPT = `The user answered the factual checks about their big decision. Compose the verdict.

You get: the options, and each check with its answer (نعم / تقريباً / لا) plus which option a نعم favors.

HARD RULES:

1. verdict is "go" — act on the bold option now — or "not_yet". "chosen" is the option to act on NOW, verbatim from the list. For not_yet that is usually the safe option, but the whole point is saying what would flip it.

2. REASON ONLY FROM THEIR ANSWERS. Cite them: "ما عندك عميل أول، ومدخراتك تقريباً تكفي". Never use a fact that is not in the answers, and never contradict one.

3. "missing" — for not_yet: one to three concrete conditions that would flip the verdict to go, each phrased as an achievable state ("عميل واحد يدفع" · "مدخرات ٦ أشهر"). Empty for go. This list is the most valuable thing on the screen: it turns "لا" into "مو الحين، وهذا الطريق".

4. "next_step": ONE action doable this week, specific enough to start tomorrow morning.

5. NOT_YET IS NOT A NO. It is sequencing. Never scold; the person who checks before jumping is doing it right.

6. SHORT SPOKEN SAUDI ARABIC. headline one sentence, detail two or three.`;

const VERDICT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    verdict: { type: Type.STRING, description: 'Exactly "go" or "not_yet".' },
    chosen: {
      type: Type.STRING,
      description: "The option to act on now, verbatim.",
    },
    headline: { type: Type.STRING, description: "One Arabic sentence — the bottom line." },
    detail: {
      type: Type.STRING,
      description: "Two or three Arabic sentences reasoning from their answers.",
    },
    missing: {
      type: Type.ARRAY,
      description: "For not_yet: 1-3 achievable states that flip it. Empty for go.",
      items: { type: Type.STRING },
    },
    next_step: {
      type: Type.STRING,
      description: "One concrete Arabic action doable this week.",
    },
  },
  required: ["verdict", "chosen", "headline", "detail", "missing", "next_step"],
  propertyOrdering: ["verdict", "chosen", "headline", "detail", "missing", "next_step"],
};

// ---------- حد المعدل ----------
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;
const hits = new Map();

function allowed(ip) {
  const now = Date.now();
  const seen = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  seen.push(now);
  hits.set(ip, seen);

  if (hits.size > 1000) {
    for (const [key, times] of hits) {
      if (!times.some((t) => now - t < RATE_WINDOW_MS)) hits.delete(key);
    }
  }
  return seen.length <= RATE_MAX;
}

const fail = (status, message) =>
  Response.json({ ok: false, error: message }, { status });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const matchOption = (label, options) => {
  if (typeof label !== "string") return null;
  const key = normalizeArabic(label);
  return options.find((o) => normalizeArabic(o) === key) ?? null;
};

function validateOptions(raw) {
  if (!Array.isArray(raw)) return null;
  const options = raw
    .filter((o) => typeof o === "string")
    .map((o) => o.trim())
    .filter(Boolean);

  if (options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) return null;
  if (options.some((o) => o.length > MAX_LABEL_LENGTH)) return null;
  if (new Set(options.map(normalizeArabic)).size !== options.length) return null;
  return options;
}

// ---------- المرحلة الأولى: الأسئلة ----------

// "تحس/تبغى" في سؤال = السؤال الكبير متنكراً بصيغة أصغر —
// وهذا بالضبط اللي جينا نتخلص منه
const FEELING = /(تحس|تبغى|تبغا|تبي|ودك)/;

function shapeQuestions(raw, options) {
  if (typeof raw?.oversized !== "boolean") return null;
  const reason = (typeof raw.reason === "string" ? raw.reason.trim() : "").slice(0, 160);

  if (!raw.oversized) return { oversized: false, reason, questions: [] };

  const seen = new Set();
  const out = [];
  for (const q of Array.isArray(raw.questions) ? raw.questions : []) {
    const key = typeof q?.key === "string" ? q.key.trim() : "";
    const label = typeof q?.label === "string" ? q.label.trim() : "";
    const favors = matchOption(q?.favors, options);
    if (!key || !SLUG.test(key) || seen.has(key)) continue;
    if (!label || FEELING.test(label) || !favors) continue;

    seen.add(key);
    out.push({
      key,
      label: label.slice(0, 120),
      why: (typeof q?.why === "string" ? q.why.trim() : "").slice(0, 100),
      favors,
    });
    if (out.length === MAX_QUESTIONS) break;
  }

  if (out.length < MIN_QUESTIONS) return null;

  // كل "نعم" تصب في خيار واحد = محاضرة مو تفكيك
  if (new Set(out.map((q) => q.favors)).size < 2) return null;

  return { oversized: true, reason, questions: out };
}

// ---------- المرحلة الثانية: الحكم ----------

const ANSWERS = new Set(["نعم", "تقريباً", "لا"]);

function validateAnswers(raw, options) {
  if (!Array.isArray(raw) || raw.length < MIN_QUESTIONS || raw.length > MAX_QUESTIONS) {
    return null;
  }
  const out = [];
  for (const a of raw) {
    const label = typeof a?.label === "string" ? a.label.trim() : "";
    const answer = typeof a?.answer === "string" ? a.answer.trim() : "";
    const favors = matchOption(a?.favors, options);
    if (!label || !ANSWERS.has(answer) || !favors) return null;
    out.push({ label: label.slice(0, 120), answer, favors });
  }
  return out;
}

function shapeVerdict(raw, options) {
  const verdict = raw?.verdict === "go" || raw?.verdict === "not_yet" ? raw.verdict : null;
  const chosen = matchOption(raw?.chosen, options);
  const text = (value, max) =>
    typeof value === "string" && value.trim() ? value.trim().slice(0, max) : "";

  const headline = text(raw?.headline, 160);
  const detail = text(raw?.detail, 400);
  const nextStep = text(raw?.next_step, 200);
  if (!verdict || !chosen || !headline || !detail || !nextStep) return null;

  // "اقدم" مع قائمة نواقص تناقض نفسها — النواقص لغير الجاهز فقط
  const missing =
    verdict === "not_yet"
      ? (Array.isArray(raw?.missing) ? raw.missing : [])
          .map((m) => text(m, 100))
          .filter(Boolean)
          .slice(0, 3)
      : [];

  if (verdict === "not_yet" && !missing.length) return null;

  return { verdict, chosen, headline, detail, missing, nextStep };
}

// ---------- النداء ----------

async function call(ai, { system, schema, contents, signal, temperature }) {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents,
    config: {
      systemInstruction: system,
      responseMimeType: "application/json",
      responseSchema: schema,
      temperature,
      abortSignal: signal,
    },
  });
  if (!response?.text) throw new Error("empty response");
  return JSON.parse(response.text);
}

// ---------------------------------------------------------------
// POST /api/breakdown — phase: "questions" | "verdict"
// ---------------------------------------------------------------

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return fail(400, "ما قدرنا نقرأ الطلب.");
  }

  const options = validateOptions(body?.options);
  if (!options) return fail(400, "خيارات غير صالحة.");

  const phase = body?.phase;
  if (phase !== "questions" && phase !== "verdict") {
    return fail(400, "phase لازم تكون questions أو verdict.");
  }

  let answers = null;
  if (phase === "verdict") {
    answers = validateAnswers(body?.answers, options);
    if (!answers) return fail(400, "إجابات غير صالحة.");
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!allowed(ip)) return fail(429, "محاولات كثيرة — انتظر دقيقة.");

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fail(503, "المفكك غير مهيأ — GEMINI_API_KEY مفقود.");

  const ai = new GoogleGenAI({ apiKey });
  const listed = options.map((o, i) => `${i + 1}. ${o}`).join("\n");

  let result = null;
  let lastError = null;

  for (let attempt = 1; attempt <= ATTEMPTS && !result; attempt += 1) {
    if (attempt > 1) await sleep(RETRY_DELAY_MS);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      if (phase === "questions") {
        const raw = await call(ai, {
          system: QUESTIONS_PROMPT,
          schema: QUESTIONS_SCHEMA,
          // اقتراح الفحوصات يحتاج تنوعاً، والحكم لاحقاً يحتاج انضباطاً
          temperature: 0.7,
          signal: controller.signal,
          contents:
            "القرار الكبير اللي محتار فيه:\n" +
            listed +
            "\n\nفكّه لفحوصات صغيرة. أرجع كائن JSON فقط.",
        });
        result = shapeQuestions(raw, options);
      } else {
        const described = answers
          .map((a) => `- ${a.label}\n  جوابه: ${a.answer} (نعم تدعم "${a.favors}")`)
          .join("\n");
        const raw = await call(ai, {
          system: VERDICT_PROMPT,
          schema: VERDICT_SCHEMA,
          temperature: 0.4,
          signal: controller.signal,
          contents:
            "الخيارات:\n" +
            listed +
            "\n\nالفحوصات وإجاباته:\n" +
            described +
            "\n\nركّب الحكم. أرجع كائن JSON فقط.",
        });
        result = shapeVerdict(raw, options);
      }
      if (!result) {
        console.warn(`[api/breakdown] rejected ${phase} shape (attempt ${attempt})`);
      }
    } catch (err) {
      lastError = err;
      console.error(`[api/breakdown] ${phase} attempt ${attempt} failed:`, err);
    } finally {
      clearTimeout(timer);
    }
  }

  if (!result) {
    if (lastError?.name === "AbortError") {
      return fail(504, "المفكك تأخر بالرد — جرب مرة ثانية.");
    }
    if (lastError?.status === 503) {
      return fail(503, "المفكك مزدحم الحين — انتظر شوي وجرب.");
    }
    return fail(502, "ما قدرنا نفك القرار الحين — جرب مرة ثانية.");
  }

  return Response.json({ ok: true, ...result });
}
