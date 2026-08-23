"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { listenOnce, speak, stopSpeaking } from "@/lib/voice/speech";
import { matchCommand } from "@/lib/voice/match";
import { useVoice } from "@/lib/voice/VoiceProvider";
import { GhostButton, PrimaryButton, SectionHeading, Tag } from "./ui";

// نصّ منطوق لا مقروء: الفصحى المكتوبة تثقل على اللسان، فالجمل قصيرة
// ومفرداتها سهلة اللفظ — بلا تراكيب تُقرأ أسرع مما تُنطق.
const INTRO =
  "تحدّث على سجيّتك. اذكر ما أنت متردد فيه، وما يهمّك في هذا القرار، ويتولّى النظام الباقي. وإن تعذّر الميكروفون، فاكتب وتستمر المحادثة نفسها.";

const GREETING =
  "أهلًا بك. اذكر القرار الذي تتردد فيه، وما يهمّك فيه اليوم. مثال: أتردد بين الإعلانات الممولة والتسويق بالمحتوى، والعائد السريع يهمّني.";

// ---------------------------------------------------------------
// الحالة. المطابقة صارت عند النموذج في /api/assist، وهنا نحتفظ
// بسجل المحادثة وما يُنطق. أوامر التوقف والإعادة تبقى محلية عشان
// تشتغل فوراً بدون انتظار الشبكة.
// ---------------------------------------------------------------

const initialState = {
  started: false,
  draft: { categoryId: null, options: [], answers: {} },
  log: [],
  pending: null, // { text, id }
  busy: false,
  result: null,
  cancelled: false,
};

let pendingId = 0;
const say = (state, text, extra = {}) => ({
  ...state,
  log: [...state.log, { who: "ahsem", text }],
  pending: { text, id: ++pendingId },
  busy: false,
  ...extra,
});

function reducer(state, action) {
  switch (action.type) {
    case "start":
      return say({ ...initialState, started: true }, GREETING);

    case "user":
      return {
        ...state,
        log: [...state.log, { who: "user", text: action.text }],
        pending: null,
        busy: true,
      };

    case "agent": {
      const next = { ...state, draft: action.state };
      if (action.ready) {
        return say(next, action.reply, { result: action.state });
      }
      return say(next, action.reply);
    }

    case "error":
      return say(state, action.message);

    case "repeat":
      return say(state, action.text);

    case "cancel":
      return { ...state, cancelled: true, pending: null, busy: false };

    default:
      return state;
  }
}

// ---------------------------------------------------------------

export default function VoiceMode({ onComplete, onCancel }) {
  const { stt } = useVoice();
  const [state, dispatch] = useReducer(reducer, initialState);
  const [listening, setListening] = useState(false);
  const [micBlocked, setMicBlocked] = useState(false);
  const [typed, setTyped] = useState("");
  const stopListening = useRef(null);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const { started, draft, log, pending, busy, result, cancelled } = state;
  const textOnly = !stt || micBlocked;

  // دورة الوكيل: كلام المستخدم → النموذج → رد منطوق + حالة محدّثة.
  // stateRef يخلي الدالة ثابتة، فما يعاد بناء تأثير النطق كل رسالة.
  const handle = useCallback(async (raw) => {
    const text = (raw ?? "").trim();
    if (!text) return;

    // أوامر التحكم محلية عشان تستجيب فوراً بدون انتظار الشبكة
    const command = matchCommand(text);
    if (command === "stop") return dispatch({ type: "cancel" });
    if (command === "repeat") {
      const last = stateRef.current.log.filter((l) => l.who === "ahsem").at(-1);
      return dispatch({ type: "repeat", text: last?.text ?? GREETING });
    }

    dispatch({ type: "user", text });

    try {
      const current = stateRef.current;
      const res = await fetch("/api/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          utterance: text,
          state: current.draft,
          history: current.log.slice(-6),
        }),
      });
      const payload = await res.json().catch(() => null);

      if (!res.ok || !payload?.ok) {
        dispatch({
          type: "error",
          message: payload?.error ?? "تعذّر فهم ما قلته. أعد المحاولة من فضلك.",
        });
        return;
      }

      dispatch({
        type: "agent",
        state: payload.state,
        reply: payload.reply,
        ready: payload.ready,
      });
    } catch (err) {
      console.error("[voice] assist failed:", err);
      dispatch({ type: "error", message: "ما وصلت للخادم — عيد عليّ؟" });
    }
  }, []);

  // ينطق الرسالة المعلّقة ثم يفتح الميكروفون
  useEffect(() => {
    if (!pending || cancelled || result) return;
    let dead = false;

    speak(pending.text, {
      onEnd: () => {
        if (dead || !stt || micBlocked) return;
        setListening(true);
        stopListening.current = listenOnce({
          onResult: (text) => {
            setListening(false);
            handle(text);
          },
          onError: (code) => {
            setListening(false);
            if (code === "not-allowed" || code === "service-not-allowed") {
              setMicBlocked(true);
              dispatch({
                type: "error",
                message: "الميكروفون ممنوع — اكتب لي هنا ونكمل.",
              });
            }
          },
        });
      },
    });

    return () => {
      dead = true;
      stopSpeaking();
      stopListening.current?.();
    };
  }, [pending, cancelled, result, stt, micBlocked, handle]);

  useEffect(() => {
    if (result) onComplete?.(result);
  }, [result, onComplete]);

  useEffect(() => {
    if (cancelled) onCancel?.();
  }, [cancelled, onCancel]);

  useEffect(() => () => stopSpeaking(), []);

  const listenAgain = () => {
    if (!stt || listening || busy) return;
    setListening(true);
    stopListening.current = listenOnce({
      onResult: (text) => {
        setListening(false);
        handle(text);
      },
      onError: () => setListening(false),
    });
  };

  const submitTyped = (e) => {
    e.preventDefault();
    const value = typed.trim();
    if (!value) return;
    setTyped("");
    handle(value);
  };

  const filledCount =
    (draft.categoryId ? 1 : 0) +
    (draft.options.length ? 1 : 0) +
    (Object.keys(draft.answers).length ? 1 : 0);

  if (!started) {
    return (
      <div className="flex flex-col gap-5">
        <SectionHeading
          title="وضع المحادثة الصوتية"
          sub={INTRO}
        />
        {!stt && (
          <p className="rounded-xl border border-dashed border-line-strong bg-card-sunken px-4 py-3 text-sm text-muted">
            متصفحك ما يدعم التعرف على الكلام — بنكمل بالكتابة، ونفس المحادثة
            تشتغل.
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <PrimaryButton onClick={() => dispatch({ type: "start" })}>
            ابدأ المحادثة
          </PrimaryButton>
          <GhostButton onClick={onCancel}>رجوع</GhostButton>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 tabIndex={-1} data-step-heading className="text-xl font-bold">
          المحادثة
        </h2>
        <Tag lang="ar">{`اكتمل ${filledCount} من ٣`}</Tag>
      </div>

      {/* السجل منطقة حيّة: قارئ الشاشة يقرأ كل رد جديد */}
      <div
        className="flex max-h-80 flex-col gap-3 overflow-y-auto"
        role="log"
        aria-live="polite"
        aria-label="المحادثة"
      >
        {log.map((entry, i) => (
          <div
            key={i}
            className={
              "flex " + (entry.who === "user" ? "justify-start" : "justify-end")
            }
          >
            <p
              className={
                "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed " +
                (entry.who === "user"
                  ? "border border-line-strong bg-card-sunken"
                  : "bg-ink text-on-ink")
              }
            >
              <span className="sr-only">
                {entry.who === "user" ? "أنت: " : "احسم: "}
              </span>
              {entry.text}
            </p>
          </div>
        ))}
      </div>

      <p role="status" aria-live="polite" className="text-sm text-muted">
        {busy && "… أفكر"}
        {!busy && listening && "أسمعك…"}
      </p>

      <form onSubmit={submitTyped} className="flex items-center gap-2">
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={textOnly ? "اكتب ردك هنا" : "أو اكتبها"}
          aria-label="اكتب ردك"
          disabled={busy}
          className="w-full border-0 border-b-2 border-line bg-transparent px-0.5 py-2.5 text-lg outline-none transition-colors placeholder:text-muted-soft focus:border-ink disabled:opacity-60"
        />
        <PrimaryButton
          type="submit"
          disabled={busy}
          className="shrink-0 px-5 py-3"
        >
          أرسل
        </PrimaryButton>
      </form>

      <div className="flex flex-wrap gap-3">
        {stt && !micBlocked && (
          <GhostButton onClick={listenAgain} disabled={listening || busy}>
            {listening ? "أسمعك…" : "تكلم"}
          </GhostButton>
        )}
        <GhostButton onClick={onCancel}>إلغاء</GhostButton>
      </div>
    </div>
  );
}
