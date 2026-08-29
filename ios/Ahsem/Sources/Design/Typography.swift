import SwiftUI

/// الخطوط — نفس اختيار النسخة الويب.
///
/// العناوين بالمرعى، والمتن ببلكس: وجه المتن يُقرأ لفقرات كاملة، وتغييره قرارٌ
/// ثانٍ غير قرار العناوين. واللاتيني (الأرقام والوسوم الإنجليزية) بسبيس جروتيسك.
///
/// ⚠️ للمهندس: هذه الوجوه ليست ضمن iOS. أضِف ملفاتها إلى `Ahsem/Resources/Fonts/`
/// وأدرِجها في `UIAppFonts` داخل `Info.plist`. حمّلها من Google Fonts:
///   • IBM Plex Sans Arabic — أوزان 400/500/600/700
///   • Almarai — وزنا 400/700 (لا يوجد فيه 600؛ الطلبُ عليه يحلّه النظام إلى 700)
///   • Space Grotesk — وزن 400
/// وحتى تُضاف، يرتد كل وجه إلى خط النظام تلقائياً فلا تنكسر أي شاشة.
enum Typo {

    private enum Family {
        static let arabic = "IBMPlexSansArabic"
        static let heading = "Almarai"
        static let latin = "SpaceGrotesk"
    }

    /// يرتد إلى خط النظام إذا لم يكن الوجه مُثبَّتاً — فالتطبيق يعمل قبل إضافة
    /// الملفات وبعدها، والفرق مظهري لا وظيفي.
    private static func font(
        _ name: String,
        size: CGFloat,
        relativeTo style: Font.TextStyle,
        fallback: Font.Weight
    ) -> Font {
        if UIFont(name: name, size: size) != nil {
            return .custom(name, size: size, relativeTo: style)
        }
        return .system(style, design: .rounded).weight(fallback)
    }

    // MARK: - العناوين (المرعى)

    static func display(_ size: CGFloat = 40) -> Font {
        font("\(Family.heading)-Bold", size: size, relativeTo: .largeTitle, fallback: .bold)
    }

    static func title(_ size: CGFloat = 26) -> Font {
        font("\(Family.heading)-Bold", size: size, relativeTo: .title, fallback: .bold)
    }

    static func heading(_ size: CGFloat = 20) -> Font {
        font("\(Family.heading)-Bold", size: size, relativeTo: .title3, fallback: .semibold)
    }

    // MARK: - المتن (بلكس)

    static func body(_ size: CGFloat = 17) -> Font {
        font("\(Family.arabic)-Regular", size: size, relativeTo: .body, fallback: .regular)
    }

    static func bodyMedium(_ size: CGFloat = 17) -> Font {
        font("\(Family.arabic)-Medium", size: size, relativeTo: .body, fallback: .medium)
    }

    static func bodySemibold(_ size: CGFloat = 17) -> Font {
        font("\(Family.arabic)-SemiBold", size: size, relativeTo: .body, fallback: .semibold)
    }

    static func caption(_ size: CGFloat = 13) -> Font {
        font("\(Family.arabic)-Regular", size: size, relativeTo: .caption, fallback: .regular)
    }

    // MARK: - اللاتيني (سبيس جروتيسك)

    /// الوسوم الإنجليزية الصغيرة: `FOOD` · `HYPED` · `ALL FREE`
    static func label(_ size: CGFloat = 11) -> Font {
        font("\(Family.latin)-Medium", size: size, relativeTo: .caption2, fallback: .medium)
    }
}

extension View {
    /// وسم إنجليزي صغير بتباعد حروف — العنصر المتكرر في كل بطاقة.
    func tagStyle(_ color: Color) -> some View {
        self
            .font(Typo.label())
            .tracking(1.2)
            .foregroundStyle(color)
            .textCase(.uppercase)
    }
}
