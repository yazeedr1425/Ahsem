import SwiftUI

/// المبارزة — مقارنة خيارين بمقبض واحد لكل معيار بدل خانتين.
///
/// الشريط الحي أعلى الشاشة يقول من يتقدّم الآن: الفارق وحده هو المعنى مع
/// خيارين، فعرضه أصدق من عرض رقمين منفصلين.
struct DuelView: View {
    let frame: FramePayload
    let options: [DecisionOption]
    let ratings: RatingMap
    let weights: WeightMap
    let onChange: (RatingMap) -> Void
    let onNext: () -> Void
    let onBack: () -> Void

    @Environment(\.palette) private var palette
    @AccessibilityFocusState private var headingFocused: Bool

    private var first: DecisionOption? { options.first }
    private var second: DecisionOption? { options.count > 1 ? options[1] : nil }

    private var lead: Duel.Lead {
        Duel.lead(criteria: frame.criteria, ratings: ratings, weights: weights, options: options)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 26) {
            SectionHeading(title: frame.headline, sub: "حرّك كل مقبض ناحية الأقوى في ذلك المعيار.")
                .accessibilityFocused($headingFocused)

            leadBar

            VStack(spacing: 20) {
                ForEach(frame.criteria) { criterion in
                    criterionSlider(criterion)
                }
            }

            HStack {
                Button(action: onBack) {
                    HStack(spacing: 6) {
                        Image(systemName: "chevron.forward")
                            .font(.system(size: 13, weight: .semibold))
                        Text("رجوع")
                    }
                    .font(Typo.body(15))
                    .foregroundStyle(palette.muted)
                }
                .buttonStyle(.plain)
                Spacer()
            }

            PrimaryButton(title: "احسمها لي", action: onNext)
        }
        .onAppear { headingFocused = true }
    }

    // MARK: - الشريط الحي

    private var leadBar: some View {
        VStack(spacing: 8) {
            HStack {
                Text(first?.label ?? "")
                    .font(Typo.bodySemibold(15))
                    .foregroundStyle(lead.diff > 0 ? palette.ink : palette.mutedSoft)
                Spacer()
                Text(second?.label ?? "")
                    .font(Typo.bodySemibold(15))
                    .foregroundStyle(lead.diff < 0 ? palette.ink : palette.mutedSoft)
            }

            GeometryReader { geo in
                let mid = geo.size.width / 2
                let extent = mid * CGFloat(abs(lead.ratio))

                ZStack(alignment: .leading) {
                    Capsule().fill(palette.line).frame(height: 6)

                    Capsule()
                        .fill(palette.actionGradient)
                        .frame(width: max(extent, lead.diff == 0 ? 0 : 3), height: 6)
                        // الموجب للخيار الأول، والأول على يمين الشاشة في RTL
                        .offset(x: lead.diff > 0 ? mid : mid - extent)
                }
            }
            .frame(height: 6)
            .animation(.easeOut(duration: 0.25), value: lead.diff)

            Text(leadDescription)
                .font(Typo.caption(12))
                .foregroundStyle(palette.muted)
                .frame(maxWidth: .infinity)
        }
        .accessibilityElement()
        .accessibilityLabel(leadDescription)
    }

    private var leadDescription: String {
        guard let leader = lead.leader else { return "متعادلان الآن" }
        let strength = abs(lead.ratio) > 0.45 ? "يتقدّم بوضوح" : "يتقدّم قليلاً"
        return "«\(leader.label)» \(strength)"
    }

    // MARK: - المقابض

    private func criterionSlider(_ criterion: Criterion) -> some View {
        guard let a = first, let b = second else { return AnyView(EmptyView()) }

        let position = Duel.position(
            first: ratings[a.id]?[criterion.key],
            second: ratings[b.id]?[criterion.key]
        )

        return AnyView(
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    Text(criterion.label)
                        .font(Typo.bodyMedium(15))
                        .foregroundStyle(palette.ink)

                    // معيارٌ وصل بثقة منخفضة يُعلَّم ليصححه المستخدم أولاً
                    if frame.isLowConfidence(criterion.key) {
                        Text("غير متأكد")
                            .font(Typo.caption(11))
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .foregroundStyle(palette.accentStrong)
                            .background { Capsule().fill(palette.accentSoft) }
                    }
                    Spacer(minLength: 0)
                }

                if let note = frame.note(for: criterion.key) {
                    Text(note)
                        .font(Typo.caption(12))
                        .foregroundStyle(palette.mutedSoft)
                        .fixedSize(horizontal: false, vertical: true)
                }

                HStack(spacing: 6) {
                    ForEach(Duel.stops, id: \.self) { stop in
                        stopButton(stop: stop, current: position, a: a, b: b, criterion: criterion)
                    }
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(criterion.label)
                .accessibilityValue(
                    Duel.positionText(position, firstLabel: a.label, secondLabel: b.label)
                )
                .accessibilityAdjustableAction { direction in
                    let next = direction == .increment ? position + 1 : position - 1
                    apply(position: next, a: a, b: b, criterion: criterion)
                }
            }
        )
    }

    private func stopButton(
        stop: Int,
        current: Int,
        a: DecisionOption,
        b: DecisionOption,
        criterion: Criterion
    ) -> some View {
        let isSelected = stop == current

        return Button {
            apply(position: stop, a: a, b: b, criterion: criterion)
        } label: {
            Capsule()
                .fill(isSelected ? AnyShapeStyle(palette.ink) : AnyShapeStyle(palette.line))
                .frame(height: isSelected ? 34 : 26)
                .overlay {
                    if isSelected {
                        Text(stopLabel(stop, criterion: criterion))
                            .font(Typo.caption(11))
                            .foregroundStyle(palette.onInk)
                            .padding(.horizontal, 6)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                    }
                }
        }
        .buttonStyle(PressDownStyle())
        .animation(.easeOut(duration: 0.18), value: isSelected)
    }

    /// طرفا المعيار على أقصى المحطتين، والوسط «متعادل» — الرقم المجرّد بلا معنى.
    private func stopLabel(_ stop: Int, criterion: Criterion) -> String {
        switch stop {
        case -2, -1: return criterion.high
        case 1, 2: return criterion.high
        default: return criterion.mid.isEmpty ? "وسط" : criterion.mid
        }
    }

    private func apply(
        position: Int,
        a: DecisionOption,
        b: DecisionOption,
        criterion: Criterion
    ) {
        let pair = Duel.ratings(at: position)
        var next = ratings
        next[a.id, default: [:]][criterion.key] = pair.first
        next[b.id, default: [:]][criterion.key] = pair.second
        onChange(next)
    }
}
