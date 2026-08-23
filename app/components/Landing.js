"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MOODS } from "@/lib/engine/mood";
import { looksOversized } from "@/lib/engine/oversized";
import { MAX_OPTIONS, MIN_OPTIONS } from "@/lib/engine/score";
import { listenOnce } from "@/lib/voice/speech";
import { parseSpokenOptions } from "@/lib/voice/match";
import { useVoice } from "@/lib/voice/VoiceProvider";
import ThirdOptionHint from "./ThirdOptionHint";
import Reveal from "./Reveal";
import { Field, hindi } from "./ui";
import {
  Activity,
  ArrowLeft,
  Brain,
  Briefcase,
  Clock,
  Headphones,
  Mic,
  MoodIcon,
  Plus,
  Scale,
  ShoppingBag,
  TriangleAlert,
  Users,
} from "./icons";

// أمثلة تعبّي الخيارين بضغطة — مدخل مختصر لا ميزة تُعرض.
// بلا فئة: النموذج يستنتجها من النصّين، فتحديدها هنا يعيد اختراع
// الحقل الذي حذفناه من الشاشة.
const EXAMPLES = [
  {
    label: "أي الإطارين أنسب لمشروعك القادم؟",
    icon: Brain,
    options: ["Next.js", "Remix"],
  },
  {
    label: "أين توجّه الميزانية التسويقية؟",
    icon: ShoppingBag,
    options: ["الإعلانات الممولة", "التسويق بالمحتوى"],
  },
  {
    label: "ما الخيار الأنسب لمرحلتك القادمة؟",
    icon: Briefcase,
    options: ["برنامج تدريبي مكثف", "مشروع خاص"],
  },
];

// أرقام هندية — الصفحة كلها عربية والرقم اللاتيني ينشز
const ORDINALS = ["١", "٢", "٣", "٤", "٥"];

// كل خطوة بتدرّجها، والثلاثة تمشي على محطات المزاج بالترتيب فتقرأ
// كتسلسل لا كثلاثة ألوان متفرقة
const STEPS = [
  {
    number: "٠١",
    title: "إدخال الخيارات",
    sub: "خياران أو أكثر، بصياغتك. أو أملِها صوتيًا ويتولى النظام ترتيبها.",
    gradient: "linear-gradient(120deg, var(--accent), var(--grad-c))",
  },
  {
    number: "٠٢",
    title: "التقييم الموزون",
    sub: "أسئلة تحدّد أوزان المعايير: وقتك، حالتك، أولوياتك.",
    gradient: "linear-gradient(120deg, var(--grad-c), var(--grad-d))",
  },
  {
    number: "٠٣",
    title: "التوصية ومسوّغها",
    sub: "خيار واحد مرجَّح، ومعه أساس الترجيح — لا قائمة إيجابيات تحسمها أنت.",
    gradient: "linear-gradient(120deg, var(--grad-d), var(--grad-e))",
  },
];

export default function Landing({
  mood,
  setMood,
  frame,
  frameError,
  onOptionBlur,
  options,
  setOptions,
  onStart,
  onVoiceMode,
  onBreakdown,
  onGroup,
  groupBusy,
}) {
  const scrollToComposer = () =>
    document.getElementById("how")?.scrollIntoView({ behavior: "smooth" });

  return (
    <div className="flex flex-col">
      <Hero onCta={scrollToComposer} />
      <ComposerSection
        mood={mood}
        setMood={setMood}
        frame={frame}
        frameError={frameError}
        onOptionBlur={onOptionBlur}
        options={options}
        setOptions={setOptions}
        onStart={onStart}
        onVoiceMode={onVoiceMode}
        onBreakdown={onBreakdown}
        onGroup={onGroup}
        groupBusy={groupBusy}
      />
      <StepsSection />
      <FeaturesSection onVoiceMode={onVoiceMode} onCta={scrollToComposer} />
    </div>
  );
}

/* ---------------------------------------------------------------
   الهيرو: الوعد بأكبر خط في الموقع، وجنبه معاينة حية للمنتج —
   بطاقتا سؤال وحكم تطفوان فوق بعض. المعاينة تبيع الفكرة أسرع
   من أي فقرة شرح.
   --------------------------------------------------------------- */
function Hero({ onCta }) {
  return (
    <section className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pb-22 pt-14 sm:px-6 sm:pt-18 lg:grid-cols-[7fr_5fr] lg:gap-8">
      <Reveal className="flex flex-col items-start gap-6">
        {/* نصف العنوان بتدرّج المزاج: الجملة تبدأ حبراً وتنتهي لوناً،
            فتقع الغاية نفسها («قرار محسوب») في الضوء لا الحالة */}
        <h1 className="display text-5xl font-bold sm:text-6xl lg:text-[4.5rem]">
          حوّل التردّد <br aria-hidden />
          <span className="grad-text">إلى قرار محسوب.</span>
        </h1>

        {/* بلا أرقام مُختلقة: قاعدة المشروع أن الأرقام تُحسب لا تُكتب.
            وبلا «بعيدًا عن العاطفة» — المزاج مُدخَل يغيّر الأوزان في
            weightsFor()، فنفيُه على الشاشة ادّعاء يكذّبه المحرّك */}
        <p className="max-w-xl text-lg leading-relaxed text-muted sm:text-xl">
          منظومة تحليل منطقي تُقيّم خياراتك المتباينة بناءً على أوزان وأولويات
          تحددها بنفسك، لتصل إلى الخيار الأنسب.
        </p>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="button"
            onClick={onCta}
            className="action flex items-center gap-2 rounded-full px-8 py-4 text-lg font-semibold transition-all active:translate-y-px"
          >
            بدء التحليل المنطقي
            <ArrowLeft size={20} />
          </button>
          <Link
            href="/how"
            className="glass rounded-full border border-line-strong bg-white/50 px-6 py-4 font-medium transition-colors hover:border-ink"
          >
            منهجية التقييم الموزون
          </Link>
        </div>
      </Reveal>

      {/* المعاينة: سؤال زجاجي وحكم حبري يركب على زاويته السفلية.
          الحكم مطلق الموضع، فالحاوية تحجز له فراغاً تحتها حتى ما
          يبلع شرائح الخيارات.

          والمعاينة تحسم نفسها مرة واحدة عند التحميل بدل ما تُعرض
          محسومة: «سوشي» يمتلئ حبراً ثم يطلع الحكم. الحبر هو نفسه
          امتلاء ‎Choice‎ حين يختار المستخدم — فالزائر يشوف القاعدة
          قبل ما يقرأ عنها. التوقيت في ‎--at‎ لأن ترتيب المشهد يُقرأ
          هنا دفعة واحدة، لا موزّعاً على أصناف في ملف آخر */}
      <Reveal
        delay={150}
        className="relative mx-auto hidden w-full max-w-sm pb-24 sm:block lg:max-w-none"
      >
        <div
          aria-hidden
          className="floaty glass-deep rounded-[1.75rem] border border-line bg-card p-6 pb-10 shadow-[0_30px_60px_-30px_rgb(23_20_15/0.26),inset_0_1px_0_rgb(255_255_255/0.14)]"
          style={{ "--tilt": "2deg" }}
        >
          <p className="text-2xl font-bold">أين توجّه الميزانية التسويقية؟</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span
              className="demo-chip rounded-full border border-line-strong px-4 py-1.5 text-sm"
              style={{ "--at": "600ms" }}
            >
              الإعلانات الممولة
            </span>
            {/* المختار: أساسه ممتلئ، والحركة تأتيه من الحالة الفارغة */}
            <span
              className="demo-chip-picked rounded-full border border-ink bg-ink px-4 py-1.5 text-sm text-on-ink"
              style={{ "--at": "760ms", "--pick-at": "1440ms" }}
            >
              التسويق بالمحتوى
            </span>
          </div>
        </div>

        <div
          aria-hidden
          className="demo-verdict absolute bottom-0 left-2 w-[70%]"
          style={{ "--at": "1900ms" }}
        >
          <div
            className="floaty-slow ink-glass on-ink rounded-[1.5rem] p-5"
            style={{ "--tilt": "-3deg" }}
          >
            <p className="grad-text-on-ink text-xl font-bold">
              التسويق بالمحتوى.
            </p>
            <p className="mt-1 text-sm leading-relaxed text-on-ink-muted">
              عائده أبطأ ظهورًا، لكنه يتراكم ويستمر بعد توقّف الإنفاق.
            </p>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/* ---------------------------------------------------------------
   المؤلّف: هنا المنتج نفسه. لوح كتابة زجاجي ولوح أمثلة أفتح منه
   بخيط يفصلهما — الانقسام باقٍ والفرق صار في وزن الزجاج لا في
   قلب اللون.
   --------------------------------------------------------------- */
function ComposerSection({
  mood,
  setMood,
  frame,
  frameError,
  onOptionBlur,
  options,
  setOptions,
  onStart,
  onVoiceMode,
  onBreakdown,
  onGroup,
  groupBusy,
}) {
  const { stt } = useVoice();
  const [dictating, setDictating] = useState(false);
  const [dictationError, setDictationError] = useState(null);
  // مفتاح الرفض هو نص الخيارات وقت الرفض — تغيير الخيارات يرجّع
  // البانر لأن القرار صار غيره
  const [dismissedKey, setDismissedKey] = useState(null);
  const stopRef = useRef(() => {});

  useEffect(() => () => stopRef.current?.(), []);

  const filledLabels = options.map((o) => o.label.trim()).filter(Boolean);
  const filled = filledLabels.length;
  const ready = filled >= MIN_OPTIONS;

  // بانر التفكيك: كشف محلي بلا نداء، والدخول بيد المستخدم دائماً.
  // الفئة صارت تجي من الإطار لا من اختيار المستخدم، فقبل وصوله
  // تعمل استدلالات النص وحدها، وأول ما يصل تنضم إشارة «حياة».
  const oversizedKey = filledLabels.join("|");
  const showBreakdown =
    filled >= MIN_OPTIONS &&
    dismissedKey !== oversizedKey &&
    looksOversized(filledLabels, frame?.category ?? null);

  const update = (id, label) =>
    setOptions((prev) => prev.map((o) => (o.id === id ? { ...o, label } : o)));

  const add = () =>
    setOptions((prev) =>
      prev.length >= MAX_OPTIONS
        ? prev
        : [...prev, { id: crypto.randomUUID(), label: "" }],
    );

  const remove = (id) =>
    setOptions((prev) =>
      prev.length <= MIN_OPTIONS ? prev : prev.filter((o) => o.id !== id),
    );

  // الاقتراح يعبّي أول خانة فاضية إن وجدت، وإلا يضيف صفاً — نفس
  // سلوك الإملاء الصوتي، حتى ما يفاجأ المستخدم بترتيب مختلف
  const addWithLabel = (label) =>
    setOptions((prev) => {
      if (prev.length >= MAX_OPTIONS) return prev;
      const empty = prev.findIndex((o) => !o.label.trim());
      if (empty !== -1)
        return prev.map((o, i) => (i === empty ? { ...o, label } : o));
      return [...prev, { id: crypto.randomUUID(), label }];
    });

  const applyExample = (example) =>
    setOptions(example.options.map((label, i) => ({ id: `ex-${i}`, label })));

  const dictate = useCallback(() => {
    if (!stt || dictating) return;
    setDictationError(null);
    setDictating(true);

    stopRef.current = listenOnce({
      onResult: (text) => {
        setDictating(false);
        const spoken = parseSpokenOptions(text, { max: MAX_OPTIONS });
        if (!spoken.length) {
          setDictationError("ما التقطت خيارات — عيد أو اكتبها.");
          return;
        }
        setOptions((prev) => {
          const next = [...prev];
          for (const label of spoken) {
            const empty = next.findIndex((o) => !o.label.trim());
            if (empty !== -1) next[empty] = { ...next[empty], label };
            else if (next.length < MAX_OPTIONS)
              next.push({ id: crypto.randomUUID(), label });
          }
          return next;
        });
      },
      onError: (code) => {
        setDictating(false);
        setDictationError(
          code === "not-allowed"
            ? "الميكروفون ممنوع — اكتب خياراتك بدل الإملاء."
            : "ما سمعت شي — عيد أو اكتبها.",
        );
      },
    });
  }, [stt, dictating, setOptions]);

  // اختصار حرف M
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || e.target?.isContentEditable)
        return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.toLowerCase() === "m") {
        e.preventDefault();
        dictate();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dictate]);

  // شريحة الفئة والمزاج — نفس الهيكل، فدالة واحدة تكفي
  const chip = (active) =>
    "flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm transition-all " +
    (active
      ? "bg-ink text-on-ink"
      : "border border-line-strong bg-white/50 text-ink hover:border-ink hover:bg-white/75");

  return (
    <section
      id="how"
      className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 py-20 sm:px-6"
    >
      <Reveal>
        <div className="panel-shadow grid overflow-hidden rounded-[2rem] border border-line lg:grid-cols-[3fr_2fr]">
          {/* ------------ لوح الكتابة ------------ */}
          <div className="glass-deep flex flex-col gap-7 bg-card p-6 sm:p-10 lg:p-12">
            <header className="flex flex-col gap-2.5">
              <h2 className="display text-3xl font-bold sm:text-[2.4rem]">
                أدخل الخيارات واشرع في التحليل
              </h2>
              {/* «الخيارين» في المقترح كانت تقفلها على اثنين، والحدّ
                  الأعلى ‎MAX_OPTIONS = 5‎ — فالصياغة تُبقيها مفتوحة */}
              <p className="text-sm leading-relaxed text-muted">
                ضع خياراتك المتاحة، وسيطرح النظام أسئلة تقييمية موزونة لقياس
                تفوّق أحدها منطقيًا.
              </p>
            </header>

            {/* سطر تحت الكلام لا صندوق حوله — نفس حقول شاشة الدخول،
                وهو اللي يخلي الصفحة تبان ورقة تُملأ */}
            <ul className="flex flex-col gap-4">
              {options.map((o, i) => (
                <li key={o.id} className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="w-4 shrink-0 text-lg font-bold text-muted-soft"
                  >
                    {ORDINALS[i]}
                  </span>
                  <Field
                    value={o.label}
                    onChange={(e) => update(o.id, e.target.value)}
                    onBlur={onOptionBlur}
                    placeholder={`الخيار ${ORDINALS[i]}`}
                    aria-label={`الخيار رقم ${i + 1}`}
                    maxLength={60}
                  />
                  {options.length > MIN_OPTIONS && (
                    <button
                      type="button"
                      onClick={() => remove(o.id)}
                      aria-label={`احذف الخيار رقم ${i + 1}`}
                      className="shrink-0 rounded-full px-1.5 text-xl leading-none text-muted-soft transition-colors hover:text-ink"
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ul>

            <ThirdOptionHint options={filledLabels} onPick={addWithLabel} />

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted">
              {options.length < MAX_OPTIONS && (
                <button
                  type="button"
                  onClick={add}
                  className="flex items-center gap-1.5 transition-colors hover:text-ink"
                >
                  <Plus size={16} />
                  أضف خيارًا {options.length === 2 ? "ثالثًا" : "آخر"}
                </button>
              )}
              {stt && (
                <button
                  type="button"
                  onClick={dictate}
                  disabled={dictating}
                  aria-label="أملِ خياراتك بالصوت — اختصار حرف M"
                  className="flex items-center gap-1.5 transition-colors hover:text-ink disabled:opacity-50"
                >
                  <Mic size={16} />
                  {dictating ? "أسمعك…" : "أملِ بالصوت"}
                </button>
              )}
              <button
                type="button"
                onClick={onVoiceMode}
                aria-label="وضع المحادثة الصوتية — اختصار حرف V"
                className="flex items-center gap-1.5 transition-colors hover:text-ink"
              >
                <Headphones size={16} />
                محادثة صوتية
              </button>
            </div>

            {dictationError && (
              <p
                role="status"
                className="flex items-center gap-1.5 text-sm text-muted"
              >
                <TriangleAlert size={15} />
                {dictationError}
              </p>
            )}

            {/* المزاج وحده بقي هنا. «نوع القرار» انحذف لأن سؤاله بعد ما
                كتب المستخدم خياريه اعترافٌ بأننا ما قرأناهما — والنموذج
                يستنتج الفئة من النصّين. المزاج يبقى لأنه لا يُستنتج:
                لا أحد يعرف مزاجك إلا أنت، وهو اختياري أصلاً. */}
            <div className="flex flex-col gap-5 border-t border-line pt-6">
              <fieldset>
                <legend className="mb-2.5 text-sm text-muted">مزاجك</legend>
                <div className="flex flex-wrap gap-2">
                  {MOODS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMood(mood === m.id ? null : m.id)}
                      aria-pressed={mood === m.id}
                      className={chip(mood === m.id)}
                    >
                      <MoodIcon moodId={m.id} size={16} />
                      {m.label}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>

            {showBreakdown && (
              <div className="flex flex-col gap-3 rounded-2xl bg-accent-soft p-4">
                <p className="flex items-start gap-2.5 text-sm leading-relaxed">
                  <Scale
                    size={17}
                    className="mt-0.5 shrink-0 text-accent-strong"
                  />
                  هذا يشبه قرارات المصير — ما ينحسم بمزاج اليوم. نفكه لك
                  لفحوصات صغيرة لها جواب، وبعدها الحكم؟
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={onBreakdown}
                    className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-on-ink transition-opacity hover:opacity-90"
                  >
                    فكّه أول
                  </button>
                  <button
                    type="button"
                    onClick={() => setDismissedKey(oversizedKey)}
                    className="text-sm text-muted underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink"
                  >
                    لا، كمّل عادي
                  </button>
                </div>
              </div>
            )}

            {/* فشل الإطار خطأ صريح لا قالب بديل: بدونه ما فيه أسئلة
                ولا معايير، وسؤال مصنوع يتنكّر كمولَّد أسوأ من لا شيء */}
            {frameError && (
              <p
                role="alert"
                className="flex items-start gap-2.5 rounded-2xl bg-accent-soft p-4 text-sm leading-relaxed"
              >
                <TriangleAlert
                  size={17}
                  className="mt-0.5 shrink-0 text-accent-strong"
                />
                {/* الرسالة تجي من المسار كاملةً بإرشادها — و«انتظر
                    دقيقة» عند تجاوز السقف يناقضها ذيلٌ يقول «جرّب
                    مرة ثانية» */}
                {frameError}
              </p>
            )}

            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={onStart}
                disabled={!ready}
                className="action flex w-full items-center justify-center gap-2 rounded-full px-6 py-4 text-lg font-semibold transition-all active:translate-y-px"
              >
                نفّذ التحليل
                <ArrowLeft size={20} />
              </button>

              {/* القرار المشترك أعقد من الفردي: تتعدد المعايير بتعدد
                  أصحابها. الرابط للمجموعة، والتصويت مرجَّح بالوزن. */}
              <button
                type="button"
                onClick={onGroup}
                disabled={!ready || groupBusy}
                className="flex w-full items-center justify-center gap-2 rounded-full border border-line-strong px-6 py-3 font-medium transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Users size={18} />
                {groupBusy ? "… يُجهَّز الرابط" : "تحليل جماعي — تصويت مرجَّح"}
              </button>

              <p className="text-center text-xs text-muted-soft">
                {ready
                  ? "لا يُحفظ القرار إلا بطلبك. البيانات ملكك."
                  : hindi(`أدخل ${MIN_OPTIONS} خيارات على الأقل.`)}
              </p>
            </div>
          </div>

          {/* ------------ لوح الأمثلة ------------
              زجاج أفتح من لوح الكتابة وخيط بينهما: الانقسام يُقرأ من
              فرق الوزن لا من قلب اللون */}
          <aside
            id="examples"
            className="glass flex flex-col gap-8 border-line p-6 sm:p-10 lg:border-s lg:p-12"
            style={{
              backgroundImage:
                "linear-gradient(200deg, rgb(255 255 255 / 0.74), rgb(255 255 255 / 0.5))",
            }}
          >
            {/* فوق المنتصف بقليل — المنتصف الهندسي يبان نازلاً للعين */}
            <div className="my-auto flex flex-col gap-6 lg:-translate-y-4">
              <h3 className="display text-2xl font-bold sm:text-3xl">
                نماذج جاهزة للتحليل
              </h3>
              <p className="text-sm leading-relaxed text-muted">
                اختر نموذجًا يُعبَّأ تلقائيًا، ثم عدّله بما يناسب حالتك.
              </p>

              <div className="flex flex-col gap-1">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex.label}
                    type="button"
                    onClick={() => applyExample(ex)}
                    className="group -mx-3 flex items-center gap-3 rounded-xl px-3 py-3 text-start transition-colors hover:bg-ink/5"
                  >
                    <ex.icon size={19} className="shrink-0 text-accent" />
                    <span className="text-[1.05rem]">{ex.label}</span>
                    <ArrowLeft
                      size={16}
                      className="mr-auto shrink-0 text-muted-soft opacity-0 transition-opacity group-hover:opacity-100"
                    />
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </Reveal>
    </section>
  );
}

/* ---------------------------------------------------------------
   الخطوات الثلاث — أرقام هندية ضخمة بتدرّج متدرّج المحطات،
   تنكشف بالتتابع.
   --------------------------------------------------------------- */
function StepsSection() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <Reveal className="mb-10">
        <h2 className="display text-3xl font-bold sm:text-4xl">
          ثلاث مراحل حتى القرار.
        </h2>
      </Reveal>

      <div className="grid gap-6 md:grid-cols-3">
        {STEPS.map((step, i) => (
          <Reveal key={step.number} delay={i * 120}>
            <div className="glass flex h-full flex-col gap-3 rounded-[1.75rem] border border-line bg-card p-7 shadow-[inset_0_1px_0_rgb(255_255_255/0.1)] transition-all hover:-translate-y-1 hover:shadow-[0_18px_40px_-24px_rgb(23_20_15/0.3)]">
              <span
                aria-hidden
                className="grad-text display text-5xl font-bold"
                style={{
                  fontFamily:
                    "var(--font-heading), var(--font-arabic), sans-serif",
                  backgroundImage: step.gradient,
                }}
              >
                {step.number}
              </span>
              <h3 className="text-xl font-bold">{step.title}</h3>
              <p className="text-sm leading-relaxed text-muted">{step.sub}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------
   الميزات — ست بطاقات، كل وحدة توديك لمكانها: الصوتية تفتح
   المحادثة، والخطة والتحليل صفحات، والبقية ترجعك للمؤلّف.

   قرص الأيقونة ياخذ تدرّجه من بقعتين من بقع الشفق، فتختلف الستة
   عن بعض ويبقى الجميع داخل عائلة المزاج. لون الأيقونة نفسها ثابت
   على --accent-strong: لو تبع كل قرص لونه، صار تباين النص رهاناً
   على ست قيم بدل قيمة واحدة مضمونة.
   --------------------------------------------------------------- */

// كل زوج: [بقعة البداية، بقعة النهاية] — ودورة تخلي المتجاورين
// ما يتشابهون
const BADGES = [
  ["var(--glow)", "var(--mesh-4)"],
  ["var(--mesh-4)", "var(--mesh-3)"],
  ["var(--mesh-3)", "var(--mesh-2)"],
  ["var(--mesh-2)", "var(--mesh-1)"],
  ["var(--glow)", "var(--mesh-2)"],
  ["var(--mesh-4)", "var(--glow)"],
];

const badgeStyle = (i) => {
  const [from, to] = BADGES[i % BADGES.length];
  return {
    backgroundImage: `linear-gradient(140deg, rgb(${from} / 0.32), rgb(${to} / 0.28))`,
  };
};

function FeaturesSection({ onVoiceMode, onCta }) {
  const features = [
    {
      icon: Users,
      title: "التصويت المرجَّح",
      sub: "رابط واحد، يصوّت كل طرف من جهازه، وتُحتسب النتيجة لحظيًا.",
      onClick: onCta,
    },
    {
      icon: Scale,
      title: "تفكيك القرارات الكبرى",
      sub: "القرار المصيري يُجزَّأ إلى فحوص صغيرة لكل منها جواب محدد.",
      onClick: onCta,
    },
    {
      icon: Brain,
      title: "نمطك في اتخاذ القرار",
      sub: "قراءة إحصائية لسجلّك: ما تؤجّله، ومتى تتردد، وما تعود عنه.",
      href: "/#history",
    },
    {
      icon: Headphones,
      title: "الجلسة الصوتية",
      sub: "حوار منطوق: يطرح النظام أسئلة التقييم ويعرض التوصية صوتيًا.",
      onClick: onVoiceMode,
    },
    {
      icon: Clock,
      title: "جدولة اليوم",
      sub: "قرارات اليوم مجتمعة تُرتَّب مرة واحدة في خطة قابلة للتنفيذ.",
      href: "/plan",
    },
    {
      icon: Activity,
      title: "تحليل المخاطر",
      sub: "تقدير أسوأ السيناريوهات واحتمالها، بدل قلق غير محدَّد المعالم.",
      href: "/analyze",
    },
  ];

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-12 pb-20 sm:px-6">
      <Reveal className="mb-10">
        <h2 className="display text-3xl font-bold sm:text-4xl">
          لكل نوع من التردد أداة تقابله.
        </h2>
      </Reveal>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f, i) => {
          const Icon = f.icon;
          const inner = (
            <>
              <span
                className="flex h-12 w-12 items-center justify-center rounded-full border border-line text-accent-strong"
                style={badgeStyle(i)}
              >
                <Icon size={22} />
              </span>
              <span className="text-lg font-bold">{f.title}</span>
              <span className="text-sm leading-relaxed text-muted">
                {f.sub}
              </span>
            </>
          );
          const cardClass =
            "glass group flex h-full flex-col items-start gap-3 rounded-[1.75rem] border border-line bg-card p-7 text-start transition-all hover:-translate-y-1 hover:shadow-[0_18px_40px_-24px_rgb(23_20_15/0.35)]";

          return (
            <Reveal key={f.title} delay={(i % 3) * 120}>
              {f.href ? (
                <Link href={f.href} className={cardClass}>
                  {inner}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={f.onClick}
                  className={cardClass + " w-full"}
                >
                  {inner}
                </button>
              )}
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
