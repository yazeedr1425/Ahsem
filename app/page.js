"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getCategory } from "@/lib/engine/categories";
import {
  frameToCategory,
  pathAnswers,
  pathQuestions,
  withRefinement,
} from "@/lib/engine/frame";
import { withPriors } from "@/lib/engine/duel";
import {
  emptyRevision,
  mergeChanges,
  revisedCategory,
  revisedRatings,
  revisedWeights,
} from "@/lib/engine/discuss";
import { MIN_OPTIONS, scoreOptions, weightsFor } from "@/lib/engine/score";
import { DEFAULT_TONE, TONES } from "@/lib/engine/tone";
import { decisionService } from "@/lib/services/decisions";
import { frameService } from "@/lib/services/frame";
import { groupService } from "@/lib/services/group";
import { profileService } from "@/lib/services/profile";
import { useMood } from "@/lib/theme/MoodProvider";
import { useAuth } from "@/lib/auth/AuthProvider";
import Landing from "./components/Landing";
import QuestionStep from "./components/QuestionStep";
import RatingGrid from "./components/RatingGrid";
import Duel from "./components/Duel";
import HistorySection from "./components/HistorySection";
import Result from "./components/Result";
import SiteFooter from "./components/SiteFooter";
import SiteNav from "./components/SiteNav";
import Thinking from "./components/Thinking";
import BreakdownFlow from "./components/BreakdownFlow";
import VoiceMode from "./components/VoiceMode";
import Reveal from "./components/Reveal";
import { Card } from "./components/ui";

// معرّفات ثابتة للخيارين الأوليين حتى لا يختلف الرندر بين الخادم والمتصفح
// نفس ما يفرضه ‎/api/frame‎: نداء بخيار من حرف واحد مرفوض سلفاً
const MIN_LABEL_LENGTH = 2;

const initialOptions = () => [
  { id: "opt-1", label: "" },
  { id: "opt-2", label: "" },
];

export default function Home() {
  const { user, signOut, accessToken } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState("landing");
  const [questionIndex, setQuestionIndex] = useState(0);
  // الإطار المولّد بدل الفئة المختارة. المحادثة الصوتية خارج نطاق
  // هذي الجولة فتظل ترجّع معرّف فئة ثابتة — مصدران للقالب، ومخرَج
  // واحد يقرأه المحرك.
  //
  // موسوم بالخيارات التي بُني لها: الإطلاق المبكر يعني أن الإطار قد
  // يسبق تعديلاً على النص، وإطارٌ لخيارٍ ما عاد موجوداً يسأل عن قرار
  // غير الذي أمام المستخدم. الاشتقاق عند الرندر يخلي القديم يسقط من
  // نفسه بلا تصفير داخل أثر.
  const [framed, setFramed] = useState(null);
  const [voiceCategoryId, setVoiceCategoryId] = useState(null);
  const [frameError, setFrameError] = useState(null);
  // طبقة المراجعة: ما غيّره النقاش فوق الحساب الأصلي. تعيش هنا لأن
  // `scoreOptions` يقرأ من هنا — ولو ملكها `Result` لصار للحقيقة مصدران
  const [revision, setRevision] = useState(emptyRevision);
  // ما هو محفوظ فعلاً في السجل، لا ما تحسبه الشاشة. الحفظ يقع لحظة
  // ظهور النتيجة والنقاش يجي بعده، فبدون هذين يبقى العمود على فائزٍ
  // رفضه المستخدم — و`/api/decide` يقرأه ليستنتج عاداته.
  const [decisionId, setDecisionId] = useState(null);
  const [savedWinner, setSavedWinner] = useState(null);
  // المزاج يعيش في المزوّد الجذري حتى يبقى اللون عبر كل الصفحات
  const { mood, setMood } = useMood();
  const [options, setOptions] = useState(initialOptions);
  const [answers, setAnswers] = useState({});
  const [ratings, setRatings] = useState({});
  const [tone, setTone] = useState(DEFAULT_TONE);
  const [recommendation, setRecommendation] = useState(null);
  const [apiError, setApiError] = useState(null);
  const [saveState, setSaveState] = useState(null);

  // تفضيلات البروفايل تسبق الحالة المحلية عند تسجيل الدخول،
  // عشان اللي يحفظه المستخدم في الإعدادات يكون له أثر فعلي هنا
  useEffect(() => {
    if (!user) return;
    let active = true;

    profileService.get().then((result) => {
      if (!active || !result.ok) return;
      if (result.profile.tone) setTone(result.profile.tone);
    });

    profileService.touchLastSeen();

    return () => {
      active = false;
    };
  }, [user]);

  // نقل التركيز لعنوان الخطوة الجديدة.
  // بدونه، مستخدم قارئ الشاشة يضيع: الزر اللي كان مركّزاً عليه يختفي
  // مع الشاشة السابقة فيرجع التركيز لأول الصفحة بدون أي إعلان.
  // نتجاهل أول رندر حتى ما نخطف التركيز عند فتح الصفحة.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const heading = document.querySelector("[data-step-heading]");
    heading?.focus();
  }, [step, questionIndex]);

  const filledOptions = useMemo(
    () =>
      options
        .filter((o) => o.label.trim())
        .map((o) => ({ ...o, label: o.label.trim() })),
    [options],
  );

  const optionsKey = filledOptions.map((o) => o.label).join("|");
  const frame = framed?.key === optionsKey ? framed.frame : null;

  // القالب الذي يقرأه المحرك: مولّد من الإطار، أو فئة ثابتة لو جاء
  // القرار من المحادثة الصوتية. `frameToCategory` يعتمد على الإجابات
  // لأن الشجرة تختار سؤالها الثاني حسب الأولى، فالاشتقاق عند الرندر
  // لا في حالة مخزَّنة.
  const baseCategory = useMemo(
    () =>
      frame
        ? frameToCategory(frame, answers)
        : voiceCategoryId
          ? getCategory(voiceCategoryId)
          : null,
    [frame, answers, voiceCategoryId],
  );

  // معيارٌ رفعه المستخدم في النقاش يدخل القالب نفسه، فيقرأه المحرك
  // كأنه من الإطار — نفس مبدأ الإطار مع الفئة الثابتة
  const category = useMemo(
    () => revisedCategory(baseCategory, revision),
    [baseCategory, revision],
  );

  // الفئة المحفوظة في السجل — قيد `CHECK` على العمود، فلها قيمة دائماً
  const decisionCategory = frame?.category ?? voiceCategoryId ?? "life";

  const baseWeights = useMemo(
    () => (category ? weightsFor(category, answers, mood) : {}),
    [category, answers, mood],
  );

  // الترتيب مقصود: `weightsFor` يعطي المعيار المضاف وزناً محايداً، ثم
  // تكتب المراجعة فوقه الوزن الذي بنى عليه النموذج تعديله
  const weights = useMemo(
    () => revisedWeights(baseWeights, revision),
    [baseWeights, revision],
  );

  // تقدير النموذج يملأ ما لم يلمسه المستخدم — اشتقاقاً عند الرندر لا
  // ضبطاً داخل أثر، فتعديلٌ سبق وصول الإطار ما ينمسح
  const seeded = useMemo(
    () => withPriors(ratings, frame, filledOptions),
    [ratings, frame, filledOptions],
  );

  const finalRatings = useMemo(
    () => revisedRatings(seeded, revision),
    [seeded, revision],
  );

  const scored = useMemo(
    () =>
      category && filledOptions.length
        ? scoreOptions(category, filledOptions, finalRatings, weights)
        : [],
    [category, filledOptions, finalRatings, weights],
  );

  // المبارزة للخيارين بإطار مولّد. المحادثة الصوتية بلا إطار، وثلاثة
  // خيارات فأكثر تبقى على الشبكة لأن القيمة المطلقة تهم هناك
  const isDuel = filledOptions.length === 2 && Boolean(frame);

  // الإطار يُبنى قبل أول سؤال، لأن الأسئلة نفسها منه. النداء الجاري
  // محفوظ في مرجع لا حالة: الضغط أثناء البناء ينتظر النداء نفسه بدل
  // ما يطلق ثانياً، والمرجع لا يسبب رندراً.
  const pendingRef = useRef({ key: null, promise: null });

  const buildFrame = useCallback((key, labels) => {
    if (pendingRef.current.key === key) return pendingRef.current.promise;

    const promise = frameService
      .build({ options: labels })
      .then((result) => {
        if (pendingRef.current.key === key) {
          pendingRef.current = { key: null, promise: null };
        }
        if (!result.ok) {
          setFrameError(result.message);
          return null;
        }
        setFrameError(null);
        setFramed({ key, frame: result.frame });
        return result.frame;
      });

    pendingRef.current = { key, promise };
    return promise;
  }, []);

  // الإطلاق المبكر: عند خروج المؤشر من حقل خيار، لا عند الضغط على
  // «احسمها لي». المستخدم عادةً يقرأ ما كتبه قبل ما يمد يده للزر،
  // فهذي ثانيتان إلى أربع مجاناً — وضربة الكاش في المسار تخلي الخروج
  // والدخول المتكرر بلا كلفة.
  //
  // الشرط أن تكون كل الحقول المعروضة مكتوبة: حقل فاضٍ يعني أن
  // المستخدم ما خلّص، وبناء إطار لخيارات ناقصة يُرمى بعد سطر.
  const prefetchFrame = useCallback(() => {
    const labels = options.map((o) => o.label.trim());
    if (labels.length < MIN_OPTIONS) return;
    if (labels.some((l) => l.length < MIN_LABEL_LENGTH)) return;

    const key = labels.join("|");
    if (framed?.key === key || pendingRef.current.key === key) return;
    buildFrame(key, labels);
  }, [options, framed, buildFrame]);

  // المستوى الثالث يُطلَق **لحظة عرض السؤال الثاني**: المستخدم يقرأ
  // ويختار بينما النداء جارٍ، فيجهز قبل ضغطته. لو تأخّر أو فشل، تُعرض
  // شاشة التقييم بعد السؤال الثاني بهدوء — بلا انتظار ولا رسالة خطأ
  // لتحسين ما طلبه أحد.
  const refineRef = useRef(null);

  useEffect(() => {
    if (step !== "questions" || questionIndex !== 1) return;
    if (!frame || frame.deeper) return;

    const asked = pathQuestions(frame, answers);
    const shown = asked[1];
    if (!shown) return;

    // المعايير التي ما سُئل عنها بعد — السؤال الثالث لواحد منها،
    // ومعيار يغطيه سؤالان يكتب وزنه مرتين ويضيع أحدهما
    const used = new Set(asked.map((q) => q.affects));
    const untouched = frame.criteria.filter((c) => !used.has(c.key));
    if (!untouched.length) return;

    const key = `${optionsKey}|${shown.key}`;
    if (refineRef.current === key) return;
    refineRef.current = key;

    const controller = new AbortController();
    let settled = false;
    frameService
      .refine({
        options: filledOptions.map((o) => o.label),
        refine: {
          shown: {
            key: shown.key,
            label: shown.label,
            choices: shown.choices.map((c) => ({ value: c.value, label: c.label })),
          },
          untouched: untouched.map((c) => ({ key: c.key, label: c.label })),
          asked: asked
            .slice(0, 1)
            .map((q) => ({
              question: q.label,
              answer:
                q.choices.find((c) => c.value === answers[q.key])?.label ?? "",
            })),
        },
        signal: controller.signal,
      })
      .then((deeper) => {
        settled = true;
        if (!deeper || controller.signal.aborted) return;
        // نلصقه على الإطار نفسه: كل ما بعده — الأسئلة والحسم والحفظ —
        // يقرأ كائناً واحداً بلا أن يعرف أن ثمة نداءً ثانياً
        setFramed((prev) =>
          prev?.key === optionsKey
            ? { ...prev, frame: withRefinement(prev.frame, deeper) }
            : prev,
        );
      })
      .catch(() => {
        settled = true;
      });

    // المفتاح يُحرَّر لو أُجهض النداء قبل ما يستقر: بدونه يمنع الحارسُ
    // أي محاولة لاحقة إلى الأبد — و StrictMode يركّب الأثر مرتين في
    // التطوير، فالتنظيف الأول كان يقتل النداء ويقفل الباب خلفه
    return () => {
      controller.abort();
      if (!settled && refineRef.current === key) refineRef.current = null;
    };
  }, [step, questionIndex, frame, answers, optionsKey, filledOptions]);

  const start = async () => {
    setAnswers({});
    setRatings({});
    setQuestionIndex(0);
    setFrameError(null);

    // جاهز من الإطلاق المبكر؟ انتقال فوري بلا شاشة انتظار
    if (frame) {
      setStep("questions");
      return;
    }

    setStep("reading");
    const labels = filledOptions.map((o) => o.label);
    const built = await buildFrame(labels.join("|"), labels);
    setStep(built ? "questions" : "landing");
  };

  // القرار الجماعي: ينشئ ويوجه لصفحة التصويت — المنشئ يشارك الرابط
  // من هناك. يحتاج دخولاً لأن القرار يُملك، والضيوف يصوتون بلا حساب.
  const [groupBusy, setGroupBusy] = useState(false);
  const createGroup = async () => {
    if (groupBusy) return;
    if (!user) {
      router.push("/login");
      return;
    }
    setGroupBusy(true);
    // التصويت يحتاج فئة للحفظ لا أسئلة، فالإطار هنا وسيلة لا غاية.
    // ولو فشل نكمل بـ«حياة» بدل ما نمنع إنشاء تصويت لأجل حقل تصنيف —
    // هذا سقوط في وسم داخلي، لا محتوى مصنوع يُعرض على أنه مولّد.
    const labels = filledOptions.map((o) => o.label);
    const built = frame ?? (await buildFrame(labels.join("|"), labels));
    const result = await groupService.createGroup({
      categoryId: built?.category ?? "life",
      options: labels,
    });
    if (!result.ok) {
      setGroupBusy(false);
      if (result.reason === "unauthenticated") router.push("/login");
      else setApiError(result.message ?? "تعذّر إنشاء التصويت.");
      return;
    }
    router.push(`/vote/${result.code}`);
  };

  const nextQuestion = () => {
    if (questionIndex + 1 < category.questions.length) {
      setQuestionIndex((i) => i + 1);
    } else {
      setStep("ratings");
    }
  };

  const backFromQuestion = () => {
    if (questionIndex === 0) setStep("landing");
    else setQuestionIndex((i) => i - 1);
  };

  // النقاش يحتاج جواب «هل انقلب؟» في نفس اللحظة، والحالة ما تحدّثت بعد.
  // فنحسبه هنا بنفس دوال الرندر لا بأثرٍ يركض بعد الرسم — والنتيجة
  // واحدة لأن الدوال نقية
  const applyDiscussion = useCallback(
    (changes, reply) => {
      const next = mergeChanges(revision, changes, filledOptions);
      setRevision(next);

      const cat = revisedCategory(baseCategory, next);
      const w = revisedWeights(weightsFor(cat, answers, mood), next);
      const r = revisedRatings(seeded, next);
      const winner = scoreOptions(cat, filledOptions, r, w)[0]?.label ?? null;

      // المقارنة بـ`savedWinner` لا بـ`scored[0]`: المحفوظ هو حكم
      // النموذج، وقد يخالف حساب JS أصلاً (حالة «حسابي يقول كذا بس
      // شفت كذا»). المقارنة بالحساب المحلي تطلق تحديثاً في غير محله
      // أو تفوّت انقلاباً حقيقياً.
      //
      // بلا `await`: الدالة تُرجع التسمية فوراً لأن `Result` يعلن بها
      // الانقلاب في نفس اللحظة. والتصحيح شأن السجل لا شأن الشاشة.
      //
      // والضيف بلا `decisionId` — ما فيه شي يُصحَّح، فيُتجاهل بصمت.
      if (decisionId && winner && winner !== savedWinner) {
        decisionService
          // رد الدورة يمشي معه ليقيّد في السجل *لماذا* انقلب الحكم،
          // فالواقعة بلا سببها تقول نصف ما جرى
          .updateWinner({ decisionId, chosen: winner, reason: reply ?? null })
          .then((res) => {
            if (res.ok) setSavedWinner(winner);
            else console.warn("[decide] winner update failed:", res.reason);
          })
          .catch((err) => console.warn("[decide] winner update failed:", err));
      }

      return winner;
    },
    [
      revision,
      filledOptions,
      baseCategory,
      answers,
      mood,
      seeded,
      decisionId,
      savedWinner,
    ],
  );

  // نداء المحرك: التوصية تجي من /api/decide، والحساب المحلي يبقى
  // كخط رجعة لو النداء فشل حتى ما تنكسر الشاشة على المستخدم.
  // override يجي من وضع المحادثة الصوتية، لأن الحالة ما تكون تحدّثت بعد
  const decide = useCallback(
    async (override) => {
      setStep("thinking");
      setApiError(null);
      setRecommendation(null);
      setSaveState(null);
      // بدونه، نقاش قرارٍ سابق يعدّل حساب القرار التالي
      setRevision(emptyRevision());
      setDecisionId(null);
      setSavedWinner(null);

      const labels = override?.options ?? filledOptions.map((o) => o.label);
      // إجابات المسار وحدها: الرجوع وتغيير السؤال الأول يبدّل الفرع،
      // فتبقى إجابة الفرع القديم بمفتاح ما عاد أحد يسأل عنه — وإرسالها
      // للنموذج يعني موقفاً تراجع عنه المستخدم
      const finalAnswers =
        override?.answers ?? (frame ? pathAnswers(frame, answers) : answers);
      const finalCategory = override?.categoryId ?? decisionCategory;
      let result = null;

      try {
        // التوكن هو الهوية — أوثق من إرسال userId في الـ body
        const token = await accessToken();
        const res = await fetch("/api/decide", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            options: labels,
            answers: finalAnswers,
            categoryId: finalCategory,
            // الإطار يحمل الأسئلة والمعايير بنصوصها، فيصف البرومبت
            // إجابات المستخدم بكلامه بدل مفاتيح مولّدة
            frame: override?.frame ?? frame,
            // النبرة كانت تُطبَّق على غلاف الحكم في Result وحده، فيقرأ
            // مَن اختار «جدي» صياغةً رسمية حول نصٍّ وُلِّد مرحاً
            tone,
          }),
        });

        const payload = await res.json().catch(() => null);

        if (!res.ok || !payload?.ok) {
          setApiError(payload?.error ?? `تعذر الوصول للمحرك (${res.status})`);
        } else {
          result = {
            selected_option: payload.selected_option,
            funny_reason: payload.funny_reason,
            // الطبقة الأعمق اختيارية — الحقل الغائب يعني بطاقة أقل
            decisive_criterion: payload.decisive_criterion,
            edge: payload.edge,
            cost_of_switching: payload.cost_of_switching,
            flip_condition: payload.flip_condition,
          };
          setRecommendation(result);
        }
      } catch (err) {
        console.error("[decide] request failed:", err);
        setApiError("تعذّر الوصول إلى المحرك. تحقق من اتصالك.");
      }

      setStep("result");

      // الحفظ بعد ما تظهر النتيجة — ما نخلي المستخدم ينتظره
      if (result) {
        setSaveState({ status: "saving" });
        try {
          const saved = await decisionService.saveDecision({
            categoryId: finalCategory,
            options: labels,
            chosen: result.selected_option,
            reason: result.funny_reason,
            answers: finalAnswers,
            weights,
          });
          if (saved.ok) {
            // المعرّف كان يُرمى، وهو ما يخلي التصحيح ممكناً أصلاً
            setDecisionId(saved.decisionId ?? null);
            setSavedWinner(result.selected_option);
          }
          setSaveState(
            saved.ok
              ? { status: "saved" }
              : { status: "failed", message: saved.message },
          );
        } catch (err) {
          console.error("[decide] save failed:", err);
          setSaveState({ status: "failed", message: "تعذر الحفظ في السجل." });
        }
      }
    },
    [filledOptions, answers, frame, decisionCategory, weights, accessToken, tone],
  );

  // المحادثة الصوتية تعطينا كل شي دفعة واحدة — بما فيه التقييمات.
  // الوكيل يرجّعها مفهرسة بنص الخيار، والمحرك يبيها بمعرّف الخيار.
  const fromVoice = useCallback(
    (payload) => {
      const voiceOptions = payload.options.map((label, i) => ({
        id: `voice-${i}`,
        label,
      }));

      const byId = {};
      for (const option of voiceOptions) {
        const given = payload.ratings?.[option.label];
        if (given) byId[option.id] = given;
      }

      setFramed(null);
      setVoiceCategoryId(payload.categoryId);
      setOptions(voiceOptions);
      setAnswers(payload.answers);
      setRatings(byId);
      decide({ ...payload, ratings: byId });
    },
    [decide],
  );

  const restart = () => {
    setStep("landing");
    setQuestionIndex(0);
    setFramed(null);
    setVoiceCategoryId(null);
    setFrameError(null);
    refineRef.current = null;
    setMood(null);
    setOptions(initialOptions());
    setAnswers({});
    setRatings({});
    setRevision(emptyRevision());
    setDecisionId(null);
    setSavedWinner(null);
    setRecommendation(null);
    setApiError(null);
    setSaveState(null);
  };

  // طبقة المراجعة تعلو التقييمات، فلو رجع المستخدم لشاشة المبارزة بعد
  // نقاشٍ حرّك مقبضاً وما تغيّر شي — المراجعة تحجبه، والبق يبان عشوائياً
  // لأنه يظهر فقط بعد نقاش عدّل تقييماً. الحل تثبيت ما جاء من النقاش
  // داخل التقييمات نفسها ثم إفراغ طبقته.
  //
  // المعايير والأوزان تبقى في المراجعة — هي إضافات لا تعارض ما يحرّكه
  // المستخدم، والمقبض ما يلمسها أصلاً.
  const settleRevision = () => {
    setRatings(revisedRatings(seeded, revision));
    setRevision((prev) => ({ ...prev, ratings: {} }));
  };

  const backToRatings = () => {
    settleRevision();
    setQuestionIndex(category.questions.length - 1);
    setStep("ratings");
  };

  // «رجوع» من شاشة التقييم وجهتها الأسئلة لا التقييم — تثبيت المراجعة
  // واحد والوجهتان مختلفتان، فلو وحّدناهما صار زر الرجوع بلا أثر
  const backToQuestions = () => {
    settleRevision();
    setQuestionIndex(category.questions.length - 1);
    setStep("questions");
  };

  const isLanding = step === "landing";

  return (
    <>
      <SiteNav
        onHome={restart}
        onVoiceMode={() => setStep("voice")}
        onSignIn={() => router.push("/login")}
        onStart={() => {
          setStep("landing");
          document
            .getElementById("main")
            ?.scrollIntoView({ behavior: "smooth" });
        }}
      />

      <main
        id="main"
        className={
          "flex w-full flex-1 flex-col " +
          (isLanding
            ? ""
            : "mx-auto max-w-3xl gap-16 px-4 py-8 sm:px-6 sm:py-12")
        }
      >
        {/* شاشة الهبوط أشرطة بعرض الشاشة تدير حاوياتها بنفسها،
            وباقي الخطوات داخل بطاقة ضيقة */}
        {isLanding ? (
          <>
            <Landing
              mood={mood}
              setMood={setMood}
              frame={frame}
              frameError={frameError}
              onOptionBlur={prefetchFrame}
              options={options}
              setOptions={setOptions}
              onStart={start}
              onVoiceMode={() => setStep("voice")}
              onBreakdown={() => setStep("breakdown")}
              onGroup={createGroup}
              groupBusy={groupBusy}
            />

            <Reveal className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6">
              <HistorySection
                onSignIn={() => router.push("/login")}
                refreshKey={saveState?.status === "saved" ? "saved" : "idle"}
              />
            </Reveal>
          </>
        ) : step === "reading" || step === "thinking" ? (
          // التفكير والنتيجة يجيبان سطحهما الحبري بنفسهما —
          // البطاقة الورقية للخطوات اللي يكتب فيها المستخدم
          <Thinking reading={step === "reading"} />
        ) : step === "result" && scored.length > 0 ? (
          <Result
            scored={scored}
            frame={frame}
            criteria={category?.criteria ?? []}
            weights={weights}
            revision={revision}
            onDiscuss={applyDiscussion}
            recommendation={recommendation}
            apiError={apiError}
            saveState={saveState}
            tone={tone}
            onRestart={restart}
            onBack={backToRatings}
            onRetry={decide}
          />
        ) : (
          <Card>
            {step === "voice" && (
              <VoiceMode
                onComplete={fromVoice}
                onCancel={() => setStep("landing")}
              />
            )}

            {/* المفتاح يعيد التفكيك من أوله لو تغيرت الخيارات */}
            {step === "breakdown" && (
              <BreakdownFlow
                key={filledOptions.map((o) => o.label).join("|")}
                options={filledOptions.map((o) => o.label)}
                categoryId={frame?.category ?? null}
                onCancel={() => setStep("landing")}
                onRestart={restart}
              />
            )}

            {step === "questions" && category && (
              <QuestionStep
                category={category}
                index={questionIndex}
                answers={answers}
                setAnswers={setAnswers}
                onAnswer={nextQuestion}
                onBack={backFromQuestion}
              />
            )}

            {step === "ratings" &&
              category &&
              (isDuel ? (
                <Duel
                  frame={frame}
                  options={filledOptions}
                  ratings={finalRatings}
                  setRatings={setRatings}
                  weights={weights}
                  onNext={() => decide()}
                  onBack={backToQuestions}
                />
              ) : (
                <RatingGrid
                  category={category}
                  options={filledOptions}
                  ratings={finalRatings}
                  setRatings={setRatings}
                  weights={weights}
                  onNext={() => decide()}
                  onBack={backToQuestions}
                />
              ))}
          </Card>
        )}
      </main>

      <SiteFooter />
    </>
  );
}
