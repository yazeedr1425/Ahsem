import SwiftUI

/// شاشة الهبوط: لوح الكتابة.
///
/// النسخة الويب تعرض لوحين جنباً إلى جنب (الكتابة والأمثلة) لأن الشاشة عريضة.
/// على الهاتف يصير الترتيب رأسياً: العنوان، ثم الحقول، ثم ما يعلّق عليها
/// (الخيار الثالث، المزاج، لافتة القرار المصيري)، ثم الفعل — والأمثلة تحته لأنها
/// مدخل مختصر لا ميزة تُعرض.
struct LandingView: View {
    @Bindable var store: DecideFlowStore
    @Environment(MoodTheme.self) private var theme
    @Environment(AuthStore.self) private var auth
    @Environment(\.palette) private var palette

    /// أرقام هندية — الشاشة كلها عربية والرقم اللاتيني ينشز.
    private let ordinals = ["١", "٢", "٣", "٤", "٥"]

    /// لافتة القرار المصيري تُرفض لمرة واحدة بمفتاح الخيارات نفسها: تغيّر النص
    /// يعيد طرحها، وإلحاحها على نفس النص بعد الرفض مزعج.
    @State private var dismissedOversizedKey: String?
    @State private var suggestions: [ThirdOptionService.Suggestion] = []
    @State private var suggestionTask: Task<Void, Never>?

    private var filledLabels: [String] { store.filledOptions.map(\.label) }

    private var oversizedKey: String { filledLabels.joined(separator: "|") }

    private var showsOversizedBanner: Bool {
        guard filledLabels.count >= ScoreEngine.minOptions else { return false }
        guard dismissedOversizedKey != oversizedKey else { return false }
        return Oversized.looksOversized(labels: filledLabels, categoryId: nil)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            hero
            composer
        }
    }

    // MARK: - العنوان

    private var hero: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("احسمها بالمنطق،\nلا بالتردد.")
                .font(Typo.display(38))
                .foregroundStyle(palette.titleGradient)
                .fixedSize(horizontal: false, vertical: true)

            Text("اكتب خياراتك، جاوب أسئلة سريعة، وأحسمها لك — مع السبب.")
                .font(Typo.body(17))
                .lineSpacing(5)
                .foregroundStyle(palette.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - لوح الكتابة

    private var composer: some View {
        GlassCard(padding: 22) {
            VStack(alignment: .leading, spacing: 22) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("أدخل الخيارات واشرع في التحليل")
                        .font(Typo.title(24))
                        .foregroundStyle(palette.ink)

                    // «الخيارين» كانت تقفلها على اثنين، والحدّ الأعلى خمسة —
                    // فالصياغة تُبقيها مفتوحة
                    Text("ضع خياراتك المتاحة، وسيطرح النظام أسئلة تقييمية موزونة لقياس تفوّق أحدها منطقيًا.")
                        .font(Typo.body(14))
                        .lineSpacing(4)
                        .foregroundStyle(palette.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }

                optionFields
                addOptionButton

                if !suggestions.isEmpty {
                    ThirdOptionHint(suggestions: suggestions) { label in
                        addOption(labelled: label)
                    }
                }

                moodPicker

                if showsOversizedBanner { oversizedBanner }
                if let error = store.frameError { frameErrorBanner(error) }

                actions
            }
        }
    }

    private var optionFields: some View {
        VStack(spacing: 14) {
            ForEach(store.options) { option in
                let index = store.options.firstIndex { $0.id == option.id } ?? 0

                HStack(spacing: 12) {
                    Text(ordinals[min(index, ordinals.count - 1)])
                        .font(Typo.bodySemibold(18))
                        .foregroundStyle(palette.mutedSoft)
                        .frame(width: 16)
                        .accessibilityHidden(true)

                    UnderlineField(
                        placeholder: "الخيار \(ordinals[min(index, ordinals.count - 1)])",
                        text: binding(for: option.id),
                        submitLabel: .done,
                        onSubmit: store.prefetchFrame
                    )
                    .accessibilityLabel("الخيار رقم \((index + 1).arabicDigits)")

                    if store.options.count > ScoreEngine.minOptions {
                        Button {
                            store.removeOption(id: option.id)
                        } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(palette.mutedSoft)
                                .frame(width: 28, height: 28)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("احذف الخيار رقم \((index + 1).arabicDigits)")
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var addOptionButton: some View {
        if store.options.count < ScoreEngine.maxOptions {
            Button {
                store.addOption()
            } label: {
                Label("أضف خياراً", systemImage: "plus")
                    .font(Typo.body(15))
                    .foregroundStyle(palette.muted)
            }
            .buttonStyle(.plain)
        }
    }

    /// المزاج يغيّر الثيم كله ويضيف +1 لوزن معيار واحد — وأثره معلن في شرح
    /// النتيجة، فلا يخترع شيئاً من فراغ.
    private var moodPicker: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("كيف حالتك الآن؟")
                .font(Typo.bodyMedium(14))
                .foregroundStyle(palette.muted)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(Moods.all) { mood in
                        ChoiceChip(
                            title: mood.label,
                            isSelected: theme.moodId == mood.id
                        ) {
                            theme.moodId = theme.moodId == mood.id ? nil : mood.id
                        }
                    }
                }
                .padding(.horizontal, 1)
            }
            .scrollClipDisabled()

            if let line = theme.mood?.line {
                Text(line)
                    .font(Typo.caption(12))
                    .foregroundStyle(palette.mutedSoft)
                    .fixedSize(horizontal: false, vertical: true)
                    .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.25), value: theme.moodId)
    }

    private var oversizedBanner: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "scalemass")
                    .font(.system(size: 15))
                    .foregroundStyle(palette.accentStrong)
                    .padding(.top, 2)

                Text("هذا يشبه قرارات المصير — ما ينحسم بمزاج اليوم. نفكه لك لفحوصات صغيرة لها جواب، وبعدها الحكم؟")
                    .font(Typo.body(14))
                    .lineSpacing(4)
                    .foregroundStyle(palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack(spacing: 14) {
                InkButton(title: "فكّه أول") { store.step = .breakdown }
                QuietButton(title: "لا، كمّل عادي") {
                    dismissedOversizedKey = oversizedKey
                }
            }
        }
        .padding(16)
        .background {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(palette.accentSoft)
        }
    }

    /// فشل الإطار خطأ صريح لا قالب بديل: بدونه لا أسئلة ولا معايير، وسؤال مصنوع
    /// يتنكّر كمولَّد أسوأ من لا شيء.
    private func frameErrorBanner(_ message: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 15))
                .foregroundStyle(palette.accentStrong)
                .padding(.top, 2)

            // الرسالة تأتي من الخادم كاملةً بإرشادها — و«انتظر دقيقة» عند تجاوز
            // السقف يناقضها ذيلٌ يقول «جرّب مرة ثانية»
            Text(message)
                .font(Typo.body(14))
                .lineSpacing(4)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(palette.accentSoft)
        }
        .accessibilityAddTraits(.isStaticText)
    }

    private var actions: some View {
        VStack(spacing: 12) {
            PrimaryButton(
                title: "نفّذ التحليل",
                isEnabled: store.canStart
            ) {
                Task { await store.start() }
            }

            // القرار المشترك أعقد من الفردي: تتعدد المعايير بتعدد أصحابها.
            // الرابط للمجموعة، والتصويت مرجَّح بالوزن.
            Button {
                Task { await store.createGroup() }
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "person.2")
                    Text(store.groupBusy ? "… يُجهَّز الرابط" : "تحليل جماعي — تصويت مرجَّح")
                }
                .font(Typo.bodyMedium(15))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 13)
                .foregroundStyle(palette.ink)
                .background { Capsule().stroke(palette.lineStrong, lineWidth: 1) }
            }
            .buttonStyle(PressDownStyle())
            .disabled(!store.canStart || store.groupBusy)
            .opacity(store.canStart && !store.groupBusy ? 1 : 0.4)

            Text(
                store.canStart
                    ? "لا يُحفظ القرار إلا بطلبك. البيانات ملكك."
                    : "أدخل \(ScoreEngine.minOptions.arabicDigits) خيارات على الأقل."
            )
            .font(Typo.caption(12))
            .foregroundStyle(palette.mutedSoft)
            .frame(maxWidth: .infinity)
            .multilineTextAlignment(.center)
        }
    }

    // MARK: -

    private func binding(for id: String) -> Binding<String> {
        Binding(
            get: { store.options.first { $0.id == id }?.label ?? "" },
            set: { newValue in
                guard let index = store.options.firstIndex(where: { $0.id == id }) else { return }
                store.options[index].label = String(newValue.prefix(60))
                scheduleSuggestions()
            }
        )
    }

    private func addOption(labelled label: String) {
        // الفراغ الأول يستقبل الاقتراح، وإلا أُضيف صفٌّ جديد
        if let index = store.options.firstIndex(where: {
            $0.label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }) {
            store.options[index].label = label
        } else if store.options.count < ScoreEngine.maxOptions {
            store.options.append(DecisionOption(label: label))
        }
        suggestions = []
        store.prefetchFrame()
    }

    /// الاقتراح يُطلب بعد سكون الكتابة لا مع كل حرف: النداء ثمنه، والحرف الواحد
    /// لا يغيّر المقايضة.
    private func scheduleSuggestions() {
        suggestionTask?.cancel()
        let labels = filledLabels
        guard labels.count >= ScoreEngine.minOptions,
              labels.allSatisfy({ $0.count >= 2 }) else {
            suggestions = []
            return
        }

        suggestionTask = Task {
            try? await Task.sleep(for: .milliseconds(700))
            guard !Task.isCancelled else { return }
            let found = await ThirdOptionService.suggestions(for: labels)
            guard !Task.isCancelled else { return }
            suggestions = found
        }
    }
}

/// «الخيار اللي ما فكرت فيه» — يظهر فقط حين يوجد اقتراح حقيقي: لا حالة تحميل،
/// ولا ضجيج.
struct ThirdOptionHint: View {
    let suggestions: [ThirdOptionService.Suggestion]
    let onPick: (String) -> Void

    @Environment(\.palette) private var palette

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("أو الخيار اللي ما فكرت فيه")
                .font(Typo.caption(12))
                .foregroundStyle(palette.mutedSoft)

            ForEach(suggestions) { suggestion in
                Button {
                    onPick(suggestion.label)
                } label: {
                    HStack(spacing: 10) {
                        Image(systemName: "plus.circle")
                            .font(.system(size: 15))
                            .foregroundStyle(palette.accent)

                        VStack(alignment: .leading, spacing: 2) {
                            Text(suggestion.label)
                                .font(Typo.bodyMedium(15))
                                .foregroundStyle(palette.ink)
                            Text(suggestion.note)
                                .font(Typo.caption(12))
                                .foregroundStyle(palette.muted)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(.vertical, 10)
                    .padding(.horizontal, 14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background {
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .fill(palette.cardSunken)
                    }
                }
                .buttonStyle(PressDownStyle())
            }
        }
        .transition(.opacity.combined(with: .move(edge: .top)))
    }
}
