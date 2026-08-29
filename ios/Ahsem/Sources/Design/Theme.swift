import SwiftUI

extension Color {
    /// `#rrggbb` — الشكل الذي كُتبت به اللوحة في `globals.css`، فننقلها كما هي
    /// بدل إعادة حسابها إلى مكوّنات عشرية يصعب مقابلتها بالأصل.
    init(hex: UInt32, opacity: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: opacity
        )
    }
}

/// لوحة «الشفق والورق».
///
/// الورق باقٍ أساساً، وفوقه شفقٌ ملوّن مموّه يتحرك ببطء خلف كل شيء، والأسطح
/// زجاج أبيض شفاف بدل ألواح مصمتة.
///
/// الشفافية آمنة على القراءة هنا لسبب محدد: ما تحت الزجاج منخفض التردد تماماً
/// (بقع مموّهة، وحبيبات خفيفة)، فلا تفاصيل تخترق النص. لو صارت خلف الزجاج صورة
/// أو نص، انكسرت هذه الضمانة.
///
/// السطوح الغامقة ليست عكساً للثيم بل جزء ثابت منه — الحبر يبقى محجوزاً للحكم
/// (النتيجة، التفكير، قراءة الأنماط).
struct Palette {
    // المتغيّر بالمزاج
    let background: Color
    let accent: Color
    let accentStrong: Color
    /// ثلاثي التوهج تحت الأزرار — يتبع المزاج.
    let glow: Color
    /// بقع الشفق الأربع: كل مزاج يبدّل ألوانها ومواضعها ثابتة، فالحركة تبقى هي
    /// هي ويتغيّر الجو وحده.
    let mesh: [Color]
    /// محطات التدرّج. الفعل والعنوان يُبنيان منها لا من ألوان مكتوبة بأيديها —
    /// بدون ذلك ينفصل أهم زر في الشاشة عن المزاج.
    let gradient: [Color]

    // MARK: - الثابت عبر المزاجات (الهوية: ورق + حبر + زجاج)

    let ink = Color(hex: 0x17140F)
    let foreground = Color(hex: 0x17140F)
    let accentInk = Color(hex: 0xFDF6EE)
    let muted = Color(hex: 0x6B6257)
    let mutedSoft = Color(hex: 0xA89E90)

    /// السطح الغامق ونصوصه — النتيجة وبطاقة الحكم.
    let onInk = Color(hex: 0xF4EFE4)
    let onInkMuted = Color(hex: 0xBDB3A4)
    let lineInk = Color(hex: 0x3A352C)

    /// الأسطح: أبيض شفاف. القيمة نفسها تشتغل فوق الورق وفوق الشفق، فما عاد
    /// للبطاقة لون ثابت تنسخه كل شاشة.
    let card = Color.white.opacity(0.62)
    let cardSunken = Color(hex: 0x17140F, opacity: 0.05)

    /// الحدود حبرٌ شفاف لا لون مصمت: فوق الورق تبدو خطاً ورقياً، وفوق الزجاج
    /// حافة زجاج — والمصمت كان ينشز فوق الاثنين.
    let line = Color(hex: 0x17140F, opacity: 0.10)
    let lineStrong = Color(hex: 0x17140F, opacity: 0.16)

    /// مشتق من التوهج حتى يتبع المزاج بلا نسخة لكل كتلة، وشفاف حتى لا يصير رقعة
    /// مصمتة فوق الزجاج.
    var accentSoft: Color { glow.opacity(0.13) }

    var actionGradient: LinearGradient {
        LinearGradient(
            colors: [gradient[0], gradient[1], gradient[2]],
            startPoint: .topTrailing,
            endPoint: .bottomLeading
        )
    }

    var titleGradient: LinearGradient {
        LinearGradient(
            colors: [accent, gradient[2], gradient[3]],
            startPoint: .topTrailing,
            endPoint: .bottomLeading
        )
    }

    static let radiusCard: CGFloat = 28
}

extension Palette {

    /// الطوبيّ الافتراضي — يخدم كل ما هو خارج كتل المزاج (الشاشة الافتتاحية،
    /// شاشة الدخول) بلا نسخ قيمته.
    static let `default` = Palette(
        background: Color(hex: 0xF6F2EC),
        accent: Color(hex: 0xC2542C),
        accentStrong: Color(hex: 0x9C3F1E),
        glow: Color(hex: 0xC2542C),
        mesh: [
            Color(hex: 0x4A4478), Color(hex: 0x2F6B57),
            Color(hex: 0x5B4FA0), Color(hex: 0xB03A5B),
        ],
        gradient: [
            Color(hex: 0xE0703F), Color(hex: 0xC2452A), Color(hex: 0xB03A5B),
            Color(hex: 0x4A4478), Color(hex: 0x2F6B57),
        ]
    )

    static let hyped = Palette(
        background: Color(hex: 0xF7EFE6),
        accent: Color(hex: 0xC2452A),
        accentStrong: Color(hex: 0x96311A),
        glow: Color(hex: 0xC2452A),
        mesh: [
            Color(hex: 0xC2542C), Color(hex: 0xB03A5B),
            Color(hex: 0x9C3F1E), Color(hex: 0x4A4478),
        ],
        gradient: [
            Color(hex: 0xF08A4B), Color(hex: 0xC2452A), Color(hex: 0xB03A5B),
            Color(hex: 0x8F2B4D), Color(hex: 0x8F2B4D),
        ]
    )

    static let calm = Palette(
        background: Color(hex: 0xEEF3EF),
        accent: Color(hex: 0x2F6B57),
        accentStrong: Color(hex: 0x1F5040),
        glow: Color(hex: 0x2F6B57),
        mesh: [
            Color(hex: 0x2F6B57), Color(hex: 0x4A4478),
            Color(hex: 0x5B4FA0), Color(hex: 0x2F6B57),
        ],
        gradient: [
            Color(hex: 0x4F9A7E), Color(hex: 0x2F6B57), Color(hex: 0x4A4478),
            Color(hex: 0x5B4FA0), Color(hex: 0xB03A5B),
        ]
    )

    static let drained = Palette(
        background: Color(hex: 0xF1EFF6),
        accent: Color(hex: 0x4A4478),
        accentStrong: Color(hex: 0x342F5B),
        glow: Color(hex: 0x4A4478),
        mesh: [
            Color(hex: 0x4A4478), Color(hex: 0x5B4FA0),
            Color(hex: 0x4A4478), Color(hex: 0x2F6B57),
        ],
        gradient: [
            Color(hex: 0x7A72B8), Color(hex: 0x4A4478), Color(hex: 0xB03A5B),
            Color(hex: 0x2F6B57), Color(hex: 0xB03A5B),
        ]
    )

    static let happy = Palette(
        background: Color(hex: 0xF8EFF0),
        accent: Color(hex: 0xB03A5B),
        accentStrong: Color(hex: 0x862742),
        glow: Color(hex: 0xB03A5B),
        mesh: [
            Color(hex: 0xB03A5B), Color(hex: 0xE0703F),
            Color(hex: 0x4A4478), Color(hex: 0x2F6B57),
        ],
        gradient: [
            Color(hex: 0xE0703F), Color(hex: 0xB03A5B), Color(hex: 0x8F2B4D),
            Color(hex: 0x4A4478), Color(hex: 0x2F6B57),
        ]
    )

    static func of(moodId: String?) -> Palette {
        switch moodId {
        case "hyped": return .hyped
        case "calm": return .calm
        case "drained": return .drained
        case "happy": return .happy
        default: return .default
        }
    }
}

/// الثيم يتبع المزاج. الهوية (ورق + حبر + زجاج) ثابتة، والمزاج يحرّك اللون
/// الفاعل ويميل بالورق وبقع الشفق ميلة خفيفة — لولا ذلك صار كل مزاج تطبيقاً
/// مختلفاً، وهذا آخر ما نريده بعد أن وحّدنا اللغة البصرية.
@MainActor
@Observable
final class MoodTheme {
    var moodId: String? {
        didSet { palette = Palette.of(moodId) }
    }
    private(set) var palette: Palette = .default

    init(moodId: String? = nil) {
        self.moodId = moodId
        self.palette = Palette.of(moodId)
    }

    var mood: Mood? { Moods.get(moodId) }
}

private struct PaletteKey: EnvironmentKey {
    static let defaultValue: Palette = .default
}

extension EnvironmentValues {
    var palette: Palette {
        get { self[PaletteKey.self] }
        set { self[PaletteKey.self] = newValue }
    }
}
