import { supabaseAdmin } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// دخول برابط لمرة واحدة — بلا كلمة مرور تُتذكر.
//
// نفس معمارية التسجيل: admin.generateLink يولّد الرابط بلا إرسال،
// ونرسله نحن بقالبنا العربي عبر Mailtrap. لو تركناها لـ Supabase
// أرسل قالبه الإنجليزي من مرسله المحدود (٣-٤ رسائل بالساعة).
//
// الرسالة هنا HTML مضمّن لا قالب Mailtrap مخزّن: نص الدخول قصير
// وثابت، وقالب ثانٍ في لوحة خارجية = معرّف ثانٍ ينكسر بصمت لو
// أُعيد إنشاؤه. التصميم نفس لغة رسالة التحقق.
const MAILTRAP_SEND_URL = "https://send.api.mailtrap.io/api/send";
const FROM_EMAIL = process.env.MAILTRAP_FROM_EMAIL ?? "no-reply@yazeed.store";
const FROM_NAME = "احسم";
const SEND_TIMEOUT_MS = 15000;

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

// نفس بنية رسالة التحقق وألوانها: جداول وأنماط مضمّنة، لأن عملاء
// البريد يتجاهلون CSS الخارجي و flex.
//
// الخلفية بيضاء لا ورقية: صندوق البريد نفسه أبيض، والشريط الورقي
// حول البطاقة كان يبان إطاراً غريباً بدل ما يذوب في الصفحة. الورقيّ
// باقٍ في البطاقة نفسها، وهو اللي يحمل دفء الهوية.
//
// المرعى يُطلب بثلاث طرق لأن كل عميل يحترم واحدة ويسقط غيرها: وسم
// link، و@import داخل style، وإعلان مضمّن على العنوان نفسه. المُختبَر
// في معاينة Mailtrap أن link وحده ما كفى — @import هو اللي حمّل الخط.
// وجيميل يسقط الخطوط الخارجية مهما فعلنا، فما ينفع إلا ضبط ما بعده:
// انظر ترتيب السقوط في FONT تحت.
function emailHtml(actionLink) {
  // ترتيب السقوط مقصود. جيميل يسقط الخطوط الخارجية دائماً، فالمهم
  // ليس المرعى بل ما يليه: تاهوما خط عربي قديم الطراز ثقيل، والمرعى
  // هندسي حديث — فالقفز إليه مباشرة كان يعطي أبعد شكل ممكن عن الهوية.
  // نوتو سانس عربي مثبّت على أندرويد، وsystem-ui يعطي SF Arabic على
  // آبل وSegoe UI على ويندوز، وكلها هندسية أقرب للمرعى. تاهوما تبقى
  // آخر ملجأ لا أول بديل.
  const FONT =
    "'Almarai', 'Noto Sans Arabic', system-ui, -apple-system, 'Segoe UI', Tahoma, Arial, sans-serif";

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>رابط دخولك — احسم</title>
  <link href="https://fonts.googleapis.com/css2?family=Almarai:wght@400;700&display=swap" rel="stylesheet" />
  <style type="text/css">
    @import url('https://fonts.googleapis.com/css2?family=Almarai:wght@400;700&display=swap');
    h1, h2, h3, td, span, a, p { font-family: ${FONT}; }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#ffffff;" bgcolor="#ffffff">
  <div style="display:none; max-height:0; overflow:hidden; mso-hide:all;">ضغطة وحدة وأنت داخل.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background-color:#ffffff;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; width:100%;">
          <tr>
            <td align="right" style="padding:0 8px 20px 8px;" dir="rtl">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" dir="rtl">
                <tr>
                  <td width="44" height="44" align="center" valign="middle" bgcolor="#c2542c" style="background-color:#c2542c; border-radius:14px; width:44px; height:44px;">
                    <span style="font-family:${FONT}; font-size:20px; font-weight:bold; color:#fdf6ee; line-height:44px;">حـ</span>
                  </td>
                  <td style="padding-right:12px;">
                    <span style="font-family:${FONT}; font-size:22px; font-weight:bold; color:#17140f;">احسم</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td bgcolor="#fbf7f0" style="background-color:#fbf7f0; border:1px solid #ddd3c4; border-radius:28px; padding:40px 32px;" dir="rtl">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="rtl">
                <tr>
                  <td align="right" style="font-family:${FONT}; color:#17140f;">
                    <!-- ١٫٢٥ لا ١٫٣٥: الهمزة والشدة تعلوان صندوق السطر في
                         العربية، والضيق يخلّيهما يلامسان ما فوقهما -->
                    <h1 style="font-family:${FONT}; margin:0 0 12px 0; font-size:28px; line-height:1.25; font-weight:bold;">رابط دخولك جاهز</h1>
                    <p style="margin:0 0 24px 0; font-size:16px; line-height:1.8; color:#6b6257;">
                      اضغط الزر وأنت داخل — بلا كلمة مرور. الرابط يفتح مرة
                      واحدة، فلو ما اشتغل اطلب رابطاً جديداً من صفحة الدخول.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding:4px 0 28px 0;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" bgcolor="#c2542c" style="background-color:#c2542c; border-radius:999px;">
                          <a href="${actionLink}" style="display:inline-block; padding:15px 44px; font-family:${FONT}; font-size:17px; font-weight:bold; color:#fdf6ee; text-decoration:none; border-radius:999px;">ادخل لاحسم</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td align="right" style="font-family:${FONT}; border-top:1px solid #ddd3c4; padding-top:20px;">
                    <p style="margin:0 0 8px 0; font-size:13px; line-height:1.7; color:#6b6257;">الزر ما اشتغل؟ انسخ الرابط والصقه في متصفحك:</p>
                    <p style="margin:0; font-size:12px; line-height:1.7; word-break:break-all;" dir="ltr" align="left">
                      <a href="${actionLink}" style="color:#9c3f1e; text-decoration:underline;">${actionLink}</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="right" style="padding:20px 8px 0 8px; font-family:${FONT};" dir="rtl">
              <p style="margin:0; font-size:12px; line-height:1.7; color:#a89e90;">
                ما طلبت الدخول؟ تجاهل هذي الرسالة وما راح يدخل أحد —
                الرابط ما يوصل إلا لبريدك.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return fail(400, "تعذّرت قراءة الطلب.");
  }

  const email = typeof body?.email === "string" ? body.email.trim() : "";
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return fail(400, "اكتب إيميلاً صالحاً.");
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!allowed(ip)) return fail(429, "محاولات كثيرة — انتظر دقيقة.");

  const token = process.env.MAILTRAP_API_TOKEN;
  if (!token) return fail(503, "الإرسال غير مهيأ — MAILTRAP_API_TOKEN مفقود.");

  // النوع recovery وليس magiclink عمداً: مُختبَر — magiclink لإيميل
  // غير موجود «ينجح» بإنشاء حساب شبح بصمت، فيصير طلب رابط الدخول
  // باباً لتسجيل حسابات بأي إيميل. recovery يشترط وجود المستخدم ولا
  // ينشئ أبداً، وجلسة الاستعادة دخولٌ كامل — نفس النتيجة للمستخدم.
  //
  // ونقول «مو مسجل» بصراحة بدل الغموض: التطبيق ما فيه حساسية تبرر
  // إخفاء وجود الحساب، والوضوح أنفع.
  const admin = supabaseAdmin();
  let link;
  try {
    // redirectTo لأصل الطلب نفسه: بدونه يرجع الرابط لـ Site URL
    // (الدومين الإنتاجي) حتى لو طلبته من بيئة تطوير. Supabase ما
    // يقبله إلا لو كان في قائمة Redirect URLs المسموحة — وإلا سقط
    // للـ Site URL بصمت، فالتمرير آمن في الحالتين.
    link = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: new URL(request.url).origin },
    });
  } catch (err) {
    console.error("[api/magic-link] generateLink threw:", err);
    return fail(502, "تعذّر تجهيز الرابط. أعد المحاولة.");
  }

  if (link.error) {
    if (/not.*found/i.test(link.error.message) || link.error.code === "user_not_found") {
      return fail(404, "هذا البريد غير مسجّل. أنشئ حسابًا أولًا.");
    }
    console.error("[api/magic-link] generateLink failed:", link.error);
    return fail(502, "تعذّر تجهيز الرابط. أعد المحاولة.");
  }

  const actionLink = link.data?.properties?.action_link;
  if (!actionLink) return fail(502, "تعذر تجهيز الرابط.");

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
        subject: "رابط دخولك — ضغطة وحدة وأنت داخل",
        html: emailHtml(actionLink),
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Mailtrap ${res.status}: ${text.slice(0, 200)}`);
    }
  } catch (err) {
    console.error("[api/magic-link] send failed:", err);
    if (err.name === "AbortError") return fail(504, "تأخّر الإرسال. أعد المحاولة.");
    return fail(502, "تعذّر إرسال الرابط. أعد المحاولة.");
  } finally {
    clearTimeout(timer);
  }

  return Response.json({ ok: true });
}
