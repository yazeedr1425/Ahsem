import { GoogleGenAI } from "@google/genai";
import { getCategory } from "@/lib/engine/categories";
import { RESPONSE_SCHEMA, SYSTEM_INSTRUCTION, shape } from "@/lib/insight/prompt";
import { describe, summarize } from "@/lib/insight/stats";
import { toArabicDigits } from "@/lib/text/digits";
import { clientIp, createLimiter } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// القراءة بضغطة زر لا بكل رندر، فستة في الدقيقة أكثر من كافية —
// والحدّ قبل التحقق من الهوية حتى لا يصير التحقق نفسه هدفاً للإغراق
const allowed = createLimiter({ max: 6 });

const MODEL = "gemini-3.6-flash";
const TIMEOUT_MS = 20000;

// نقرأ أكثر مما نحتاج للعرض: النمط يبان من العدد، وسطرين ما يكفيان
const HISTORY_LIMIT = 60;

// أقل من هذا ما فيه نمط — فيه صدفة. نقول للمستخدم كم باقي بدل ما
// نعطيه قراءة مبنية على ثلاثة قرارات ونسميها "شخصيتك".
const MIN_RATED = 5;

// أسماء مناطق IANA فقط. نتحقق قبل ما نمرّرها لـ Intl لأن قيمة
// مصنوعة تدخل formatToParts وترمي، وتسقط الإحصاء كله بلا سبب واضح.
const TIMEZONE = /^[A-Za-z][A-Za-z0-9+_-]*(\/[A-Za-z0-9+_-]+){0,2}$/;

const fail = (status, message) =>
  Response.json({ ok: false, error: message }, { status });

const firstOf = (value) => (Array.isArray(value) ? (value[0] ?? null) : value);

async function fetchHistory(userId) {
  const { data, error } = await supabaseAdmin()
    .from("decisions")
    // نفس سبب /api/decide: علاقتان بين decisions و options، وبدون
    // تسمية الـ FK يرجع PGRST201
    .select(
      "id, title, category, created_at, winner_option_id, options!options_decision_id_fkey(id, label), feedback(satisfaction)",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  if (error) throw new Error(error.message);

  return (data ?? []).map((d) => {
    const all = d.options ?? [];
    const chosen = all.find((o) => o.id === d.winner_option_id) ?? null;
    return {
      // القيمة في القاعدة إنجليزية ('food')، والقراءة كلها عربية.
      // لو مرّرناها كما هي دخل البرومبت سطر إنجليزي وسط نص عربي
      // واضطر النموذج يترجمه بنفسه.
      category: getCategory(d.category)?.label ?? d.category,
      decidedAt: d.created_at,
      chosen: chosen?.label ?? null,
      rejected: all
        .filter((o) => o.id !== d.winner_option_id)
        .map((o) => o.label),
      satisfaction: firstOf(d.feedback)?.satisfaction ?? null,
    };
  });
}

// ---------------------------------------------------------------
// GET /api/patterns
//
// قراءة فقط، وتحتاج توكن: القراءة عن شخص بعينه، فما فيها مسار ضيف.
// ---------------------------------------------------------------

export async function GET(request) {
  if (!allowed(clientIp(request))) return fail(429, "محاولات كثيرة — انتظر دقيقة.");

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
  if (!token) return fail(401, "قراءة أنماطك تحتاج تسجيل دخول.");

  let userId;
  try {
    const { data, error } = await supabaseAdmin().auth.getUser(token);
    if (error || !data?.user) return fail(401, "توكن الدخول غير صالح.");
    userId = data.user.id;
  } catch (err) {
    console.error("[api/patterns] identity check failed:", err);
    return fail(500, "تعذر التحقق من الهوية.");
  }

  const requested = new URL(request.url).searchParams.get("tz");
  const timeZone = requested && TIMEZONE.test(requested) ? requested : undefined;

  let history;
  try {
    history = await fetchHistory(userId);
  } catch (err) {
    console.error("[api/patterns] history fetch failed:", err);
    return fail(502, "تعذر جلب سجلك.");
  }

  const stats = summarize(history, { timeZone });

  // ما نصرف نداءً على عيّنة ما تكفي — ونقول بصراحة كم باقي
  if (stats.rated < MIN_RATED) {
    return Response.json({
      ok: true,
      ready: false,
      rated: stats.rated,
      need: MIN_RATED - stats.rated,
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fail(503, "محرك القراءة غير مهيأ.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: MODEL,
      // الإحصاء يدخل بأرقام هندية: النموذج ينسخ الأرقام كما يراها،
      // فإعطاؤه الشكل المطلوب أوثق من مطالبته بتحويله
      contents:
        "إحصاء سجل هذا الشخص:\n\n" +
        toArabicDigits(describe(stats)) +
        "\n\nاقرأ شخصيته القرارية من هذي الأرقام. أرجع كائن JSON فقط.",
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.7,
        abortSignal: controller.signal,
      },
    });

    const reading = shape(JSON.parse(response.text ?? "{}"));
    if (!reading) return fail(502, "تعذّرت قراءة أنماطك حاليًا. أعد المحاولة.");

    return Response.json({ ok: true, ready: true, reading, stats });
  } catch (err) {
    console.error("[api/patterns] failed:", err);
    if (err.name === "AbortError") return fail(504, "تأخّرت القراءة. أعد المحاولة.");
    if (err.status === 503) {
      return fail(503, "المحرك مزدحم حاليًا. أمهله قليلًا ثم أعد المحاولة.");
    }
    return fail(502, "تعذّرت قراءة أنماطك حاليًا. أعد المحاولة.");
  } finally {
    clearTimeout(timer);
  }
}
