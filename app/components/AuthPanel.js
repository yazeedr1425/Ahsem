"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  ArrowLeft,
  Brain,
  CircleCheck,
  Clock,
  TriangleAlert,
} from "./icons";

const MIN_PASSWORD = 6;

// «الاتجاه الجديد»: لوح حبري يشرح ليش تسجل، ودخول برابط لمرة واحدة
// كطريقة أولى — كلمة المرور صارت البديل لا الأساس. ألوان هذي الشاشة
// من ملف التصميم مباشرة، مقصود اختلافها الطفيف عن بقية التطبيق.
const INK = "#17140f";
const PARCHMENT = "#e7e0d4";
const PANEL = "#fbf7f0";
const ACCENT = "#c2542c";
const ACCENT_INK = "#fdf6ee";
const CREAM = "#f4efe4";

const BENEFITS = [
  {
    icon: CircleCheck,
    title: "سجلك يبقى معك",
    sub: "كل قرار حسمته، والسبب اللي بنى عليه الترشيح.",
  },
  {
    icon: Brain,
    title: "أنماطك تتوضح",
    sub: "مع تقييماتك، الترشيح يصير أقرب لك لا لأي أحد.",
  },
  {
    icon: Clock,
    title: "خطة اليوم تكمل من وين وقفت",
    sub: "تفتحها من أي جهاز وتلقاها زي ما تركتها.",
  },
];

const field =
  "w-full border-0 border-b-2 bg-transparent px-0.5 py-2.5 text-xl outline-none transition-colors";

export default function AuthPanel({ mode = "signin" }) {
  const { signIn, signUp } = useAuth();
  const router = useRouter();
  const isSignUp = mode === "signup";

  // طريقة الدخول: الرابط أولاً، وكلمة المرور خيار يُكشف بزر
  const [method, setMethod] = useState("link");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const sendLink = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.ok) {
        setError(payload?.error ?? "تعذّر إرسال الرابط. أعد المحاولة.");
        return;
      }
      setNotice(
        `أرسلنا رابط الدخول إلى ${email.trim()} — افتحه وأنت داخل مباشرة. الرابط يفتح مرة واحدة.`,
      );
    } catch {
      setError("ما وصلنا للخادم — تأكد من اتصالك.");
    } finally {
      setBusy(false);
    }
  };

  const submitCredentials = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    const result = isSignUp
      ? await signUp(email.trim(), password, displayName)
      : await signIn(email.trim(), password);

    setBusy(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }
    if (result.needsConfirmation) {
      setNotice(`أرسلنا رابط تأكيد إلى ${email.trim()}. افتحه، وبعدها ادخل.`);
      return;
    }
    router.push("/");
  };

  const usePasswordForm = isSignUp || method === "password";

  return (
    // الشاشة كاملة مثل التصميم: اللوحان يعبّيان العرض والارتفاع بلا
    // بطاقة عائمة — البطاقة كانت تفسيراً خاطئاً للملف
    // min-h-dvh هنا لا على body: سلسلة الارتفاع في الجذر ما توصّل
    // (html بلا height)، وهذي الشاشة الوحيدة اللي تحتاج ملء الإطار
    <main
      id="main"
      className="grid min-h-dvh flex-1 lg:grid-cols-[2fr_3fr]"
      style={{ backgroundColor: PARCHMENT }}
    >
      {/* ------- اللوح الحبري: ليش تسجل ------- */}
        <aside
          className="order-2 flex flex-col gap-8 p-8 sm:p-12 lg:order-none lg:p-16"
          style={{ backgroundColor: INK, color: CREAM }}
        >
          <Link href="/" className="flex items-center gap-2.5 self-start">
            <span
              className="flex h-10 w-10 items-center justify-center rounded-xl text-lg font-bold"
              style={{ backgroundColor: ACCENT, color: ACCENT_INK }}
            >
              حـ
            </span>
            <span className="text-lg font-semibold">احسم</span>
          </Link>

          {/* الكتلة الوسطى تتوسط عمودياً بين الشعار والتذييل،
              والوسم اللاتيني على الحافة اليسرى عمداً — مقابلة
              الاتجاهين من التصميم نفسه */}
          {/* فوق المنتصف بقليل — المنتصف الهندسي يبان نازلاً للعين.
              الإزاحة على الشاشات الكبيرة فقط: في الرصّة العمودية ما
              فيه فراغ يسمح بها */}
          <div className="my-auto flex flex-col gap-8 lg:-translate-y-8">
            <div className="flex flex-col gap-4">
              <h2 className="text-4xl font-bold leading-snug sm:text-5xl sm:leading-snug">
                حسابك هو ذاكرة قراراتك.
              </h2>
            </div>

            <ul className="flex flex-col gap-6">
              {BENEFITS.map((b) => {
                const Icon = b.icon;
                return (
                  <li key={b.title} className="flex items-start gap-3.5">
                    <Icon
                      size={24}
                      className="mt-1 shrink-0"
                      style={{ color: ACCENT }}
                    />
                    <div>
                      <p className="text-xl font-semibold">{b.title}</p>
                      <p className="mt-0.5 text-base leading-relaxed" style={{ color: "#bdb3a4" }}>
                        {b.sub}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <p
            className="border-t pt-6 text-base leading-relaxed"
            style={{ borderColor: "#3a352c", color: "#a89e90" }}
          >
            تقدر تستخدم احسم بدون حساب. الحساب للحفظ فقط — وما نشارك
            قراراتك مع أحد.
          </p>
        </aside>

        {/* ------- النموذج ------- */}
        <section
          className="flex flex-col items-center justify-center p-8 sm:p-12 lg:p-16"
          style={{ backgroundColor: PANEL, color: INK }}
        >
        <div className="flex w-full max-w-md flex-col gap-7">
          <div className="flex flex-col gap-3">
            <h1 className="text-4xl font-bold leading-tight sm:text-[44px]">
              {isSignUp ? "أنشئ حسابك." : "أهلًا بعودتك."}
            </h1>
            <p className="leading-relaxed" style={{ color: "#6b6257" }}>
              {isSignUp
                ? "لحفظ قراراتك، واستخلاص أنماطك منها مع الوقت."
                : usePasswordForm
                  ? "أدخل بريدك وكلمة مرورك."
                  : "أدخل بريدك ليصلك رابط دخول لمرة واحدة — دون كلمة مرور تحتاج إلى تذكّرها."}
            </p>
          </div>

          <form
            onSubmit={usePasswordForm ? submitCredentials : sendLink}
            className="flex flex-col gap-6"
          >
            {isSignUp && (
              <label className="flex flex-col gap-1.5">
                <span className="text-sm" style={{ color: "#6b6257" }}>
                  الاسم
                </span>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  autoComplete="name"
                  maxLength={60}
                  placeholder="كيف تحب نناديك؟"
                  className={field}
                  style={{ borderColor: INK }}
                />
              </label>
            )}

            <label className="flex flex-col gap-1.5">
              <span className="text-sm" style={{ color: "#6b6257" }}>
                الإيميل
              </span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                dir="ltr"
                className={`${field} text-left`}
                style={{ borderColor: INK }}
              />
            </label>

            {usePasswordForm && (
              <label className="flex flex-col gap-1.5">
                <span className="text-sm" style={{ color: "#6b6257" }}>
                  كلمة المرور
                </span>
                <input
                  type="password"
                  required
                  minLength={MIN_PASSWORD}
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={field}
                  style={{ borderColor: INK }}
                />
                {isSignUp && (
                  <span className="text-xs" style={{ color: "#a89e90" }}>
                    {MIN_PASSWORD} أحرف على الأقل.
                  </span>
                )}
              </label>
            )}

            {error && (
              <p
                role="alert"
                className="flex items-center gap-2 rounded-xl border border-dashed px-4 py-3 text-sm"
                style={{ borderColor: "#ddd3c4" }}
              >
                <TriangleAlert size={15} className="shrink-0" />
                {error}
              </p>
            )}

            {notice && (
              <p
                role="status"
                className="flex items-start gap-2 rounded-xl px-4 py-3 text-sm"
                style={{ backgroundColor: "#f3e2d8", color: "#8a3d1f" }}
              >
                <CircleCheck size={18} className="mt-0.5 shrink-0" />
                {notice}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="flex items-center justify-center gap-2 rounded-full px-6 py-4 text-lg font-semibold shadow-[0_10px_24px_rgba(194,84,44,0.35)] transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: ACCENT, color: ACCENT_INK }}
            >
              {busy
                ? "…"
                : isSignUp
                  ? "أنشئ الحساب"
                  : usePasswordForm
                    ? "دخول"
                    : "أرسل لي رابط الدخول"}
              {!busy && <ArrowLeft size={18} />}
            </button>

            {!isSignUp && (
              <>
                <div
                  className="flex items-center gap-3 text-sm"
                  style={{ color: "#a89e90" }}
                >
                  <span className="h-px flex-1" style={{ backgroundColor: "#ddd3c4" }} />
                  أو
                  <span className="h-px flex-1" style={{ backgroundColor: "#ddd3c4" }} />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setMethod(method === "link" ? "password" : "link");
                    setError(null);
                    setNotice(null);
                  }}
                  className="rounded-full border px-6 py-3 text-sm font-medium transition-colors hover:border-current"
                  style={{ backgroundColor: "#fdfaf5", borderColor: "#ddd3c4", color: INK }}
                >
                  {method === "link" ? "دخول بكلمة المرور" : "رجّعني لرابط الدخول"}
                </button>
              </>
            )}
          </form>

          <div
            className="flex flex-wrap items-center justify-between gap-3 text-sm"
            style={{ color: "#6b6257" }}
          >
            <p>
              {isSignUp ? "عندك حساب؟ " : "ما عندك حساب؟ "}
              <Link
                href={isSignUp ? "/login" : "/signup"}
                className="font-medium underline underline-offset-4"
                style={{ color: "#8a3d1f" }}
              >
                {isSignUp ? "سجّل دخولك" : "أنشئ واحد"}
              </Link>
            </p>
            <Link href="/" className="flex items-center gap-1.5">
              أكمل بدون حساب
              <ArrowLeft size={15} />
            </Link>
          </div>
        </div>
        </section>
    </main>
  );
}
