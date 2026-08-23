"use client";

import { useRef, useState } from "react";
import { MAX_TURNS } from "@/lib/engine/discuss";
import { Field, hindi } from "./ui";
import { ArrowLeft, Scale, Shuffle, TriangleAlert } from "./icons";

// النقاش تحت الحكم — مدخل واحد لا نافذة محادثة.
//
// المكان مقصود: البنية موجودة فوقه (معايير وأوزان وأرقام)، فالمحادثة
// تعدّل عليها بدل ما تبنيها من فراغ. مدخلٌ في أول الرحلة كان يطلب من
// المتردد أصعب ما لا يقدر عليه — أن يصيغ حيرته.
//
// المكوّن يعرض ولا يقرر: الحالة كلها في `Result` لأن البطاقة الحبرية
// تتبع الحكم المُعاد حسابه، ومصدران للحقيقة يعني بطاقةً تناقض فقاعة.
export default function VerdictChat({ turns, busy, error, onSend }) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef(null);

  const spent = turns.filter((t) => t.role === "user").length;
  const exhausted = spent >= MAX_TURNS;

  const submit = (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy || exhausted) return;
    setDraft("");
    onSend(text);
    // التركيز يبقى في المدخل: النقاش تبادل، وإرجاع التركيز لأول
    // الصفحة بعد كل إرسال يقطعه
    inputRef.current?.focus();
  };

  return (
    // الخيط الزاحف حول الصندوق: النقاش هو الفعل المطلوب هنا، وسطرٌ
    // متقطّع رمادي كان يقرأ حاشيةً تُتجاوَز. والقوس يتلوّن بمحطات
    // المزاج فيبقى الحبر للحكم فوقه والتدرّج للفعل الواحد أسفله.
    <section className="snake card-shadow">
      <div className="glass rounded-[calc(var(--radius-card)-2px)] bg-white/72 p-6">
        <p className="text-base font-semibold">
          {turns.length ? "تابع المناقشة" : "غير مقتنع بالتوصية؟"}
        </p>
        <p className="mt-1 text-sm text-muted">
          {turns.length
            ? "أي معطى يخصّك ولم يُؤخذ في الحسبان"
            : "بيّن سبب اعتراضك، وأضف أي معطى يخصّك لم يدخل في الحساب."}
        </p>

        {turns.length > 0 && (
          <ul className="mt-5 flex flex-col gap-3">
            {turns.map((turn, i) => (
              <li
                key={i}
                className={
                  "flex flex-col gap-1.5 " +
                  // كلامه في الجهة المقابلة: التبادل يُقرأ من الجانبين
                  // قبل أن يُقرأ من الألوان. و«البداية» في RTL هي اليمين
                  (turn.role === "user" ? "items-start" : "items-end")
                }
              >
                {turn.role === "user" ? (
                  <span className="max-w-[85%] rounded-2xl rounded-ss-sm bg-ink px-4 py-2.5 text-[0.95rem] text-on-ink">
                    {turn.text}
                  </span>
                ) : (
                  <>
                    {/* فقاعته بلون المزاج لا بالحبر: الحبر للحكم فوقها،
                        ولو تساويا صار للشاشة صوتان بنفس النبرة. والذيل
                        على الطرف المقابل لذيل فقاعته */}
                    <span className="max-w-[85%] rounded-2xl rounded-se-sm bg-accent-soft px-4 py-2.5 text-[0.95rem] leading-relaxed">
                      {turn.text}
                    </span>

                    {/* الانقلاب يُعلَن بسببه: انقلابٌ صامت يقرأ تذبذباً،
                        ومعلنٌ بسببه يقرأ إصغاءً. والفرق سطر واحد.
                        حبريّ لا ملوّن — الفقاعة صارت بلون المزاج، ولونان
                        متجاوران بنفس الدرجة يبتلع أحدهما الآخر */}
                    {turn.flippedTo && (
                      <p className="on-ink flex items-start gap-2 rounded-2xl bg-ink px-4 py-2.5 text-sm text-on-ink">
                        <Shuffle size={16} className="mt-0.5 shrink-0" />
                        <span>
                          انقلب — صار{" "}
                          <span className="font-semibold">
                            {turn.flippedTo}
                          </span>
                          .
                        </span>
                      </p>
                    )}

                    {/* تعديلٌ ما قلب الحكم يبقى تعديلاً: بدون هالسطر
                        يظن المستخدم أن كلامه ضاع */}
                    {turn.applied > 0 && !turn.flippedTo && (
                      <p className="flex items-center gap-2 text-xs text-muted">
                        <Scale size={14} className="shrink-0" />
                        عدّلت الحساب — الحكم ما انقلب.
                      </p>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {busy && (
          <p role="status" className="mt-4 text-sm text-muted">
            … يراجع
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="mt-4 flex items-start gap-1.5 text-sm text-muted"
          >
            <TriangleAlert size={15} className="mt-0.5 shrink-0" />
            {error}
          </p>
        )}

        {exhausted ? (
          // القفل صريح لا صامت: بعد أربع دورات ما بقي نقاشٌ بل إقناع،
          // وقولها للمتردد أنفع من مواصلة الجدل معه
          <p className="mt-5 rounded-2xl bg-card px-4 py-3 text-sm text-muted">
            خلاص، وصلنا مدى النقاش — أنت حسمتها.
          </p>
        ) : (
          <form onSubmit={submit} className="mt-5 flex items-end gap-3">
            <Field
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={busy}
              maxLength={400}
              placeholder="مثلاً: المطعم بعيد عني"
              aria-label="ناقش الحكم"
              className="flex-1 text-base"
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              className="shrink-0 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-on-ink transition-all hover:bg-ink/90 active:translate-y-px disabled:cursor-not-allowed disabled:bg-line disabled:text-muted"
            >
              <ArrowLeft size={16} />
              <span className="sr-only">أرسل</span>
            </button>
          </form>
        )}

        {!exhausted && turns.length > 0 && (
          <p className="mt-2 text-xs text-muted-soft">
            باقي لك {hindi(MAX_TURNS - spent)} من {hindi(MAX_TURNS)}
          </p>
        )}
      </div>
    </section>
  );
}
