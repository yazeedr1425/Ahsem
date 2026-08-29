import SwiftUI

/// الجذر: الشفق خلف كل شيء، والأقسام الأربعة فوقه.
///
/// الخلفية هنا لا داخل شاشة — لو عاشت في شاشة لاختفت عند الانتقال لغيرها، وهو
/// نفس السبب الذي رفع المزاج إلى الجذر.
struct RootView: View {
    @Environment(MoodTheme.self) private var theme
    @Environment(AuthStore.self) private var auth

    /// الرابط `ahsem://vote/CODE` يفتح شاشة التصويت مباشرة — الرابط *هو* السر،
    /// فلا يمر بأي وسيط.
    @State private var pendingVoteCode: VoteCode?

    var body: some View {
        ZStack {
            AuroraBackground(palette: theme.palette)

            TabView {
                DecideFlowView()
                    .tabItem { Label("احسم", systemImage: "scale.3d") }

                DayPlanView()
                    .tabItem { Label("خطة اليوم", systemImage: "map") }

                AnalyzeView()
                    .tabItem { Label("تحليل المخاطر", systemImage: "chart.line.uptrend.xyaxis") }

                AccountView()
                    .tabItem { Label("حسابي", systemImage: "person.crop.circle") }
            }
            .scrollContentBackground(.hidden)
        }
        .environment(\.palette, theme.palette)
        .tint(theme.palette.accent)
        .animation(.easeInOut(duration: 0.6), value: theme.moodId)
        .onOpenURL { url in
            guard url.scheme == "ahsem", url.host == "vote" else { return }
            let code = url.lastPathComponent
            if !code.isEmpty { pendingVoteCode = VoteCode(id: code) }
        }
        .sheet(item: $pendingVoteCode) { code in
            NavigationStack {
                GroupVoteView(code: code.id)
            }
            .environment(\.palette, theme.palette)
            .environment(\.layoutDirection, .rightToLeft)
        }
        .overlay {
            if auth.isLoading { SplashView() }
        }
    }
}

/// الشاشة الافتتاحية — تبقى حتى تُقرأ الجلسة المحفوظة، فلا تومض الواجهة بحالة
/// الضيف ثم تقفز لحالة المسجَّل.
struct SplashView: View {
    @Environment(\.palette) private var palette

    var body: some View {
        ZStack {
            palette.background.ignoresSafeArea()
            Text("احسم")
                .font(Typo.display(44))
                .foregroundStyle(palette.titleGradient)
        }
        .transition(.opacity)
    }
}

/// كود التصويت ملفوفاً في نوعه: `sheet(item:)` تطلب `Identifiable`، وتمديد
/// `String` بها يمسّ كل نصٍّ في التطبيق لأجل شاشة واحدة.
struct VoteCode: Identifiable, Equatable {
    let id: String
}
