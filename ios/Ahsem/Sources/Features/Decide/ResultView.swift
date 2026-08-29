import SwiftUI

/// الحكم حبري والحساب ورقي — نفس البطاقة الغامقة، لكن بالحجم الكامل: ما شافه
/// المستخدم وعداً أول ما دخل يشوفه الآن حقيقةً.
///
/// والنقاش يعيش هنا لا في مكوّنه: البطاقة الحبرية لازم تتبع الحكم بعد أي تعديل،
/// فلو ملك المكوّنُ حالتَه صار للحقيقة مصدران — بطاقة تقول شيئاً وفقاعةٌ تحتها
/// تقول غيره.
struct ResultView: View {
    @Bindable var store: DecideFlowStore
    @Environment(\.palette) private var palette
    @AccessibilityFocusState private var headingFocused: Bool

    @State private var showDetails = false
    @State private var spinning = false
    @State private var flashLabel: String?
    @State private var randomPick: ScoredOption?
    /// الحكم بعد النقاش. `nil` = لم يتغيّر شيء، فيبقى حكم النموذج الأصلي.
    @State private var revised: (winner: String, reason: String)?
    @State private var turns: [DiscussTurn] = []
    @State private var talkBusy = false
    @State private var talkError: String?

    private static let spinDuration: Duration = .milliseconds(1200)

    private var scored: [ScoredOption] { store.scored }
    private var recommendation: DecideService.Verdict? { store.recommendation }

    private var chosen: String {
        revised?.winner ?? recommendation?.winner ?? scored.first?.label ?? ""
    }

    private var reason: String {
        revised?.reason ?? recommendation?.reason ?? Explain.reasonPhrase(scored)
    }

    private var voice: Voice { Voice.of(store.tone) }

    private var localWinner: ScoredOption? { scored.first }

    /// حكم النموذج قد يخالف حساب الأوزان — وهذا معلن لا مخفي.
    private var disagrees: Bool {
        guard revised == nil, let local = localWinner else { return false }
        return local.label != chosen
    }

    private var decisiveKey: String? {
        revised == nil ? recommendation?.decisiveCriterion : nil
    }

    private var decisiveCriterion: BreakdownRow? {
        guard let decisiveKey else { return nil }
        return scored.first?.breakdown.first { $0.key == decisiveKey }
    }

    private var withChances: [ScoredOption] { ScoreEngine.chances(scored) }

    var body: some View {
        VStack(spacing: 20) {
            verdictCard

            if let error = store.apiError { localFallbackNote(error) }
            if disagrees, let local = localWinner { disagreementNote(local) }

            weightsCard
            aftermathCards

            if !(store.category?.criteria.isEmpty ?? true) {
                VerdictChatView(
                    turns: turns,
                    busy: talkBusy,
                    error: talkError,
                    onSend: { text in Task { await talk(text) } }
                )
            }

            hesitantCard

            if let saveState = store.saveState { saveStateNote(saveState) }

            HStack {
                Button(action: store.backToRatings) {
                    HStack(spacing: 6) {
                        Image(systemName: "chevron.forward")
                            .font(.system(size: 13, weight: .semibold))
                        Text("عدّل التقييمات")
                    }
                    .font(Typo.body(15))
                    .foregroundStyle(palette.muted)
                }
                .buttonStyle(.plain)

                Spacer()
            }

            PrimaryButton(title: voice.restart, action: store.restart)
        }
        .onAppear { headingFocused = true }
    }

    // MARK: - الحكم

    private var verdictCard: some View {
        InkCard(padding: 28) {
            VStack(alignment: .leading, spacing: 0) {
                Text(revised != nil ? "بعد كلامك، قرارك هو" : "قرارك هو")
                    .font(Typo.body(14))
                    .foregroundStyle(palette.onInkMuted)

                Text(chosen)
                    .font(Typo.display(42))
                    .foregroundStyle(palette.onInk)
                    .padding(.top, 12)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityFocused($headingFocused)

                // فقاعة المحادثة
                HStack(alignment: .top, spacing: 12) {
                    Text("حـ")
                        .font(Typo.heading(17))
                        .foregroundStyle(palette.accentInk)
                        .frame(width: 40, height: 40)
                        .background {
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .fill(palette.accent)
                        }
                        .rotationEffect(.degrees(-3))

                    Text(reason)
                        .font(Typo.body(16))
                        .lineSpacing(5)
                        .foregroundStyle(palette.onInk)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 14)
                        .background {
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .fill(Color.white.opacity(0.05))
                                .overlay {
                                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                                        .stroke(palette.lineInk, lineWidth: 1)
                                }
                        }
                }
                .padding(.top, 28)
            }
        }
        // نص مكافئ للقارئ: النتيجة والسبب في جملة واحدة
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("قرارك هو \(chosen). \(reason)")
    }

    private func localFallbackNote(_ message: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 14))
                .padding(.top, 2)

            VStack(alignment: .leading, spacing: 6) {
                Text("\(message) — هذي نتيجة الحساب المحلي بالأوزان.")
                    .fixedSize(horizontal: false, vertical: true)

                Button("جرب مرة ثانية") {
                    Task { await store.decide() }
                }
                .font(Typo.body(14))
                .foregroundStyle(palette.accentStrong)
            }
        }
        .font(Typo.body(14))
        .foregroundStyle(palette.muted)
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background { dashedSurface }
    }

    private func disagreementNote(_ local: ScoredOption) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "scalemass")
                .font(.system(size: 14))
                .padding(.top, 2)

            Text("حسابي بالأوزان يقول «\(local.label)»، بس شفت إن «\(chosen)» أنسب لك اليوم.")
                .fixedSize(horizontal: false, vertical: true)
        }
        .font(Typo.body(14))
        .foregroundStyle(palette.muted)
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background { dashedSurface }
    }

    private var dashedSurface: some View {
        RoundedRectangle(cornerRadius: 18, style: .continuous)
            .fill(palette.card)
            .overlay {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(palette.lineStrong, style: StrokeStyle(lineWidth: 1, dash: [5, 4]))
            }
    }

    // MARK: - الترتيب حسب الأوزان

    private var weightsCard: some View {
        GlassCard(padding: 20) {
            VStack(alignment: .leading, spacing: 16) {
                Text("حسابك بالأوزان")
                    .font(Typo.heading(18))
                    .foregroundStyle(palette.ink)

                ForEach(scored) { option in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            if option.label == chosen {
                                Image(systemName: "trophy")
                                    .font(.system(size: 13))
                            }
                            Text(option.label)
                                .font(option.label == chosen
                                      ? Typo.bodySemibold(16) : Typo.body(16))
                                .foregroundStyle(option.label == chosen ? palette.ink : palette.muted)

                            Spacer(minLength: 8)

                            Text("\(option.percent.arabicDigits)٪")
                                .font(Typo.body(14))
                                .foregroundStyle(palette.muted)
                        }

                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                Capsule().fill(palette.line)
                                Capsule()
                                    .fill(palette.actionGradient)
                                    .frame(width: geo.size.width * CGFloat(option.percent) / 100)
                            }
                        }
                        .frame(height: 6)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("\(option.label) \(option.percent.arabicDigits) بالمئة")
                }

                // الوصل: حكم النموذج وحساب الجهاز كانا يظهران كرأيين منفصلين،
                // وهذا السطر يقول على أي معيار التقيا
                if let decisive = decisiveCriterion {
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: "trophy")
                            .font(.system(size: 14))
                            .foregroundStyle(palette.accentStrong)
                            .padding(.top, 2)

                        Text(decisiveLine(decisive))
                            .font(Typo.body(14))
                            .lineSpacing(4)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background {
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .fill(palette.accentSoft)
                    }
                }

                Button {
                    withAnimation(.easeInOut(duration: 0.2)) { showDetails.toggle() }
                } label: {
                    HStack(spacing: 4) {
                        Text(showDetails ? "أخفِ التفاصيل" : "وضّح أكثر")
                        Image(systemName: showDetails ? "chevron.up" : "chevron.down")
                            .font(.system(size: 12, weight: .semibold))
                    }
                    .font(Typo.body(14))
                    .foregroundStyle(palette.accentStrong)
                }
                .buttonStyle(.plain)

                if showDetails { detailsList }
            }
        }
    }

    private func decisiveLine(_ decisive: BreakdownRow) -> AttributedString {
        var text = AttributedString("الحاسم كان ")
        var label = AttributedString(decisive.label)
        label.font = Typo.bodySemibold(14)
        text.append(label)
        text.append(AttributedString(
            recommendation?.edge.map { " — \($0)" } ?? "."
        ))
        return text
    }

    private var detailsList: some View {
        VStack(alignment: .leading, spacing: 12) {
            PaperRule()

            ForEach(Explain.detailedBreakdown(scored)) { detail in
                VStack(alignment: .leading, spacing: 2) {
                    Text(detail.label)
                        .font(Typo.bodyMedium(14))
                        .foregroundStyle(palette.ink)
                    Text("\(detail.importance) — \(detail.verdict)")
                        .font(Typo.body(14))
                        .foregroundStyle(palette.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, detail.key == decisiveKey ? 10 : 0)
                .padding(.vertical, detail.key == decisiveKey ? 8 : 0)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background {
                    if detail.key == decisiveKey {
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(palette.accentSoft)
                    }
                }
            }
        }
        .transition(.opacity)
    }

    // MARK: - ما بعد الحكم

    /// سطران فقط — «وش تخسر» يبرّر، و«متى ينقلب» يعطي قاعدة تُستعمل بلا التطبيق.
    /// خارج البطاقة عمداً: البطاقة الحبرية فوق هي الحكم، وتعشيش هذين داخل بطاقة
    /// ثانية يؤطّره مرتين.
    @ViewBuilder
    private var aftermathCards: some View {
        let items: [(title: String, body: String, icon: String)] = [
            recommendation?.costOfSwitching.map { ("وش تخسر لو غيّرت", $0, "scalemass") },
            recommendation?.flipCondition.map { ("ينقلب القرار لو", $0, "shuffle") },
        ].compactMap { $0 }

        if !items.isEmpty, revised == nil {
            VStack(spacing: 12) {
                ForEach(items, id: \.title) { item in
                    GlassCard(padding: 18) {
                        VStack(alignment: .leading, spacing: 6) {
                            Label(item.title, systemImage: item.icon)
                                .font(Typo.bodySemibold(14))
                                .foregroundStyle(palette.ink)

                            Text(item.body)
                                .font(Typo.body(14))
                                .lineSpacing(4)
                                .foregroundStyle(palette.muted)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
            }
        }
    }

    // MARK: - أنا متردد جدًا

    private var hesitantCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(voice.hesitantPrompt)
                .font(Typo.body(14))
                .foregroundStyle(palette.muted)
                .fixedSize(horizontal: false, vertical: true)

            if spinning || randomPick != nil {
                HStack(spacing: 10) {
                    if spinning {
                        Text(flashLabel ?? "")
                            .font(Typo.title(26))
                    } else if let randomPick {
                        Image(systemName: "dice")
                            .font(.system(size: 24))
                        Text(randomPick.label)
                            .font(Typo.title(26))
                    }
                }
                .foregroundStyle(palette.ink)
                .frame(maxWidth: .infinity)
                .animation(nil, value: flashLabel)
            }

            if let randomPick, !spinning {
                Text(voice.randomResult(randomPick.label))
                    .font(Typo.body(14))
                    .foregroundStyle(palette.muted)
                    .frame(maxWidth: .infinity)
                    .multilineTextAlignment(.center)
            }

            GhostButton(
                title: spinning ? "…" : (randomPick != nil ? "مرة ثانية" : "أنا متردد جدًا"),
                isEnabled: !spinning
            ) {
                Task { await spin() }
            }

            Text("الحظوظ: " + withChances
                .map { "\($0.label) \($0.chance.arabicDigits)٪" }
                .joined(separator: " · "))
                .font(Typo.caption(12))
                .foregroundStyle(palette.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            RoundedRectangle(cornerRadius: Palette.radiusCard, style: .continuous)
                .fill(palette.cardSunken)
                .overlay {
                    RoundedRectangle(cornerRadius: Palette.radiusCard, style: .continuous)
                        .stroke(palette.lineStrong, style: StrokeStyle(lineWidth: 1, dash: [5, 4]))
                }
        }
    }

    /// سحبة موزونة: الأعلى مرجَّح لكنه غير مضمون. الوميض تمثيلٌ للدوران، والنتيجة
    /// محسوبة قبله — فلا يقرر العرضُ شيئاً.
    private func spin() async {
        guard !spinning else { return }
        randomPick = nil
        spinning = true

        let pick = ScoreEngine.weightedRandomPick(scored)

        let flashing = Task {
            while !Task.isCancelled {
                flashLabel = scored.randomElement()?.label
                try? await Task.sleep(for: .milliseconds(80))
            }
        }

        try? await Task.sleep(for: Self.spinDuration)
        flashing.cancel()
        flashLabel = nil
        spinning = false
        randomPick = pick
    }

    // MARK: - حالة الحفظ

    @ViewBuilder
    private func saveStateNote(_ state: DecideFlowStore.SaveState) -> some View {
        HStack(spacing: 6) {
            switch state {
            case .saving:
                Text("… يحفظ في سجلك")
            case .saved:
                Image(systemName: "checkmark.circle")
                Text("انحفظ في سجلك")
            case .failed(let message):
                Image(systemName: "exclamationmark.triangle")
                Text(message)
            }
            Spacer(minLength: 0)
        }
        .font(Typo.body(14))
        .foregroundStyle(palette.muted)
    }

    // MARK: - النقاش

    /// النقاش بعد الحساب لا قبله: المستخدم يعترض على شيء يراه.
    private func talk(_ text: String) async {
        let before = chosen
        turns.append(DiscussTurn(role: .user, text: text))
        talkBusy = true
        talkError = nil
        defer { talkBusy = false }

        guard let category = store.category else { return }

        // الأرقام تُقرأ من النتيجة نفسها: هي ما رسمته الشاشة، فالنموذج يجادل بما
        // يراه المستخدم لا بنسخة موازية
        let ratings = Dictionary(
            uniqueKeysWithValues: scored.map { option in
                (option.label, Dictionary(
                    uniqueKeysWithValues: option.breakdown.map { ($0.key, $0.rating) }
                ))
            }
        )

        do {
            let result = try await DiscussService.send(
                options: scored.map(\.label),
                criteria: category.criteria,
                weights: store.weights,
                ratings: ratings,
                verdict: .init(
                    chosen: chosen,
                    reason: reason,
                    decisive: decisiveKey,
                    flip: recommendation?.flipCondition
                ),
                lead: DiscussService.describeLead(
                    scored: scored,
                    criteria: category.criteria,
                    weights: store.weights
                ),
                turns: turns,
                spent: store.revision.spent,
                message: text
            )

            var flippedTo: String?
            if !result.changes.isEmpty {
                store.revision = store.revision.merging(
                    result.changes,
                    options: store.filledOptions
                )
                let after = store.scored.first?.label ?? before
                if after != before { flippedTo = after }
                revised = (winner: after, reason: result.reply)

                // المقارنة بالفائز المحفوظ لا بالمحسوب: المحفوظ هو حكم النموذج،
                // وقد يخالف الحساب المحلي أصلاً.
                if let decisionId = store.decisionId.flatMap(UUID.init(uuidString:)),
                   after != store.savedWinner {
                    // رد الدورة يمشي معه ليقيَّد في السجل *لماذا* انقلب الحكم،
                    // فالواقعة بلا سببها تقول نصف ما جرى
                    try? await DecisionsService.updateWinner(
                        decisionId: decisionId,
                        chosen: after,
                        reason: result.reply
                    )
                    store.savedWinner = after
                }
            }

            turns.append(DiscussTurn(
                role: .agent,
                text: result.reply,
                applied: result.changes.count,
                flippedTo: flippedTo
            ))
        } catch {
            talkError = error.localizedDescription
        }
    }
}
