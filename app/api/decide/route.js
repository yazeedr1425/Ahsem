import { GoogleGenAI, Type } from "@google/genai";
import { getCategory } from "@/lib/engine/categories";
import { isUsableFrame, pathQuestions } from "@/lib/engine/frame";
import { toArabicDigits } from "@/lib/text/digits";
import { MAX_OPTIONS, MIN_OPTIONS } from "@/lib/engine/score";
import { supabaseAdmin } from "@/lib/supabase-server";
import { clientIp, createLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// حسم واحد يكفيه نداء واحد — ١٥ في الدقيقة سخيّ لمستخدم حقيقي وضيّق على حلقة
const allowed = createLimiter({ max: 15 });

const HISTORY_LIMIT = 5;
const MAX_LABEL_LENGTH = 60;
// سطر واحد لكل حقل — الأطول يكسر البطاقة ولا يضيف معنى
const MAX_DEPTH_TEXT = 160;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MODEL = "gemini-3.6-flash";
const GEMINI_TIMEOUT_MS = 15000;

const SYSTEM_INSTRUCTION =
  "You are Ahsem, a smart, slightly sarcastic, and fun decision-making assistant. " +
  "Your job is to choose ONE option from the user's list based on their current answers " +
  "and past decision history. Weigh their current answers heavily. Look at their past " +
  "decisions to spot habits. Provide a short, witty, and fun reason in Arabic explaining " +
  "WHY you chose this. Act like a close friend, not a robotic assistant. " +
  "Then go one layer deeper, in short Saudi-dialect Arabic with Arabic-Indic digits: " +
  "decisive_criterion is the criterion key that actually settled it, copied verbatim from " +
  "the criteria list you were given. edge is the winner's one decisive strength. " +
  "cost_of_switching is what they give up by taking the other option — concrete, not a " +
  "platitude. flip_condition names the specific change that would reverse this decision, " +
  "so they can reuse the rule without the app: «لو صار كذا، ينقلب لكذا». " +
  "Never hedge in these four — a condition that never flips anything is worse than none.";

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    selected_option: {
      type: Type.STRING,
      description: "Must be copied verbatim from the user's options list.",
    },
    funny_reason: {
      type: Type.STRING,
      description: "One or two witty sentences in Arabic explaining the choice.",
    },
    decisive_criterion: {
      type: Type.STRING,
      description: "A criterion key copied verbatim from the criteria list.",
    },
    edge: { type: Type.STRING, description: "The winner's decisive strength." },
    cost_of_switching: {
      type: Type.STRING,
      description: "What they lose by taking the other option.",
    },
    flip_condition: {
      type: Type.STRING,
      description: "The specific change that would reverse this decision.",
    },
  },
  required: [
    "selected_option",
    "funny_reason",
    "decisive_criterion",
    "edge",
    "cost_of_switching",
    "flip_condition",
  ],
  propertyOrdering: [
    "selected_option",
    "funny_reason",
    "decisive_criterion",
    "edge",
    "cost_of_switching",
    "flip_condition",
  ],
};

function fail(status, message, extra) {
  return Response.json({ ok: false, error: message, ...extra }, { status });
}

// ---------------------------------------------------------------
// التحقق من المدخلات
// ---------------------------------------------------------------

function validate(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "الطلب لازم يكون كائن JSON." };
  }

  const { options, answers, userId, categoryId, frame } = body;

  if (!Array.isArray(options)) {
    return { ok: false, message: "options لازم تكون مصفوفة." };
  }

  const cleaned = options
    .filter((o) => typeof o === "string")
    .map((o) => o.trim())
    .filter(Boolean);

  if (cleaned.length !== options.length) {
    return { ok: false, message: "كل عنصر في options لازم يكون نص غير فاضي." };
  }
  if (cleaned.length < MIN_OPTIONS || cleaned.length > MAX_OPTIONS) {
    return {
      ok: false,
      message: toArabicDigits(
        `عدد الخيارات لازم يكون بين ${MIN_OPTIONS} و${MAX_OPTIONS}.`,
      ),
    };
  }
  if (cleaned.some((o) => o.length > MAX_LABEL_LENGTH)) {
    return {
      ok: false,
      message: toArabicDigits(`طول الخيار الواحد ما يتجاوز ${MAX_LABEL_LENGTH} حرف.`),
    };
  }
  if (new Set(cleaned).size !== cleaned.length) {
    return { ok: false, message: "فيه خيارات مكررة." };
  }

  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return { ok: false, message: "answers لازم تكون كائن." };
  }
  if (Object.values(answers).some((v) => typeof v !== "string")) {
    return { ok: false, message: "قيم answers لازم تكون نصوص." };
  }

  if (userId != null && (typeof userId !== "string" || !UUID.test(userId))) {
    return { ok: false, message: "userId لازم يكون UUID صالح." };
  }

  // اختياري، لكن بدونه ما نعرف إيش معايير القرار وقت بناء البرومبت
  let category = null;
  if (categoryId != null) {
    category = getCategory(categoryId);
    if (!category) {
      return { ok: false, message: `فئة غير معروفة: ${categoryId}` };
    }
  }

  // الإطار مصدر الأسئلة والمعايير بنصوصها. ما نثق بشكلٍ جاء من
  // المتصفح أكثر مما نثق بمخرَج النموذج، فيمر على نفس المدقّق —
  // وإسقاطه عند الفشل يرجّع وصف الإجابات لمفاتيحها، ولا يفشّل الحسم
  const usable = isUsableFrame(frame) ? frame : null;

  return {
    ok: true,
    value: {
      options: cleaned,
      answers,
      userId: userId ?? null,
      categoryId: category?.id ?? null,
      frame: usable,
    },
  };
}

// ---------------------------------------------------------------
// الهوية — التوكن أوثق من userId اللي يجي في الـ body
// ---------------------------------------------------------------

async function resolveIdentity(request, bodyUserId) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;

  if (token) {
    const { data, error } = await supabaseAdmin().auth.getUser(token);
    if (error || !data?.user) {
      return { error: "توكن الدخول غير صالح." };
    }
    return { userId: data.user.id, verified: true };
  }

  return { userId: bodyUserId, verified: false };
}

// ---------------------------------------------------------------
// سجل آخر 5 قرارات — لفهم عادات المستخدم
// ---------------------------------------------------------------

function firstOf(value) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

async function fetchRecentDecisions(userId) {
  const { data, error } = await supabaseAdmin()
    .from("decisions")
    // لازم نحدد اسم الـ FK: فيه علاقتان بين decisions و options
    // (options.decision_id → decisions.id، و decisions.winner_option_id → options.id)
    // وبدون التحديد يرجع PostgREST خطأ PGRST201 لأنه ما يعرف أيهما نقصد.
    .select(
      "id, title, category, status, winner_option_id, created_at, options!options_decision_id_fkey(id, label), feedback(satisfaction)"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  if (error) throw new Error(error.message);

  return (data ?? []).map((d) => {
    const all = d.options ?? [];
    const chosen = all.find((o) => o.id === d.winner_option_id) ?? null;
    return {
      id: d.id,
      title: d.title,
      category: d.category,
      decidedAt: d.created_at,
      chosen: chosen?.label ?? null,
      rejected: all.filter((o) => o.id !== d.winner_option_id).map((o) => o.label),
      satisfaction: firstOf(d.feedback)?.satisfaction ?? null,
    };
  });
}

// ---------------------------------------------------------------
// بناء البرومبت
// ---------------------------------------------------------------

// إجابات المستخدم تجي كمفاتيح خام مثل { time: "rush" }.
// نحولها لجُمل مفهومة حتى يقدر النموذج يستخدمها فعلاً.
//
// أسئلة الإطار أولاً: مفاتيحها مولّدة فما توجد أبداً بين أسئلة الفئة
// الثابتة، وبدون هذا يستلم النموذج «‎where_will_you_eat: on_the_go‎»
// بدل «وين بتاكل؟ ← وأنا ماشي» — معرّفات بدل نصٍّ عربي كتبه هو نفسه.
function describeAnswers({ category, frame, answers }) {
  const entries = Object.entries(answers);
  if (!entries.length) return "لم يجب على أي سؤال.";

  const questions = frame ? pathQuestions(frame, answers) : (category?.questions ?? []);

  return entries
    .map(([key, value]) => {
      const question = questions.find((q) => q.key === key);
      if (!question) return `- ${key}: ${value}`;
      const choice = question.choices.find((c) => c.value === value);
      return `- ${question.label} ← ${choice?.label ?? value}`;
    })
    .join("\n");
}

function describeHistory(history) {
  if (!history.length) return "لا يوجد سجل سابق — هذا أول قرار له.";

  return history
    .map((h) => {
      const parts = [`- [${h.category}] ${h.title}`];
      if (h.chosen) parts.push(`اختار: ${h.chosen}`);
      if (h.rejected?.length) parts.push(`وترك: ${h.rejected.join("، ")}`);
      if (h.satisfaction != null) parts.push(`رضاه: ${h.satisfaction}/5`);
      return parts.join(" · ");
    })
    .join("\n");
}

// المعايير بمفاتيحها: `decisive_criterion` لازم ينسخ واحداً منها،
// وبلا القائمة يخترع مفتاحاً يسقط في `shape()` ويضيع الحقل
function describeCriteria(frame) {
  if (!frame) return null;
  return [
    "معايير هذا القرار (decisive_criterion لازم يكون أحد مفاتيحها):",
    ...frame.criteria.map((c) => `- ${c.key}: ${c.label} (${c.low} ← → ${c.high})`),
  ].join("\n");
}

function buildPrompt({ options, answers, category, frame, history }) {
  return [
    frame?.headline ? `المفاضلة: ${frame.headline}` : null,
    category
      ? `نوع القرار: ${category.label} (${category.en})`
      : "نوع القرار: غير محدد",
    "",
    "الخيارات المطروحة (اختر واحداً منها حرفياً):",
    ...options.map((o, i) => `${toArabicDigits(i + 1)}. ${o}`),
    "",
    describeCriteria(frame),
    frame ? "" : null,
    "إجاباته على الأسئلة السريعة (وزنها عالي):",
    describeAnswers({ category, frame, answers }),
    "",
    `آخر ${toArabicDigits(HISTORY_LIMIT)} قرارات له (للعادات فقط، لا تغلّبها على إجاباته الحالية):`,
    describeHistory(history),
  ]
    .filter((line) => line !== null)
    .join("\n");
}

// ---------------------------------------------------------------
// نداء Gemini
// ---------------------------------------------------------------

const normalize = (s) => s.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();

// النموذج ممكن يعيد صياغة الخيار بدل ما ينسخه — نرجّعه للخيار الأصلي
function matchOption(selected, options) {
  if (typeof selected !== "string") return null;
  const exact = options.find((o) => o === selected);
  if (exact) return exact;
  return options.find((o) => normalize(o) === normalize(selected)) ?? null;
}

// الحقول الأربعة الجديدة إضافة محضة: الحسم يظهر بدونها، فأي حقل
// لا يجتاز التدقيق يُحذف ولا يُسقِط الطلب. حقل ناقص يعني بطاقة أقل،
// وحقل مخترع يعني سطراً يشير لمعيار غير موجود.
const line = (value) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed ? toArabicDigits(trimmed.slice(0, MAX_DEPTH_TEXT)) : null;
};

function depth(parsed, frame) {
  const out = {};

  // المفتاح لازم يشير لمعيار حقيقي — بدون الإطار ما فيه ما نقيس عليه
  const keys = frame ? new Set(frame.criteria.map((c) => c.key)) : null;
  if (keys?.has(parsed.decisive_criterion)) {
    out.decisive_criterion = parsed.decisive_criterion;
  }

  for (const field of ["edge", "cost_of_switching", "flip_condition"]) {
    const value = line(parsed[field]);
    if (value) out[field] = value;
  }

  return out;
}

async function askGemini({ options, answers, category, frame, history }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const err = new Error("GEMINI_API_KEY is not set");
    err.code = "NO_API_KEY";
    throw err;
  }

  const ai = new GoogleGenAI({ apiKey });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  let response;
  try {
    response = await ai.models.generateContent({
      model: MODEL,
      contents: buildPrompt({ options, answers, category, frame, history }),
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.9,
        abortSignal: controller.signal,
      },
    });
  } finally {
    clearTimeout(timeout);
  }

  const text = response?.text;
  if (!text) {
    const err = new Error("Gemini returned an empty response");
    err.code = "EMPTY";
    throw err;
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const err = new Error(`Gemini returned non-JSON: ${text.slice(0, 200)}`);
    err.code = "BAD_JSON";
    throw err;
  }

  const matched = matchOption(parsed.selected_option, options);
  if (!matched) {
    const err = new Error(
      `Gemini picked an option that is not in the list: ${parsed.selected_option}`
    );
    err.code = "OFF_LIST";
    throw err;
  }
  if (typeof parsed.funny_reason !== "string" || !parsed.funny_reason.trim()) {
    const err = new Error("Gemini returned an empty funny_reason");
    err.code = "BAD_REASON";
    throw err;
  }

  // نرجّع النص الأصلي للخيار حتى يطابق ما كتبه المستخدم بالضبط
  return {
    selected_option: matched,
    funny_reason: parsed.funny_reason.trim(),
    ...depth(parsed, frame),
  };
}

// ---------------------------------------------------------------
// POST /api/decide
// ---------------------------------------------------------------

export async function POST(request) {
  if (!allowed(clientIp(request))) return fail(429, "محاولات كثيرة — انتظر دقيقة.");

  let body;
  try {
    body = await request.json();
  } catch {
    return fail(400, "ما قدرنا نقرأ الطلب — لازم يكون JSON صالح.");
  }

  const parsed = validate(body);
  if (!parsed.ok) return fail(400, parsed.message);

  const { options, answers, userId: bodyUserId, categoryId, frame } = parsed.value;

  let identity;
  try {
    identity = await resolveIdentity(request, bodyUserId);
  } catch (err) {
    console.error("[api/decide] identity check failed:", err);
    return fail(500, "تعذر التحقق من الهوية.");
  }
  if (identity.error) return fail(401, identity.error);

  const { userId, verified } = identity;

  // السجل تحسين مو شرط — لو فشل نكمل بدونه بدل ما نفشل الطلب كله
  let history = [];
  let historyError = null;

  if (userId) {
    try {
      history = await fetchRecentDecisions(userId);
    } catch (err) {
      console.error("[api/decide] history fetch failed:", err);
      historyError = "تعذر جلب السجل السابق، كملنا بدونه.";
    }
  }

  let recommendation;
  try {
    recommendation = await askGemini({
      options,
      answers,
      category: categoryId ? getCategory(categoryId) : null,
      frame,
      history,
    });
  } catch (err) {
    console.error(`[api/decide] gemini failed (${err.code ?? "UNKNOWN"}):`, err);

    if (err.code === "NO_API_KEY") {
      return fail(503, "محرك القرار غير مهيأ — GEMINI_API_KEY مفقود.");
    }
    if (err.name === "AbortError") {
      return fail(504, "محرك القرار تأخر بالرد، جرب مرة ثانية.");
    }
    // OFF_LIST / BAD_JSON / EMPTY / BAD_REASON أو خطأ من الـ API نفسه
    return fail(502, "ما قدرنا نطلع بتوصية الحين، جرب مرة ثانية.");
  }

  return Response.json({
    ok: true,
    input: { options, answers, categoryId },
    user: { id: userId, verified },
    history,
    historyCount: history.length,
    historyError,
    model: MODEL,
    ...recommendation,
  });
}
