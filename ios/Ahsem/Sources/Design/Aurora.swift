import SwiftUI

/// طبقتا الخلفية: شفق ملوّن مموّه يتحرك ببطء، وفوقه حبيبات ورقية.
///
/// تُركَّب مرة واحدة في الجذر لا داخل شاشة: الطبقتان ثابتتان خلف كل شيء، ولو
/// عاشتا في شاشة لاختفتا عند الانتقال لغيرها — نفس السبب الذي رفع المزاج للجذر.
///
/// لا حالة فيها ولا منطق — الألوان كلها تأتي من `Palette` الذي يبدّله المزاج.
struct AuroraBackground: View {

    let palette: Palette
    /// حركة الشفق تُطفأ مع «تقليل الحركة» — الخلفية تبقى، ويتوقف الانجراف وحده.
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var phase: CGFloat = 0

    /// مواضع البقع الأربع ثابتة عبر المزاجات: المزاج يبدّل ألوانها فقط، فتبقى
    /// الحركة هي هي ويتغيّر الجو وحده.
    private let blobs: [(x: CGFloat, y: CGFloat, w: CGFloat, h: CGFloat, opacity: Double)] = [
        (0.14, 0.18, 0.62, 0.58, 0.29),
        (0.86, 0.08, 0.52, 0.52, 0.26),
        (0.78, 0.72, 0.58, 0.58, 0.24),
        (0.34, 0.88, 0.44, 0.46, 0.22),
    ]

    var body: some View {
        GeometryReader { geo in
            let size = geo.size

            ZStack {
                palette.background

                ZStack {
                    ForEach(Array(blobs.enumerated()), id: \.offset) { index, blob in
                        RadialGradient(
                            colors: [
                                palette.mesh[index].opacity(blob.opacity),
                                palette.mesh[index].opacity(0),
                            ],
                            center: .center,
                            startRadius: 0,
                            endRadius: max(size.width, size.height) * blob.w * 0.72
                        )
                        .frame(width: size.width * blob.w * 2, height: size.height * blob.h * 2)
                        .position(x: size.width * blob.x, y: size.height * blob.y)
                    }
                }
                .blur(radius: 40)
                // تتجاوز الشاشة حتى لا تكشف الحركةُ حافةً فارغة عند أطرافها
                .scaleEffect(1.15 + phase * 0.06)
                .offset(x: size.width * 0.02 * phase, y: size.height * -0.03 * phase)

                // حبيبات ورقية فوق الشفق: تكسر نظافة التدرّجات وتجعل الخلفية تبدو
                // ورقاً مطبوعاً لا شاشة. ٦٪ بالضرب — أعلى منها يتّسخ النص.
                PaperGrain()
                    .opacity(0.06)
                    .blendMode(.multiply)
            }
            .ignoresSafeArea()
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.easeInOut(duration: 34).repeatForever(autoreverses: true)) {
                    phase = 1
                }
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
    }
}

/// حبيبات الورق — ضوضاء ثابتة تُرسم مرة وتُبلَّط.
///
/// `Canvas` بدل صورة مولّدة كل إطار: النمط لا يتحرك، ورسمه مرة واحدة يكفي.
private struct PaperGrain: View {
    var body: some View {
        Canvas { context, size in
            // بذرة ثابتة: الحبيبات زخرفة لا عشوائية حقيقية، وثباتها يمنع
            // «الغليان» بين الإطارات
            var seed: UInt64 = 0x9E3779B97F4A7C15
            func next() -> Double {
                seed ^= seed << 13
                seed ^= seed >> 7
                seed ^= seed << 17
                return Double(seed % 1000) / 1000
            }

            let count = Int(size.width * size.height / 90)
            for _ in 0..<count {
                let x = next() * size.width
                let y = next() * size.height
                let shade = next() * 0.5 + 0.2
                context.fill(
                    Path(ellipseIn: CGRect(x: x, y: y, width: 1.1, height: 1.1)),
                    with: .color(.black.opacity(shade))
                )
            }
        }
        .drawingGroup()
    }
}
