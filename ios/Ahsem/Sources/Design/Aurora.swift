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

    /// بقعة شفق واحدة. نوعٌ صريح لا tuple: `ForEach` تحتاج معرّفاً، ومسار
    /// المفتاح لا يدخل عناصر الـ tuple.
    private struct Blob: Identifiable {
        let id: Int
        let x: CGFloat
        let y: CGFloat
        let w: CGFloat
        let h: CGFloat
        let opacity: Double
    }

    /// مواضع البقع الأربع ثابتة عبر المزاجات: المزاج يبدّل ألوانها فقط، فتبقى
    /// الحركة هي هي ويتغيّر الجو وحده.
    private let blobs: [Blob] = [
        Blob(id: 0, x: 0.14, y: 0.18, w: 0.62, h: 0.58, opacity: 0.29),
        Blob(id: 1, x: 0.86, y: 0.08, w: 0.52, h: 0.52, opacity: 0.26),
        Blob(id: 2, x: 0.78, y: 0.72, w: 0.58, h: 0.58, opacity: 0.24),
        Blob(id: 3, x: 0.34, y: 0.88, w: 0.44, h: 0.46, opacity: 0.22),
    ]

    var body: some View {
        GeometryReader { geo in
            let size = geo.size

            ZStack {
                palette.background

                ZStack {
                    ForEach(blobs) { blob in
                        RadialGradient(
                            colors: [
                                palette.mesh[blob.id].opacity(blob.opacity),
                                palette.mesh[blob.id].opacity(0),
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
