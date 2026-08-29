import Foundation

/// تطبيع النص العربي ومطابقته — الأساس الذي تقوم عليه مطابقة الكلام المنطوق
/// وكشف القرارات المصيرية. التعرف على الكلام يرجّع نصاً حراً، فنحتاج تطبيعاً
/// عربياً قبل أي مقارنة.
enum ArabicText {

    /// التشكيل والتطويل: ‎U+064B..U+0652‎ زائد الألف الخنجرية والتطويل.
    private static let diacritics: Set<Unicode.Scalar> = {
        var set = Set<Unicode.Scalar>()
        for value in 0x064B...0x0652 {
            if let scalar = Unicode.Scalar(value) { set.insert(scalar) }
        }
        if let dagger = Unicode.Scalar(0x0670) { set.insert(dagger) }   // ٰ
        if let tatweel = Unicode.Scalar(0x0640) { set.insert(tatweel) } // ـ
        return set
    }()

    /// أ/إ/آ/ٱ ← ا ، ى ← ي ، ة ← ه ، وكل ما ليس حرفاً أو رقماً يصير مسافة.
    static func normalize(_ input: String?) -> String {
        guard let input, !input.isEmpty else { return "" }

        var scalars = String.UnicodeScalarView()
        for scalar in input.precomposedStringWithCompatibilityMapping.unicodeScalars {
            if diacritics.contains(scalar) { continue }

            switch scalar {
            case "أ", "إ", "آ", "ٱ":
                scalars.append("ا")
            case "ى":
                scalars.append("ي")
            case "ة":
                scalars.append("ه")
            default:
                if CharacterSet.alphanumerics.contains(scalar) {
                    scalars.append(scalar)
                } else {
                    scalars.append(" ")
                }
            }
        }

        // يجمع تقليص المسافات المتتابعة والقصّ من الطرفين في خطوة واحدة
        return String(String.UnicodeScalarView(scalars))
            .split(whereSeparator: { $0.isWhitespace })
            .joined(separator: " ")
            .lowercased()
    }

    /// كلمات النص بعد التطبيع.
    static func tokens(_ input: String?) -> [String] {
        let normalized = normalize(input)
        return normalized.isEmpty ? [] : normalized.split(separator: " ").map(String.init)
    }

    // MARK: - الأرقام

    private static let arabicDigits = Array("٠١٢٣٤٥٦٧٨٩")

    /// تحويل الأرقام اللاتينية إلى هندية.
    ///
    /// التطبيق كله عربي، والرقم اللاتيني وسط الجملة العربية ينشز — وأسوأ منه أن
    /// يختلط النظامان في سطر واحد. المصدران اللذان يسرّبان أرقاماً لاتينية
    /// مختلفان: واجهتنا نحن (تُحوَّل عند العرض)، ونص يكتبه النموذج (يُحوَّل عند
    /// التحقق، لأن القاعدة في البرومبت رجاء والنموذج قد يخالفه).
    static func toArabicDigits(_ value: String) -> String {
        String(value.map { character in
            guard let ascii = character.wholeNumberValue,
                  character.isASCII, character.isNumber,
                  ascii >= 0, ascii <= 9 else { return character }
            return arabicDigits[ascii]
        })
    }

    static func toArabicDigits(_ value: Int) -> String {
        toArabicDigits(String(value))
    }
}

extension Int {
    /// «٤٢» بدل «42» — كل رقم يظهر للمستخدم يمرّ من هنا.
    var arabicDigits: String { ArabicText.toArabicDigits(self) }
}

extension String {
    var arabicDigits: String { ArabicText.toArabicDigits(self) }
}
