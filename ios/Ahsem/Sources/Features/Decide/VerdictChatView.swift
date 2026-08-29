import SwiftUI

/// النقاش بعد الحكم — المستخدم يعترض على شيء يراه، لا على شيء يتخيّله.
///
/// المجاملة ممنوعة في الخادم لا في البرومبت: رسالةٌ صُنِّفت ضغطاً لا معلومة لا
/// تحرّك رقماً مهما ألحّت. ولهذا يظهر «عدّلت الحساب» فقط حين يقع تعديل فعلي.
struct VerdictChatView: View {
    let turns: [DiscussTurn]
    let busy: Bool
    let error: String?
    let onSend: (String) -> Void

    @Environment(\.palette) private var palette
    @State private var draft = ""
    @FocusState private var isFocused: Bool

    private var canSend: Bool {
        !busy && !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        GlassCard(padding: 20) {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("ما اقتنعت؟ قل ليش")
                        .font(Typo.heading(17))
                        .foregroundStyle(palette.ink)
                    Text("لو أعطيتني معلومة جديدة، أعدّل الحساب أمامك. أما الإلحاح فلا يحرّك رقماً.")
                        .font(Typo.caption(12))
                        .foregroundStyle(palette.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }

                if !turns.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        ForEach(turns) { turn in
                            bubble(turn)
                        }
                    }
                }

                if busy {
                    HStack(spacing: 8) {
                        ProgressView().scaleEffect(0.7)
                        Text("… يقرأ كلامك")
                            .font(Typo.body(14))
                            .foregroundStyle(palette.muted)
                    }
                }

                if let error {
                    Text(error)
                        .font(Typo.body(14))
                        .foregroundStyle(palette.accentStrong)
                        .fixedSize(horizontal: false, vertical: true)
                }

                HStack(spacing: 10) {
                    UnderlineField(
                        placeholder: "مثال: السعر ما يهمني هالمرة",
                        text: $draft,
                        submitLabel: .send,
                        onSubmit: send
                    )
                    .focused($isFocused)

                    Button(action: send) {
                        Image(systemName: "arrow.up")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(palette.onInk)
                            .frame(width: 38, height: 38)
                            .background { Circle().fill(canSend ? palette.ink : palette.line) }
                    }
                    .buttonStyle(PressDownStyle())
                    .disabled(!canSend)
                    .accessibilityLabel("أرسل")
                }
            }
        }
    }

    private func send() {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !busy else { return }
        draft = ""
        onSend(text)
    }

    @ViewBuilder
    private func bubble(_ turn: DiscussTurn) -> some View {
        let isUser = turn.role == .user

        VStack(alignment: isUser ? .trailing : .leading, spacing: 6) {
            Text(turn.text)
                .font(Typo.body(15))
                .lineSpacing(4)
                .foregroundStyle(isUser ? palette.onInk : palette.ink)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background {
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .fill(isUser ? AnyShapeStyle(palette.ink) : AnyShapeStyle(palette.cardSunken))
                }

            // الانقلاب يُعلن صراحةً: تعديلٌ غيّر الفائز حدثٌ يستحق سطراً، لا
            // فرقاً يلاحظه المستخدم وحده في البطاقة أعلاه
            if let flippedTo = turn.flippedTo {
                Label("انقلب الحكم إلى «\(flippedTo)»", systemImage: "arrow.triangle.2.circlepath")
                    .font(Typo.caption(12))
                    .foregroundStyle(palette.accentStrong)
            } else if turn.applied > 0 {
                Label("عدّلت الحساب", systemImage: "checkmark.circle")
                    .font(Typo.caption(12))
                    .foregroundStyle(palette.muted)
            }
        }
        .frame(maxWidth: .infinity, alignment: isUser ? .trailing : .leading)
    }
}
