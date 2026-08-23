"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SiteNav from "../components/SiteNav";
import SiteFooter from "../components/SiteFooter";
import PlanTimeline from "../components/plan/PlanTimeline";
import {
  Card,
  Choice,
  GhostButton,
  PrimaryButton,
  SectionHeading,
  Tag,
  hindi,
} from "../components/ui";
import {
  Check,
  GroupIcon,
  MapPin,
  RefreshCw,
  VibeIcon,
} from "../components/icons";
import {
  BUDGETS,
  DEFAULT_RADIUS_KM,
  DURATIONS,
  GROUPS,
  MAX_RADIUS_KM,
  MIN_RADIUS_KM,
  VIBES,
} from "@/lib/plan/config";

// وقت ثابت كقيمة أولية بدل new Date(): لو حسبناه وقت الرندر يختلف
// ما يولّده الخادم عن المتصفح ويطلع تحذير hydration.
const DEFAULT_START = "16:00";

// YYYY-MM-DD بالتوقيت المحلي للمستخدم. toISOString يحوّل لـ UTC،
// فيعطي يوم أمس لمن يخرج بعد منتصف الليل بتوقيت شرق غرينتش.
function todayLocal() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export default function PlanPage() {
  const [coords, setCoords] = useState(null);
  const [locationQuery, setLocationQuery] = useState("");
  const [locating, setLocating] = useState(false);
  const [geoDenied, setGeoDenied] = useState(false);

  const [startTime, setStartTime] = useState(DEFAULT_START);
  const [durationHours, setDurationHours] = useState(5);
  const [groupId, setGroupId] = useState("friends");
  const [budgetId, setBudgetId] = useState("medium");
  const [vibeId, setVibeId] = useState("chill");
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [excluded, setExcluded] = useState([]);

  const abortRef = useRef(null);
  const resultRef = useRef(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  // التركيز ينتقل لعنوان الخطة أول ما تجهز — بدونه يبقى مستخدم قارئ
  // الشاشة على الزر ولا يدري أن شيئاً ظهر تحته
  useEffect(() => {
    if (result) resultRef.current?.querySelector("[data-step-heading]")?.focus();
  }, [result]);

  const locate = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoDenied(true);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setGeoDenied(false);
        setLocating(false);
      },
      (err) => {
        // الرفض ليس خطأً — نفتح الإدخال اليدوي ونكمل بدون ضجيج
        console.warn("[plan] geolocation unavailable:", err.message);
        setCoords(null);
        setGeoDenied(true);
        setLocating(false);
      },
      { timeout: 10000, maximumAge: 5 * 60 * 1000 },
    );
  }, []);

  const generate = useCallback(
    async (excludeIds) => {
      if (loading) return;
      if (!coords && !locationQuery.trim()) {
        setError("نحتاج موقعك — اضغط «حدّد موقعي» أو اكتب المدينة.");
        return;
      }

      setLoading(true);
      setError(null);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lat: coords?.lat ?? null,
            lng: coords?.lng ?? null,
            locationQuery: locationQuery.trim() || null,
            startTime,
            durationHours,
            date: todayLocal(),
            group: groupId,
            budget: budgetId,
            vibe: vibeId,
            radiusKm,
            excludePlaceIds: excludeIds,
          }),
          signal: controller.signal,
        });

        const payload = await res.json().catch(() => null);

        if (!res.ok || !payload?.ok) {
          setError(payload?.error ?? `تعذر بناء الخطة (${res.status})`);
          setResult(null);
          return;
        }

        setResult(payload);
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("[plan] request failed:", err);
          setError("تعذّر الوصول إلى الخادم. تحقق من اتصالك.");
        }
      } finally {
        setLoading(false);
        abortRef.current = null;
      }
    },
    [
      loading,
      coords,
      locationQuery,
      startTime,
      durationHours,
      groupId,
      budgetId,
      vibeId,
      radiusKm,
    ],
  );

  const submit = (e) => {
    e.preventDefault();
    setExcluded([]);
    generate([]);
  };

  const regenerate = () => generate(excluded);

  const swap = (stop) => {
    const next = [...excluded, stop.place_id];
    setExcluded(next);
    generate(next);
  };

  const hasLocation = Boolean(coords) || locationQuery.trim().length > 0;

  return (
    <>
      <SiteNav />

      <main
        id="main"
        className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14"
      >
        <SectionHeading
          title="ابنِ لك خطة يوم كاملة"
          sub="نجيب الأماكن المفتوحة حولك، نرتّبها لتقليل التنقّل، ونحسب وقت الطريق بين كل محطة."
        />

        {/* ——— الإدخال ——— */}
        <form onSubmit={submit}>
          <Card className="mt-6 flex flex-col gap-6">
            {/* الموقع */}
            <fieldset className="flex flex-col gap-3">
              <legend className="font-semibold">وين أنت؟</legend>

              <div className="flex flex-wrap items-center gap-3">
                <GhostButton
                  onClick={locate}
                  disabled={locating || loading}
                  className="flex items-center gap-1.5"
                >
                  <MapPin size={15} />
                  {locating ? "نحدد…" : coords ? "تم تحديد موقعك" : "حدّد موقعي"}
                  {coords && !locating && <Check size={15} />}
                </GhostButton>

                {coords && (
                  <button
                    type="button"
                    onClick={() => setCoords(null)}
                    className="text-sm text-muted underline-offset-4 hover:underline"
                  >
                    استخدم مدينة بدلاً منه
                  </button>
                )}
              </div>

              {!coords && (
                <>
                  <label htmlFor="location" className="text-sm text-muted">
                    {geoDenied
                      ? "ما وصلنا لموقعك — اكتب المدينة أو الحي:"
                      : "أو اكتب المدينة أو الحي:"}
                  </label>
                  <input
                    id="location"
                    value={locationQuery}
                    onChange={(e) => setLocationQuery(e.target.value)}
                    disabled={loading}
                    maxLength={120}
                    placeholder="مثال: حي النخيل، الرياض"
                    className="w-full border-0 border-b-2 border-line bg-transparent px-0.5 py-2.5 text-lg outline-none transition-colors placeholder:text-muted-soft focus:border-ink disabled:opacity-60"
                  />
                </>
              )}
            </fieldset>

            {/* الوقت والمدة */}
            <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
              <label className="flex flex-1 flex-col gap-1.5">
                <span className="font-semibold">متى تبدأ؟</span>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  disabled={loading}
                  className="w-full border-0 border-b-2 border-line bg-transparent px-0.5 py-2.5 text-lg outline-none transition-colors placeholder:text-muted-soft focus:border-ink disabled:opacity-60"
                />
              </label>

              <fieldset className="flex flex-1 flex-col gap-1.5">
                <legend className="font-semibold">كم ساعة؟</legend>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {DURATIONS.map((d) => (
                    <Choice
                      key={d.id}
                      selected={durationHours === d.id}
                      disabled={loading}
                      onClick={() => setDurationHours(d.id)}
                    >
                      {d.label}
                    </Choice>
                  ))}
                </div>
              </fieldset>
            </div>

            {/* المجموعة */}
            <fieldset className="flex flex-col gap-3">
              <legend className="font-semibold">مين معك؟</legend>
              <div className="flex flex-wrap gap-2">
                {GROUPS.map((g) => (
                  <Choice
                    key={g.id}
                    selected={groupId === g.id}
                    disabled={loading}
                    onClick={() => setGroupId(g.id)}
                    className="flex items-center gap-1.5"
                  >
                    <GroupIcon groupId={g.id} size={16} />
                    {g.label}
                  </Choice>
                ))}
              </div>
            </fieldset>

            {/* المزاج */}
            <fieldset className="flex flex-col gap-3">
              <legend className="font-semibold">وش المزاج؟</legend>
              <div className="flex flex-wrap gap-2">
                {VIBES.map((v) => (
                  <Choice
                    key={v.id}
                    selected={vibeId === v.id}
                    disabled={loading}
                    onClick={() => setVibeId(v.id)}
                    className="flex items-center gap-1.5"
                  >
                    <VibeIcon vibeId={v.id} size={16} />
                    {v.label}
                  </Choice>
                ))}
              </div>
            </fieldset>

            {/* الميزانية */}
            <fieldset className="flex flex-col gap-3">
              <legend className="font-semibold">الميزانية</legend>
              <div className="flex flex-wrap gap-2">
                {BUDGETS.map((b) => (
                  <Choice
                    key={b.id}
                    selected={budgetId === b.id}
                    disabled={loading}
                    onClick={() => setBudgetId(b.id)}
                  >
                    {b.label}
                  </Choice>
                ))}
              </div>
            </fieldset>

            {/* النطاق */}
            <label htmlFor="radius" className="flex flex-col gap-2">
              <span className="font-semibold">
                أبعد مسافة تروحها: {hindi(radiusKm)} كم
              </span>
              <input
                id="radius"
                type="range"
                min={MIN_RADIUS_KM}
                max={MAX_RADIUS_KM}
                step={1}
                value={radiusKm}
                onChange={(e) => setRadiusKm(Number(e.target.value))}
                disabled={loading}
                className="accent-[color:var(--accent)]"
              />
            </label>

            <div className="flex flex-wrap items-center gap-3">
              {/* type="submit" يتجاوز type="button" الافتراضي في
                  PrimaryButton لأن الـ props تُنشر بعده */}
              <PrimaryButton type="submit" disabled={loading || !hasLocation}>
                {loading ? "نبني خطتك…" : "ابنِ الخطة"}
              </PrimaryButton>
              {loading && (
                <GhostButton onClick={() => abortRef.current?.abort()}>
                  إيقاف
                </GhostButton>
              )}
              <span className="text-sm text-muted">يأخذ قرابة نصف دقيقة.</span>
            </div>
          </Card>
        </form>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-2xl border border-accent-strong bg-accent-soft p-4 text-sm text-accent-strong"
          >
            {error}
          </p>
        )}

        {loading && (
          <div className="mt-8 flex flex-col gap-3" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-28 animate-pulse rounded-2xl border border-line bg-card"
              />
            ))}
          </div>
        )}

        {/* ——— النتيجة ——— */}
        {!loading && result && (
          <div ref={resultRef} className="mt-10">
            {result.empty ? (
              <Card className="text-center">
                <h2
                  tabIndex={-1}
                  data-step-heading
                  className="text-xl font-semibold"
                >
                  ما طلعنا بخطة هالمرة
                </h2>
                <p className="mt-2 text-muted">{result.message}</p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  <GhostButton onClick={() => setRadiusKm(MAX_RADIUS_KM)}>
                    وسّع النطاق لأقصاه
                  </GhostButton>
                  <GhostButton onClick={() => setDurationHours(8)}>
                    خلّها يوم كامل
                  </GhostButton>
                </div>
              </Card>
            ) : (
              <>
                <PlanTimeline
                  plan={result.plan}
                  weather={result.weather}
                  onSwap={swap}
                  busy={loading}
                />

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <GhostButton
                    onClick={regenerate}
                    disabled={loading}
                    className="flex items-center gap-1.5"
                  >
                    <RefreshCw size={15} />
                    أعد التوليد
                  </GhostButton>
                  {/* اسم المكان عربي — الوسم الافتراضي lang="en" يخلي
                      قارئ الشاشة ينطقه بصوت إنجليزي */}
                  <Tag lang="ar">{result.origin?.label}</Tag>
                </div>

                {result.droppedStops > 0 && (
                  <p className="mt-3 text-xs text-muted">
                    استبعدنا {result.droppedStops} محطة اقترحها المولّد لأنها ما
                    كانت ضمن الأماكن الحقيقية القريبة منك.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </main>

      <SiteFooter />
    </>
  );
}
