import SwiftUI

/// شبكة تقييم مضغوطة: كل خيار × كل معيار.
/// الافتراضي «متوسط»، فيقدر المستخدم يتخطاها كلها لو استعجل.
struct RatingGridView: View {
    let category: Category
    let options: [DecisionOption]
    let ratings: RatingMap
    let weights: WeightMap
    let onChange: (RatingMap) -> Void
    let onNext: () -> Void
    let onBack: () -> Void

    @Environment(\.palette) private var palette
    @AccessibilityFocusState private var headingFocused: Bool

    /// نعرض المعايير الأهم أولاً حسب أوزان إجابات المستخدم.
    private var sortedCriteria: [Criterion] {
        category.criteria.sorted { (weights[$0.key] ?? 0) > (weights[$1.key] ?? 0) }
    }

    /// لو تساوت الأوزان كلها فلا «أهم» — وسمُ كل شيء يساوي وسمَ لا شيء.
    private var topWeight: Int? {
        let values = weights.values
        guard let top = values.max(), values.contains(where: { $0 != top }) else { return nil }
        return top
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            SectionHeading(
                title: "قيّم كل خيار بسرعة",
                sub: "كل شي على «متوسط» — غيّر اللي تحس فيه فرق وبس."
            )
            .accessibilityFocused($headingFocused)

            VStack(spacing: 16) {
                ForEach(options) { option in
                    optionCard(option)
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

    private func optionCard(_ option: DecisionOption) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(option.label)
                .font(Typo.heading(18))
                .foregroundStyle(palette.ink)

            VStack(spacing: 14) {
                ForEach(sortedCriteria) { criterion in
                    criterionRow(option: option, criterion: criterion)
                }
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(palette.cardSunken)
        }
    }

    private func criterionRow(option: DecisionOption, criterion: Criterion) -> some View {
        let current = ratings[option.id]?[criterion.key] ?? ScoreEngine.defaultRating

        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text(criterion.label)
                    .font(Typo.body(14))
                    .foregroundStyle(palette.muted)

                if let topWeight, weights[criterion.key] == topWeight {
                    Text("الأهم")
                        .font(Typo.caption(11))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .foregroundStyle(palette.accentStrong)
                        .background { Capsule().fill(palette.accentSoft) }
                }

                Spacer(minLength: 0)
            }

            // اختيار واحد من ثلاثة — الدلالات تجعل قارئ الشاشة يقول «١ من ٣» بدل
            // ثلاثة أزرار منفصلة
            HStack(spacing: 6) {
                ForEach(RatingScale.steps(for: criterion), id: \.value) { step in
                    ChoiceChip(
                        title: step.label,
                        isSelected: current == step.value
                    ) {
                        var next = ratings
                        next[option.id, default: [:]][criterion.key] = step.value
                        onChange(next)
                    }
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel("\(criterion.label) — \(option.label)")
        }
    }
}

/// سلّم التقييم لكل معيار على حدة.
///
/// كانت الشبكة تعرض ضعيف/متوسط/ممتاز لكل المعايير، وهذا مقياس جودة لا ينطبق إلا
/// على بعضها. «الاستعجال: ضعيف/ممتاز» بلا معنى — مستعجل ليس جودة، بل طرف في
/// مقياس. والمعيار أصلاً يحمل طرفيه، فالشبكة كانت تتجاهل بالضبط ما تحتاجه.
///
/// الترتيب ١←٣ لم يتغيّر: الأعلى دائماً هو الطرف المرغوب حين يهم المعيار، وعليه
/// يقوم الحساب.
///
/// السقوط للمقياس العام يبقى لأي معيار بلا طرفين — القرارات المحفوظة قديماً
/// تُقرأ بنفس هذا العنصر.
enum RatingScale {
    static func steps(for criterion: Criterion) -> [ScoreEngine.RatingStep] {
        guard !criterion.low.isEmpty, !criterion.high.isEmpty else {
            return ScoreEngine.ratingScale
        }
        return [
            .init(value: 1, label: criterion.low),
            .init(value: 2, label: criterion.mid.isEmpty ? "وسط" : criterion.mid),
            .init(value: 3, label: criterion.high),
        ]
    }
}
