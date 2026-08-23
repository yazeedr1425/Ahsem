import { supabaseAdmin } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// إنشاء الحساب + إرسال رابط التأكيد عبر Mailtrap.
//
// كان التسجيل من المتصفح مباشرة بـ supabase.auth.signUp، فيرسل
// Supabase رسالته الافتراضية من مرسله المحدود (وبقالبه الإنجليزي).
// هنا نفصل الخطوتين: admin.generateLink ينشئ المستخدم ويرجّع رابط
// التأكيد بلا أي إرسال، ثم نرسل نحن القالب العربي عبر Mailtrap من
// نطاقنا. النتيجة نفس ضمانات Supabase (انتهاء صلاحية الرابط، منع
// الدخول قبل التأكيد) مع رسالة تخصنا.
//
// ⚠️ القالب يعيش في Mailtrap بمعرّفه الثابت — لو أعيد إنشاؤه هناك
// يتغيّر الـ UUID ولازم يتحدث هنا.
const MAILTRAP_SEND_URL = "https://send.api.mailtrap.io/api/send";
const TEMPLATE_UUID = "28bf46a1-33da-410e-8632-dc9e694566af";

// المرسل لازم يكون على نطاق موثّق في Mailtrap → Sending Domains
const FROM_EMAIL = process.env.MAILTRAP_FROM_EMAIL ?? "no-reply@yazeed.store";
const FROM_NAME = "احسم";

const SEND_TIMEOUT_MS = 15000;
const MIN_PASSWORD = 6;
const MAX_PASSWORD = 72;

// هذا المسار ينشئ مستخدمين ويرسل بريداً — هدف مغرٍ للتخريب:
// حلقة تسجيل تعبّي جدول المستخدمين وتحرق حصة الإرسال. الحد أشد من
// بقية المسارات لأن الاستعمال الشرعي له مرة أو مرتين لكل شخص.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 5;
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

function validate(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "الطلب لازم يكون كائن JSON." };
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const displayName =
    typeof body.displayName === "string"
      ? body.displayName.trim().slice(0, 60)
      : "";

  // فحص خفيف — الفيصل النهائي عند Supabase، وهذا فقط يوقف الواضح
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, message: "اكتب إيميلاً صالحاً." };
  }
  if (password.length < MIN_PASSWORD) {
    return { ok: false, message: `كلمة المرور ${MIN_PASSWORD} أحرف على الأقل.` };
  }
  if (password.length > MAX_PASSWORD) {
    return { ok: false, message: "كلمة المرور طويلة زيادة." };
  }

  return { ok: true, value: { email, password, displayName } };
}

async function sendVerification(email, confirmationUrl) {
  const token = process.env.MAILTRAP_API_TOKEN;
  if (!token) {
    const err = new Error("MAILTRAP_API_TOKEN is not set");
    err.code = "NO_TOKEN";
    throw err;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

  try {
    const res = await fetch(MAILTRAP_SEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        from: { email: FROM_EMAIL, name: FROM_NAME },
        to: [{ email }],
        template_uuid: TEMPLATE_UUID,
        template_variables: { confirmation_url: confirmationUrl },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const err = new Error(`Mailtrap ${res.status}: ${body.slice(0, 300)}`);
      err.status = res.status;
      throw err;
    }
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return fail(400, "تعذّرت قراءة الطلب.");
  }

  const parsed = validate(body);
  if (!parsed.ok) return fail(400, parsed.message);

  const { email, password, displayName } = parsed.value;

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!allowed(ip)) {
    return fail(429, "محاولات متكررة. أمهل دقيقة ثم أعد المحاولة.");
  }

  // ١) إنشاء المستخدم + توليد رابط التأكيد، بلا إرسال.
  // display_name يمشي في metadata لأن trigger handle_new_user يقرأه
  // منه عند إنشاء البروفايل.
  const admin = supabaseAdmin();
  let link;
  try {
    link = await admin.auth.admin.generateLink({
      type: "signup",
      email,
      password,
      options: displayName ? { data: { display_name: displayName } } : undefined,
    });
  } catch (err) {
    console.error("[api/signup] generateLink threw:", err);
    return fail(502, "تعذّر إنشاء الحساب حاليًا. أعد المحاولة.");
  }

  if (link.error) {
    const code = link.error.code ?? "";
    if (code === "email_exists" || /already.*registered/i.test(link.error.message)) {
      return fail(409, "هذا الإيميل مسجّل من قبل — سجّل دخولك.");
    }
    if (code === "weak_password") {
      return fail(400, "كلمة المرور ضعيفة. اجعلها أطول أو أكثر تعقيدًا.");
    }
    console.error("[api/signup] generateLink failed:", link.error);
    return fail(502, "تعذّر إنشاء الحساب حاليًا. أعد المحاولة.");
  }

  const userId = link.data?.user?.id;
  const confirmationUrl = link.data?.properties?.action_link;

  if (!confirmationUrl) {
    console.error("[api/signup] no action_link in response");
    return fail(502, "تعذر تجهيز رابط التأكيد.");
  }

  // ٢) الإرسال عبر Mailtrap بالقالب العربي.
  try {
    await sendVerification(email, confirmationUrl);
  } catch (err) {
    console.error("[api/signup] send failed:", err);

    // تعويض: حساب أُنشئ ورسالته ما طلعت = مستخدم عالق، محاولته
    // الجاية تصطدم بـ"الإيميل مسجّل" وهو ما استلم شيئاً. نحذفه
    // فتصير إعادة المحاولة نظيفة كأن شيئاً لم يكن.
    if (userId) {
      const removed = await admin.auth.admin.deleteUser(userId);
      if (removed.error) {
        console.error("[api/signup] compensation delete failed:", removed.error);
      }
    }

    if (err.code === "NO_TOKEN") {
      return fail(503, "الإرسال غير مهيأ — MAILTRAP_API_TOKEN مفقود.");
    }
    if (err.name === "AbortError") {
      return fail(504, "تأخّر الإرسال. أعد المحاولة.");
    }
    return fail(502, "تعذّر إرسال رابط التأكيد. أعد المحاولة.");
  }

  return Response.json({ ok: true });
}
