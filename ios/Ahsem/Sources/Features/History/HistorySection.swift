import SwiftUI

/// سجل القرارات — وتحت كل قرار سؤال «كانت صح؟».
///
/// الإجابة ليست زينة: هي ما يغذّي قراءة الأنماط، ولهذا يُسأل بعد وقوع القرار لا
/// قبله.
struct HistorySection: View {
    @Environment(AuthStore.self) private var auth
    @Environment(\.palette) private var palette

    @State private var decisions: [DecisionsService.RecentDecision] = []
    @State private var loading = false
    @State private var showsAuth = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("سجل قراراتك")
                .font(Typo.title(22))
                .foregroundStyle(palette.ink)

            if !auth.isSignedIn {
                signedOutNote
            } else if loading && decisions.isEmpty {
                ProgressView().tint(palette.accent)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 20)
            } else if decisions.isEmpty {
                Text("ما فيه قرارات محفوظة بعد. أول حسم يظهر هنا.")
                    .font(Typo.body(15))
                    .foregroundStyle(palette.muted)
            } else {
                VStack(spacing: 12) {
                    ForEach(decisions) { decision in
                        DecisionRow(decision: decision) { rating in
                            await rate(decision: decision, satisfaction: rating)
                        }
                    }
                }

                NavigationLink {
                    PatternsView()
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "sparkles")
                        Text("اقرأ شخصيتك القرارية")
                        Spacer()
                        Image(systemName: "chevron.backward")
                            .font(.system(size: 12, weight: .semibold))
                    }
                    .font(Typo.bodyMedium(15))
                    .foregroundStyle(palette.ink)
                    .padding(16)
                    .background {
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .fill(palette.accentSoft)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .task(id: auth.isSignedIn) { await load() }
        .sheet(isPresented: $showsAuth) {
            NavigationStack { AuthView() }
                .environment(\.palette, palette)
                .environment(\.layoutDirection, .rightToLeft)
        }
    }

    private var signedOutNote: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("سجّل الدخول ليُحفظ قرارك ويتعلّم الحسم من عاداتك.")
                .font(Typo.body(15))
                .foregroundStyle(palette.muted)
                .fixedSize(horizontal: false, vertical: true)

            GhostButton(title: "دخول") { showsAuth = true }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(palette.cardSunken)
        }
    }

    private func load() async {
        guard auth.isSignedIn else {
            decisions = []
            return
        }
        loading = true
        defer { loading = false }
        decisions = (try? await DecisionsService.recent(limit: 6)) ?? []
    }

    private func rate(decision: DecisionsService.RecentDecision, satisfaction: Int) async {
        try? await FeedbackService.rate(decisionId: decision.id, satisfaction: satisfaction)
        await load()
    }
}

/// قرار واحد في السجل، ومعه سؤال الرضا.
private struct DecisionRow: View {
    let decision: DecisionsService.RecentDecision
    let onRate: (Int) async -> Void

    @Environment(\.palette) private var palette
    @State private var busy = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                if let category = Categories.get(decision.category) {
                    Text(category.label)
                        .font(Typo.caption(11))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .foregroundStyle(palette.muted)
                        .background { Capsule().fill(palette.cardSunken) }
                }
                Spacer()
                if let date = decision.createdAt {
                    Text(date.formatted(.relative(presentation: .named)))
                        .font(Typo.caption(11))
                        .foregroundStyle(palette.mutedSoft)
                }
            }

            Text(decision.title ?? "قرار")
                .font(Typo.body(15))
                .foregroundStyle(palette.muted)
                .fixedSize(horizontal: false, vertical: true)

            if let chosen = decision.chosen {
                Label(chosen, systemImage: "trophy")
                    .font(Typo.bodySemibold(16))
                    .foregroundStyle(palette.ink)
            }

            outcomeAsk
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(palette.card)
                .overlay {
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .stroke(palette.line, lineWidth: 1)
                }
        }
    }

    /// «كانت صح؟» — خمس درجات، وما يُجاب عليه مرة يبقى معروضاً بجوابه.
    private var outcomeAsk: some View {
        VStack(alignment: .leading, spacing: 8) {
            PaperRule()

            HStack(spacing: 10) {
                Text(decision.satisfaction == nil ? "كانت صح؟" : "قيّمتها")
                    .font(Typo.caption(12))
                    .foregroundStyle(palette.muted)

                Spacer(minLength: 0)

                HStack(spacing: 4) {
                    ForEach(1...5, id: \.self) { value in
                        Button {
                            guard !busy else { return }
                            busy = true
                            Task {
                                await onRate(value)
                                busy = false
                            }
                        } label: {
                            Image(systemName: (decision.satisfaction ?? 0) >= value
                                  ? "star.fill" : "star")
                                .font(.system(size: 15))
                                .foregroundStyle(
                                    (decision.satisfaction ?? 0) >= value
                                        ? palette.accent : palette.mutedSoft
                                )
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("\(value.arabicDigits) من ٥")
                    }
                }
                .disabled(busy)
            }
        }
    }
}
