import { GoogleGenAI, Type } from "@google/genai";
import { supabaseAdmin } from "@/lib/supabase-server";
import { normalizeArabic } from "@/lib/voice/match";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "gemini-3.6-flash";
const TIMEOUT_MS = 20000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// share_code من gen_random_bytes(6) → ١٢ خانة hex
const CODE = /^[0-9a-f]{12}$/;
const MAX_NAMES_IN_PROMPT = 20;

// معلّق النتيجة — نفس شخصية "احسم" في /api/decide: صديق ظريف لا
// مذيع رسمي. القيمة هنا إعلان يُقرأ بصوت عالٍ في القروب.
//
// التعادل هو المهمة الحقيقية: الأغلبية تعلن نفسها، أما التعادل
// فيرجع الحيرة للمجموعة كاملة — وهنا جيميناي يحسم ويتحمل اللوم
// بدل ما يتحمله أحد من الربع.
const SYSTEM_INSTRUCTION = `You announce the result of a group vote among friends, in the voice of Ahsem: a smart, slightly sarcastic, fun Saudi friend. Your announcement will be read aloud in the group chat.

You get: the question, each option with its vote count and voter names, and either the winner (announce it) or a tie (YOU break it — pick one and own the blame, that is your job so no friend has to take it).

HARD RULES:
1. "winner" is copied VERBATIM from the options. If a winner is given, echo it exactly. If it is a tie, choose from the TIED options only.
2. Two to three sentences. Mention the actual numbers once, and one or two voters by name — playfully, never meanly. Losing voters get sympathy, not mockery.
3. If you broke a tie, say clearly it was your call: "محد قدر يحسم، فحسمتها أنا".
4. Spoken Saudi Arabic only. No English, no emoji, no lists.`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    winner: {
      type: Type.STRING,
      description: "The winning option, verbatim from the list.",
    },
    announcement: {
      type: Type.STRING,
      description: "Two or three sentences of spoken Saudi Arabic.",
    },
  },
  required: ["winner", "announcement"],
  propertyOrdering: ["winner", "announcement"],
};

// كاش الإعلان: المقفل ما يتغير، وكل مشارك في القروب بيفتح الرابط —
// بلا كاش كل فتحة تولّد إعلاناً جديداً بصياغة مختلفة ونداءً مدفوعاً.
// خارج الطلب حتى يعيش بين الطلبات في نفس العملية.
const TTL_MS = 24 * 60 * 60 * 1000;
const verdicts = new Map();

function readVerdict(id) {
  const hit = verdicts.get(id);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    verdicts.delete(id);
    return null;
  }
  return hit.value;
}

function writeVerdict(id, value) {
  if (verdicts.size >= 500) {
    const oldest = verdicts.keys().next().value;
    if (oldest !== undefined) verdicts.delete(oldest);
  }
  verdicts.set(id, { at: Date.now(), value });
}

const RATE_WINDOW_MS = 60_000;
const hits = new Map();

function allowed(ip, max) {
  const now = Date.now();
  const seen = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  seen.push(now);
  hits.set(ip, seen);
  if (hits.size > 1000) {
    for (const [key, times] of hits) {
      if (!times.some((t) => now - t < RATE_WINDOW_MS)) hits.delete(key);
    }
  }
  return seen.length <= max;
}

const fail = (status, message) =>
  Response.json({ ok: false, error: message }, { status });

const clientIp = (request) =>
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";

// ---------- الفرز ----------

function tally(options, votes) {
  const counts = new Map(options.map((o) => [o.id, 0]));
  const names = new Map(options.map((o) => [o.id, []]));
  for (const v of votes) {
    if (!counts.has(v.option_id)) continue;
    counts.set(v.option_id, counts.get(v.option_id) + 1);
    names.get(v.option_id).push(v.voter_name);
  }

  const rows = options
    .map((o) => ({ ...o, count: counts.get(o.id), names: names.get(o.id) }))
    .sort((a, b) => b.count - a.count);

  const top = rows[0]?.count ?? 0;
  const leaders = rows.filter((r) => r.count === top);
  return { rows, tie: leaders.length > 1, leaders };
}

async function announce({ title, rows, tie, leaders, forcedWinner }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const err = new Error("GEMINI_API_KEY is not set");
    err.code = "NO_API_KEY";
    throw err;
  }

  const described = rows
    .map((r) => {
      const shown = r.names.slice(0, MAX_NAMES_IN_PROMPT);
      const list = shown.length ? ` (${shown.join("، ")})` : "";
      return `- ${r.label}: ${r.count} صوت${list}`;
    })
    .join("\n");

  const instruction = forcedWinner
    ? `الفائز بالأغلبية: "${forcedWinner.label}" — أعلنه.`
    : `تعادل بين: ${leaders.map((l) => `"${l.label}"`).join(" و ")} — اكسر التعادل بنفسك.`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [
        `السؤال: ${title}`,
        "",
        "الأصوات:",
        described,
        "",
        instruction,
        "أرجع كائن JSON فقط.",
      ].join("\n"),
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.8,
        abortSignal: controller.signal,
      },
    });

    const parsed = JSON.parse(response.text ?? "{}");
    const announcement =
      typeof parsed.announcement === "string" ? parsed.announcement.trim().slice(0, 500) : "";

    // الفائز المسموح: المفروض بالأغلبية، أو أحد المتعادلين فقط —
    // النموذج ما يملك ترقية خاسر
    const pool = forcedWinner ? [forcedWinner] : leaders;
    const winner =
      pool.find(
        (p) => normalizeArabic(p.label) === normalizeArabic(parsed.winner ?? ""),
      ) ?? pool[0];

    if (!announcement) {
      const err = new Error("empty announcement");
      err.code = "EMPTY";
      throw err;
    }
    return { winner, announcement };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchGroupDecision(admin, filters) {
  let query = admin
    .from("decisions")
    .select(
      "id, user_id, title, status, mode, winner_option_id, options!options_decision_id_fkey(id, label), votes(option_id, voter_name)",
    )
    .eq("mode", "group");
  for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
  const { data, error } = await query.single();
  if (error || !data) return null;
  return data;
}

// ---------------------------------------------------------------
// GET /api/group?code=… — إعلان النتيجة لأي زائر بعد الإقفال.
// يتولد مرة ويُخدم من الكاش — المنشئ أقفل، والبقية يفتحون الرابط.
// ---------------------------------------------------------------

export async function GET(request) {
  const code = new URL(request.url).searchParams.get("code") ?? "";
  if (!CODE.test(code)) return fail(400, "كود غير صالح.");

  if (!allowed(clientIp(request), 20)) return fail(429, "محاولات كثيرة — انتظر شوي.");

  const admin = supabaseAdmin();
  const decision = await fetchGroupDecision(admin, { share_code: code });
  if (!decision) return fail(404, "ما لقينا هذا القرار.");

  if (decision.status !== "closed") {
    return Response.json({ ok: true, closed: false });
  }

  const cached = readVerdict(decision.id);
  if (cached) return Response.json({ ok: true, closed: true, ...cached });

  const { rows } = tally(decision.options, decision.votes);
  // الفائز محسوم ومخزن وقت الإقفال — الإعلان وحده يُعاد توليده،
  // فما فيه احتمال يتبدل الفائز بين زائر وزائر
  const stored = rows.find((r) => r.id === decision.winner_option_id) ?? rows[0];

  try {
    const { announcement } = await announce({
      title: decision.title,
      rows,
      tie: false,
      leaders: [stored],
      forcedWinner: stored,
    });
    const value = { winner: stored.label, announcement };
    writeVerdict(decision.id, value);
    return Response.json({ ok: true, closed: true, ...value });
  } catch (err) {
    console.error("[api/group] verdict failed:", err);
    // الإعلان تحسين — الفائز نفسه معروف، فنرجعه بلا زينة بدل خطأ
    return Response.json({
      ok: true,
      closed: true,
      winner: stored.label,
      announcement: "",
    });
  }
}

// ---------------------------------------------------------------
// POST /api/group — إقفال التصويت. للمنشئ فقط، بتوكنه.
// يفرز، يكسر التعادل بجيميناي إن وقع، يخزن الفائز، يرجع الإعلان.
// ---------------------------------------------------------------

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return fail(400, "ما قدرنا نقرأ الطلب.");
  }

  const decisionId = typeof body?.decisionId === "string" ? body.decisionId : "";
  if (!UUID.test(decisionId)) return fail(400, "معرّف غير صالح.");

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
  if (!token) return fail(401, "إقفال التصويت للمنشئ فقط — سجّل دخولك.");

  if (!allowed(clientIp(request), 5)) return fail(429, "محاولات كثيرة — انتظر دقيقة.");

  const admin = supabaseAdmin();
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth?.user) return fail(401, "توكن الدخول غير صالح.");

  const decision = await fetchGroupDecision(admin, { id: decisionId });
  if (!decision) return fail(404, "ما لقينا هذا القرار.");
  if (decision.user_id !== auth.user.id) {
    return fail(403, "بس اللي أنشأ القرار يقفله.");
  }
  if (decision.status === "closed") return fail(409, "مقفل من قبل.");

  const { rows, tie, leaders } = tally(decision.options, decision.votes);
  if (!decision.votes.length) {
    return fail(422, "ما فيه أصوات بعد — خل أحد يصوت أول.");
  }

  let result;
  try {
    result = await announce({
      title: decision.title,
      rows,
      tie,
      leaders,
      forcedWinner: tie ? null : leaders[0],
    });
  } catch (err) {
    console.error("[api/group] close failed:", err);
    if (err.code === "NO_API_KEY") return fail(503, "المعلّق غير مهيأ.");
    if (err.name === "AbortError") return fail(504, "المعلّق تأخر — جرب مرة ثانية.");
    if (err.status === 503) return fail(503, "المعلّق مزدحم — انتظر شوي وجرب.");
    return fail(502, "ما قدرنا نجهز الإعلان — جرب مرة ثانية.");
  }

  // الإقفال بعد نجاح الإعلان: لو انعكس الترتيب صار عندنا قرار مقفل
  // بلا إعلان لكل زائر لين ينجح GET — الفشل قبل الكتابة أنظف
  const { error: updateError } = await admin
    .from("decisions")
    .update({ status: "closed", winner_option_id: result.winner.id })
    .eq("id", decisionId)
    .eq("status", "open");

  if (updateError) {
    console.error("[api/group] update failed:", updateError);
    return fail(502, "ما قدرنا نقفل التصويت — جرب مرة ثانية.");
  }

  // قيدٌ في سجل الفائزين، بعد الإقفال لا قبله: التصويت أُقفل فعلاً
  // وصفحة التصويت تقرأ العمود، فلا يستاهل فشلُ السجل أن يرجّع خطأ
  // على إقفالٍ نجح
  const { error: logError } = await admin.from("decision_winners").insert({
    decision_id: decisionId,
    option_id: result.winner.id,
    option_label: result.winner.label,
    source: "vote",
    reason: result.announcement,
  });
  if (logError) console.warn("[api/group] winner log failed:", logError.message);

  const value = { winner: result.winner.label, announcement: result.announcement };
  writeVerdict(decisionId, value);
  return Response.json({ ok: true, closed: true, ...value });
}
