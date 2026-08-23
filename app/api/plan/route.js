import { GoogleGenAI, Type } from "@google/genai";
import { fetchCandidates, resolveLocation } from "@/lib/places/client";
import { prepareCandidates } from "@/lib/places/trim";
import { travelLegs } from "@/lib/routing/travel";
import { fetchWeather } from "@/lib/weather/client";
import { buildUserPrompt, SYSTEM_PROMPT } from "@/lib/plan/prompt";
import { parsePlan } from "@/lib/plan/parse";
import {
  budget,
  DEFAULT_RADIUS_KM,
  group,
  MAX_CANDIDATES,
  MAX_DURATION_HOURS,
  MAX_RADIUS_KM,
  MIN_DURATION_HOURS,
  MIN_RADIUS_KM,
  minutesOfDay,
  vibe,
} from "@/lib/plan/config";
import { clientIp, createLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// أغلى مسار في المشروع: نداء جيميناي مع أماكن جوجل والطقس في الطلب
// الواحد، فالسقف هو الأضيق
const allowed = createLimiter({ max: 6 });

// نفس نموذج /api/decide — مزوّد واحد لكل التطبيق
const MODEL = "gemini-3.6-flash";
const GEMINI_TIMEOUT_MS = 30000;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// responseSchema يفرض الشكل على مستوى الـ API، فما نحتاج نتوسّل
// للنموذج يرجّع JSON نظيفاً. لكنه يفرض الشكل فقط — ما يقدر يمنع
// النموذج من اختراع place_id، وهذا يبقى شغل lib/plan/parse.js.
const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: "Short Arabic title for the day, playful and specific.",
    },
    stops: {
      type: Type.ARRAY,
      description: "Between 3 and 5 stops, in visiting order.",
      items: {
        type: Type.OBJECT,
        properties: {
          place_id: {
            type: Type.STRING,
            description: "Must be copied verbatim from the candidates list.",
          },
          name: { type: Type.STRING, description: "The place name." },
          arrival_time: {
            type: Type.STRING,
            description: "24-hour clock, exactly HH:MM.",
          },
          duration_minutes: {
            type: Type.INTEGER,
            description: "How long they stay at this stop.",
          },
          why: {
            type: Type.STRING,
            description:
              "One short Arabic sentence on why this stop suits them.",
          },
        },
        required: ["place_id", "name", "arrival_time", "duration_minutes", "why"],
        propertyOrdering: [
          "place_id",
          "name",
          "arrival_time",
          "duration_minutes",
          "why",
        ],
      },
    },
    note: {
      type: Type.STRING,
      description: "One practical Arabic line: parking, timing, or booking.",
    },
  },
  required: ["title", "stops", "note"],
  propertyOrdering: ["title", "stops", "note"],
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

  const hasCoords =
    Number.isFinite(body.lat) &&
    Number.isFinite(body.lng) &&
    Math.abs(body.lat) <= 90 &&
    Math.abs(body.lng) <= 180;

  const query =
    typeof body.locationQuery === "string" ? body.locationQuery.trim() : "";

  if (!hasCoords && !query) {
    return { ok: false, message: "نحتاج موقعك — فعّل تحديد الموقع أو اكتب المدينة." };
  }
  if (query.length > 120) {
    return { ok: false, message: "اسم المكان طويل — اختصره." };
  }

  const startMinutes = minutesOfDay(body.startTime);
  if (startMinutes === null) {
    return { ok: false, message: "وقت البداية لازم يكون بصيغة HH:MM." };
  }

  const durationHours = Number(body.durationHours);
  if (
    !Number.isFinite(durationHours) ||
    durationHours < MIN_DURATION_HOURS ||
    durationHours > MAX_DURATION_HOURS
  ) {
    return {
      ok: false,
      message: `المدة لازم تكون بين ${MIN_DURATION_HOURS} و${MAX_DURATION_HOURS} ساعات.`,
    };
  }

  if (typeof body.date !== "string" || !DATE.test(body.date)) {
    return { ok: false, message: "التاريخ لازم يكون بصيغة YYYY-MM-DD." };
  }
  // "2026-08-13" ينقرأ كمنتصف ليل UTC، و getUTCDay يعطي اليوم نفسه
  // مهما كانت منطقة الخادم الزمنية — مهم لأن Vercel يشتغل على UTC.
  const parsedDate = new Date(`${body.date}T00:00:00Z`);
  if (Number.isNaN(parsedDate.getTime())) {
    return { ok: false, message: "التاريخ غير صالح." };
  }

  if (!vibe(body.vibe)) return { ok: false, message: "المزاج غير معروف." };
  if (!group(body.group)) return { ok: false, message: "نوع المجموعة غير معروف." };
  if (!budget(body.budget)) return { ok: false, message: "الميزانية غير معروفة." };

  let radiusKm = Number(body.radiusKm ?? DEFAULT_RADIUS_KM);
  if (!Number.isFinite(radiusKm)) radiusKm = DEFAULT_RADIUS_KM;
  radiusKm = Math.min(MAX_RADIUS_KM, Math.max(MIN_RADIUS_KM, Math.round(radiusKm)));

  const exclude = Array.isArray(body.excludePlaceIds)
    ? body.excludePlaceIds.filter((id) => typeof id === "string").slice(0, 20)
    : [];

  return {
    ok: true,
    value: {
      lat: hasCoords ? body.lat : null,
      lng: hasCoords ? body.lng : null,
      locationQuery: query || null,
      startMinutes,
      durationHours,
      date: body.date, // خام كما وصل — Open-Meteo يبيه بصيغة YYYY-MM-DD
      weekday: parsedDate.getUTCDay(), // 0 = الأحد، نفس ترقيم Places
      vibeId: body.vibe,
      groupId: body.group,
      budgetId: body.budget,
      radiusKm,
      exclude,
    },
  };
}

// ---------------------------------------------------------------
// نداء Claude
// ---------------------------------------------------------------

async function askGemini(input) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const err = new Error("GEMINI_API_KEY is not set");
    err.code = "NO_API_KEY";
    throw err;
  }

  let userPrompt = buildUserPrompt(input);
  if (input.exclude.length) {
    userPrompt += `\n\nDo NOT use these place_ids — the user rejected them: ${input.exclude.join(", ")}`;
  }

  const ai = new GoogleGenAI({ apiKey });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  let response;
  try {
    response = await ai.models.generateContent({
      model: MODEL,
      contents: userPrompt,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        // أقل من /api/decide: هناك نبي طرافة، وهنا نبي ترتيباً
        // يحترم الوقت والمسافة. الحرارة العالية تعطي جدولاً مبعثراً.
        temperature: 0.6,
        abortSignal: controller.signal,
      },
    });
  } finally {
    clearTimeout(timeout);
  }

  const raw = response?.text;
  if (!raw) {
    const err = new Error("Gemini returned an empty response");
    err.code = "EMPTY";
    throw err;
  }

  return raw;
}

// ---------------------------------------------------------------
// POST /api/plan
// ---------------------------------------------------------------

export async function POST(request) {
  if (!allowed(clientIp(request))) return fail(429, "محاولات كثيرة — انتظر دقيقة.");

  let body;
  try {
    body = await request.json();
  } catch {
    return fail(400, "تعذّرت قراءة الطلب — يلزم أن يكون JSON صالحًا.");
  }

  const parsed = validate(body);
  if (!parsed.ok) return fail(400, parsed.message);

  const input = parsed.value;

  // ١ — الموقع، ثم المرشّحون من Places
  let origin;
  let candidates;

  try {
    origin = input.lat != null
      ? { lat: input.lat, lng: input.lng, label: input.locationQuery ?? "موقعك الحالي" }
      : await resolveLocation(input.locationQuery);

    if (!origin) {
      return fail(400, `ما لقينا "${input.locationQuery}" — جرب اسماً أوضح.`);
    }

    const raw = await fetchCandidates({
      lat: origin.lat,
      lng: origin.lng,
      radiusKm: input.radiusKm,
      types: vibe(input.vibeId).types,
    });

    // ٢ و٣ — التقليم ثم استبعاد المغلق في نافذة الخروج
    candidates = prepareCandidates(
      raw,
      {
        weekday: input.weekday,
        startMinutes: input.startMinutes,
        durationMinutes: input.durationHours * 60,
      },
      MAX_CANDIDATES,
    ).filter((place) => !input.exclude.includes(place.id));
  } catch (err) {
    console.error(`[api/plan] places failed (${err.code ?? "UNKNOWN"}):`, err);
    if (err.code === "NO_MAPS_KEY") {
      return fail(503, "خدمة الأماكن غير مهيأة — GOOGLE_MAPS_API_KEY مفقود.");
    }
    if (err.name === "AbortError") {
      return fail(504, "تأخّرت خدمة الأماكن عن الرد. أعد المحاولة.");
    }
    // 403 من Places يعني إعداد المفتاح غالباً لا عطلاً: إما قيود
    // التطبيق على "HTTP referrers" (والنداء من الخادم بلا referer)،
    // أو الـ API نفسه غير مفعّل. رسالة عامة هنا تضيّع ساعة تشخيص.
    if (err.status === 403) {
      return fail(
        503,
        "مفتاح الخرائط مرفوض — تأكد أن قيود التطبيق None (لا HTTP referrers) وأن Places API (New) و Routes API مفعّلتان.",
      );
    }
    return fail(502, "تعذّر جلب أماكن قريبة منك حاليًا.");
  }

  if (candidates.length === 0) {
    return Response.json({
      ok: true,
      empty: true,
      message:
        "ما لقينا أماكن مفتوحة في هذا الوقت حولك. جرّب توسّع النطاق، أو غيّر الوقت أو المزاج.",
      origin: { label: origin.label },
      candidateCount: 0,
    });
  }

  // ٤ — الطقس. اختياري تماماً: فشله أو خروج التاريخ عن مدى التوقّع
  // يكمل بخطة عادية بلا وعي بالجو، نفس معاملة travelLegs تحت.
  // fetchWeather يبتلع أخطاءه ويرجّع null، والـ catch هنا للطارئ.
  let weather = null;
  try {
    weather = await fetchWeather({
      lat: origin.lat,
      lng: origin.lng,
      date: input.date,
      startMinutes: input.startMinutes,
      durationMinutes: input.durationHours * 60,
    });
  } catch (err) {
    console.error("[api/plan] weather failed:", err);
  }

  // ٥ — الخطة من النموذج
  let raw;
  try {
    raw = await askGemini({
      ...input,
      candidates,
      locationLabel: origin.label,
      weather,
    });
  } catch (err) {
    console.error(`[api/plan] gemini failed (${err.code ?? "UNKNOWN"}):`, err);

    if (err.code === "NO_API_KEY") {
      return fail(503, "مولّد الخطة غير مهيأ — GEMINI_API_KEY مفقود.");
    }
    if (err.name === "AbortError") {
      return fail(504, "تأخّر مولّد الخطة عن الرد. أعد المحاولة.");
    }
    if (err.status === 429) {
      return fail(502, "الضغط مرتفع على مولّد الخطة. أمهله قليلًا ثم أعد المحاولة.");
    }
    return fail(502, "تعذّر بناء الخطة حاليًا. أعد المحاولة.");
  }

  const result = parsePlan(raw, candidates);
  if (!result.ok) {
    console.error(`[api/plan] parse failed (${result.reason}):`, result.sample);
    return fail(502, "ورد رد غير متوقع من المولّد. أعد المحاولة.");
  }

  const { plan, dropped } = result;

  if (plan.stops.length === 0) {
    return Response.json({
      ok: true,
      empty: true,
      message:
        "المولّد ما طلع بخطة تناسب وقتك وميزانيتك. جرّب توسّع النطاق أو تزيد المدة.",
      origin: { label: origin.label },
      candidateCount: candidates.length,
    });
  }

  // ٦ — أزمنة التنقّل الحقيقية بين المحطات المختارة، بترتيبها
  let legs = [];
  try {
    legs = await travelLegs(plan.stops);
  } catch (err) {
    // الخطة صالحة بدونها — نعرضها بلا أزمنة تنقّل
    console.error("[api/plan] travel legs failed:", err);
    legs = plan.stops.slice(1).map(() => null);
  }

  // ٧ — الرد
  return Response.json({
    ok: true,
    empty: false,
    origin: { label: origin.label, lat: origin.lat, lng: origin.lng },
    // ملخّص فقط لا الساعات كاملة: الشريط يعرض المدى واحتمال المطر،
    // وإرسال ٦ صفوف لكل طلب حشو في الرد بلا فائدة للواجهة.
    // null هنا يعني "بلا طقس" والواجهة تخفي الشريط كلياً.
    weather: weather && {
      minFeels: weather.minFeels,
      maxFeels: weather.maxFeels,
      maxRain: weather.maxRain,
      unit: weather.unit,
      hottest: weather.hottest,
      coolest: weather.coolest,
    },
    plan: {
      ...plan,
      stops: plan.stops.map((stop, i) => ({
        ...stop,
        travel_to_next: i < legs.length ? legs[i] : null,
      })),
    },
    candidateCount: candidates.length,
    droppedStops: dropped,
    model: MODEL,
  });
}
