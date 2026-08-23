"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { decisionService } from "@/lib/services/decisions";
import { useScreenAnnounce } from "@/lib/voice/VoiceProvider";
import {
  GhostButton,
  PrimaryButton,
  Progress,
  QuietButton,
  SectionHeading,
} from "./ui";
import {
  ArrowRight,
  Check,
  CircleCheck,
  Lightbulb,
  Scale,
  TriangleAlert,
  Trophy,
} from "./icons";

// نعم تدعم "favors" كاملة، تقريباً نصفها — والحساب كله عند النموذج
// وقت الحكم؛ هذي القيم للعرض فقط
const ANSWER_CHOICES = ["نعم", "تقريباً", "لا"];

/**
 * تفكيك القرار الكبير: فحوصات صغيرة لها جواب اليوم، ثم حكم مركّب
 * منها — "أقدِم" أو "التأجيل أنسب، وهذا ما ينقصك".
 *
 * والتأجيل ليس رفضاً بل ترتيباً: قائمة النواقص تحوّل الحيرة
 * المعلقة إلى طريق له محطات.
 */
export default function BreakdownFlow({ options, categoryId, onCancel, onRestart }) {
  const [phase, setPhase] = useState("loading"); // loading | error | asking | composing | verdict
  const [questions, setQuestions] = useState([]);
  const [smallReason, setSmallReason] = useState(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [verdict, setVerdict] = useState(null);
  const [error, setError] = useState(null);
  const [saveState, setSaveState] = useState(null);
  const abort = useRef(null);
  const headingRef = useRef(null);

  useEffect(() => () => abort.current?.abort(), []);

  // التنقل الداخلي ما يمر على page.js — ننقل التركيز بأنفسنا
  useEffect(() => {
    headingRef.current?.focus();
  }, [phase, index]);

  // عدّاد المحاولة هو مشغّل الجلب: الأثر يجلب فقط، وكل setState
  // يعيش في .then — التصفير المتزامن داخل أثر يسبب رندراً متتالياً
  // (نفس درس PatternsCard)
  const [attempt, setAttempt] = useState(0);
  const optionsKey = options.join("|");

  useEffect(() => {
    const controller = new AbortController();
    abort.current = controller;

    fetch("/api/breakdown", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phase: "questions", options: optionsKey.split("|") }),
      signal: controller.signal,
    })
      .then(async (res) => ({ res, payload: await res.json().catch(() => null) }))
      .then(({ res, payload }) => {
        if (controller.signal.aborted) return;

        if (!res.ok || !payload?.ok) {
          setError(payload?.error ?? "تعذّر تفكيك القرار. أعد المحاولة.");
          setPhase("error");
          return;
        }

        // النموذج حكم إنه قرار عادي — نقولها ونرجّعه للمسار العادي
        // بدل ما نمثّل عليه إن قراره أكبر مما هو
        if (!payload.oversized) {
          setSmallReason(payload.reason || "هذا قرار يتحسم مباشرة.");
          setPhase("error");
          return;
        }

        setQuestions(payload.questions);
        setAnswers({});
        setIndex(0);
        setPhase("asking");
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        console.error("[breakdown] questions failed:", err);
        setError("ما وصلنا للخادم — تأكد من اتصالك.");
        setPhase("error");
      });

    return () => controller.abort();
  }, [optionsKey, attempt]);

  const retry = () => {
    setPhase("loading");
    setError(null);
    setSmallReason(null);
    setAttempt((a) => a + 1);
  };

  const compose = useCallback(
    async (finalAnswers) => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      setPhase("composing");
      setError(null);

      try {
        const res = await fetch("/api/breakdown", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phase: "verdict",
            options,
            answers: questions.map((q) => ({
              label: q.label,
              answer: finalAnswers[q.key],
              favors: q.favors,
            })),
          }),
          signal: controller.signal,
        });
        const payload = await res.json().catch(() => null);
        if (controller.signal.aborted) return;

        if (!res.ok || !payload?.ok) {
          setError(payload?.error ?? "تعذّر تركيب الحكم. أعد المحاولة.");
          setPhase("error");
          return;
        }

        setVerdict(payload);
        setPhase("verdict");

        // الحفظ بعد العرض — المستخدم ما ينتظره. قرارات المصير أولى
        // القرارات بالسجل: سؤال "كان قرار صح؟" بعد شهر يصير له معنى.
        setSaveState({ status: "saving" });
        decisionService
          .saveDecision({
            categoryId: categoryId ?? "life",
            options,
            chosen: payload.chosen,
            reason: payload.headline,
            answers: finalAnswers,
          })
          .then((saved) =>
            setSaveState(
              saved.ok
                ? { status: "saved" }
                : { status: "failed", message: saved.message },
            ),
          )
          .catch(() => setSaveState({ status: "failed", message: "تعذر الحفظ." }));
      } catch (err) {
        if (err.name === "AbortError") return;
        console.error("[breakdown] verdict failed:", err);
        setError("ما وصلنا للخادم — تأكد من اتصالك.");
        setPhase("error");
      }
    },
    [options, questions, categoryId],
  );

  const answer = (value) => {
    const q = questions[index];
    const next = { ...answers, [q.key]: value };
    setAnswers(next);
    if (index + 1 < questions.length) setIndex(index + 1);
    else compose(next);
  };

  const back = () => {
    if (index === 0) onCancel();
    else setIndex(index - 1);
  };

  const question = questions[index];
  useScreenAnnounce(
    phase === "asking" && question ? question.label : "",
  );

  // ---------- الهيكل أثناء التوليد ----------
  if (phase === "loading" || phase === "composing") {
    return (
      <div className="flex flex-col gap-6">
        <SectionHeading
          title={phase === "loading" ? "نفك قرارك…" : "نركب الحكم…"}
          sub={
            phase === "loading"
              ? "نحوّل السؤال الكبير لفحوصات صغيرة لها جواب اليوم."
              : "نقرأ إجاباتك ونطلع لك الخلاصة."
          }
        />
        <div className="flex flex-col gap-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-2xl bg-card-sunken"
              style={{ opacity: 1 - i * 0.25 }}
            />
          ))}
        </div>
      </div>
    );
  }

  // ---------- فشل أو "قرارك عادي" ----------
  if (phase === "error") {
    return (
      <div className="flex flex-col items-start gap-4">
        <h2 tabIndex={-1} ref={headingRef} data-step-heading className="sr-only">
          {smallReason ? "قرار عادي" : "تعذر التفكيك"}
        </h2>
        <p role="alert" className="flex items-start gap-2 text-muted">
          {smallReason ? (
            <Scale size={18} className="mt-0.5 shrink-0" />
          ) : (
            <TriangleAlert size={18} className="mt-0.5 shrink-0" />
          )}
          {smallReason ?? error}
        </p>
        <div className="flex flex-wrap gap-2">
          {smallReason ? (
            <PrimaryButton onClick={onCancel}>احسمه بالطريقة العادية</PrimaryButton>
          ) : (
            <>
              <PrimaryButton onClick={retry}>جرب مرة ثانية</PrimaryButton>
              <GhostButton onClick={onCancel}>رجوع</GhostButton>
            </>
          )}
        </div>
      </div>
    );
  }

  // ---------- الفحوصات ----------
  if (phase === "asking" && question) {
    return (
      <div className="flex flex-col gap-8">
        <Progress current={index + 1} total={questions.length} />

        <header className="flex flex-col gap-2">
          <h2
            tabIndex={-1}
            ref={headingRef}
            data-step-heading
            className="display text-3xl font-bold sm:text-4xl"
          >
            {question.label}
          </h2>
          {question.why && (
            <p className="text-sm text-muted">{question.why}</p>
          )}
        </header>

        <div
          role="radiogroup"
          aria-label={question.label}
          className="flex flex-col gap-2"
        >
          {ANSWER_CHOICES.map((choice) => (
            <button
              key={choice}
              type="button"
              role="radio"
              aria-checked={answers[question.key] === choice}
              onClick={() => answer(choice)}
              className={
                "rounded-2xl border px-5 py-4 text-start text-lg transition-all " +
                (answers[question.key] === choice
                  ? "border-ink bg-ink text-on-ink"
                  : "border-line-strong hover:-translate-y-0.5 hover:border-ink hover:bg-card-sunken")
              }
            >
              {choice}
            </button>
          ))}
        </div>

        <QuietButton onClick={back} className="flex items-center gap-1.5 self-start">
          <ArrowRight size={15} />
          رجوع
        </QuietButton>
      </div>
    );
  }

  // ---------- الحكم ----------
  if (phase === "verdict" && verdict) {
    const go = verdict.verdict === "go";
    return (
      <div className="flex flex-col gap-7">
        <header className="flex flex-col gap-2">
          <p className="text-sm text-muted">{go ? "الظروف ناضجة" : "التأجيل أنسب — ولها طريق"}</p>
          <h2
            tabIndex={-1}
            ref={headingRef}
            data-step-heading
            className="display text-3xl font-bold sm:text-4xl"
          >
            {verdict.headline}
          </h2>
        </header>

        <p className="flex items-center gap-2 self-start rounded-2xl bg-card-sunken px-4 py-2.5 font-medium">
          <Trophy size={17} className="shrink-0 text-accent-strong" />
          {verdict.chosen}
        </p>

        <p className="leading-relaxed text-muted">{verdict.detail}</p>

        {verdict.missing.length > 0 && (
          <section className="rounded-2xl border border-dashed border-line-strong p-5">
            <h3 className="flex items-center gap-1.5 font-semibold">
              <Check size={17} className="shrink-0 text-accent-strong" />
              اللي يقلبها لـ«اقدم»
            </h3>
            <ul className="mt-3 flex flex-col gap-2">
              {verdict.missing.map((m) => (
                <li key={m} className="flex items-start gap-2 text-sm leading-relaxed">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  {m}
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="glow-sm flex items-start gap-2 rounded-2xl bg-accent px-5 py-4 leading-relaxed text-accent-ink">
          <Lightbulb size={18} className="mt-1 shrink-0" />
          <span>
            <span className="font-semibold">خطوتك هالأسبوع: </span>
            {verdict.nextStep}
          </span>
        </p>

        {saveState && (
          <p role="status" className="flex items-center gap-1.5 text-sm text-muted">
            {saveState.status === "saving" && "… يحفظ في سجلك"}
            {saveState.status === "saved" && (
              <>
                <CircleCheck size={15} />
                انحفظ في سجلك — بنسألك عنه بعدين
              </>
            )}
            {saveState.status === "failed" && (
              <>
                <TriangleAlert size={15} />
                {saveState.message}
              </>
            )}
          </p>
        )}

        <div className="flex items-center justify-between gap-3">
          <GhostButton onClick={onCancel} className="flex items-center gap-1.5">
            <ArrowRight size={16} />
            عدّل خياراتك
          </GhostButton>
          <PrimaryButton onClick={onRestart}>قرار جديد</PrimaryButton>
        </div>
      </div>
    );
  }

  return null;
}
