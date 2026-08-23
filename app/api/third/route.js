import { GoogleGenAI, Type } from "@google/genai";
import { MAX_OPTIONS, MIN_OPTIONS } from "@/lib/engine/score";
import { normalizeArabic } from "@/lib/voice/match";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "gemini-3.6-flash";
// المقاس: النداء الناجح يأخذ ٤ إلى ٩ ثوانٍ، فـ ٩ كانت على الحافة
// وتقطع نداءات كانت راح تنجح. والأسوأ إنها تفشل بصمت — الاقتراح
// يختفي والمستخدم يظن إن ما فيه اقتراح، لا إن النداء انقطع.
// المهلة طويلة ما تضر هنا: العميل يلغي الطلب أول ما يعدّل خياراته.
const TIMEOUT_MS = 20000;
const MAX_LABEL_LENGTH = 60;
const MAX_SUGGESTION_LENGTH = 40;
const SUGGESTION_COUNT = 2;

// اقتراح خيار ثالث.
//
// أحياناً الحيرة بين شيئين ما هي لأن أحدهما أفضل، بل لأن الاثنين
// غلط. البديل الجيد ما هو "واحد ثالث من نفس النوع" — بيتزا مع برجر
// وسوشي ما تحل شيئاً، تزيد الحيرة صفاً. البديل الجيد يقرأ المقايضة
// اللي عالق فيها ويكسرها.
const SYSTEM_PROMPT = `Someone is torn between two or more things. Your job is to notice what they are trading off, and offer the option they did not think of.

Return at most ${SUGGESTION_COUNT} suggestions. Fewer is better than forced.

FIRST, WORK OUT THE TRADE-OFF.
What do their options have in common, and what separates them? "برجر" and "سوشي" are both a meal out, split by heavy-versus-light. "أستقيل" and "أكمل بالوظيفة" are both all-or-nothing, split by security-versus-freedom.

THEN OFFER ONE OF THESE THREE MOVES:

1. المنتصف — sits between them on the axis that splits them.
   برجر / سوشي → "مشاوي" (a meal out, neither heavy nor raw).

2. الهروب — sidesteps the trade-off instead of splitting it.
   أطلب من مطعم / أطبخ بالبيت → "أسخّن اللي بالثلاجة" (cheap AND no effort — it refuses the trade entirely).

3. نسخة مصغّرة — the smaller version of the scary option, for all-or-nothing choices.
   أستقيل / أكمل بالوظيفة → "أشتغل على مشروعي بالليل".

4. الدمج — when the two are not actually mutually exclusive and nobody noticed.
   أقعد أشرب شاهي / أطلع برا للحديقة → "أشرب شاهي بالحديقة". Check this one first: people often frame two compatible things as a fork out of habit, and pointing that out ends the hesitation instantly.

5. البقاء أو التأجيل — for buying and switching, the missing option is usually neither of the two products.
   أشتري آيفون / أشتري أندرويد → "أصلح جوالي الحالي" or "أنتظر الإصدار الجاي".
   Whenever both options are purchases or both are switches, ask what happens if they do neither — that is almost always a real option they did not write down.

HARD RULES:

1. CONCRETE ENOUGH TO PICK RIGHT NOW.
   "أكل صحي" is a category, not an option — they cannot choose it tonight. "سلطة دجاج" they can. Same test for everything: could they act on it in the next hour, or this week for a life decision?

2. THE SAME KIND OF THING AS THEIR OPTIONS.
   If they listed meals, suggest a meal. If they listed life paths, suggest a life path. If they listed places to go, suggest a place. Never change the category on them.

3. NOT A RESTATEMENT.
   It must not be a synonym, a subtype, or a rewording of anything already on their list. "شاورما" when they wrote "شاورما دجاج" is the same thing. If the only thing you can think of is a cousin of an existing option, return nothing.

4. THEIR WORDS, NOT DICTIONARY ARABIC.
   Match the register they typed in — this rule cuts both ways. Someone who wrote "أقعد أشرب شاهي" gets "أطلع أمشي شوي", not "ممارسة رياضة المشي". And someone who wrote "الإعلانات الممولة" gets "التسويق بالمحتوى", never "إعلانات ممولة خفيفة".

5. TWO TO FOUR WORDS.
   It goes on a small chip next to their options.

6. RETURNING NOTHING IS A REAL ANSWER — BUT CHECK ALL FIVE MOVES FIRST.
   Sometimes the two options really are the whole world of that choice, and an empty list beats padding. But before you return nothing, walk the five moves in order: is there a middle? an escape? a smaller version? can they just do both? what if they do neither?
   Most pairs that look closed open up on move 4 or 5. Return nothing only when all five come up empty.

7. "note" IS TWO OR THREE WORDS SAYING WHY.
   "أخف من الثنتين" · "بلا طبخ ولا فلوس" · "تجرب بلا ما تخاطر". Not a sentence.`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    suggestions: {
      type: Type.ARRAY,
      description: `Zero to ${SUGGESTION_COUNT} options they did not think of.`,
      items: {
        type: Type.OBJECT,
        properties: {
          label: {
            type: Type.STRING,
            description: "Two to four Arabic words, concrete and pickable.",
          },
          note: {
            type: Type.STRING,
            description: "Two or three Arabic words saying why it helps.",
          },
        },
        required: ["label", "note"],
        propertyOrdering: ["label", "note"],
      },
    },
  },
  required: ["suggestions"],
  propertyOrdering: ["suggestions"],
};

// ---------- كاش ----------
// يُنادى أثناء الكتابة، فالتكرار وارد جداً: نفس الزوج من نفس الشخص
// وهو يعدّل خياراً ثالثاً. الرقم يرتفع مع أي تغيير في البرومبت.
const VERSION = "v3-register";
const TTL_MS = 12 * 60 * 60 * 1000;
const MAX_ENTRIES = 500;
const store = new Map();

const cacheKey = (options) =>
  [VERSION, ...options.map(normalizeArabic).sort()].join("|");

function readCache(key) {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    store.delete(key);
    return null;
  }
  return hit.value;
}

function writeCache(key, value) {
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  store.set(key, { at: Date.now(), value });
}

// ---------- حد بسيط للمعدل ----------
// هذا المسار الوحيد اللي ينضرب أثناء الكتابة لا بضغطة، فبدون حد
// واحد يفتح الصفحة ويكتب بسرعة يصرف نداءات أكثر من أي شاشة ثانية.
// ذاكرة العملية تكفي هنا: التجاوز يرجّع قائمة فاضية لا خطأ، وأسوأ
// حالة إن الاقتراح ما يظهر.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20;
const hits = new Map();

function allowed(ip) {
  const now = Date.now();
  const seen = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  seen.push(now);
  hits.set(ip, seen);

  // كنس كسول حتى ما تكبر الخريطة بلا حد
  if (hits.size > 1000) {
    for (const [key, times] of hits) {
      if (!times.some((t) => now - t < RATE_WINDOW_MS)) hits.delete(key);
    }
  }
  return seen.length <= RATE_MAX;
}

const fail = (status, message) =>
  Response.json({ ok: false, error: message }, { status });

function validate(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  if (!Array.isArray(body.options)) return null;

  const options = body.options
    .filter((o) => typeof o === "string")
    .map((o) => o.trim())
    .filter(Boolean);

  if (options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) return null;
  if (options.some((o) => o.length > MAX_LABEL_LENGTH)) return null;
  if (new Set(options.map(normalizeArabic)).size !== options.length) return null;

  return options;
}

const words = (text) => new Set(text.split(" ").filter(Boolean));

/**
 * هل أحدهما إعادة صياغة للآخر؟ المقارنة بالكلمات لا بالحروف.
 *
 * الاحتواء النصي الخام يقع في فخ: خيار "بر" يبلع اقتراح "برجر" لأن
 * الأولى داخل الثانية حرفياً، وهما شيئان لا علاقة بينهما. الكلمات
 * تمسك "شاورما" تحت "شاورما دجاج" — وهذا المقصود — بلا هذا الضرر.
 */
function isRestatement(a, b) {
  const first = words(a);
  const second = words(b);
  const [small, big] =
    first.size <= second.size ? [first, second] : [second, first];
  return small.size > 0 && [...small].every((w) => big.has(w));
}

/**
 * يرفض ما يعيد تسمية خيار موجود. الاقتراح الوحيد اللي ينفع هو
 * الجديد فعلاً — و"شاورما" فوق "شاورما دجاج" حشو يضحك على المستخدم.
 */
function shape(raw, options) {
  const taken = new Set(options.map(normalizeArabic));
  const out = [];

  for (const item of Array.isArray(raw?.suggestions) ? raw.suggestions : []) {
    const label = typeof item?.label === "string" ? item.label.trim() : "";
    if (!label || label.length > MAX_SUGGESTION_LENGTH) continue;

    const key = normalizeArabic(label);
    if (!key || taken.has(key)) continue;

    if ([...taken].some((t) => isRestatement(t, key))) continue;

    taken.add(key);
    out.push({
      label,
      note: (typeof item?.note === "string" ? item.note.trim() : "").slice(0, 30),
    });
    if (out.length === SUGGESTION_COUNT) break;
  }
  return out;
}

// ---------------------------------------------------------------
// POST /api/third
//
// تحسين لا ركن: أي فشل يرجّع قائمة فاضية بحالة 200، فالواجهة ما
// تعرض شيئاً وتكمل. ما فيه رسالة خطأ لأن المستخدم ما طلب شيئاً.
// ---------------------------------------------------------------

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return fail(400, "الطلب لازم يكون JSON صالح.");
  }

  const options = validate(body);
  if (!options) return fail(400, "خيارات غير صالحة.");

  // ما فيه مكان لخيار إضافي أصلاً
  if (options.length >= MAX_OPTIONS) {
    return Response.json({ ok: true, suggestions: [] });
  }

  const key = cacheKey(options);
  const cached = readCache(key);
  if (cached) {
    return Response.json({ ok: true, suggestions: cached, source: "cache" });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!allowed(ip)) {
    console.warn("[api/third] rate limited:", ip);
    return Response.json({ ok: true, suggestions: [], source: "throttled" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return Response.json({ ok: true, suggestions: [] });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: MODEL,
      contents:
        "الخيارات التي كتبها:\n" +
        options.map((o, i) => `${i + 1}. ${o}`).join("\n") +
        "\n\nما الخيار الذي لم يخطر له؟ أعِد كائن JSON فقط.",
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.9,
        abortSignal: controller.signal,
      },
    });

    const suggestions = shape(JSON.parse(response.text ?? "{}"), options);
    writeCache(key, suggestions);
    return Response.json({ ok: true, suggestions, source: "generated" });
  } catch (err) {
    // ما نزعج المستخدم بخطأ على شي ما طلبه
    console.error("[api/third] failed:", err);
    return Response.json({ ok: true, suggestions: [] });
  } finally {
    clearTimeout(timer);
  }
}
