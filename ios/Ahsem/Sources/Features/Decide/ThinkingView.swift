import SwiftUI

/// لحظة الحكم حبرية: الورق للكتابة والحبر للفصل. الانقلاب من بطاقة فاتحة لغامقة
/// يقول «خلصت الأسئلة» بلا كلمة واحدة.
struct ThinkingView: View {
    var isReading = false

    @Environment(\.palette) private var palette
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var lineIndex = 0
    @State private var spin = false

    private static let thinkingLines = [
        "احسم يفكر…",
        "أوزن خياراتك…",
        "أقلّب في قراراتك السابقة…",
        "أجهز لك سبب مقنع…",
        "لحظة، أبي أطلع بشي ذكي…",
    ]

    /// انتظار بناء الإطار. النص يقول ما يحدث فعلاً: النموذج يقرأ الخيارات ليبني
    /// منها المعايير والأسئلة، ولا «يفكر» في حكم بعد — والمستخدم ينتظر ست ثوانٍ،
    /// فأقل ما يستحقه أن يكون السطر صادقاً.
    private static let readingLines = [
        "تُقرأ الخيارات…",
        "تُستخلص المعايير التي تفرّق بينها…",
        "تُصاغ أسئلة التقييم…",
    ]

    private var lines: [String] {
        isReading ? Self.readingLines : Self.thinkingLines
    }

    var body: some View {
        InkCard(padding: 28) {
            VStack(spacing: 28) {
                wheel

                Text(lines[min(lineIndex, lines.count - 1)])
                    .font(Typo.bodySemibold(19))
                    .foregroundStyle(palette.onInk)
                    .multilineTextAlignment(.center)
                    .id(lineIndex)
                    .transition(.opacity)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 36)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(lines[min(lineIndex, lines.count - 1)])
        .accessibilityAddTraits(.updatesFrequently)
        .task(id: isReading) {
            lineIndex = 0
            spin = !reduceMotion
            // الطول يُعاد قراءته كل دورة: تبديل الطور وسط الدوران يجعل الفهرس
            // يتجاوز القائمة الأقصر فيظهر سطر فارغ
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(1100))
                guard !Task.isCancelled else { return }
                withAnimation(.easeInOut(duration: 0.25)) {
                    lineIndex = (lineIndex + 1) % lines.count
                }
            }
        }
    }

    /// عجلة الحظ.
    private var wheel: some View {
        ZStack {
            Circle()
                .strokeBorder(
                    palette.accent,
                    style: StrokeStyle(lineWidth: 4, dash: [7, 7])
                )
                .frame(width: 112, height: 112)
                .rotationEffect(.degrees(spin ? 360 : 0))
                .animation(
                    reduceMotion
                        ? nil
                        : .linear(duration: 2.4).repeatForever(autoreverses: false),
                    value: spin
                )

            Image(systemName: "dice")
                .font(.system(size: 38))
                .foregroundStyle(palette.accent)
        }
        .accessibilityHidden(true)
    }
}
