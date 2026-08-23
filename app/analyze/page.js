"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SiteNav from "../components/SiteNav";
import SiteFooter from "../components/SiteFooter";
import { Card, PrimaryButton, GhostButton, SectionHeading, Tag } from "../components/ui";
import AgentTrail from "../components/analyze/AgentTrail";
import SwotGrid from "../components/analyze/SwotGrid";
import PathTree from "../components/analyze/PathTree";
import { Recommendation, Critique, Sources } from "../components/analyze/Verdict";
import { useAuth } from "@/lib/auth/AuthProvider";

const STEPS = [
  { id: "research", index: 1, label: "الباحث", en: "RESEARCH", note: "يبحث في السوق ويجمع الحقائق بمصادرها" },
  { id: "swot", index: 2, label: "محلل SWOT", en: "SWOT", note: "يبني التحليل الرباعي من الحقائق" },
  { id: "scenarios", index: 3, label: "باني السيناريوهات", en: "SCENARIOS", note: "يرسم المسارات وتفرّعاتها" },
  { id: "critic", index: 4, label: "المراجع النقدي", en: "CRITIQUE", note: "يراجع التحليل ويكشف الافتراضات الهشّة" },
  { id: "synthesis", index: 5, label: "المُركِّب", en: "VERDICT", note: "يوازن ويوصي" },
];

const EXAMPLES = [
  "أفتح فرع ثاني لمطعمي في جدة ولا أوسّع التوصيل في الرياض؟",
  "أستقيل من وظيفتي وأتفرغ لمشروعي ولا أشتغل عليه بالليل سنة أخرى؟",
  "أطلق تطبيقي باشتراك شهري ولا مجاني مع إعلانات؟",
];

// العربية تميّز المفرد والمثنى والجمع، و"٢ اعتراض" غلط.
// الجمع للأعداد ٣–١٠، ويعود للمفرد من ١١ فما فوق ("١١ مصدراً").
function count(n, one, two, few) {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n <= 10) return `${n} ${few}`;
  return `${n} ${one}`;
}

export default function AnalyzePage() {
  const { accessToken } = useAuth();

  const [statement, setStatement] = useState("");
  const [context, setContext] = useState("");
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState({});
  const [skipped, setSkipped] = useState({});
  const [current, setCurrent] = useState(null);
  const [failed, setFailed] = useState(null);
  const [detail, setDetail] = useState({});
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [notice, setNotice] = useState(null);

  const abortRef = useRef(null);
  const resultRef = useRef(null);

  // ينظّف الطلب لو غادر المستخدم الصفحة والتحليل شغّال
  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (result) resultRef.current?.querySelector("[data-step-heading]")?.focus();
  }, [result]);

  const handleEvent = useCallback((event) => {
    if (event.type === "agent_start") {
      setCurrent(event.agent);
      return;
    }

    if (event.type === "agent_done") {
      setCurrent(null);
      setDone((d) => ({ ...d, [event.agent]: true }));

      // تفصيلة صغيرة تطمّن المستخدم أن المرحلة أنتجت شيئاً فعلاً
      if (event.agent === "research") {
        const n = event.data?.sourceCount ?? 0;
        setDetail((d) => ({
          ...d,
          research: n
            ? count(n, "مصدر", "مصدران", "مصادر")
            : "ما رجع بمصادر — التقديرات بتكون أضعف",
        }));
      }
      if (event.agent === "scenarios") {
        const n = event.data?.paths?.length ?? 0;
        setDetail((d) => ({
          ...d,
          scenarios: count(n, "مسار", "مساران", "مسارات"),
        }));
      }
      if (event.agent === "critic") {
        const n = event.data?.challenges?.length ?? 0;
        setDetail((d) => ({
          ...d,
          critic: count(n, "اعتراض", "اعتراضان", "اعتراضات"),
        }));
      }
      return;
    }

    // المراجع النقدي وحده يُتخطّى بدل ما يُسقط الخط — الخط يكمل
    // والمرحلة تُعلَّم كمتخطّاة بدل مكتملة.
    if (event.type === "agent_skipped") {
      setCurrent(null);
      setSkipped((s) => ({ ...s, [event.agent]: true }));
      setDetail((d) => ({ ...d, [event.agent]: event.message }));
      return;
    }

    if (event.type === "fatal") {
      setFailed(event.agent ?? null);
      setError(event.message);
      setCurrent(null);
      return;
    }

    if (event.type === "done") {
      setResult(event.result);
      setNotice(event.saveError ?? event.savedHint ?? null);
    }
  }, []);

  const start = useCallback(async () => {
    if (!statement.trim() || running) return;

    setRunning(true);
    setDone({});
    setSkipped({});
    setDetail({});
    setFailed(null);
    setError(null);
    setResult(null);
    setNotice(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // accessToken دالة غير متزامنة، مو قيمة — لازم تُستدعى
      const token = await accessToken();
      const headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers,
        body: JSON.stringify({ statement, context }),
        signal: controller.signal,
      });

      // أخطاء ما قبل البث ترجع JSON عادي، مو تدفقاً
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "تعذّر بدء التحليل.");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // القراءة سطراً سطراً: قطعة الشبكة ممكن تنتهي بنص سطر،
      // فنحتفظ بالباقي للدورة الجاية بدل ما نحاول نحلله ناقصاً.
      for (;;) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            handleEvent(JSON.parse(trimmed));
          } catch {
            console.warn("[analyze] تعذّر تحليل سطر:", trimmed.slice(0, 120));
          }
        }
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("[analyze] failed:", err);
        setError("انقطع الاتصال أثناء التحليل.");
      }
    } finally {
      setRunning(false);
      setCurrent(null);
      abortRef.current = null;
    }
  }, [statement, context, accessToken, running, handleEvent]);

  const steps = STEPS.map((s) => ({
    ...s,
    done: Boolean(done[s.id]),
    skipped: Boolean(skipped[s.id]),
    detail: detail[s.id],
  }));

  const started = running || result || error;

  return (
    <>
      <SiteNav />

      <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <SectionHeading
          title="حلّل قراراً كبيراً قبل ما تاخذه"
          sub="خمسة وكلاء: واحد يبحث، واحد يبني SWOT، واحد يرسم المسارات، واحد يهاجمهم كلهم، وواحد يوصي."
        />

        {/* ——— الإدخال ——— */}
        <Card className="mt-6">
          <label htmlFor="statement" className="block font-semibold">
            وش القرار؟
          </label>
          <p className="mt-1 text-sm text-muted">
            كلما كان أوضح — سوق محدد، مبلغ، مدة — كان التحليل أدق.
          </p>
          <textarea
            id="statement"
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
            disabled={running}
            rows={3}
            maxLength={600}
            placeholder="مثال: أفتح فرع ثاني لمطعمي في جدة بميزانية ٤٠٠ ألف ريال؟"
            className="mt-3 w-full rounded-2xl border border-line bg-card-sunken p-4 leading-relaxed outline-none transition-colors placeholder:text-muted-soft focus:border-ink disabled:opacity-60"
          />

          <div className="mt-3 flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                disabled={running}
                onClick={() => setStatement(ex)}
                className="rounded-full border border-line-strong px-3 py-1.5 text-xs text-muted transition-colors hover:border-ink hover:text-ink disabled:opacity-40"
              >
                {ex}
              </button>
            ))}
          </div>

          <label htmlFor="context" className="mt-6 block font-semibold">
            سياق إضافي <span className="font-normal text-muted">(اختياري)</span>
          </label>
          <p className="mt-1 text-sm text-muted">
            أرقامك، قيودك، وما جرّبته قبل. الوكلاء يبنون عليه بدل ما يفترضون.
          </p>
          <textarea
            id="context"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            disabled={running}
            rows={3}
            maxLength={2000}
            placeholder="مثال: الفرع الحالي يحقق ٨٠ ألف شهريًا بهامش ٢٢٪، ولديّ طاقم جاهز، غير أن خبرتي بسوق جدة محدودة."
            className="mt-3 w-full rounded-2xl border border-line bg-card-sunken p-4 leading-relaxed outline-none transition-colors placeholder:text-muted-soft focus:border-ink disabled:opacity-60"
          />

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <PrimaryButton onClick={start} disabled={running || !statement.trim()}>
              {running ? "الوكلاء يشتغلون…" : "حلّل القرار"}
            </PrimaryButton>
            {running && (
              <GhostButton onClick={() => abortRef.current?.abort()}>
                إيقاف
              </GhostButton>
            )}
            <span className="text-sm text-muted">يأخذ قرابة دقيقة.</span>
          </div>
        </Card>

        {/* ——— التقدّم ——— */}
        {started && (
          <div className="mt-6">
            <div className="mt-2">
              <AgentTrail steps={steps} current={current} failed={failed} />
            </div>
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-2xl border border-accent-strong bg-accent-soft p-4 text-sm text-accent-strong"
          >
            {error}
          </p>
        )}

        {/* ——— النتيجة ——— */}
        {result && (
          <div ref={resultRef} className="mt-10 flex flex-col gap-6">
            <Recommendation recommendation={result.recommendation} />

            <div>
              <SectionHeading title="المسارات" />
              <div className="mt-4">
                <PathTree
                  paths={result.paths}
                  recommended={result.recommendation?.recommended_path}
                />
              </div>
            </div>

            <div>
              <SectionHeading title="التحليل الرباعي" />
              <div className="mt-4">
                <SwotGrid swot={result.swot} />
              </div>
            </div>

            <Critique
              challenges={result.challenges}
              skipped={result.criticSkipped}
            />
            <Sources sources={result.sources} findings={result.findings} />

            {notice && (
              <p className="rounded-2xl border border-line bg-card p-4 text-sm text-muted">
                {notice}
              </p>
            )}

            {/* تنويه لازم يبقى ظاهراً: الأداة دعم قرار، مو استشارة مالية */}
            <p className="rounded-2xl bg-card-sunken p-4 text-xs leading-relaxed text-muted">
              هذا التحليل أداة دعم قرار وليس استشارة مالية أو قانونية. الأرقام
              فيه تقديرات محسوبة من أحكام نوعية — راجع{" "}
              <span className="text-ink">«كيف انحسبت هذي الأرقام؟»</span>{" "}
              داخل كل مسار — ومو توقعات مبنية على نموذج مالي. تحقق من المصادر
              بنفسك قبل أي التزام مالي.
            </p>
          </div>
        )}
      </main>

      <SiteFooter />
    </>
  );
}
