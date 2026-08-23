import Link from "next/link";
import SiteNav from "../components/SiteNav";
import SiteFooter from "../components/SiteFooter";
import {
  ArrowLeft,
  Brain,
  CircleCheck,
  Headphones,
  Lightbulb,
  Mic,
  Plus,
  RotateCw,
  Scale,
  Sparkles,
  Users,
  Volume2,
} from "../components/icons";

export const metadata = {
  title: "منهجية التقييم الموزون — احسم",
  description:
    "كيف يُحتسب الترجيح: خياراتك، أسئلة تحدّد أوزان المعايير، وتوصية واحدة مع مسوّغها.",
};

// ما حول القرار نفسه — القدرات اللي تشتغل قبل الترشيح وبعده.
// وضع المحادثة الصوتية له قسمه الخاص تحت، فما يتكرر هنا.
const POWERS = [
  {
    icon: Lightbulb,
    title: "خيار ثالث لم يخطر لك",
    body: "قد يقترح النظام خيارًا إضافيًا أثناء الإدخال، لأن التردد كثيرًا ما يكون عرَضًا لسوء صياغة الخيارين لا لصعوبة المفاضلة بينهما. والاقتراح مشتق من خياراتك أنت، لا من قائمة معدّة مسبقًا.",
  },
  {
    icon: Scale,
    title: "ما يتجاوز نطاق أسئلة سريعة",
    body: "القرارات المصيرية لا تُحسم بأسئلة سريعة. فإذا رُصد ثقل الخيارات، عُرض تفكيكها إلى فحوص صغيرة لكل منها جواب محدد اليوم — أثمة مدخرات كافية؟ أجُرِّب الخيار بالتوازي مع الوضع الحالي؟ — ثم يصدر حكم صريح: الإقدام، أو التأجيل مع بيان الشرط الذي يقلبه.",
  },
  {
    icon: Users,
    title: "القرار المشترك",
    body: "يُشارَك القرار برابط أو رمز مصوَّر، فيصوّت كل طرف باسمه دون حساب، وتتحدث النتائج أمام الجميع لحظة ورود كل صوت. وعند التعادل يفصل النظام بنفسه، فلا يقع الترجيح على أحد المشاركين.",
  },
  {
    icon: Brain,
    title: "سجل يُراكم المعرفة بنمطك",
    body: "يُستطلَع رأيك لاحقًا في صحة القرار، فتتكوّن من إجاباتك قراءة لنمطك: أي أنواع القرارات تعود عنها، وأي خيار تطرحه دائمًا ولا تختاره قط، وفي أي الأوقات يشتد ترددك. وكل تقييم يدخل في ترجيح ما بعده.",
  },
];

const STEPS = [
  {
    icon: Plus,
    title: "إدخال الخيارات",
    body: "من خيارين إلى خمسة: تُكتب نصًا، أو تُملى صوتيًا، أو تُستخلص من جلسة حوارية منطوقة.",
  },
  {
    icon: Brain,
    title: "تحديد أوزان المعايير",
    body: "الأسئلة لا تختار عنك، بل تحدد وزن كل معيار في حالتك: الوقت، والميزانية، وحالتك الذهنية.",
  },
  {
    icon: CircleCheck,
    title: "تقييم الخيارات على المعايير",
    body: "يبدأ كل خيار عند التقدير المتوسط، فلا يلزم إلا تعديل ما ترى فيه فرقًا. والمرحلة كلها قابلة للتخطي.",
  },
  {
    icon: Sparkles,
    title: "التوصية ومسوّغها",
    body: "توصية واحدة صريحة مع مسوّغها. ولمن أراد التفصيل، يعرض «وضّح أكثر» تفكيكًا للأوزان بصياغة مقروءة.",
  },
];

export default function HowItWorks() {
  return (
    <>
      <SiteNav />

      <main
        id="main"
        className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-16 px-4 py-10 sm:px-6 sm:py-14"
      >
        {/* المقدمة */}
        <section className="flex flex-col gap-5">
          <h1 className="display text-4xl font-bold sm:text-5xl">
            كيف يُحتسب الترجيح.
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed text-muted">
            لا يُنتقى الخيار عشوائيًا. تُطرح أسئلة قصيرة تحدّد وزن كل معيار في
            حالتك، ثم تُقيَّم الخيارات على تلك المعايير، فتصدر توصية واحدة مع
            بيان ما رجّحها.
          </p>
        </section>

        {/* الخطوات */}
        <section className="flex flex-col gap-5">
          <h2 className="display text-2xl font-bold sm:text-3xl">مراحل التقييم الأربع</h2>
          <ol className="grid gap-4 sm:grid-cols-2">
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <li
                  key={step.title}
                  className="card-shadow flex flex-col gap-3 rounded-[1.5rem] border border-line bg-card p-6 transition-transform hover:-translate-y-0.5"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent-strong">
                      <Icon size={18} />
                    </span>
                    <span lang="ar" className="tag">{`الخطوة ${"١٢٣٤"[i]}`}</span>
                  </div>
                  <h3 className="text-lg font-semibold">{step.title}</h3>
                  <p className="text-sm leading-relaxed text-muted">
                    {step.body}
                  </p>
                </li>
              );
            })}
          </ol>
        </section>

        {/* حول القرار نفسه */}
        <section className="flex flex-col gap-5">
          <h2 className="display text-2xl font-bold sm:text-3xl">
            أربع قدرات حول القرار
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {POWERS.map((power) => {
              const Icon = power.icon;
              return (
                <div
                  key={power.title}
                  className="card-shadow flex flex-col gap-3 rounded-[1.5rem] border border-line bg-card p-6 transition-transform hover:-translate-y-0.5"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent-strong">
                    <Icon size={18} />
                  </span>
                  <h3 className="text-lg font-semibold">{power.title}</h3>
                  <p className="text-sm leading-relaxed text-muted">
                    {power.body}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* ليش سؤالين مختلفين */}
        <section className="card-shadow flex flex-col gap-4 rounded-[var(--radius-card)] border border-line bg-card p-6 sm:p-8">
          <h2 className="display text-2xl font-bold">
            ليش نسألك مرتين — أسئلة وتقييم؟
          </h2>
          <p className="leading-relaxed text-muted">
            لأنهما شيئان مختلفان. الأسئلة تحدد{" "}
            <strong className="font-semibold text-foreground">وزن</strong> كل
            معيار: لو أنت مستعجل، السرعة تصير أثقل. والتقييم يحدد{" "}
            <strong className="font-semibold text-foreground">درجة</strong> كل
            خيار في ذلك المعيار: أي الخيارات أسرع فعلاً.
          </p>
          <p className="leading-relaxed text-muted">
            بدون الاثنين، نص المعادلة ناقص — نعرف إيش يهمك، بس ما نعرف أي خيار
            يحققه. النتيجة النهائية بسيطة:
          </p>
          <p className="rounded-xl bg-card-sunken px-4 py-3 text-center font-medium">
            درجة الخيار = مجموع (وزن المعيار × تقييم الخيار فيه)
          </p>
          <p className="text-sm leading-relaxed text-muted">
            وعشان كذا النِّسب اللي تشوفها في «حسابك بالأوزان» محسوبة فعلاً من
            إجاباتك، مو أرقام مزخرفة.
          </p>
        </section>

        {/* المزاج */}
        <section className="flex flex-col gap-4">
          <h2 className="display text-2xl font-bold sm:text-3xl">أثر الحالة الذهنية</h2>
          <p className="leading-relaxed text-muted">
            تغيّر حالتك لون الواجهة، وتضيف{" "}
            <strong className="font-semibold text-foreground">+١</strong> إلى وزن
            معيار واحد لا غير. فحالة التحفّز أو الارتياح ترجّح معيار المبادرة
            والتجديد، وحالة الإجهاد ترجّح قلّة الكلفة والجهد، والحالة المتزنة
            تُبقي الأوزان على أصلها بلا ترجيح مسبق.
          </p>
          <p className="text-sm leading-relaxed text-muted">
            وهذا الأثر معلن لا مضمر: إذا كانت الحالة هي التي رجّحت معيارًا، ذُكر
            ذلك صراحةً في شرح النتيجة.
          </p>
        </section>

        {/* الصوت */}
        <section className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-dashed border-line-strong bg-card-sunken p-6 sm:p-8">
          <h2 className="flex items-center gap-2 display text-2xl font-bold">
            <Headphones size={22} className="text-accent" />
            تفضّل تتكلم؟
          </h2>
          <p className="leading-relaxed text-muted">
            وضع المحادثة الصوتية يسألك ويسمع ردك ويعبّي كل شي عنك، ويقرأ لك
            النتيجة. وإذا الميكروفون ممنوع أو متصفحك ما يدعمه، يظهر لك مربع
            كتابة وتكمل نفس المحادثة بالضبط.
          </p>
          <ul className="grid gap-2 text-sm text-muted sm:grid-cols-2">
            <li className="flex items-center gap-2">
              <Headphones size={16} className="text-accent" /> حرف V — المحادثة
              الصوتية
            </li>
            <li className="flex items-center gap-2">
              <Mic size={16} className="text-accent" /> حرف M — أملِ خياراتك
            </li>
            <li className="flex items-center gap-2">
              <Volume2 size={16} className="text-accent" /> حرف S — تشغيل أو
              إيقاف القراءة
            </li>
            <li className="flex items-center gap-2">
              <RotateCw size={16} className="text-accent" /> حرف R — أعد قراءة
              الشاشة
            </li>
          </ul>
        </section>

        {/* الخصوصية */}
        <section className="flex flex-col gap-4">
          <h2 className="display text-2xl font-bold sm:text-3xl">ملكية البيانات</h2>
          <p className="leading-relaxed text-muted">
            بغير تسجيل دخول لا يُحفظ شيء، ويظل النظام متاحًا بكامل قدراته دون أن
            يترك أثرًا. وبالتسجيل تُحفظ قراراتك في سجلّك، ليُستدل بها على أنماطك
            ويتحسّن الترجيح مع الوقت.
          </p>
          <p className="text-sm leading-relaxed text-muted">
            وفي القرار المشترك لا يرى فاتح الرابط سوى الخيارات وأعداد الأصوات؛
            ولا تُكشف أسماء المصوّتين إلا عند إعلان النتيجة، ولا يُطلب حساب من أي
            مشارك.
          </p>
        </section>

        {/* دعوة */}
        <section className="flex flex-col items-start gap-4 border-t border-line pt-10">
          <h2 className="display text-2xl font-bold">
            جرّبه على قرار محتار فيه الحين.
          </h2>
          <Link
            href="/"
            className="action flex items-center gap-2 rounded-full px-8 py-4 text-lg font-semibold transition-all active:translate-y-px"
          >
            احسمها لي
            <ArrowLeft size={20} />
          </Link>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
