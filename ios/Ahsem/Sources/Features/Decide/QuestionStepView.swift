import SwiftUI

/// سؤال واحد في كل شاشة — ورقة تُملأ سطراً سطراً.
struct QuestionStepView: View {
    let category: Category
    let index: Int
    @Binding var answers: AnswerMap
    let onAnswer: () -> Void
    let onBack: () -> Void

    @Environment(\.palette) private var palette
    @AccessibilityFocusState private var headingFocused: Bool

    private var question: Question? {
        guard category.questions.indices.contains(index) else { return nil }
        return category.questions[index]
    }

    var body: some View {
        if let question {
            VStack(alignment: .leading, spacing: 28) {
                ProgressLine(current: index + 1, total: category.questions.count)

                SectionHeading(title: question.label)
                    // التركيز ينتقل لعنوان الخطوة الجديدة: بدونه يضيع مستخدم
                    // قارئ الشاشة، لأن الزر الذي كان مركَّزاً عليه يختفي مع
                    // الشاشة السابقة فيعود التركيز لأول الصفحة بلا أي إعلان.
                    .accessibilityFocused($headingFocused)

                VStack(spacing: 10) {
                    ForEach(question.choices) { choice in
                        choiceRow(question: question, choice: choice)
                    }
                }
                .accessibilityElement(children: .contain)
                .accessibilityLabel(question.label)

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
            }
            .onAppear { headingFocused = true }
            .onChange(of: index) { headingFocused = true }
        }
    }

    private func choiceRow(question: Question, choice: Choice) -> some View {
        let isChecked = answers[question.key] == choice.value

        return Button {
            answers[question.key] = choice.value
            onAnswer()
        } label: {
            HStack(spacing: 16) {
                Text(choice.label)
                    .font(Typo.bodyMedium(17))
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)

                Spacer(minLength: 0)

                // الصح يثبت على المختار
                Image(systemName: "checkmark")
                    .font(.system(size: 15, weight: .semibold))
                    .opacity(isChecked ? 1 : 0)
            }
            .foregroundStyle(isChecked ? palette.onInk : palette.ink)
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(isChecked ? AnyShapeStyle(palette.ink) : AnyShapeStyle(Color.clear))
                    .overlay {
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .stroke(isChecked ? .clear : palette.lineStrong, lineWidth: 1)
                    }
            }
        }
        .buttonStyle(PressDownStyle())
        .accessibilityAddTraits(isChecked ? [.isSelected] : [])
    }
}
