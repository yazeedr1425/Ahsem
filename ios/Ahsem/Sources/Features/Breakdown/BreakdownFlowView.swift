import SwiftUI

/// تفكيك القرار الأكبر من أدوات الحسم العادية.
///
/// «أستقيل؟» لا تجاوبه ثلاثة أسئلة وشبكة تقييم. مرحلتان: فحوصات واقعية يجاوب
/// عنها اليوم، ثم حكم مركَّب من إجاباته — «اقدم» أو «ليس بعد» مع ما يقلبها
/// بالضبط وخطوة واحدة ممكنة هذا الأسبوع.
///
/// و«ليس بعد» ليست «لا»، بل ترتيب. الشاشة تحمل هذا التمييز في نبرتها كلها: من
/// يفحص قبل أن يقفز يفعل الصواب، فلا لوم في أي سطر.
struct BreakdownFlowView: View {
    let options: [String]
    let onCancel: () -> Void
    let onRestart: () -> Void

    @Environment(\.palette) private var palette

    private enum Phase: Equatable {
        case loadingChecks
        case notOversized(reason: String?)
        case answering
        case composing
        case verdict(BreakdownService.VerdictResponse)
        case failed(String)
    }

    @State private var phase: Phase = .loadingChecks
    @State private var checks: [BreakdownService.Check] = []
    @State private var given: [String: BreakdownService.Answer] = [:]

    private var allAnswered: Bool {
        !checks.isEmpty && checks.allSatisfy { given[$0.key] != nil }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            switch phase {
            case .loadingChecks:
                loading("… يفكّك قرارك لفحوصات لها جواب")

            case .notOversized(let reason):
                notOversized(reason)

            case .answering:
                answering

            case .composing:
                loading("… يركّب الحكم من إجاباتك")

            case .verdict(let verdict):
                verdictView(verdict)

            case .failed(let message):
                failure(message)
            }
        }
        .task { await loadChecks() }
    }

    // MARK: - الحالات

    private func loading(_ text: String) -> some View {
        VStack(spacing: 16) {
            ProgressView().tint(palette.accent)
            Text(text)
                .font(Typo.body(15))
                .foregroundStyle(palette.muted)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
    }

    private func notOversized(_ reason: String?) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            SectionHeading(
                title: "هذا قرار عادي",
                sub: reason?.isEmpty == false
                    ? reason
                    : "ما يحتاج تفكيكاً — الأسئلة السريعة تكفيه."
            )
            PrimaryButton(title: "كمّل عادي", action: onCancel)
        }
    }

    private var answering: some View {
        VStack(alignment: .leading, spacing: 24) {
            SectionHeading(
                tag: "تفكيك",
                title: "فحوصات لها جواب اليوم",
                sub: "لا رأي ولا إحساس — وقائع تعرفها الآن."
            )

            ProgressLine(current: given.count, total: checks.count)

            VStack(spacing: 16) {
                ForEach(checks) { check in
                    checkCard(check)
                }
            }

            HStack {
                QuietButton(title: "إلغاء", action: onCancel)
                Spacer()
            }

            PrimaryButton(title: "ركّب الحكم", isEnabled: allAnswered) {
                Task { await composeVerdict() }
            }
        }
    }

    private func checkCard(_ check: BreakdownService.Check) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(check.label)
                .font(Typo.bodyMedium(16))
                .foregroundStyle(palette.ink)
                .fixedSize(horizontal: false, vertical: true)

            if let why = check.why, !why.isEmpty {
                Text(why)
                    .font(Typo.caption(12))
                    .foregroundStyle(palette.mutedSoft)
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack(spacing: 8) {
                ForEach(BreakdownService.Answer.allCases) { answer in
                    ChoiceChip(
                        title: answer.label,
                        isSelected: given[check.key] == answer
                    ) {
                        given[check.key] = answer
                    }
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel(check.label)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(palette.cardSunken)
        }
    }

    private func verdictView(_ verdict: BreakdownService.VerdictResponse) -> some View {
        VStack(alignment: .leading, spacing: 20) {
            InkCard(padding: 26) {
                VStack(alignment: .leading, spacing: 12) {
                    Text(verdict.isGo ? "الحكم: اقدم" : "الحكم: ليس بعد")
                        .font(Typo.body(14))
                        .foregroundStyle(palette.onInkMuted)

                    Text(verdict.chosen)
                        .font(Typo.display(34))
                        .foregroundStyle(palette.onInk)
                        .fixedSize(horizontal: false, vertical: true)

                    Text(verdict.headline)
                        .font(Typo.bodySemibold(17))
                        .foregroundStyle(palette.onInk)
                        .fixedSize(horizontal: false, vertical: true)

                    Text(verdict.detail)
                        .font(Typo.body(15))
                        .lineSpacing(5)
                        .foregroundStyle(palette.onInkMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            // أثمن ما في الشاشة: تحوّل «لا» إلى «التأجيل أنسب، وهذا الطريق»
            if !verdict.missing.isEmpty {
                GlassCard(padding: 20) {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("يصير «اقدم» لو توفّر")
                            .font(Typo.heading(17))
                            .foregroundStyle(palette.ink)

                        ForEach(Array(verdict.missing.enumerated()), id: \.offset) { _, item in
                            HStack(alignment: .top, spacing: 10) {
                                Image(systemName: "circle")
                                    .font(.system(size: 7))
                                    .foregroundStyle(palette.accent)
                                    .padding(.top, 7)
                                Text(item)
                                    .font(Typo.body(15))
                                    .foregroundStyle(palette.ink)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                }
            }

            GlassCard(padding: 20) {
                VStack(alignment: .leading, spacing: 6) {
                    Label("خطوة هذا الأسبوع", systemImage: "figure.walk")
                        .font(Typo.bodySemibold(15))
                        .foregroundStyle(palette.ink)

                    Text(verdict.next_step)
                        .font(Typo.body(15))
                        .lineSpacing(4)
                        .foregroundStyle(palette.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            PrimaryButton(title: "ابدأ من جديد", action: onRestart)
        }
    }

    private func failure(_ message: String) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(message)
                .font(Typo.body(15))
                .foregroundStyle(palette.ink)
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: 14) {
                GhostButton(title: "أعد المحاولة") {
                    Task { await loadChecks() }
                }
                QuietButton(title: "إلغاء", action: onCancel)
            }
        }
    }

    // MARK: - النداءات

    private func loadChecks() async {
        phase = .loadingChecks
        do {
            let response = try await BreakdownService.checks(for: options)
            guard response.oversized else {
                phase = .notOversized(reason: response.reason)
                return
            }
            checks = response.questions
            given = [:]
            phase = .answering
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }

    private func composeVerdict() async {
        phase = .composing
        let answers = checks.compactMap { check -> BreakdownService.AnsweredCheck? in
            guard let answer = given[check.key] else { return nil }
            return BreakdownService.AnsweredCheck(
                label: check.label,
                answer: answer.rawValue,
                favors: check.favors
            )
        }

        do {
            phase = .verdict(try await BreakdownService.verdict(options: options, answers: answers))
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }
}
