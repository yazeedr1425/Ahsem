import SwiftUI

/// عناصر مشتركة على لغة «الشفق والورق».
///
/// قاعدة اللون هنا: تدرّج المزاج محجوز للفعل الواحد الرئيسي في الشاشة، والحبر
/// (الأسود الدافئ) لكل ما هو مختار أو مؤكَّد. لو صار الاختيار ملوّناً أيضاً ضاع
/// الترتيب البصري وما عاد للزر الرئيسي وزن.

// MARK: - الوسوم

/// وسم لاتيني صغير: `FOOD` · `HYPED`.
///
/// اللغة تُصرَّح: قارئ الشاشة العربي ينطق الكلمة اللاتينية بحروف عربية فيخرج
/// كلام غير مفهوم — التصريح يجعله يبدّل الصوت.
struct Tag: View {
    let text: String
    @Environment(\.palette) private var palette

    var body: some View {
        Text(text)
            .tagStyle(palette.mutedSoft)
            .accessibilityLabel(Text(verbatim: text))
            .environment(\.locale, Locale(identifier: "en"))
    }
}

/// سطر تمهيدي عربي فوق العنوان.
struct Eyebrow: View {
    let text: String
    @Environment(\.palette) private var palette

    var body: some View {
        Text(text)
            .font(Typo.caption(12))
            .tracking(0.5)
            .foregroundStyle(palette.muted)
    }
}

// MARK: - الأزرار

/// الأزرار كلها حبّة (pill) لأن شاشة الدخول كذلك، والاختلاف بينها في الوزن لا في
/// الشكل.

/// الفعل الرئيسي: تدرّج المزاج وتوهجه. واحد لكل شاشة.
struct PrimaryButton: View {
    let title: String
    var isLoading: Bool = false
    var isEnabled: Bool = true
    let action: () -> Void

    @Environment(\.palette) private var palette

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                if isLoading {
                    ProgressView()
                        .progressViewStyle(.circular)
                        .tint(palette.accentInk)
                        .scaleEffect(0.8)
                }
                Text(title)
                    .font(Typo.bodySemibold())
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 15)
            .padding(.horizontal, 28)
            .foregroundStyle(palette.accentInk)
            .background {
                Capsule().fill(
                    isEnabled && !isLoading
                        ? AnyShapeStyle(palette.actionGradient)
                        : AnyShapeStyle(palette.line)
                )
            }
            .foregroundStyle(isEnabled ? palette.accentInk : palette.muted)
            .shadow(
                color: isEnabled ? palette.glow.opacity(0.32) : .clear,
                radius: 18, y: 8
            )
        }
        .buttonStyle(PressDownStyle())
        .disabled(!isEnabled || isLoading)
    }
}

/// الفعل الثانوي القوي: أسود على ورق. أقوى من الشبح، ولا يزاحم الطوبيّ.
struct InkButton: View {
    let title: String
    var isEnabled: Bool = true
    let action: () -> Void

    @Environment(\.palette) private var palette

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(Typo.bodySemibold(16))
                .padding(.vertical, 13)
                .padding(.horizontal, 24)
                .foregroundStyle(isEnabled ? palette.onInk : palette.muted)
                .background {
                    Capsule().fill(isEnabled ? palette.ink : palette.line)
                }
        }
        .buttonStyle(PressDownStyle())
        .disabled(!isEnabled)
    }
}

struct GhostButton: View {
    let title: String
    var isEnabled: Bool = true
    let action: () -> Void

    @Environment(\.palette) private var palette

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(Typo.body(15))
                .padding(.vertical, 10)
                .padding(.horizontal, 20)
                .foregroundStyle(palette.ink)
                .background { Capsule().stroke(palette.lineStrong, lineWidth: 1) }
        }
        .buttonStyle(PressDownStyle())
        .opacity(isEnabled ? 1 : 0.4)
        .disabled(!isEnabled)
    }
}

/// زر نصّي بلا إطار — للرجوع والإلغاء، حتى لا تمتلئ الشاشة بالحبّات.
struct QuietButton: View {
    let title: String
    var isEnabled: Bool = true
    let action: () -> Void

    @Environment(\.palette) private var palette

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(Typo.body(15))
                .foregroundStyle(palette.muted)
                .underline(true, color: palette.lineStrong)
        }
        .buttonStyle(.plain)
        .opacity(isEnabled ? 1 : 0.4)
        .disabled(!isEnabled)
    }
}

/// انخفاضة بسيطة عند الضغط — بديل `active:translate-y-px` في الويب.
struct PressDownStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .offset(y: configuration.isPressed ? 1 : 0)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

// MARK: - الاختيار

/// حبّة تمتلئ حبراً عند الاختيار.
struct ChoiceChip: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void

    @Environment(\.palette) private var palette

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(Typo.body(15))
                .multilineTextAlignment(.center)
                .padding(.vertical, 10)
                .padding(.horizontal, 16)
                .foregroundStyle(isSelected ? palette.onInk : palette.ink)
                .background {
                    Capsule()
                        .fill(isSelected ? AnyShapeStyle(palette.ink) : AnyShapeStyle(Color.clear))
                        .overlay {
                            Capsule().stroke(
                                isSelected ? .clear : palette.lineStrong,
                                lineWidth: 1
                            )
                        }
                }
        }
        .buttonStyle(PressDownStyle())
        .animation(.easeOut(duration: 0.18), value: isSelected)
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }
}

// MARK: - الحقول

/// سطر تحت الكلام لا صندوق حوله. هذا أبرز ما يميّز شاشة الدخول، وهو ما يجعل
/// الشاشة تبدو ورقةً مكتوبة.
struct UnderlineField: View {
    let placeholder: String
    @Binding var text: String
    var isSecure: Bool = false
    var keyboard: UIKeyboardType = .default
    var contentType: UITextContentType? = nil
    var submitLabel: SubmitLabel = .next
    var onSubmit: () -> Void = {}

    @FocusState private var isFocused: Bool
    @Environment(\.palette) private var palette

    var body: some View {
        VStack(spacing: 0) {
            Group {
                if isSecure {
                    SecureField(placeholder, text: $text)
                } else {
                    TextField(placeholder, text: $text)
                }
            }
            .font(Typo.body(18))
            .foregroundStyle(palette.ink)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .keyboardType(keyboard)
            .textContentType(contentType)
            .submitLabel(submitLabel)
            .focused($isFocused)
            .onSubmit(onSubmit)
            .padding(.vertical, 10)

            Rectangle()
                .fill(isFocused ? palette.ink : palette.line)
                .frame(height: 2)
                .animation(.easeOut(duration: 0.2), value: isFocused)
        }
    }
}

// MARK: - الأسطح

/// لوح زجاجي: أبيض شفاف وضبابة خلفه.
///
/// الضبابة على الأسطح الكبيرة فقط — لكل عنصر منها كلفة رسم على الجهاز، ولا تضيف
/// شيئاً فوق سطح صغير.
struct GlassCard<Content: View>: View {
    var padding: CGFloat = 24
    @ViewBuilder var content: Content
    @Environment(\.palette) private var palette

    var body: some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                RoundedRectangle(cornerRadius: Palette.radiusCard, style: .continuous)
                    .fill(.ultraThinMaterial)
                    .overlay {
                        RoundedRectangle(cornerRadius: Palette.radiusCard, style: .continuous)
                            .fill(palette.card)
                    }
            }
            .overlay {
                RoundedRectangle(cornerRadius: Palette.radiusCard, style: .continuous)
                    .stroke(palette.line, lineWidth: 1)
            }
            .shadow(color: palette.ink.opacity(0.06), radius: 24, y: 12)
    }
}

/// بطاقة غامقة — الحبر محجوز للحكم: النتيجة، والتفكير، وقراءة الأنماط.
struct InkCard<Content: View>: View {
    var padding: CGFloat = 24
    @ViewBuilder var content: Content
    @Environment(\.palette) private var palette

    var body: some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .foregroundStyle(palette.onInk)
            .background {
                RoundedRectangle(cornerRadius: Palette.radiusCard, style: .continuous)
                    .fill(palette.ink)
            }
    }
}

// MARK: - العناوين

struct SectionHeading: View {
    var tag: String? = nil
    let title: String
    var sub: String? = nil

    @Environment(\.palette) private var palette

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let tag { Eyebrow(text: tag) }

            Text(title)
                .font(Typo.title(30))
                .foregroundStyle(palette.ink)
                // العنوان يستقبل التركيز عند تغيّر الخطوة: بدونه يضيع مستخدم
                // قارئ الشاشة، لأن الزر الذي كان مركَّزاً عليه يختفي مع الشاشة
                // السابقة.
                .accessibilityAddTraits(.isHeader)

            if let sub {
                Text(sub)
                    .font(Typo.body(15))
                    .lineSpacing(4)
                    .foregroundStyle(palette.muted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - التقدّم

/// سطر رفيع لا شريط سمين. الرقم بجانبه لأن الطول وحده لا يقول للمستخدم كم بقي.
struct ProgressLine: View {
    let current: Int
    let total: Int

    @Environment(\.palette) private var palette

    var body: some View {
        HStack(spacing: 12) {
            HStack(spacing: 2) {
                Text(current.arabicDigits)
                    .foregroundStyle(palette.muted)
                Text(" / \(total.arabicDigits)")
                    .foregroundStyle(palette.mutedSoft)
            }
            .font(Typo.bodySemibold(12))

            GeometryReader { geo in
                ZStack(alignment: .trailing) {
                    Rectangle().fill(palette.lineStrong).frame(height: 1)
                    Rectangle()
                        .fill(palette.ink)
                        .frame(
                            width: geo.size.width * (total > 0 ? CGFloat(current) / CGFloat(total) : 0),
                            height: 1
                        )
                }
            }
            .frame(height: 1)
        }
        .accessibilityElement()
        .accessibilityLabel("الخطوة \(current.arabicDigits) من \(total.arabicDigits)")
    }
}

/// فاصل ورقي بين أقسام الشاشة.
struct PaperRule: View {
    @Environment(\.palette) private var palette

    var body: some View {
        Rectangle()
            .fill(palette.line)
            .frame(height: 1)
    }
}
