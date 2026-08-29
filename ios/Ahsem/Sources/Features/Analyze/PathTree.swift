import SwiftUI

/// شجرة المسارات — لكل مسار فرعان: كيف يبدو القرار التالي إن سارت الأمور جيداً،
/// وإن ساءت. والفرع الثاني هو حيث تظهر الكلفة الحقيقية للمسار.
///
/// الرقمان تحت كل مسار محسوبان في الكود من أحكام نوعية أعطاها النموذج — ولهذا
/// يُعرض «على أي أساس» بجانبهما: رقمٌ لا تعرف من أين جاء يبدو أدق مما هو.
struct PathTree: View {
    let paths: [Risk.ScoredPath]

    @Environment(\.palette) private var palette
    @State private var expanded: Set<String> = []

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("المسارات")
                .font(Typo.title(22))
                .foregroundStyle(palette.ink)

            ForEach(paths) { scored in
                pathCard(scored)
            }
        }
    }

    private func pathCard(_ scored: Risk.ScoredPath) -> some View {
        let isOpen = expanded.contains(scored.id)

        return GlassCard(padding: 18) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top, spacing: 10) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(scored.path.label)
                            .font(Typo.heading(18))
                            .foregroundStyle(palette.ink)
                            .fixedSize(horizontal: false, vertical: true)

                        Text(scored.quadrant.label)
                            .font(Typo.caption(11))
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .foregroundStyle(quadrantColor(scored.quadrant.key))
                            .background {
                                Capsule().fill(quadrantColor(scored.quadrant.key).opacity(0.12))
                            }
                    }
                    Spacer(minLength: 0)
                }

                Text(scored.path.summary)
                    .font(Typo.body(15))
                    .lineSpacing(4)
                    .foregroundStyle(palette.muted)
                    .fixedSize(horizontal: false, vertical: true)

                // الرقمان منفصلان عمداً: مسارٌ قد يكون عالي الاثنين، ودمجهما في
                // رقم واحد يخفي هذه المفارقة بالضبط
                HStack(spacing: 20) {
                    meter(title: "المخاطرة", value: scored.risk, color: palette.gradient[2])
                    meter(title: "الجاذبية", value: scored.upside, color: palette.gradient[4])
                }

                Button {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        if isOpen { expanded.remove(scored.id) } else { expanded.insert(scored.id) }
                    }
                } label: {
                    HStack(spacing: 4) {
                        Text(isOpen ? "أخفِ التفاصيل" : "على أي أساس؟")
                        Image(systemName: isOpen ? "chevron.up" : "chevron.down")
                            .font(.system(size: 12, weight: .semibold))
                    }
                    .font(Typo.body(14))
                    .foregroundStyle(palette.accentStrong)
                }
                .buttonStyle(.plain)

                if isOpen { details(scored) }
            }
        }
    }

    private func meter(title: String, value: Int, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 6) {
                Text(title)
                    .font(Typo.caption(12))
                    .foregroundStyle(palette.muted)
                Text("\(value.arabicDigits)٪")
                    .font(Typo.bodySemibold(14))
                    .foregroundStyle(palette.ink)
            }

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(palette.line)
                    Capsule()
                        .fill(color)
                        .frame(width: geo.size.width * CGFloat(value) / 100)
                }
            }
            .frame(height: 5)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title) \(value.arabicDigits) بالمئة")
    }

    private func details(_ scored: Risk.ScoredPath) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            PaperRule()

            // المدخلات التي بُني عليها الرقم — حتى يمكن الاختلاف معه بمعرفة
            ForEach(scored.basis) { row in
                HStack {
                    Text(row.label)
                        .font(Typo.body(14))
                        .foregroundStyle(palette.muted)
                    Spacer()
                    Text(row.value)
                        .font(Typo.bodyMedium(14))
                        .foregroundStyle(palette.ink)
                }
            }

            if let good = scored.path.good_branch {
                branch(title: "لو سارت جيداً", branch: good, icon: "arrow.up.right")
            }
            if let bad = scored.path.bad_branch {
                branch(title: "لو ساءت", branch: bad, icon: "arrow.down.right")
            }
        }
        .transition(.opacity)
    }

    private func branch(title: String, branch: AnalyzeService.Branch, icon: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Label(title, systemImage: icon)
                .font(Typo.bodySemibold(14))
                .foregroundStyle(palette.ink)

            if let label = branch.label, !label.isEmpty {
                Text(label)
                    .font(Typo.body(14))
                    .foregroundStyle(palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let detail = branch.detail, !detail.isEmpty {
                Text(detail)
                    .font(Typo.body(14))
                    .lineSpacing(4)
                    .foregroundStyle(palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(palette.cardSunken)
        }
    }

    private func quadrantColor(_ key: String) -> Color {
        switch key {
        case "sweet": return palette.gradient[4]
        case "bet": return palette.gradient[0]
        case "trap": return palette.gradient[2]
        default: return palette.muted
        }
    }
}
