"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { renderSVG } from "uqr";
import { groupService } from "@/lib/services/group";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth/AuthProvider";
import SiteFooter from "@/app/components/SiteFooter";
import {
  Field,
  GhostButton,
  PrimaryButton,
  hindi,
} from "@/app/components/ui";
import {
  Check,
  CircleCheck,
  Copy,
  QrCode,
  Trophy,
  TriangleAlert,
  Users,
} from "@/app/components/icons";

const NAME_KEY = "ahsem-voter-name";
const CODE = /^[0-9a-f]{12}$/;
// صوتي في هذا التصويت تحديداً — الخادم ما يكشف أسماء المصوتين،
// فالمتصفح يتذكر بنفسه وش اختار
const myVoteKey = (code) => `ahsem-vote-${code}`;

// دقة التحديث الحي: الإشارة تقول "فيه جديد" فقط، والأرقام تجي من
// الخادم — منع الإغراق يمنع مصوّتاً خبيثاً من ضربنا بإعادة جلب متتالية
const REFETCH_DEBOUNCE_MS = 400;

/**
 * صفحة التصويت الجماعي — أول استعمال فعلي لـ Realtime في المشروع.
 *
 * القناة تحمل شيئين: broadcast كجرس (صوت جديد / انقفل)، و presence
 * للحاضرين. الجرس ما يُصدَّق كبيانات أبداً: كل رنة = إعادة جلب من
 * get_vote_page، فالأرقام دائماً من القاعدة لا من رسالة متصفح آخر —
 * أي عابث يقدر يرن الجرس، وما يقدر يزوّر عموداً.
 *
 * (postgres_changes ما تنفع هنا عمداً: RLS يحجب صفوف الجداول عن
 * الضيوف من مهاجرة إغلاق التسريب، والبث لا يمر على RLS.)
 */
export default function VotePage() {
  const { code } = useParams();
  const { user, accessToken } = useAuth();

  const [state, setState] = useState({ status: "loading" });
  const [isCreator, setIsCreator] = useState(false);
  const [present, setPresent] = useState(0);
  const [name, setName] = useState("");
  const [savedName, setSavedName] = useState(null);
  const [myOptionId, setMyOptionId] = useState(null);
  const [voteError, setVoteError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [verdict, setVerdict] = useState(null);
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const channelRef = useRef(null);
  const refetchTimer = useRef(null);

  // يتولد عند أول طلب فقط — الضغطة تضمن إننا في المتصفح (ما فيه
  // window وقت رندر الخادم)، والمولّد محلي فما يطلع الرابط لأي طرف
  // ثالث لخدمة باركود
  const qrSvg = useMemo(
    () => (showQr ? renderSVG(window.location.href) : null),
    [showQr],
  );

  const valid = typeof code === "string" && CODE.test(code);

  const refetch = useCallback(() => {
    clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(() => {
      groupService.fetchByCode(code).then((result) => {
        if (!result.ok) return;
        setState({
          status: "ready",
          decision: result.decision,
          options: result.options,
        });
      });
    }, REFETCH_DEBOUNCE_MS);
  }, [code]);

  useEffect(() => {
    if (!valid) return;
    let dead = false;

    groupService.fetchByCode(code).then((result) => {
      if (dead) return;
      if (!result.ok) {
        setState({ status: "notfound" });
        return;
      }

      setSavedName(localStorage.getItem(NAME_KEY) ?? "");
      try {
        const mine = JSON.parse(localStorage.getItem(myVoteKey(code)) ?? "null");
        if (mine?.optionId) setMyOptionId(mine.optionId);
      } catch {
        /* قيمة قديمة مكسورة — نتجاهلها */
      }

      setState({
        status: "ready",
        decision: result.decision,
        options: result.options,
      });

      groupService.isCreator(result.decision.id).then(setIsCreator);

      const channel = supabase
        .channel(`vote:${result.decision.id}`)
        .on("broadcast", { event: "ping" }, () => refetch())
        .on("presence", { event: "sync" }, () => {
          setPresent(Object.keys(channel.presenceState()).length);
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            channel.track({
              name: localStorage.getItem(NAME_KEY) || "متفرج",
            });
          }
        });
      channelRef.current = channel;
    });

    return () => {
      dead = true;
      clearTimeout(refetchTimer.current);
      channelRef.current && supabase.removeChannel(channelRef.current);
    };
  }, [code, valid, refetch]);

  // رجع للتبويب بعد غياب؟ الجرس فاتك — نجلب عند الرجوع
  useEffect(() => {
    const onFocus = () => valid && refetch();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [valid, refetch]);

  const decision = state.status === "ready" ? state.decision : null;
  const options = state.status === "ready" ? state.options : [];
  const closed = decision ? decision.status !== "open" || !decision.is_open : false;

  // النتيجة بعد الإقفال — تتولد مرة وتنخدم للبقية من الكاش
  useEffect(() => {
    if (!closed || verdict) return;
    let dead = false;
    fetch(`/api/group?code=${code}`)
      .then((res) => res.json())
      .then((payload) => {
        if (dead || !payload?.ok || !payload.closed) return;
        setVerdict({ winner: payload.winner, announcement: payload.announcement });
      })
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, [closed, verdict, code]);

  const ping = () =>
    channelRef.current?.send({ type: "broadcast", event: "ping", payload: {} });

  const vote = async (optionId) => {
    const trimmed = (savedName || name).trim();
    if (trimmed.length < 2) {
      setVoteError("اكتب اسمك أول — حرفين على الأقل.");
      return;
    }
    setBusy(true);
    setVoteError(null);

    const result = await groupService.castVote({ code, optionId, name: trimmed });
    setBusy(false);

    if (!result.ok) {
      setVoteError(result.message);
      return;
    }

    localStorage.setItem(NAME_KEY, trimmed);
    localStorage.setItem(myVoteKey(code), JSON.stringify({ name: trimmed, optionId }));
    setSavedName(trimmed);
    setMyOptionId(optionId);
    channelRef.current?.track({ name: trimmed });
    refetch();
    ping();
  };

  const close = async () => {
    setClosing(true);
    setCloseError(null);
    try {
      const token = await accessToken();
      const res = await fetch("/api/group", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ decisionId: decision.id }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.ok) {
        setCloseError(payload?.error ?? "تعذّر إقفال التصويت.");
        return;
      }
      setVerdict({ winner: payload.winner, announcement: payload.announcement });
      refetch();
      ping();
    } catch {
      setCloseError("ما وصلنا للخادم — تأكد من اتصالك.");
    } finally {
      setClosing(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setVoteError("تعذّر النسخ. انسخ الرابط من شريط العنوان.");
    }
  };

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: decision.title, url: window.location.href });
        return;
      }
      // ما فيه قائمة مشاركة (كمبيوتر غالباً) — النسخ أقرب مكافئ
      await copyLink();
    } catch {
      /* المستخدم لغى المشاركة — مو خطأ */
    }
  };

  // ---------------------------------------------------------------

  if (!valid || state.status === "notfound") {
    return (
      <Shell>
        <p role="alert" className="flex items-center gap-2 text-muted">
          <TriangleAlert size={18} className="shrink-0" />
          ما لقينا هذا التصويت — تأكد من الرابط.
        </p>
        <Link href="/" className="text-accent-strong underline underline-offset-4">
          روح لاحسم
        </Link>
      </Shell>
    );
  }

  if (state.status === "loading") {
    return (
      <Shell>
        <div className="flex flex-col gap-3" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-2xl border border-line bg-card-sunken"
            />
          ))}
        </div>
      </Shell>
    );
  }

  const total = options.reduce((sum, o) => sum + Number(o.votes ?? 0), 0);
  const winnerLabel =
    verdict?.winner ??
    options.find((o) => o.id === decision.winner_option_id)?.label;

  return (
    <Shell>
      {/* بعد حذف الوسم ما بقي في الصف إلا شارة الحضور — والصف الفاضي
          يظل عنصراً في flex ويورث فجوة كاملة، فنحذفه معها */}
      {present > 0 && (
        <div className="flex items-center justify-end">
          <span className="pill">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
            الحاضرين الحين: {hindi(present)}
          </span>
        </div>
      )}

      <h1
        tabIndex={-1}
        data-step-heading
        className="display text-3xl font-bold sm:text-4xl"
      >
        {decision.title}
      </h1>

      {/* ---------- النتيجة: حكم القروب بالحبر، مثل بطاقة النتيجة ---------- */}
      {closed && (
        <section className="on-ink rounded-[1.5rem] bg-ink p-6 text-on-ink sm:p-7">
          <p className="display text-4xl font-bold">
            {winnerLabel ?? "…"}
          </p>
          {verdict?.announcement && (
            <p className="mt-4 leading-relaxed">{verdict.announcement}</p>
          )}
        </section>
      )}

      {/* ---------- الاسم ---------- */}
      {!closed && !myOptionId && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="voter-name" className="text-sm text-muted">
            اسمك — عشان القروب يعرف من صوّت
          </label>
          <Field
            id="voter-name"
            value={savedName || name}
            onChange={(e) => {
              setSavedName(null);
              setName(e.target.value);
            }}
            maxLength={30}
            placeholder="اكتب اسمك"
          />
        </div>
      )}

      {/* ---------- الخيارات: العمود الحي خلف الصف نفسه ---------- */}
      <div className="flex flex-col gap-3" aria-live="polite">
        {options.map((option) => {
          const count = Number(option.votes ?? 0);
          const percent = total ? Math.round((count / total) * 100) : 0;
          const mine = myOptionId === option.id;
          const winner = closed && decision.winner_option_id === option.id;

          return (
            <button
              key={option.id}
              type="button"
              onClick={() => vote(option.id)}
              disabled={closed || Boolean(myOptionId) || busy}
              className={
                "relative overflow-hidden rounded-2xl border text-start transition-all " +
                (winner
                  ? "border-accent"
                  : mine
                    ? "border-ink"
                    : "border-line-strong") +
                (!closed && !myOptionId
                  ? " hover:-translate-y-0.5 hover:border-ink"
                  : "")
              }
            >
              {/* التعبئة خلف النص هي العمود — تتحرك مع كل صوت */}
              <span
                aria-hidden
                className={
                  "absolute inset-y-0 start-0 transition-all duration-500 " +
                  (winner ? "bg-accent-soft" : "bg-card-sunken")
                }
                style={{ width: `${percent}%` }}
              />
              <span className="relative flex items-center justify-between gap-3 px-5 py-4">
                <span className="flex items-center gap-2 text-lg font-medium">
                  {mine && <Check size={17} className="shrink-0 text-accent-strong" />}
                  {winner && (
                    <Trophy size={17} className="shrink-0 text-accent-strong" />
                  )}
                  {option.label}
                </span>
                <span className="text-sm text-muted">
                  {hindi(count)} · {hindi(percent)}٪
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <p role="status" className="text-sm text-muted">
        {voteError ? (
          <span className="flex items-center gap-1.5">
            <TriangleAlert size={15} />
            {voteError}
          </span>
        ) : myOptionId && !closed ? (
          <span className="flex items-center gap-1.5">
            <CircleCheck size={15} />
            صوتك محسوب يا {savedName} — الأعمدة تتحرك أول ما يصوت أحد.
          </span>
        ) : !closed ? (
          `${hindi(total)} ${total === 1 ? "صوت" : "أصوات"} لين الحين`
        ) : null}
      </p>

      {/* ---------- المشاركة والإقفال ---------- */}
      {!closed && (
        <div className="flex flex-col gap-4 border-t border-line pt-5">
          <div className="flex flex-wrap items-center gap-2.5">
            <GhostButton onClick={share} className="flex items-center gap-1.5">
              <Users size={16} />
              شارك الرابط
            </GhostButton>

            <button
              type="button"
              onClick={copyLink}
              aria-label="انسخ رابط التصويت"
              title="انسخ الرابط"
              className="rounded-full border border-line-strong p-2.5 text-muted transition-colors hover:border-ink hover:text-ink"
            >
              {copied ? (
                <CircleCheck size={17} className="text-accent-strong" />
              ) : (
                <Copy size={17} />
              )}
            </button>

            <button
              type="button"
              onClick={() => setShowQr((v) => !v)}
              aria-pressed={showQr}
              aria-label="اعرض باركود التصويت"
              className={
                "flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm transition-colors " +
                (showQr
                  ? "border-ink bg-ink text-on-ink"
                  : "border-line-strong text-muted hover:border-ink hover:text-ink")
              }
            >
              <QrCode size={16} />
              باركود
            </button>

            {isCreator && (
              <PrimaryButton
                onClick={close}
                disabled={closing || !total}
                className="px-5 py-2.5 text-base"
              >
                {closing ? "… يجهز الإعلان" : "اقفل واحسم"}
              </PrimaryButton>
            )}
            {closeError && (
              <p role="alert" className="text-sm text-muted">
                {closeError}
              </p>
            )}
          </div>

          {/* الجالسون في نفس المكان: باركود على الشاشة أسرع من
              إرسال رابط — كل واحد يمسح بكاميرته ويصوت.
              خلفية بيضاء ثابتة مهما كان الثيم: الماسح يبي تبايناً */}
          {showQr && qrSvg && (
            <figure className="flex flex-col items-center gap-2 self-center rounded-2xl border border-line bg-white p-4">
              <div
                className="w-52 [&_svg]:h-auto [&_svg]:w-full"
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
              <figcaption className="text-sm text-[#17140f]">
                امسح بالكاميرا وصوّت
              </figcaption>
            </figure>
          )}
        </div>
      )}

      {closed && (
        <Link
          href="/"
          className="self-start text-sm text-accent-strong underline underline-offset-4"
        >
          عندك حيرة ثانية؟ احسمها في احسم
        </Link>
      )}
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <>
      <main
        id="main"
        className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6"
      >
        <Link href="/" className="flex items-center gap-2.5 self-start">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-base font-bold text-accent-ink">
            حـ
          </span>
          <span className="font-semibold">احسم</span>
        </Link>
        <div className="card-shadow flex flex-col gap-6 rounded-[var(--radius-card)] border border-line bg-card p-6 sm:p-8">
          {children}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
