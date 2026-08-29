import Foundation
import Supabase
import Observation

/// حالة شاشة التصويت الجماعي.
///
/// القناة تحمل شيئين: بثٌّ كجرس (صوت جديد / انقفل)، وحضورٌ للحاضرين. الجرس لا
/// يُصدَّق كبيانات أبداً: كل رنّة = إعادة جلب من `get_vote_page`، فالأرقام دائماً
/// من القاعدة لا من رسالة جهاز آخر — أي عابث يقدر يرنّ الجرس، ولا يقدر يزوّر
/// عموداً.
///
/// (تغييرات الجداول اللحظية لا تنفع هنا عمداً: RLS يحجب صفوف الجداول عن الضيوف
/// منذ إغلاق تسريب `share_code`، والبث لا يمر على RLS.)
@MainActor
@Observable
final class GroupVoteStore {

    enum State: Equatable {
        case loading
        case ready
        case notFound
        case failed(String)
    }

    let code: String

    var state: State = .loading
    var decision: GroupService.VoteDecision?
    var options: [GroupService.VoteOption] = []
    var present = 0
    var isCreator = false

    /// الاسم يُحفظ على الجهاز فيتذكّر التطبيق بنفسه ماذا اختار المستخدم.
    var name: String = ""
    var savedName: String?
    var myOptionId: UUID?

    var voteError: String?
    var busy = false
    var verdict: GroupVerdictService.Verdict?

    private var channel: RealtimeChannelV2?
    private var tasks: [Task<Void, Never>] = []
    /// دقة التحديث الحي: الإشارة تقول «فيه جديد» فقط، والأرقام تأتي من الخادم —
    /// ومنع الإغراق يمنع مصوّتاً خبيثاً من ضربنا بإعادة جلب متتالية.
    private var refetchTask: Task<Void, Never>?

    private var nameKey: String { "ahsem-vote-name" }
    private var choiceKey: String { "ahsem-vote-\(code)" }

    init(code: String) {
        self.code = code
        self.savedName = UserDefaults.standard.string(forKey: nameKey)
        self.name = savedName ?? ""
        if let stored = UserDefaults.standard.string(forKey: choiceKey) {
            self.myOptionId = UUID(uuidString: stored)
        }
    }

    var totalVotes: Double {
        options.reduce(0) { $0 + $1.weight }
    }

    func share(of option: GroupService.VoteOption) -> Double {
        totalVotes > 0 ? option.weight / totalVotes : 0
    }

    var isOpen: Bool { decision?.isOpen ?? false }

    // MARK: - الدورة

    func start() async {
        await refetch()
        guard case .ready = state, let decision else { return }

        isCreator = await GroupService.isCreator(decisionId: decision.id)

        if !decision.isOpen {
            verdict = try? await GroupVerdictService.verdict(code: code)
        }

        await subscribe(decisionId: decision.id)
    }

    func stop() {
        refetchTask?.cancel()
        tasks.forEach { $0.cancel() }
        tasks = []
        let channel = self.channel
        self.channel = nil
        Task { await channel?.unsubscribe() }
    }

    private func subscribe(decisionId: UUID) async {
        let channel = SupabaseClientProvider.shared.channel("vote:\(decisionId.uuidString)")
        self.channel = channel

        let bell = channel.broadcastStream(event: "ping")
        let presence = channel.presenceChange()

        tasks.append(Task { [weak self] in
            for await _ in bell {
                guard let self, !Task.isCancelled else { return }
                await self.scheduleRefetch()
            }
        })

        tasks.append(Task { [weak self] in
            for await change in presence {
                guard let self, !Task.isCancelled else { return }
                await MainActor.run { self.present = change.state.count }
            }
        })

        await channel.subscribe()

        if let savedName {
            try? await channel.track(["name": AnyJSON.string(savedName)])
        } else {
            try? await channel.track(["name": AnyJSON.string("ضيف")])
        }
    }

    private func scheduleRefetch() async {
        refetchTask?.cancel()
        refetchTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(400))
            guard let self, !Task.isCancelled else { return }
            await self.refetch()
        }
    }

    func refetch() async {
        do {
            let page = try await GroupService.page(code: code)
            decision = page.decision
            // ترتيب ثابت: القفز البصري مع كل صوت يفقد المستخدم مكانه
            options = page.options
            state = .ready

            if !page.decision.isOpen, verdict == nil {
                verdict = try? await GroupVerdictService.verdict(code: code)
            }
        } catch {
            state = decision == nil ? .notFound : .failed(error.localizedDescription)
        }
    }

    // MARK: - التصويت

    func vote(optionId: UUID) async {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            voteError = "اكتب اسمك أول."
            return
        }
        guard !busy else { return }

        busy = true
        voteError = nil
        defer { busy = false }

        do {
            try await GroupService.castVote(code: code, optionId: optionId, name: trimmed)
            savedName = trimmed
            myOptionId = optionId
            UserDefaults.standard.set(trimmed, forKey: nameKey)
            UserDefaults.standard.set(optionId.uuidString, forKey: choiceKey)

            try? await channel?.track(["name": AnyJSON.string(trimmed)])
            await refetch()
            // الجرس بعد نجاح الصوت: الشاشات الأخرى تعيد الجلب من القاعدة
            try? await channel?.broadcast(event: "ping", message: [:])
        } catch {
            voteError = error.localizedDescription
        }
    }

    // MARK: - الإقفال

    func close() async {
        guard let decision, !busy else { return }
        busy = true
        defer { busy = false }

        do {
            verdict = try await GroupVerdictService.close(decisionId: decision.id)
            await refetch()
            try? await channel?.broadcast(event: "ping", message: [:])
        } catch {
            voteError = error.localizedDescription
        }
    }

    var shareURL: URL { GroupService.shareURL(code: code) }
}
