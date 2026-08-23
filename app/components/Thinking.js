"use client";

import { useEffect, useState } from "react";
import { Dices } from "./icons";

const LINES = [
  "احسم يفكر…",
  "أوزن خياراتك…",
  "أقلّب في قراراتك السابقة…",
  "أجهز لك سبب مقنع…",
  "لحظة، أبي أطلع بشي ذكي…",
];

// انتظار بناء الإطار. النص يقول ما يحدث فعلاً: النموذج يقرأ الخيارات
// ليبني منها المعايير والأسئلة، وما «يفكر» في حكم بعد — والمستخدم
// ينتظر ست ثوانٍ، فأقل ما يستحقه أن يكون السطر صادقاً.
const READING_LINES = [
  "تُقرأ الخيارات…",
  "تُستخلص المعايير التي تفرّق بينها…",
  "تُصاغ أسئلة التقييم…",
];

// لحظة الحكم حبرية: الورق للكتابة والحبر للفصل. الانقلاب من بطاقة
// فاتحة لغامقة يقول «خلصت الأسئلة» بلا كلمة واحدة.
export default function Thinking({ reading = false }) {
  const [line, setLine] = useState(0);
  const lines = reading ? READING_LINES : LINES;

  // الطول في التبعيات: تبديل الطور وسط الدوران يخلي الفهرس يتجاوز
  // القائمة الأقصر فيطلع سطر فاضٍ
  useEffect(() => {
    const id = setInterval(() => setLine((i) => (i + 1) % lines.length), 1100);
    return () => clearInterval(id);
  }, [lines.length]);

  return (
    <div
      className="on-ink card-shadow flex flex-col items-center gap-7 rounded-[var(--radius-card)] bg-ink px-6 py-16 text-on-ink"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      {/* عجلة الحظ */}
      <div className="relative h-28 w-28">
        <div className="absolute inset-0 animate-spin rounded-full border-4 border-dashed border-accent [animation-duration:2.4s]" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="animate-bounce text-accent [animation-duration:1.2s]">
            <Dices size={40} />
          </span>
        </div>
      </div>

      <p
        tabIndex={-1}
        data-step-heading
        className="text-xl font-semibold"
      >
        {lines[line]}
      </p>

      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2 w-2 animate-pulse rounded-full bg-accent"
            style={{ animationDelay: `${i * 180}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
