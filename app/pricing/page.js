import Link from "next/link";
import SiteNav from "../components/SiteNav";
import SiteFooter from "../components/SiteFooter";
import { toArabicDigits } from "@/lib/text/digits";
import { Check, Sparkles, TriangleAlert } from "../components/icons";

export const metadata = {
  title: "الأسعار — احسم",
  description:
    "ابدأ مجاناً، وارقِ لبلس لما تحتاج قرارات بلا حد وخطة اليوم وتحليل المخاطر.",
};

// الرمز ﷼ (U+FDFC) رباط يرسمه الخط متداخلاً فيطلع لطخة غير مقروءة —
// نفس السبب اللي خلى PlanTimeline يكتب الكلمة. الكلمة أوضح وأقصر.
const CURRENCY = "ريال";

// الخطط مشتقة من كلفة التشغيل الفعلية لا من رقم مستحسن: كل قرار نداءُ
// جيميناي، وخطة اليوم تصرف فوقه حصة أماكن جوجل والطقس — فهي وتحليل
// المخاطر وقراءة الأنماط خلف الاشتراك، والحسم اليومي يبقى مجانياً.
const PLANS = [
  {
    id: "free",
    name: "المجاني",
    price: 0,
    period: "للأبد",
    line: "كل ما يلزم لحسم قرارات يومك.",
    features: [
      "١٠ قرارات في الشهر",
      "سجل آخر ١٠ قرارات",
      "التصويت الجماعي مع ربعك",
      "الخيار الثالث اللي ما فكرت فيه",
    ],
    cta: "ابدأ مجاناً",
    href: "/signup",
  },
  {
    id: "plus",
    name: "بلس",
    price: 19,
    period: "في الشهر",
    line: "لما تصير احسم عادة يومية لا تجربة.",
    featured: true,
    features: [
      "قرارات بلا حد",
      "سجلك كامل + شخصيتك القرارية",
      "خطة اليوم بالأماكن والطقس",
      "تحليل المخاطر للقرارات الكبيرة",
      "تفكيك القرارات المصيرية",
      "أولوية وقت الازدحام",
    ],
    cta: "ابدأ بلس",
    href: "/signup",
  },
  {
    id: "yearly",
    name: "بلس سنوي",
    price: 190,
    period: "في السنة",
    line: "نفس بلس، وشهران على حسابنا.",
    features: [
      "كل مزايا بلس",
      "شهران مجاناً مقارنة بالشهري",
      "السعر يثبت لك ما دام اشتراكك شغال",
    ],
    cta: "اشترك سنوي",
    href: "/signup",
  },
];

function Plan({ plan }) {
  const ink = plan.featured;

  return (
    <div
      className={
        "card-shadow flex flex-col rounded-[var(--radius-card)] p-7 sm:p-8 " +
        (ink
          ? "on-ink bg-ink text-on-ink"
          : "border border-line bg-card text-ink")
      }
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">{plan.name}</h2>
        {ink && (
          <span className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-ink">
            <Sparkles size={13} />
            الأكثر اختياراً
          </span>
        )}
      </div>

      <p
        className={
          "mt-2 text-sm leading-relaxed " +
          (ink ? "text-on-ink-muted" : "text-muted")
        }
      >
        {plan.line}
      </p>

      {/* السعر والوحدة على سطر واحد: الرقم كبير والوحدة تتبعه صغيرة
          حتى ما يقرأ المستخدم رقماً بلا سياق */}
      <p className="mt-6 flex items-baseline gap-2">
        <span className="display text-5xl font-bold">
          {toArabicDigits(plan.price)}
        </span>
        <span
          className={
            "text-sm " + (ink ? "text-on-ink-muted" : "text-muted")
          }
        >
          {CURRENCY} · {plan.period}
        </span>
      </p>

      <ul className="mt-7 flex flex-col gap-3">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5 text-sm">
            <Check
              size={17}
              className={
                "mt-0.5 shrink-0 " + (ink ? "text-accent" : "text-accent-strong")
              }
            />
            <span className={ink ? "" : "text-ink"}>{feature}</span>
          </li>
        ))}
      </ul>

      <Link
        href={plan.href}
        className={
          "mt-8 flex items-center justify-center rounded-full px-6 py-3.5 font-semibold transition-all active:translate-y-px " +
          (ink
            ? "glow bg-accent text-accent-ink hover:brightness-95"
            : "border border-line-strong text-ink hover:border-ink hover:bg-card-sunken")
        }
      >
        {plan.cta}
      </Link>
    </div>
  );
}

export default function PricingPage() {
  return (
    <>
      <SiteNav />

      <main
        id="main"
        className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-12 px-4 py-10 sm:px-6 sm:py-14"
      >
        <header className="flex flex-col gap-4">
          <h1 className="display text-4xl font-bold sm:text-5xl">
            ابدأ مجاناً، وارقِ لما تحتاج.
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed text-muted">
            الحسم اليومي مجاني ويبقى مجانياً. الاشتراك للي يبي سجله كامل،
            وخطة يومه مبنية على أماكن حقيقية، وتحليلاً للقرارات اللي ما
            تنحسم بمزاج اليوم.
          </p>
        </header>

        <div className="grid gap-5 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <Plan key={plan.id} plan={plan} />
          ))}
        </div>

        {/* إفصاح لا تزيين: الصفحة تعرض أسعاراً وما فيه بوابة دفع بعد،
            وإخفاء ذلك يخلي المستخدم يضغط وينتظر شيئاً ما يجي */}
        <p className="flex items-start gap-2.5 rounded-[1.5rem] border border-dashed border-line-strong bg-card-sunken p-5 text-sm leading-relaxed text-muted">
          <TriangleAlert size={17} className="mt-0.5 shrink-0" />
          الدفع ما فتح بعد. تقدر تنشئ حسابك الحين وتستخدم المجاني كامل،
          ونعلمك بالإيميل أول ما يبدأ الاشتراك — وما ينسحب منك شي قبلها.
        </p>

        <section className="flex flex-col gap-5">
          <h2 className="display text-2xl font-bold sm:text-3xl">
            أسئلة تتكرر
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              {
                q: "هل يلزم حساب لاستخدام احسم؟",
                a: "لا. الاستخدام متاح كاملًا دون حساب. والحساب للحفظ وحده، ليبقى لك سجل تُقرأ منه أنماطك.",
              },
              {
                q: "ما مصير قراراتي عند إيقاف الاشتراك؟",
                a: "تبقى كما هي. تعود الحدود المجانية على ما يستجدّ فقط، ولا يُحذف سجلّك السابق.",
              },
              {
                q: "لمَ جدولة اليوم وتحليل المخاطر ضمن الاشتراك؟",
                a: "لأنهما الأغلى تشغيلاً: خطة اليوم تنادي أماكن حقيقية وطقساً مع كل طلب، والتحليل سلسلة نداءات لا نداءً واحداً.",
              },
              {
                q: "هل الإلغاء متاح في أي وقت؟",
                a: "نعم. يتم الإلغاء من الإعدادات، ويستمر اشتراكك إلى نهاية المدة المدفوعة.",
              },
            ].map((item) => (
              <div
                key={item.q}
                className="rounded-[1.5rem] border border-line bg-card p-5"
              >
                <p className="font-bold">{item.q}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                  {item.a}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
