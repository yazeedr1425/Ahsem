# احسم — تطبيق iOS (SwiftUI)

نقلٌ أصلي لتطبيق [احسم](../README.md) إلى SwiftUI. الواجهة كلها Swift، والخادم
هو نفسه خادم Next.js القائم على Vercel بلا تغيير.

> **للمهندس:** هذا الكود كُتب على Windows ولم يُبنَ ولم يُختبر على جهاز — لا
> يوجد Xcode خارج macOS. توقّع أخطاء بناء في أول محاولة، خاصةً في المواضع
> المؤشَّر عليها تحت [ما يحتاج انتباهك](#ما-يحتاج-انتباهك). كل شيء آخر منقول
> سطراً بسطر عن النسخة الويب.

---

## البناء في خمس خطوات

```bash
brew install xcodegen
cd ios
xcodegen generate
open Ahsem.xcodeproj
```

ثم اضبط الإعدادات الأربعة في `Ahsem/Resources/Info.plist` (انظر تحت) واختر فريق
التوقيع في **Signing & Capabilities**.

`xcodegen` يقرأ [`project.yml`](project.yml) ويولّد `Ahsem.xcodeproj`. لا تُضِف
المشروع المولَّد إلى git — أعِد توليده بعد أي ملف Swift جديد.

بديلٌ بلا XcodeGen: **File › New › Project › iOS › App**، ثم اسحب مجلد
`Ahsem/Sources` إلى المشروع، وأضِف حزمة `supabase-swift` من
**File › Add Package Dependencies**.

---

## الإعدادات

أربعة مفاتيح في `Info.plist` يقرأها [`AppConfig.swift`](Ahsem/Sources/Core/AppConfig.swift):

| المفتاح | القيمة |
|---|---|
| `AHSEM_API_BASE_URL` | جذر نشرة Vercel، مثل `https://ai-vibe-decision-making.vercel.app` |
| `AHSEM_WEB_BASE_URL` | نفس العنوان — يُستعمل في رابط التصويت المُشارَك |
| `AHSEM_SUPABASE_URL` | من `NEXT_PUBLIC_SUPABASE_URL` في `.env.local` |
| `AHSEM_SUPABASE_ANON_KEY` | من `NEXT_PUBLIC_SUPABASE_ANON_KEY` |

للفصل بين التطوير والإصدار، انقلها إلى ملف `.xcconfig` واترك `Info.plist` يشير
إليها بـ `$(AHSEM_API_BASE_URL)`.

### ⚠️ ما لا يدخل التطبيق أبداً

`GEMINI_API_KEY` و`GOOGLE_MAPS_API_KEY` و`SUPABASE_SERVICE_ROLE_KEY` تبقى على
خادم Next.js وحده. أي مفتاح يوضع داخل تطبيق منشور يمكن استخراجه من الـ binary،
و`service_role` بالذات **يتجاوز صلاحيات RLS كاملةً** — أي أن تسريبه يعني الوصول
إلى قاعدة البيانات كلها. ولهذا يبقى التطبيق عميلاً يستدعي `/api/*` ولا يستدعي
Gemini مباشرة.

المفتاح المنشور (anon) وحده داخل التطبيق، وهو آمن: صلاحياته محكومة بسياسات RLS.

---

## الخطوط

الوجوه الثلاثة ليست ضمن iOS. حمّلها من Google Fonts وضعها في
`Ahsem/Resources/Fonts/`، ثم أدرجها في `UIAppFonts` داخل `Info.plist`:

- **IBM Plex Sans Arabic** — أوزان 400/500/600/700 (المتن)
- **Almarai** — 400/700 (العناوين؛ لا يوجد فيه 600، والنظام يحلّه إلى 700)
- **Space Grotesk** — 400 (الأرقام والوسوم اللاتينية)

حتى تُضاف، يرتد كل وجه إلى خط النظام تلقائياً فلا تنكسر أي شاشة — الفرق مظهري
لا وظيفي. انظر [`Typography.swift`](Ahsem/Sources/Design/Typography.swift).

---

## البنية

```
Ahsem/Sources/
├── App/          نقطة الدخول، الجذر، التبويبات الأربعة
├── Core/         الشبكة والخدمات — كل ما يكلّم الخادم أو Supabase
├── Engine/       منطق خالص: الأوزان، الحساب، النبرة، المخاطرة
├── Design/       اللوحة والخطوط والعناصر المشتركة والشفق
└── Features/     شاشة لكل ميزة
```

`Engine/` هو ما نُقل حرفياً عن `lib/engine/` في الويب: لا يحمل سراً، ولا يعرف
شيئاً عن الشبكة. وهو أيضاً **الحساب الاحتياطي** الذي يحمل شاشة النتيجة حين يفشل
النداء — وإبقاء الحساب متطابقاً على المنصتين هو ما يجعل ذلك الاحتياطي صادقاً.

النموذج يفسّر، ولا يعدّ — في الويب وفي iOS معاً.

---

## ما نُقل

| الميزة | الحالة | الشاشة |
|---|---|---|
| القرار الفردي (خيارات ← أسئلة ← تقييم ← حكم) | ✅ | `Features/Decide/` |
| المبارزة (خياران بمقبض واحد لكل معيار) | ✅ | `DuelView` |
| المزاج وثيمه الكامل | ✅ | `Design/Theme.swift` |
| الخيار الثالث الذي لم تفكر فيه | ✅ | `ThirdOptionHint` |
| «أنا متردد جدًا» — السحبة الموزونة | ✅ | `ResultView` |
| النقاش بعد الحكم | ✅ | `VerdictChatView` |
| تفكيك القرار المصيري | ✅ | `Features/Breakdown/` |
| التصويت الجماعي + البث اللحظي + QR | ✅ | `Features/Group/` |
| السجل وتقييم النتيجة | ✅ | `HistorySection` |
| قراءة الأنماط | ✅ | `PatternsView` |
| خطة اليوم (أماكن + تنقّل + طقس) | ✅ | `Features/Plan/` |
| تحليل المخاطر (خمسة وكلاء، تدفّق NDJSON) | ✅ | `Features/Analyze/` |
| الحساب والتفضيلات | ✅ | `AccountView` |
| المحادثة الصوتية | ✅ | `VoiceModeView` |
| صفحات `/how` و`/pricing` | ❌ | تسويقية — تُترك للموقع |

---

## ما يحتاج انتباهك

هذه المواضع أرجّح أن تحتاج تعديلاً عند أول بناء، مرتّبةً بالاحتمال:

1. **واجهة البث اللحظي في `supabase-swift`**
   [`GroupVoteStore.swift`](Ahsem/Sources/Features/Group/GroupVoteStore.swift)
   يستعمل `channel.broadcastStream(event:)` و`presenceChange()` و`track()`.
   هذه الأسماء تغيّرت بين إصدارات الحزمة — قابِلها بتوثيق الإصدار الذي يجلبه
   SPM لديك. المنطق نفسه بسيط ومشروح: كل رنّة جرس = إعادة جلب من
   `get_vote_page`، والأرقام لا تُقرأ من الرسالة أبداً.

2. **`RealtimeChannelV2` وعزل التزامن**
   قد يشتكي المترجم من `Sendable` حول القناة. الحلّ الأبسط إبقاء التعامل معها
   داخل `@MainActor` كما هو الآن.

3. **`TextEditor` داخل `ScrollView`**
   في [`AnalyzeView`](Ahsem/Sources/Features/Analyze/AnalyzeView.swift). يعمل،
   لكن ارتفاعه لا ينمو مع النص. لو أزعج، استبدله بـ
   `TextField(axis: .vertical)`.

4. **أذونات الميكروفون**
   [`VoiceModeView`](Ahsem/Sources/Features/Decide/VoiceModeView.swift) يستعمل
   `AVAudioApplication.requestRecordPermission` (يحتاج iOS 17+، وهو هدف
   المشروع). على أهداف أقدم استعمل `AVAudioSession.requestRecordPermission`.

5. **`ProgressLine` داخل `GeometryReader`**
   قد يحتاج ضبط ارتفاع في بعض الشاشات.

---

## ما يبقى قبل App Store

- [ ] أيقونة التطبيق في `Assets.xcassets/AppIcon` (لم أستطع توليد صور ثنائية)
- [ ] شاشة إطلاق إن أردت أكثر من الافتراضية
- [ ] لقطات الشاشة ونص المتجر
- [ ] سياسة الخصوصية — إلزامية، والتطبيق يجمع بريداً وموقعاً وصوتاً
- [ ] إفصاح خصوصية App Store: البريد (الحساب)، الموقع (خطة اليوم)، الصوت
      (المحادثة) — الصوت يُعالَج على الجهاز عبر `SFSpeechRecognizer` ولا يُخزَّن
- [ ] حساب Apple Developer + ملفات التوقيع
