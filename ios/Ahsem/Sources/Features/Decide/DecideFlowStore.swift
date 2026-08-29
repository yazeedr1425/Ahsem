import Foundation
import Observation

/// حالة التدفق الرئيسي — مقابل `app/page.js` في النسخة الويب.
///
/// القاعدة المنقولة معها: كل ما يمكن اشتقاقه يُشتق عند العرض لا يُخزَّن. الإطار
/// موسوم بالخيارات التي بُني لها، فإطارٌ لخيارٍ ما عاد موجوداً يسقط من نفسه بلا
/// تصفير داخل أثر جانبي.
@MainActor
@Observable
final class DecideFlowStore {

    enum Step: Equatable {
        case landing
        /// بناء الإطار قبل أول سؤال — الأسئلة نفسها منه.
        case reading
        case questions
        case ratings
        case thinking
        case result
        case voice
        case breakdown
    }

    // MARK: - الحالة

    var step: Step = .landing
    var questionIndex = 0

    /// نص من حرف واحد مرفوض سلفاً عند الخادم، فلا نبني له إطاراً.
    private let minLabelLength = 2

    var options: [DecisionOption] = [
        DecisionOption(id: "opt-1", label: ""),
        DecisionOption(id: "opt-2", label: ""),
    ]
    var answers: AnswerMap = [:]
    var ratings: RatingMap = [:]
    var tone: Tone = .default

    /// الإطار المولّد، موسوماً بمفتاح الخيارات التي بُني لها.
    private var framed: (key: String, frame: FramePayload)?
    /// المحادثة الصوتية ترجّع معرّف فئة ثابتة — مصدران للقالب، ومخرَج واحد
    /// يقرأه المحرك.
    var voiceCategoryId: String?
    var frameError: String?

    var revision: Revision = .empty

    /// ما هو محفوظ فعلاً في السجل، لا ما تحسبه الشاشة. الحفظ يقع لحظة ظهور
    /// النتيجة والنقاش يأتي بعده، فبدون هذين يبقى العمود على فائزٍ رفضه
    /// المستخدم — والخادم يقرأه ليستنتج عاداته.
    var decisionId: String?
    var savedWinner: String?

    var recommendation: DecideService.Verdict?
    var apiError: String?
    var saveState: SaveState?
    var groupBusy = false
    /// كود التصويت المنشأ حالاً — تفتح عليه الشاشة، والمنشئ يشارك الرابط من هناك.
    var pendingVoteCode: VoteCode?
    /// إنشاء التصويت يحتاج دخولاً لأن القرار يُملَك؛ الضيوف يصوّتون بلا حسابات.
    var needsSignIn = false

    enum SaveState: Equatable {
        case saving
        case saved
        case failed(String)
    }

    private let theme: MoodTheme
    private let auth: AuthStore

    init(theme: MoodTheme, auth: AuthStore) {
        self.theme = theme
        self.auth = auth
    }

    // MARK: - المشتقات

    var filledOptions: [DecisionOption] {
        options.compactMap { option in
            let label = option.label.trimmingCharacters(in: .whitespacesAndNewlines)
            return label.isEmpty ? nil : DecisionOption(id: option.id, label: label)
        }
    }

    var optionsKey: String {
        filledOptions.map(\.label).joined(separator: "|")
    }

    /// الإطار الصالح لهذه الخيارات بعينها — أو `nil` لو تغيّر النص بعد بنائه.
    var frame: FramePayload? {
        framed?.key == optionsKey ? framed?.frame : nil
    }

    /// القالب الذي يقرأه المحرك: مولّد من الإطار، أو فئة ثابتة لو جاء القرار من
    /// المحادثة الصوتية.
    private var baseCategory: Category? {
        if let frame { return frame.asCategory(answers: answers) }
        if let voiceCategoryId { return Categories.get(voiceCategoryId) }
        return nil
    }

    var category: Category? {
        revision.applied(to: baseCategory)
    }

    /// الفئة المحفوظة في السجل — قيد `CHECK` على العمود، فلها قيمة دائماً.
    var decisionCategory: String {
        frame?.category ?? voiceCategoryId ?? "life"
    }

    var weights: WeightMap {
        guard let category else { return [:] }
        return revision.applied(
            to: ScoreEngine.weights(category: category, answers: answers, moodId: theme.moodId)
        )
    }

    /// تقدير النموذج يملأ ما لم يلمسه المستخدم — اشتقاقاً عند العرض لا ضبطاً
    /// داخل أثر، فتعديلٌ سبق وصول الإطار لا يُمحى.
    private var seededRatings: RatingMap {
        Duel.withPriors(ratings: ratings, frame: frame, options: filledOptions)
    }

    var finalRatings: RatingMap {
        revision.applied(to: seededRatings)
    }

    var scored: [ScoredOption] {
        guard let category, !filledOptions.isEmpty else { return [] }
        return ScoreEngine.score(
            category: category,
            options: filledOptions,
            ratings: finalRatings,
            weights: weights
        )
    }

    /// المبارزة للخيارين بإطار مولّد. المحادثة الصوتية بلا إطار، وثلاثة خيارات
    /// فأكثر تبقى على الشبكة لأن القيمة المطلقة تهم هناك.
    var isDuel: Bool {
        filledOptions.count == 2 && frame != nil
    }

    var canStart: Bool {
        let labels = options.map { $0.label.trimmingCharacters(in: .whitespacesAndNewlines) }
        return labels.count >= ScoreEngine.minOptions
            && labels.allSatisfy { $0.count >= minLabelLength }
    }

    // MARK: - الخيارات

    func addOption() {
        guard options.count < ScoreEngine.maxOptions else { return }
        options.append(DecisionOption(label: ""))
    }

    func removeOption(id: String) {
        guard options.count > ScoreEngine.minOptions else { return }
        options.removeAll { $0.id == id }
        ratings[id] = nil
    }

    // MARK: - بناء الإطار

    /// النداء الجاري محفوظ هنا لا في حالة معروضة: الضغط أثناء البناء ينتظر
    /// النداء نفسه بدل أن يطلق ثانياً.
    private var pending: (key: String, task: Task<FramePayload?, Never>)?

    @discardableResult
    private func buildFrame(key: String, labels: [String]) async -> FramePayload? {
        if let pending, pending.key == key { return await pending.task.value }

        let task = Task<FramePayload?, Never> { [weak self] in
            guard let self else { return nil }
            do {
                let built = try await FrameService.frame(for: labels)
                await MainActor.run {
                    self.frameError = nil
                    if let built { self.framed = (key, built) }
                }
                return built
            } catch {
                await MainActor.run {
                    self.frameError = (error as? APIError)?.localizedDescription
                        ?? "تعذّر تجهيز الأسئلة. أعد المحاولة."
                }
                return nil
            }
        }

        pending = (key, task)
        let result = await task.value
        if pending?.key == key { pending = nil }
        return result
    }

    /// الإطلاق المبكر: عند خروج المؤشر من حقل خيار، لا عند الضغط على «احسمها
    /// لي». المستخدم عادةً يقرأ ما كتبه قبل أن يمد يده للزر، فهذه ثانيتان إلى
    /// أربع مجاناً — وضربة الكاش على الخادم تجعل الخروج والدخول المتكرر بلا كلفة.
    ///
    /// الشرط أن تكون كل الحقول المعروضة مكتوبة: حقل فارغ يعني أن المستخدم لم
    /// ينتهِ، وبناء إطار لخيارات ناقصة يُرمى بعد سطر.
    func prefetchFrame() {
        guard canStart else { return }
        let labels = options.map { $0.label.trimmingCharacters(in: .whitespacesAndNewlines) }
        let key = labels.joined(separator: "|")
        guard framed?.key != key, pending?.key != key else { return }
        Task { await buildFrame(key: key, labels: labels) }
    }

    // MARK: - التنقّل

    func start() async {
        answers = [:]
        ratings = [:]
        questionIndex = 0
        frameError = nil

        // جاهز من الإطلاق المبكر؟ انتقال فوري بلا شاشة انتظار
        if frame != nil {
            step = .questions
            return
        }

        step = .reading
        let labels = filledOptions.map(\.label)
        let built = await buildFrame(key: labels.joined(separator: "|"), labels: labels)
        step = built != nil ? .questions : .landing
    }

    /// القرار الجماعي: يُنشئ ويفتح شاشة التصويت — المنشئ يشارك الرابط من هناك.
    func createGroup() async {
        guard !groupBusy else { return }
        guard auth.isSignedIn else {
            needsSignIn = true
            return
        }

        groupBusy = true
        defer { groupBusy = false }

        // التصويت يحتاج فئة للحفظ لا أسئلة، فالإطار هنا وسيلة لا غاية. ولو فشل
        // أكملنا بـ«حياة» بدل أن نمنع إنشاء تصويت لأجل حقل تصنيف — هذا سقوط في
        // وسم داخلي، لا محتوى مصنوع يُعرض على أنه مولَّد.
        let labels = filledOptions.map(\.label)
        let built = frame ?? (await buildFrame(key: labels.joined(separator: "|"), labels: labels))

        do {
            let code = try await GroupService.create(
                categoryId: built?.category ?? "life",
                options: labels
            )
            pendingVoteCode = VoteCode(id: code)
        } catch GroupService.GroupError.unauthenticated {
            needsSignIn = true
        } catch {
            apiError = error.localizedDescription
        }
    }

    func nextQuestion() {
        guard let category else { return }
        if questionIndex + 1 < category.questions.count {
            questionIndex += 1
        } else {
            step = .ratings
        }
    }

    func backFromQuestion() {
        if questionIndex == 0 { step = .landing } else { questionIndex -= 1 }
    }

    /// طبقة المراجعة تعلو التقييمات، فلو رجع المستخدم لشاشة المبارزة بعد نقاشٍ
    /// حرّك مقبضاً ولم يتغيّر شيء — المراجعة تحجبه. الحل تثبيت ما جاء من النقاش
    /// داخل التقييمات نفسها ثم إفراغ طبقته.
    ///
    /// المعايير والأوزان تبقى في المراجعة — هي إضافات لا تعارض ما يحرّكه
    /// المستخدم، والمقبض لا يلمسها أصلاً.
    private func settleRevision() {
        ratings = revision.applied(to: seededRatings)
        revision.ratings = [:]
    }

    func backToRatings() {
        settleRevision()
        questionIndex = max(0, (category?.questions.count ?? 1) - 1)
        step = .ratings
    }

    /// «رجوع» من شاشة التقييم وجهتها الأسئلة لا التقييم — تثبيت المراجعة واحد
    /// والوجهتان مختلفتان، فلو وحّدناهما صار زر الرجوع بلا أثر.
    func backToQuestions() {
        settleRevision()
        questionIndex = max(0, (category?.questions.count ?? 1) - 1)
        step = .questions
    }

    func restart() {
        step = .landing
        questionIndex = 0
        framed = nil
        pending = nil
        voiceCategoryId = nil
        frameError = nil
        theme.moodId = nil
        options = [
            DecisionOption(id: "opt-1", label: ""),
            DecisionOption(id: "opt-2", label: ""),
        ]
        answers = [:]
        ratings = [:]
        revision = .empty
        decisionId = nil
        savedWinner = nil
        recommendation = nil
        apiError = nil
        saveState = nil
    }

    // MARK: - الحسم

    /// التوصية تأتي من الخادم، والحساب المحلي يبقى خط رجعة لو فشل النداء حتى لا
    /// تنكسر الشاشة على المستخدم.
    func decide() async {
        step = .thinking
        apiError = nil
        recommendation = nil
        saveState = nil
        // بدونه، نقاش قرارٍ سابق يعدّل حساب القرار التالي
        revision = .empty
        decisionId = nil
        savedWinner = nil

        let labels = filledOptions.map(\.label)
        // إجابات المسار وحدها: الرجوع وتغيير السؤال الأول يبدّل الفرع، فتبقى
        // إجابة الفرع القديم بمفتاح ما عاد أحد يسأل عنه — وإرسالها للنموذج تعني
        // موقفاً تراجع عنه المستخدم.
        let finalAnswers = frame?.pathAnswers(answers) ?? answers
        let currentScored = scored

        do {
            recommendation = try await DecideService.decide(
                options: filledOptions,
                answers: finalAnswers,
                userId: auth.userId,
                categoryId: decisionCategory,
                frame: frame,
                tone: tone
            )
        } catch {
            apiError = (error as? APIError)?.localizedDescription
                ?? "تعذّر الوصول إلى المحرك. تحقق من اتصالك."
            // الحساب المحلي يحمل الشاشة — الأرقام هي هي، والفارق نبرة السطر
            recommendation = DecideService.localVerdict(scored: currentScored, tone: tone)
        }

        step = .result

        // الحفظ بعد ظهور النتيجة — لا نجعل المستخدم ينتظره
        guard let verdict = recommendation, !verdict.isLocal else { return }
        await save(verdict: verdict, labels: labels, answers: finalAnswers)
    }

    /// المحادثة الصوتية تعطينا كل شيء دفعة واحدة — بما فيه التقييمات. الوكيل
    /// يرجّعها مفهرسة بنص الخيار، والمحرك يريدها بمعرّف الخيار.
    func applyVoice(_ state: AssistService.State) async {
        let voiceOptions = (state.options ?? []).enumerated().map { index, label in
            DecisionOption(id: "voice-\(index)", label: label)
        }
        guard voiceOptions.count >= ScoreEngine.minOptions else { return }

        framed = nil
        voiceCategoryId = state.categoryId
        options = voiceOptions
        answers = state.answerMap
        ratings = state.ratingMap(for: voiceOptions)

        await decide()
    }

    private func save(
        verdict: DecideService.Verdict,
        labels: [String],
        answers: AnswerMap
    ) async {
        saveState = .saving
        do {
            let id = try await DecisionsService.save(
                categoryId: decisionCategory,
                options: labels,
                chosen: verdict.winner,
                reason: verdict.reason,
                answers: answers,
                weights: weights
            )
            decisionId = id
            savedWinner = verdict.winner
            saveState = .saved
        } catch {
            saveState = .failed(
                (error as? APIError)?.localizedDescription ?? "تعذر الحفظ في السجل."
            )
        }
    }
}
