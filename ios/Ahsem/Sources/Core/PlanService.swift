import Foundation

/// `POST /api/plan` — مولّد خطة اليوم.
///
/// المحطات من Google Places (مفتوحة فعلاً وقت الزيارة)، وأزمنة التنقّل من Routes
/// API، وطقس Open-Meteo يبعد المحطات المكشوفة عن ذروة الحر — وفشل الطقس لا يكسر
/// الخطة.
///
/// القاعدة الصلبة عند الخادم: معرّف المكان لازم يكون من القائمة التي أُرسلت.
/// النموذج قد يخترع مكاناً معقولاً تماماً — وهذا بالضبط ما يُمنع.
enum PlanService {

    // MARK: - الإعدادات المشتركة مع الخادم

    struct Vibe: Identifiable, Hashable {
        let id: String
        let label: String
    }

    struct Group: Identifiable, Hashable {
        let id: String
        let label: String
    }

    struct Budget: Identifiable, Hashable {
        let id: String
        let label: String
        let hint: String
    }

    struct DurationChoice: Identifiable, Hashable {
        let id: Int
        let label: String
    }

    static let vibes: [Vibe] = [
        Vibe(id: "chill", label: "هادي"),
        Vibe(id: "active", label: "نشيط"),
        Vibe(id: "foodie", label: "أكل"),
        Vibe(id: "outdoors", label: "برّا"),
        Vibe(id: "nightlife", label: "سهر"),
    ]

    static let groups: [Group] = [
        Group(id: "solo", label: "لحالي"),
        Group(id: "couple", label: "أنا وشريكي"),
        Group(id: "family_kids", label: "عائلة وأطفال"),
        Group(id: "friends", label: "مع الأصحاب"),
    ]

    static let budgets: [Budget] = [
        Budget(id: "low", label: "اقتصادي", hint: "مجاني إلى رخيص"),
        Budget(id: "medium", label: "متوسط", hint: "معقول"),
        Budget(id: "high", label: "مفتوح", hint: "ما يهم السعر"),
    ]

    static let durations: [DurationChoice] = [
        DurationChoice(id: 3, label: "٣ ساعات"),
        DurationChoice(id: 5, label: "٥ ساعات"),
        DurationChoice(id: 8, label: "يوم كامل"),
    ]

    static let defaultRadiusKm = 15
    static let minRadiusKm = 1
    static let maxRadiusKm = 50

    // MARK: - الطلب

    struct Request: Encodable {
        var lat: Double?
        var lng: Double?
        /// بديل الإحداثيات حين يرفض المستخدم تحديد الموقع.
        var locationQuery: String?
        /// `HH:MM`
        let startTime: String
        let durationHours: Int
        /// `YYYY-MM-DD`
        let date: String
        let vibe: String
        let group: String
        let budget: String
        var radiusKm: Int = defaultRadiusKm
        /// «بدّل هذا المكان» — يُستثنى في الطلب التالي.
        var excludePlaceIds: [String] = []
    }

    // MARK: - الرد

    struct TravelLeg: Decodable, Hashable {
        let minutes: Int
        let meters: Int?
    }

    struct Stop: Decodable, Identifiable, Hashable {
        let place_id: String
        /// الاسم من قائمتنا لا من رد النموذج — لو أعاد صياغته أو ترجمه نبقى على
        /// الاسم الذي يعرفه المستخدم على الخريطة.
        let name: String
        /// `HH:MM`
        let arrival_time: String
        let duration_minutes: Int
        let why: String
        let lat: Double?
        let lng: Double?
        let address: String?
        let rating: Double?
        let price_level: Int?
        let category: String?
        /// زمن الانتقال للمحطة التالية — `nil` لآخر محطة أو حين تسقط الرجل.
        let travel_to_next: TravelLeg?

        var id: String { place_id }
    }

    struct Plan: Decodable, Hashable {
        let title: String
        let note: String
        let stops: [Stop]
    }

    /// ملخّص لا ساعات كاملة: الشريط يعرض المدى واحتمال المطر. `nil` يعني «بلا
    /// طقس» والواجهة تخفي الشريط كلياً.
    struct Weather: Decodable, Hashable {
        let minFeels: Double?
        let maxFeels: Double?
        let maxRain: Double?
        let unit: String?
        let hottest: String?
        let coolest: String?
    }

    struct Origin: Decodable, Hashable {
        let label: String
        let lat: Double?
        let lng: Double?
    }

    struct Response: Decodable {
        let ok: Bool
        /// `true` حين لا يوجد مرشّحون أصلاً — والرسالة تقول لماذا.
        let empty: Bool?
        let origin: Origin?
        let weather: Weather?
        let plan: Plan?
        let candidateCount: Int?
        let model: String?
    }

    static func build(_ request: Request) async throws -> Response {
        try await APIClient.shared.post("api/plan", body: request)
    }
}
