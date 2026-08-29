import SwiftUI

/// الدخول وإنشاء الحساب — سطر تحت الكلام لا صندوق حوله، وهو ما يجعل الشاشة تبدو
/// ورقةً تُملأ.
struct AuthView: View {
    @Environment(AuthStore.self) private var auth
    @Environment(\.palette) private var palette
    @Environment(\.dismiss) private var dismiss

    enum Mode: String, CaseIterable, Identifiable {
        case signIn = "دخول"
        case signUp = "حساب جديد"
        var id: String { rawValue }
    }

    @State private var mode: Mode = .signIn
    @State private var email = ""
    @State private var password = ""
    @State private var displayName = ""
    @State private var busy = false
    @State private var message: String?
    @State private var sentConfirmation = false

    private var canSubmit: Bool {
        !busy && email.contains("@") && password.count >= 8
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 26) {
                header

                if sentConfirmation {
                    confirmationNote
                } else {
                    form
                }
            }
            .padding(24)
        }
        .background(palette.background.ignoresSafeArea())
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("إغلاق") { dismiss() }
                    .foregroundStyle(palette.muted)
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("احسم")
                .font(Typo.display(36))
                .foregroundStyle(palette.titleGradient)

            Text("الحساب يحفظ قراراتك ويجعل الحسم يتعلّم من عاداتك. القرار الجماعي يحتاجه أيضاً.")
                .font(Typo.body(15))
                .lineSpacing(4)
                .foregroundStyle(palette.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var form: some View {
        VStack(alignment: .leading, spacing: 22) {
            Picker("", selection: $mode) {
                ForEach(Mode.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)

            if mode == .signUp {
                UnderlineField(
                    placeholder: "اسمك (اختياري)",
                    text: $displayName,
                    contentType: .name
                )
            }

            UnderlineField(
                placeholder: "الإيميل",
                text: $email,
                keyboard: .emailAddress,
                contentType: .emailAddress
            )

            UnderlineField(
                placeholder: "كلمة المرور",
                text: $password,
                isSecure: true,
                contentType: mode == .signUp ? .newPassword : .password,
                submitLabel: .go,
                onSubmit: { Task { await submit() } }
            )

            if mode == .signUp {
                Text("ثمانية أحرف على الأقل.")
                    .font(Typo.caption(12))
                    .foregroundStyle(palette.mutedSoft)
            }

            if let message {
                Text(message)
                    .font(Typo.body(14))
                    .foregroundStyle(palette.accentStrong)
                    .fixedSize(horizontal: false, vertical: true)
            }

            PrimaryButton(
                title: mode == .signIn ? "ادخل" : "أنشئ الحساب",
                isLoading: busy,
                isEnabled: canSubmit
            ) {
                Task { await submit() }
            }

            // رابط الدخول السريع — لمن نسي كلمة المرور أو لا يريدها أصلاً
            QuietButton(title: "أرسل لي رابط دخول بدل كلمة المرور", isEnabled: !busy) {
                Task { await sendLink() }
            }
        }
        .animation(.easeInOut(duration: 0.2), value: mode)
    }

    /// لا توجد جلسة قبل التأكيد في هذا المسار أبداً — فالشاشة تقول ذلك صراحةً بدل
    /// أن تُبقي المستخدم ينتظر دخولاً لن يقع.
    private var confirmationNote: some View {
        VStack(alignment: .leading, spacing: 14) {
            Label("وصلتك رسالة", systemImage: "envelope")
                .font(Typo.heading(18))
                .foregroundStyle(palette.ink)

            Text("افتح الرابط في إيميلك لتأكيد الحساب، ثم ارجع وسجّل الدخول.")
                .font(Typo.body(15))
                .lineSpacing(4)
                .foregroundStyle(palette.muted)
                .fixedSize(horizontal: false, vertical: true)

            GhostButton(title: "رجوع") {
                sentConfirmation = false
                mode = .signIn
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            RoundedRectangle(cornerRadius: Palette.radiusCard, style: .continuous)
                .fill(palette.accentSoft)
        }
    }

    // MARK: -

    private func submit() async {
        guard canSubmit else { return }
        busy = true
        message = nil
        defer { busy = false }

        let outcome = mode == .signIn
            ? await auth.signIn(email: email, password: password)
            : await auth.signUp(email: email, password: password, displayName: displayName)

        switch outcome {
        case .success:
            dismiss()
        case .needsConfirmation:
            sentConfirmation = true
        case .failure(let text):
            message = text
        }
    }

    private func sendLink() async {
        guard email.contains("@") else {
            message = "اكتب إيميلاً صالحاً."
            return
        }
        busy = true
        message = nil
        defer { busy = false }

        switch await auth.sendMagicLink(email: email) {
        case .needsConfirmation, .success:
            sentConfirmation = true
        case .failure(let text):
            message = text
        }
    }
}
