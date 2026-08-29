import SwiftUI

@main
struct AhsemApp: App {
    /// المزاج والجلسة يعيشان في الجذر: اللون يبقى عبر كل الشاشات، والجلسة
    /// تُقرأ مرة واحدة — وهو نفس السبب الذي رفعهما إلى التخطيط الجذري في الويب.
    @State private var theme = MoodTheme()
    @State private var auth = AuthStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(theme)
                .environment(auth)
                .environment(\.palette, theme.palette)
                // التطبيق عربي أولاً: الاتجاه يُفرض ولا يُترك للغة الجهاز، وإلا
                // انقلبت الشاشة على مستخدم لغته الإنجليزية والنص عربي.
                .environment(\.layoutDirection, .rightToLeft)
                .environment(\.locale, Locale(identifier: "ar"))
                .tint(theme.palette.accent)
                .preferredColorScheme(.light)
        }
    }
}
