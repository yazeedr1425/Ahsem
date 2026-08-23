"use client";

import { useEffect, useState } from "react";
import { getCategory } from "@/lib/engine/categories";
import { decisionService } from "@/lib/services/decisions";
import { useAuth } from "@/lib/auth/AuthProvider";
import OutcomeAsk from "./OutcomeAsk";
import PatternsCard from "./PatternsCard";
import { GhostButton } from "./ui";
import { ArrowLeft, CircleCheck, TriangleAlert } from "./icons";

// كان معروضاً ٣، وقراءة الأنماط تحتاج ٥ مقيَّمة — فما كان للمستخدم
// طريق يوصل فيه للعدد أصلاً. الزر يوسّع لباقي السجل.
const COMPACT_LIMIT = 6;
const FULL_LIMIT = 24;

// ‎-u-nu-arab‎ يفرض الأرقام الهندية — locale ‏"ar" وحدها تترك القرار
// للمنصة، وكروم على ويندوز يطلع أرقاماً لاتينية وسط الجملة العربية
const rtf = new Intl.RelativeTimeFormat("ar-u-nu-arab", { numeric: "auto" });

function relativeTime(iso) {
  if (!iso) return "";
  const diffMs = new Date(iso).getTime() - Date.now();
  const minutes = Math.round(diffMs / 60000);
  if (Math.abs(minutes) < 60) return rtf.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  return rtf.format(Math.round(hours / 24), "day");
}

export default function HistorySection({ onSignIn, refreshKey }) {
  const { user } = useAuth();
  // النتيجة موسومة بصاحبها حتى نشتق الحالة بدل ما نضبطها داخل effect
  const [fetched, setFetched] = useState(null);
  const [limit, setLimit] = useState(COMPACT_LIMIT);

  useEffect(() => {
    if (!user) return;

    let active = true;
    decisionService.recentDecisions(limit).then((result) => {
      if (!active) return;
      setFetched(
        result.ok
          ? { userId: user.id, status: "ready", decisions: result.decisions }
          : {
              userId: user.id,
              status: "error",
              decisions: [],
              message: result.message,
            },
      );
    });

    return () => {
      active = false;
    };
  }, [user, refreshKey, limit]);

  // تحديث محلي بعد تسجيل النتيجة — إعادة الجلب من الشبكة تومض البطاقات
  // كلها لأجل رقم واحد تغيّر
  const noteOutcome = (decisionId, satisfaction) =>
    setFetched((prev) =>
      prev
        ? {
            ...prev,
            decisions: prev.decisions.map((d) =>
              d.id === decisionId ? { ...d, satisfaction } : d,
            ),
          }
        : prev,
    );

  const state = !user
    ? { status: "anonymous", decisions: [] }
    : fetched?.userId === user.id
      ? fetched
      : { status: "loading", decisions: [] };

  return (
    <section id="history" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="display text-3xl font-bold sm:text-4xl">
          سجل القرارات
        </h2>
        {state.status === "ready" &&
          state.decisions.length >= COMPACT_LIMIT && (
            <GhostButton
              onClick={() =>
                setLimit((l) =>
                  l === COMPACT_LIMIT ? FULL_LIMIT : COMPACT_LIMIT,
                )
              }
              className="flex items-center gap-2"
            >
              <ArrowLeft size={16} />
              {limit === COMPACT_LIMIT ? "عرض السجل كامل" : "اعرض أقل"}
            </GhostButton>
          )}
      </div>

      {state.status === "anonymous" && (
        <div className="glass rounded-[var(--radius-card)] border border-dashed border-line-strong bg-card p-8 text-center">
          <p className="text-lg font-semibold">
            سجلك يبدأ بعد أول قرار تحفظه.
          </p>
          <p className="mt-1.5 text-sm text-muted">
            سجّل دخولك لتُحفظ قراراتك وتُستخلص منها أنماطك.
          </p>
          {/* أبيض لا حبر: الحبر هنا يزاحم بطاقة الأنماط الحبرية
              اللي تحتها في نفس القسم */}
          <GhostButton
            onClick={onSignIn}
            className="mt-5 bg-white/72 px-6 py-2.5 font-semibold"
          >
            دخول
          </GhostButton>
        </div>
      )}

      {state.status === "loading" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="glass h-36 animate-pulse rounded-[1.5rem] border border-line bg-card"
            />
          ))}
        </div>
      )}

      {state.status === "error" && (
        <p className="glass flex items-center gap-2 rounded-[1.5rem] border border-dashed border-line-strong bg-card p-5 text-sm text-muted">
          <TriangleAlert size={15} className="shrink-0" />
          تعذر جلب السجل. {state.message}
        </p>
      )}

      {state.status === "ready" && state.decisions.length === 0 && (
        <div className="glass rounded-[1.5rem] border border-dashed border-line-strong bg-card p-6 text-center text-sm text-muted">
          ما فيه قرارات محفوظة بعد — أول قرار تحسمه بيظهر هنا.
        </div>
      )}

      {state.status === "ready" && state.decisions.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {state.decisions.map((d) => {
            const category = getCategory(d.category);
            return (
              <article
                key={d.id}
                className="glass card-shadow flex flex-col gap-3 rounded-[1.5rem] border border-line bg-card p-5 transition-transform hover:-translate-y-0.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="pill">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                    {category?.label ?? d.category}
                  </span>
                  <span className="text-xs text-muted-soft">
                    {relativeTime(d.createdAt)}
                  </span>
                </div>

                <h3 className="font-bold leading-snug">{d.title}</h3>

                {/* المختار بحبرٍ يملأ — نفس لغة الاختيار في كل الموقع */}
                {d.chosen && (
                  <p className="flex items-center gap-2 rounded-xl bg-card-sunken px-3 py-2 text-sm font-medium">
                    <CircleCheck
                      size={18}
                      className="shrink-0 text-accent-strong"
                    />
                    {d.chosen}
                  </p>
                )}

                <OutcomeAsk
                  decisionId={d.id}
                  satisfaction={d.satisfaction}
                  onRecorded={noteOutcome}
                />
              </article>
            );
          })}
        </div>
      )}

      {state.status === "ready" && state.decisions.length > 0 && (
        <PatternsCard />
      )}
    </section>
  );
}
