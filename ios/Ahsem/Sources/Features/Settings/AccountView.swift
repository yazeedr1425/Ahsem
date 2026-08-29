import SwiftUI

/// حسابي — التفضيلات التي تسبق الحالة المحلية في كل شاشة، والسجل، والخروج.
struct AccountView: View {
    @Environment(AuthStore.self) private var auth
    @Environment(MoodTheme.self) private var theme
    @Environment(\.palette) private var palette

    @State private var profile: ProfileService.Profile?
    @State private var displayName = ""
    @State private var tone: Tone = .default
    @State private var readAloud = false
    @State private var loading = true
    @State private var saving = false
    @State private var message: String?
    @State private var showsAuth = false
    /// الخروج يُسأل عنه مرتين — الضغطة الواحدة على زر بهذا الأثر خطأٌ سهل.
    @State private var confirmingSignOut = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    if !auth.isSignedIn {
                        signedOut
                    } else if loading {
                        ProgressView().tint(palette.accent)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 60)
                    } else {
                        identity
                        preferences
                        NavigationLink {
                            PatternsView()
                        } label: {
                            row(icon: "sparkles", title: "شخصيتك القرارية")
                        }
                        signOutButton
                    }

                    if let message {
                        Text(message)
                            .font(Typo.body(14))
                            .foregroundStyle(palette.muted)
                    }
                }
                .padding(22)
            }
            .background(Color.clear)
            .navigationTitle("حسابي")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.hidden, for: .navigationBar)
        }
        .task(id: auth.isSignedIn) { await load() }
        .sheet(isPresented: $showsAuth) {
            NavigationStack { AuthView() }
                .environment(\.palette, palette)
                .environment(\.layoutDirection, .rightToLeft)
        }
    }

    // MARK: - الأجزاء

    private var signedOut: some View {
        VStack(alignment: .leading, spacing: 16) {
            SectionHeading(
                title: "ما فيه حساب بعد",
                sub: "الحساب يحفظ قراراتك، ويفتح قراءة الأنماط، ويسمح بإنشاء تصويت جماعي."
            )
            PrimaryButton(title: "دخول أو إنشاء حساب") { showsAuth = true }
        }
    }

    private var identity: some View {
        GlassCard(padding: 20) {
            VStack(alignment: .leading, spacing: 14) {
                if let email = auth.user?.email {
                    HStack {
                        Text("الإيميل")
                            .font(Typo.body(14))
                            .foregroundStyle(palette.muted)
                        Spacer()
                        Text(email)
                            .font(Typo.body(14))
                            .foregroundStyle(palette.ink)
                            .environment(\.layoutDirection, .leftToRight)
                    }
                }

                PaperRule()

                UnderlineField(
                    placeholder: "اسمك",
                    text: $displayName,
                    contentType: .name,
                    submitLabel: .done,
                    onSubmit: { Task { await save() } }
                )
            }
        }
    }

    private var preferences: some View {
        GlassCard(padding: 20) {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("نبرة الحسم")
                        .font(Typo.bodyMedium(15))
                        .foregroundStyle(palette.ink)

                    // النبرة تصل إلى برومبت النموذج نفسه لا إلى غلاف الحكم وحده:
                    // من يختار «جدي» كان يقرأ إطاراً رسمياً حول نكتة.
                    Picker("", selection: $tone) {
                        ForEach(Tone.allCases) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.segmented)
                }

                Toggle(isOn: $readAloud) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("قراءة الشاشة صوتياً")
                            .font(Typo.bodyMedium(15))
                            .foregroundStyle(palette.ink)
                        Text("يقرأ الحكم وأسئلته أول ما تظهر.")
                            .font(Typo.caption(12))
                            .foregroundStyle(palette.mutedSoft)
                    }
                }
                .tint(palette.accent)

                VStack(alignment: .leading, spacing: 8) {
                    Text("المزاج الافتراضي")
                        .font(Typo.bodyMedium(15))
                        .foregroundStyle(palette.ink)

                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ChoiceChip(title: "بلا", isSelected: theme.moodId == nil) {
                                theme.moodId = nil
                            }
                            ForEach(Moods.all) { mood in
                                ChoiceChip(
                                    title: mood.label,
                                    isSelected: theme.moodId == mood.id
                                ) {
                                    theme.moodId = mood.id
                                }
                            }
                        }
                    }
                    .scrollClipDisabled()
                }

                PrimaryButton(title: "احفظ", isLoading: saving) {
                    Task { await save() }
                }
            }
        }
    }

    private func row(icon: String, title: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
            Text(title)
            Spacer()
            Image(systemName: "chevron.backward")
                .font(.system(size: 12, weight: .semibold))
        }
        .font(Typo.bodyMedium(15))
        .foregroundStyle(palette.ink)
        .padding(16)
        .background {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(palette.cardSunken)
        }
    }

    private var signOutButton: some View {
        VStack(alignment: .leading, spacing: 10) {
            if confirmingSignOut {
                Text("متأكد؟ الضغطة الجاية تخرجك.")
                    .font(Typo.body(14))
                    .foregroundStyle(palette.muted)
            }

            GhostButton(title: confirmingSignOut ? "أكيد، اخرج" : "خروج") {
                if confirmingSignOut {
                    Task { await auth.signOut() }
                    confirmingSignOut = false
                } else {
                    confirmingSignOut = true
                }
            }
        }
        .animation(.easeOut(duration: 0.2), value: confirmingSignOut)
    }

    // MARK: -

    private func load() async {
        guard auth.isSignedIn else {
            loading = false
            return
        }
        loading = true
        defer { loading = false }

        profile = try? await ProfileService.get()
        displayName = profile?.display_name ?? ""
        tone = profile?.toneValue ?? .default
        readAloud = profile?.read_aloud ?? false
        if theme.moodId == nil { theme.moodId = profile?.default_mood }

        await ProfileService.touchLastSeen()
    }

    private func save() async {
        saving = true
        message = nil
        defer { saving = false }

        do {
            profile = try await ProfileService.update(
                ProfileService.Patch(
                    display_name: displayName.trimmingCharacters(in: .whitespacesAndNewlines),
                    tone: tone.rawValue,
                    read_aloud: readAloud,
                    default_mood: theme.moodId
                )
            )
            message = "انحفظ."
        } catch {
            message = error.localizedDescription
        }
    }
}
