import SwiftUI

/// التحليل الرباعي.
///
/// الانضباط الذي يجعله مفيداً لا زخرفياً: كل بند يستند إلى شيء في الحقائق —
/// ولهذا يُعرض السند تحت البند لا في حاشية. وداخلي/خارجي ليس اختيارياً: القوة
/// والضعف مما يملكه المستخدم، والفرصة والتهديد مما لا يملكه.
struct SwotGrid: View {
    let swot: AnalyzeService.Swot

    @Environment(\.palette) private var palette

    private var quadrants: [(title: String, subtitle: String, points: [AnalyzeService.SwotPoint], icon: String)] {
        [
            ("القوة", "مما تملكه", swot.strengths, "arrow.up.circle"),
            ("الضعف", "مما تملكه", swot.weaknesses, "arrow.down.circle"),
            ("الفرص", "مما لا تملكه", swot.opportunities, "sparkles"),
            ("التهديدات", "مما لا تملكه", swot.threats, "exclamationmark.triangle"),
        ]
    }

    var body: some View {
        VStack(spacing: 14) {
            ForEach(quadrants, id: \.title) { quadrant in
                GlassCard(padding: 18) {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack(spacing: 8) {
                            Image(systemName: quadrant.icon)
                                .font(.system(size: 15))
                                .foregroundStyle(palette.accent)
                            Text(quadrant.title)
                                .font(Typo.heading(17))
                                .foregroundStyle(palette.ink)
                            Text(quadrant.subtitle)
                                .font(Typo.caption(11))
                                .foregroundStyle(palette.mutedSoft)
                            Spacer(minLength: 0)
                        }

                        if quadrant.points.isEmpty {
                            Text("لا شيء يستحق الذكر هنا.")
                                .font(Typo.body(14))
                                .foregroundStyle(palette.mutedSoft)
                        } else {
                            ForEach(quadrant.points) { point in
                                pointRow(point)
                            }
                        }
                    }
                }
            }
        }
    }

    private func pointRow(_ point: AnalyzeService.SwotPoint) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .top, spacing: 8) {
                Text(point.point)
                    .font(Typo.bodyMedium(15))
                    .foregroundStyle(palette.ink)
                    .fixedSize(horizontal: false, vertical: true)

                Spacer(minLength: 8)

                confidenceBadge(point.confidence)
            }

            // السند تحت البند: بند بلا سند كان يُحذف عند الخادم، وما وصل هنا
            // يحمل سنده معه
            Text(point.evidence)
                .font(Typo.caption(12))
                .foregroundStyle(palette.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, 4)
    }

    private func confidenceBadge(_ confidence: String) -> some View {
        Text(Risk.label(confidence))
            .font(Typo.caption(10))
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .foregroundStyle(confidence == "low" ? palette.accentStrong : palette.muted)
            .background {
                Capsule().fill(confidence == "low" ? palette.accentSoft : palette.cardSunken)
            }
            .accessibilityLabel("الثقة \(Risk.label(confidence))")
    }
}
