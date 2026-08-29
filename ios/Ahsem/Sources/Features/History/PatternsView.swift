import SwiftUI

/// «شخصيتك القرارية» — قراءة الأنماط من سجلك.
///
/// كل الإحصاء يُحسب في الكود؛ النموذج يفسّر ولا يعدّ. والشاشة تقول ذلك ضمناً:
/// الأرقام معروضة بجانب القراءة، فمن أراد التحقق يقارن.
struct PatternsView: View {
    @Environment(\.palette) private var palette

    @State private var response: PatternsService.Response?
    @State private var error: String?
    @State private var loading = true

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                if loading {
                    ProgressView().tint(palette.accent)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 60)
                } else if let error {
                    SectionHeading(title: "تعثّرت القراءة", sub: error)
                    GhostButton(title: "أعد المحاولة") { Task { await load() } }
                } else if let response {
                    if response.ready, let reading = response.reading {
                        readingBody(reading, stats: response.stats)
                    } else {
                        notEnoughYet(response)
                    }
                }
            }
            .padding(22)
        }
        .background(palette.background.ignoresSafeArea())
        .navigationTitle("شخصيتك القرارية")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    /// لا نصرف نداءً على عيّنة لا تكفي — والشاشة تقول بصراحة كم بقي.
    private func notEnoughYet(_ response: PatternsService.Response) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionHeading(
                title: "لسه بدري",
                sub: "القراءة تحتاج قرارات مقيَّمة كفاية حتى تكون عن شخصيتك لا عن الصدفة."
            )

            if let need = response.need, need > 0 {
                Text("قيّم \(need.arabicDigits) قرارات إضافية وتنفتح القراءة.")
                    .font(Typo.bodyMedium(16))
                    .foregroundStyle(palette.ink)
            }
        }
    }

    private func readingBody(
        _ reading: PatternsService.Reading,
        stats: PatternsService.Stats?
    ) -> some View {
        VStack(alignment: .leading, spacing: 20) {
            InkCard(padding: 24) {
                Text(reading.headline)
                    .font(Typo.title(24))
                    .foregroundStyle(palette.onInk)
                    .lineSpacing(4)
                    .fixedSize(horizontal: false, vertical: true)
            }

            ForEach(reading.patterns) { pattern in
                GlassCard(padding: 18) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(pattern.title)
                            .font(Typo.heading(17))
                            .foregroundStyle(palette.ink)
                        Text(pattern.detail)
                            .font(Typo.body(15))
                            .lineSpacing(4)
                            .foregroundStyle(palette.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }

            if let blindSpot = reading.blindSpot, !blindSpot.isEmpty {
                calloutCard(
                    title: "النقطة العمياء",
                    body: blindSpot,
                    icon: "eye.trianglebadge.exclamationmark"
                )
            }

            if let advice = reading.advice, !advice.isEmpty {
                calloutCard(title: "جرّب هذا اليوم", body: advice, icon: "lightbulb")
            }

            if let stats { statsCard(stats) }
        }
    }

    private func calloutCard(title: String, body: String, icon: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Label(title, systemImage: icon)
                .font(Typo.bodySemibold(15))
                .foregroundStyle(palette.accentStrong)

            Text(body)
                .font(Typo.body(15))
                .lineSpacing(4)
                .foregroundStyle(palette.ink)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(palette.accentSoft)
        }
    }

    /// الأرقام الخام بجانب القراءة: من أراد التحقق يقارن.
    private func statsCard(_ stats: PatternsService.Stats) -> some View {
        GlassCard(padding: 20) {
            VStack(alignment: .leading, spacing: 14) {
                Text("الأرقام")
                    .font(Typo.heading(17))
                    .foregroundStyle(palette.ink)

                statRow("قرارات محفوظة", stats.total.arabicDigits)
                statRow("مقيَّمة", stats.rated.arabicDigits)
                statRow("نسبة الندم", "\(stats.regretRate.arabicDigits)٪")

                if let never = stats.neverChosen, !never.isEmpty {
                    PaperRule()
                    VStack(alignment: .leading, spacing: 6) {
                        Text("تطرحه ولا تختاره أبداً")
                            .font(Typo.bodyMedium(14))
                            .foregroundStyle(palette.ink)
                        Text(never.map(\.label).joined(separator: "، "))
                            .font(Typo.body(14))
                            .foregroundStyle(palette.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        }
    }

    private func statRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label)
                .font(Typo.body(14))
                .foregroundStyle(palette.muted)
            Spacer()
            Text(value)
                .font(Typo.bodySemibold(15))
                .foregroundStyle(palette.ink)
        }
    }

    private func load() async {
        loading = true
        error = nil
        defer { loading = false }
        do {
            response = try await PatternsService.read()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
