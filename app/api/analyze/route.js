import { GoogleGenAI } from "@google/genai";
import { PIPELINE, RESEARCH, SWOT, SCENARIOS, CRITIC, SYNTHESIS } from "@/lib/analyze/agents";
import { rankPaths } from "@/lib/analyze/risk";
import { supabaseAdmin } from "@/lib/supabase-server";
import { clientIp, createLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// كل طلب هنا خط أنابيب من عدة نداءات لا نداءً واحداً، فالسقف منخفض
const allowed = createLimiter({ max: 8 });

const MODEL = "gemini-3.6-flash";

// المهل لكل وكيل حسب ثقله الفعلي، مو رقم واحد للجميع.
//
// الباحث بطيء لأنه يطلع للشبكة. والمراجع النقدي أبطأ منه لسبب
// مختلف: برومبته أكبر واحد (نص الباحث + SWOT + المسارات) ومهمته
// أثقل استدلالاً — "هاجم كل شي" تستنزف أقصى تفكير من النموذج.
// كان على ٣٠ ثانية مثل الوكلاء الخفاف، فكان يتجاوزها غالباً
// ويسقط الخط كله معه.
const TIMEOUT_MS = {
  research: 45000,
  critic: 75000,
  synthesis: 45000,
  default: 30000,
};

// gemini-2.5-flash يفكّر افتراضياً بميزانية تلقائية، وتوكنات
// التفكير تُحسب من ميزانية المخرجات. مهمة عدائية بلا سقف تفكير
// تطوّل بلا حد وتصطدم بالمهلة. السقف يخلي الزمن متوقعاً.
const THINKING_BUDGET = { critic: 2048, synthesis: 2048, default: 1024 };

// محاولة إضافية للأخطاء العابرة (مهلة، رد فاضي، JSON مقطوع).
// الفشل هنا عابر بطبيعته، وإعادة المحاولة أرخص بكثير من إسقاط
// خط كامل استغرق دقيقة.
const RETRIES = 2;

const MAX_STATEMENT = 600;
const MAX_CONTEXT = 2000;

// ---------------------------------------------------------------
// بروتوكول البث — NDJSON: سطر JSON واحد لكل حدث.
//
// اخترناه على SSE لأن العميل هنا كود نكتبه نحن، مو EventSource،
// فما نحتاج طبقة الأحداث المسمّاة. والقراءة سطراً سطراً كافية.
// خط الوكلاء يأخذ دقيقة تقريباً، والمستخدم لازم يشوف التقدم
// بدل شاشة معلّقة.
// ---------------------------------------------------------------

function ndjson(controller, encoder, event) {
  controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
}

function validate(body) {
  const statement =
    typeof body?.statement === "string" ? body.statement.trim() : "";

  if (!statement) return { ok: false, message: "اكتب القرار اللي تبي تحلله." };
  if (statement.length > MAX_STATEMENT)
    return { ok: false, message: "وصف القرار طويل — اختصره شوي." };

  const context =
    typeof body?.context === "string"
      ? body.context.trim().slice(0, MAX_CONTEXT)
      : "";

  return { ok: true, value: { statement, context } };
}

async function resolveUserId(request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
  if (!token) return null;

  try {
    const { data, error } = await supabaseAdmin().auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user.id;
  } catch (err) {
    console.error("[api/analyze] token check failed:", err);
    return null;
  }
}

// ---------------------------------------------------------------
// نداء وكيل واحد
// ---------------------------------------------------------------

async function runAgent(ai, agent, prompt) {
  const controller = new AbortController();
  const ms = TIMEOUT_MS[agent.id] ?? TIMEOUT_MS.default;
  const timeout = setTimeout(() => controller.abort(), ms);

  try {
    const config = {
      systemInstruction: agent.instruction,
      abortSignal: controller.signal,
      // الباحث يحتاج حرية أوسع في الصياغة؛ البقية نبيهم منضبطين
      temperature: agent.grounded ? 0.3 : 0.5,
      thinkingConfig: {
        thinkingBudget: THINKING_BUDGET[agent.id] ?? THINKING_BUDGET.default,
      },
    };

    if (agent.grounded) {
      // البحث والمخطط المنظّم ما يجتمعان في نداء واحد
      config.tools = [{ googleSearch: {} }];
    } else {
      config.responseMimeType = "application/json";
      config.responseSchema = agent.schema;
    }

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config,
    });

    const text = response?.text?.trim();
    if (!text) {
      // سبب الإنهاء يفرّق بين "انقطع عند الحد" و"حُجب" و"خطأ" —
      // بدونه كل الحالات تطلع "empty response" وما تنشخّص.
      const reason = response?.candidates?.[0]?.finishReason ?? "UNKNOWN";
      throw new Error(`${agent.id}: empty response (finishReason=${reason})`);
    }

    if (agent.grounded) {
      // المصادر تجي من grounding metadata، مو من نص النموذج —
      // النموذج ممكن يخترع رابطاً، الميتاداتا لأ.
      const chunks =
        response?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];

      const seen = new Set();
      const sources = [];
      for (const c of chunks) {
        const uri = c?.web?.uri;
        if (!uri || seen.has(uri)) continue;
        seen.add(uri);
        sources.push({ uri, title: c.web.title ?? uri });
      }

      return { text, sources };
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`${agent.id}: non-JSON response`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------
// بناء برومبت كل مرحلة من مخرجات ما قبلها
// ---------------------------------------------------------------

const section = (title, body) => `\n\n## ${title}\n${body}`;

// مخرجات المراحل تُمرَّر كنص مضغوط لا JSON.stringify.
//
// الـ JSON الخام كان يضاعف حجم البرومبت بأقواس ومفاتيح وحقول
// enum ما يحتاجها النموذج ليقرأ، وأثقل من يدفع الثمن هو المراجع
// النقدي لأنه يستقبل كل شي قبله. تقليص المدخل يقصّر زمن الرد،
// وزمن الرد هو اللي كان يصطدم بالمهلة.

function renderSwot(swot) {
  if (!swot) return "لا شيء";
  const titles = {
    strengths: "قوة",
    weaknesses: "ضعف",
    opportunities: "فرص",
    threats: "تهديدات",
  };

  return Object.entries(titles)
    .map(([key, title]) => {
      const points = (swot[key] ?? [])
        .map((p) => `  - ${p.point} (دليل: ${p.evidence}، ثقة: ${p.confidence})`)
        .join("\n");
      return `${title}:\n${points || "  - لا شيء"}`;
    })
    .join("\n");
}

function renderPaths(paths) {
  if (!paths?.length) return "لا شيء";

  return paths
    .map((p) => {
      const branches = (p.branches ?? [])
        .map((b) => `    · ${b.condition} ← ${b.outcome}`)
        .join("\n");
      const assumptions = (p.assumptions ?? []).join("؛ ") || "لا شيء";

      return [
        `- ${p.label}: ${p.summary}`,
        `  ضرر: احتمال ${p.downside_likelihood}/أثر ${p.downside_impact} · مكسب: احتمال ${p.upside_likelihood}/أثر ${p.upside_impact} · تراجع: ${p.reversibility}`,
        `  افتراضات: ${assumptions}`,
        branches,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");
}

function renderChallenges(challenges) {
  if (!challenges) return "لا شيء — مرحلة المراجعة النقدية ما اكتملت.";

  const items = (challenges.challenges ?? [])
    .map((c) => `- [${c.severity}] ${c.target} — ${c.why_fragile}`)
    .join("\n");
  const missing = (challenges.missing_data ?? []).join("؛ ");

  return [items || "لا اعتراضات.", missing ? `بيانات ناقصة: ${missing}` : ""]
    .filter(Boolean)
    .join("\n");
}

function promptFor(agent, state) {
  const head = [
    `القرار المطروح: ${state.statement}`,
    state.context ? `سياق إضافي من المستخدم: ${state.context}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  if (agent.id === RESEARCH.id) return head;

  let prompt = head + section("حقائق جمعها الباحث", state.findings ?? "لا شيء");

  if (agent.id === SWOT.id) return prompt;

  prompt += section("تحليل SWOT", renderSwot(state.swot));

  if (agent.id === SCENARIOS.id) return prompt;

  prompt += section("المسارات المطروحة", renderPaths(state.paths));

  if (agent.id === CRITIC.id) return prompt;

  prompt += section("اعتراضات المراجع النقدي", renderChallenges(state.challenges));

  // لو سقطت المراجعة، المُركِّب لازم يعرف — وإلا كتب توصية واثقة
  // على تحليل ما فحصه أحد، وهذا أسوأ من عدم إعطاء توصية أصلاً.
  if (state.criticSkipped) {
    prompt += section(
      "تنبيه",
      "مرحلة المراجعة النقدية فشلت ولم تُنفَّذ. لم يفحص أحد هذا التحليل بحثاً عن " +
        "الثغرات. اضبط confidence على low، واذكر في confidence_note صراحةً أن " +
        "التحليل لم يخضع للمراجعة النقدية، وشدّد على would_change_my_mind.",
    );
  }

  // المُركِّب يشوف الدرجات المحسوبة، مو المستويات الخام فقط
  prompt += section(
    "درجات المخاطرة المحسوبة (من الكود، لا تعدّلها)",
    (state.ranked ?? [])
      .map(
        (p) =>
          `- ${p.label}: مخاطرة ${p.risk}٪ · جاذبية ${p.upside}٪ · ${p.quadrant.label}`,
      )
      .join("\n") || "لا شيء",
  );

  return prompt;
}

// إعادة المحاولة مع تراجع بسيط. الفشل هنا عابر تقريباً دائماً:
// مهلة، رد فاضي، أو JSON مقطوع. المحاولة الثانية تنجح غالباً.
async function runAgentWithRetry(ai, agent, prompt) {
  let last;

  for (let attempt = 1; attempt <= RETRIES + 1; attempt++) {
    try {
      return await runAgent(ai, agent, prompt);
    } catch (err) {
      last = err;
      console.warn(
        `[api/analyze] ${agent.id} attempt ${attempt}/${RETRIES + 1} failed:`,
        err.name === "AbortError" ? "timeout" : err.message,
      );
      if (attempt <= RETRIES) {
        await new Promise((r) => setTimeout(r, 400 * attempt));
      }
    }
  }

  throw last;
}

function absorb(agent, output, state) {
  if (agent.id === RESEARCH.id) {
    state.findings = output.text;
    state.sources = output.sources;
    return { sourceCount: output.sources.length };
  }
  if (agent.id === SWOT.id) {
    state.swot = output;
    return output;
  }
  if (agent.id === SCENARIOS.id) {
    state.paths = output.paths ?? [];
    // الأرقام تتحسب هنا في الكود — انظر lib/analyze/risk.js
    state.ranked = rankPaths(state.paths);
    return { paths: state.ranked };
  }
  if (agent.id === CRITIC.id) {
    state.challenges = output;
    return output;
  }
  state.recommendation = output;
  return output;
}

// ---------------------------------------------------------------
// POST /api/analyze  →  تدفق NDJSON
// ---------------------------------------------------------------

export async function POST(request) {
  if (!allowed(clientIp(request))) {
    return Response.json(
      { ok: false, error: "محاولات كثيرة — انتظر دقيقة." },
      { status: 429 },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: "الطلب لازم يكون JSON صالح." },
      { status: 400 },
    );
  }

  const parsed = validate(body);
  if (!parsed.ok)
    return Response.json({ ok: false, error: parsed.message }, { status: 400 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey)
    return Response.json(
      { ok: false, error: "محرك التحليل غير مهيأ — GEMINI_API_KEY مفقود." },
      { status: 503 },
    );

  const userId = await resolveUserId(request);
  const state = { ...parsed.value };
  const ai = new GoogleGenAI({ apiKey });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for (const agent of PIPELINE) {
          ndjson(controller, encoder, {
            type: "agent_start",
            agent: agent.id,
            label: agent.label,
            en: agent.en,
            note: agent.note,
          });

          let output;
          try {
            output = await runAgentWithRetry(ai, agent, promptFor(agent, state));
          } catch (err) {
            console.error(`[api/analyze] ${agent.id} failed after retries:`, err);

            // المراجع النقدي وحده اختياري: لو سقط بعد كل المحاولات
            // نكمل بدونه بدل ما نرمي دقيقة من شغل الوكلاء الثلاثة
            // قبله. لكن ما نخفيه — المُركِّب يُبلَّغ أنه ما راجع أحد
            // تحليله، والواجهة تعرض ذلك بوضوح للمستخدم.
            if (agent.id === CRITIC.id) {
              state.criticSkipped = true;
              ndjson(controller, encoder, {
                type: "agent_skipped",
                agent: agent.id,
                message:
                  "المراجعة النقدية ما اكتملت — التحليل أدناه ما راجعه أحد.",
              });
              continue;
            }

            ndjson(controller, encoder, {
              type: "fatal",
              agent: agent.id,
              message:
                err.name === "AbortError"
                  ? `${agent.label} تأخر بالرد. جرب مرة ثانية.`
                  : `${agent.label} تعثّر. جرب مرة ثانية.`,
            });
            return; // الإغلاق في finally — استدعاؤه هنا كمان يرمي
          }

          ndjson(controller, encoder, {
            type: "agent_done",
            agent: agent.id,
            data: absorb(agent, output, state),
          });
        }

        const result = {
          statement: state.statement,
          context: state.context,
          findings: state.findings,
          sources: state.sources ?? [],
          swot: state.swot,
          paths: state.ranked ?? [],
          challenges: state.challenges ?? null,
          criticSkipped: Boolean(state.criticSkipped),
          recommendation: state.recommendation,
          model: MODEL,
        };

        // الحفظ إضافة مو شرط — تحليل غير محفوظ أفضل من تحليل ضائع
        let saved = null;
        let saveError = null;

        if (userId) {
          const { data, error } = await supabaseAdmin()
            .from("analyses")
            .insert({
              user_id: userId,
              statement: state.statement,
              context: state.context || null,
              findings: state.findings,
              sources: state.sources ?? [],
              swot: state.swot,
              paths: state.ranked ?? [],
              challenges: state.challenges,
              recommendation: state.recommendation,
              model: MODEL,
            })
            .select("id")
            .single();

          if (error) {
            console.error("[api/analyze] save failed:", error);
            saveError = "التحليل جاهز لكن ما انحفظ في سجلك.";
          } else {
            saved = data.id;
          }
        }

        ndjson(controller, encoder, {
          type: "done",
          result,
          analysisId: saved,
          saveError,
          savedHint: userId ? null : "سجّل دخولك عشان نحفظ تحليلاتك.",
        });
      } catch (err) {
        console.error("[api/analyze] stream failed:", err);
        ndjson(controller, encoder, {
          type: "fatal",
          message: "صار خطأ غير متوقع أثناء التحليل.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      // بدونه بعض الوسطاء يجمّعون الرد ويضيع الغرض من البث
      "X-Accel-Buffering": "no",
    },
  });
}
