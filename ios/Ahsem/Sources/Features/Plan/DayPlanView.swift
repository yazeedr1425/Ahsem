import SwiftUI
import CoreLocation

/// خطة اليوم — اختر مزاجاً وجواً وميزانية ومدة، ويبني الوكيل جدولاً حقيقياً.
///
/// «حقيقي» هنا ليست مجازاً: الأماكن مفتوحة فعلاً وقت الزيارة، وأزمنة التنقّل من
/// خدمة مسارات، والطقس يُبعد المحطات المكشوفة عن ذروة الحر. وفشل الطقس لا يكسر
/// الخطة — يختفي شريطه وحده.
struct DayPlanView: View {
    @Environment(\.palette) private var palette
    @State private var location = LocationProvider()

    @State private var vibe = PlanService.vibes[0].id
    @State private var group = PlanService.groups[0].id
    @State private var budget = PlanService.budgets[1].id
    @State private var durationHours = PlanService.durations[1].id
    @State private var startTime = Date()
    @State private var date = Date()
    @State private var manualLocation = ""

    @State private var response: PlanService.Response?
    @State private var busy = false
    @State private var error: String?
    /// «بدّل هذا المكان» — يتراكم فيُستثنى في الطلب التالي.
    @State private var excluded: [String] = []

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    if let response, let plan = response.plan {
                        planBody(response: response, plan: plan)
                    } else {
                        composer
                    }
                }
                .padding(22)
            }
            .background(Color.clear)
            .navigationTitle("خطة اليوم")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.hidden, for: .navigationBar)
        }
    }

    // MARK: - المدخلات

    private var composer: some View {
        VStack(alignment: .leading, spacing: 22) {
            SectionHeading(
                title: "خطة يوم تنفع فعلاً",
                sub: "أماكن مفتوحة وقت وصولك، وأزمنة تنقّل حقيقية، وحرٌّ لا يُتجاهل."
            )

            GlassCard(padding: 20) {
                VStack(alignment: .leading, spacing: 20) {
                    chipRow("الجو", options: PlanService.vibes.map { ($0.id, $0.label) }, selection: $vibe)
                    chipRow("مع مين", options: PlanService.groups.map { ($0.id, $0.label) }, selection: $group)
                    chipRow("الميزانية", options: PlanService.budgets.map { ($0.id, $0.label) }, selection: $budget)

                    VStack(alignment: .leading, spacing: 10) {
                        Text("المدة")
                            .font(Typo.bodyMedium(14))
                            .foregroundStyle(palette.muted)
                        HStack(spacing: 8) {
                            ForEach(PlanService.durations) { choice in
                                ChoiceChip(
                                    title: choice.label,
                                    isSelected: durationHours == choice.id
                                ) { durationHours = choice.id }
                            }
                        }
                    }

                    DatePicker("التاريخ", selection: $date, displayedComponents: .date)
                        .font(Typo.body(15))
                    DatePicker("وقت البداية", selection: $startTime, displayedComponents: .hourAndMinute)
                        .font(Typo.body(15))

                    locationField
                }
            }

            if let error {
                Text(error)
                    .font(Typo.body(14))
                    .foregroundStyle(palette.accentStrong)
                    .fixedSize(horizontal: false, vertical: true)
            }

            PrimaryButton(title: "ابنِ الخطة", isLoading: busy) {
                Task { await build() }
            }
        }
    }

    /// الموقع أولاً من الجهاز، وإلا فاسم المدينة — الخادم يقبل الاثنين.
    private var locationField: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("الموقع")
                .font(Typo.bodyMedium(14))
                .foregroundStyle(palette.muted)

            if let coordinate = location.coordinate {
                Label(
                    "موقعك الحالي محدَّد",
                    systemImage: "location.fill"
                )
                .font(Typo.body(14))
                .foregroundStyle(palette.accentStrong)
                .accessibilityValue(
                    "\(coordinate.latitude.formatted()) \(coordinate.longitude.formatted())"
                )
            } else {
                HStack(spacing: 10) {
                    UnderlineField(
                        placeholder: "اكتب المدينة أو الحي",
                        text: $manualLocation,
                        submitLabel: .done
                    )

                    Button {
                        location.request()
                    } label: {
                        Image(systemName: "location")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(palette.onInk)
                            .frame(width: 38, height: 38)
                            .background { Circle().fill(palette.ink) }
                    }
                    .buttonStyle(PressDownStyle())
                    .accessibilityLabel("استخدم موقعي الحالي")
                }

                if location.denied {
                    Text("تحديد الموقع مرفوض — اكتب المدينة بدلاً منه.")
                        .font(Typo.caption(12))
                        .foregroundStyle(palette.mutedSoft)
                }
            }
        }
    }

    private func chipRow(
        _ title: String,
        options: [(String, String)],
        selection: Binding<String>
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(Typo.bodyMedium(14))
                .foregroundStyle(palette.muted)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(options, id: \.0) { id, label in
                        ChoiceChip(title: label, isSelected: selection.wrappedValue == id) {
                            selection.wrappedValue = id
                        }
                    }
                }
                .padding(.horizontal, 1)
            }
            .scrollClipDisabled()
        }
    }

    // MARK: - الخطة

    private func planBody(response: PlanService.Response, plan: PlanService.Plan) -> some View {
        VStack(alignment: .leading, spacing: 20) {
            VStack(alignment: .leading, spacing: 8) {
                Text(plan.title)
                    .font(Typo.title(26))
                    .foregroundStyle(palette.ink)
                    .fixedSize(horizontal: false, vertical: true)

                if !plan.note.isEmpty {
                    Text(plan.note)
                        .font(Typo.body(15))
                        .lineSpacing(4)
                        .foregroundStyle(palette.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }

                if let origin = response.origin {
                    Label(origin.label, systemImage: "mappin.and.ellipse")
                        .font(Typo.caption(12))
                        .foregroundStyle(palette.mutedSoft)
                }
            }

            if let weather = response.weather { weatherBar(weather) }

            PlanTimeline(stops: plan.stops) { placeId in
                excluded.append(placeId)
                Task { await build() }
            }

            HStack(spacing: 12) {
                GhostButton(title: "خطة ثانية") {
                    Task { await build() }
                }
                QuietButton(title: "غيّر المدخلات") {
                    self.response = nil
                    excluded = []
                }
            }
        }
    }

    private func weatherBar(_ weather: PlanService.Weather) -> some View {
        HStack(spacing: 14) {
            Image(systemName: (weather.maxRain ?? 0) > 30 ? "cloud.rain" : "sun.max")
                .font(.system(size: 16))
                .foregroundStyle(palette.accentStrong)

            VStack(alignment: .leading, spacing: 2) {
                if let min = weather.minFeels, let max = weather.maxFeels {
                    Text("محسوسة \(Int(min).arabicDigits)–\(Int(max).arabicDigits)\(weather.unit ?? "°")")
                        .font(Typo.bodyMedium(14))
                        .foregroundStyle(palette.ink)
                }
                if let hottest = weather.hottest {
                    Text("أحر ساعة \(hottest.arabicDigits)")
                        .font(Typo.caption(12))
                        .foregroundStyle(palette.muted)
                }
            }

            Spacer()

            if let rain = weather.maxRain, rain > 0 {
                Text("مطر \(Int(rain).arabicDigits)٪")
                    .font(Typo.caption(12))
                    .foregroundStyle(palette.muted)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(palette.accentSoft)
        }
    }

    // MARK: -

    private func build() async {
        busy = true
        error = nil
        defer { busy = false }

        let dateFormatter = DateFormatter()
        dateFormatter.locale = Locale(identifier: "en_US_POSIX")
        dateFormatter.dateFormat = "yyyy-MM-dd"

        let timeFormatter = DateFormatter()
        timeFormatter.locale = Locale(identifier: "en_US_POSIX")
        timeFormatter.dateFormat = "HH:mm"

        let coordinate = location.coordinate
        let query = manualLocation.trimmingCharacters(in: .whitespacesAndNewlines)

        guard coordinate != nil || !query.isEmpty else {
            error = "نحتاج موقعك — فعّل تحديد الموقع أو اكتب المدينة."
            return
        }

        do {
            let result = try await PlanService.build(
                PlanService.Request(
                    lat: coordinate?.latitude,
                    lng: coordinate?.longitude,
                    locationQuery: query.isEmpty ? nil : query,
                    startTime: timeFormatter.string(from: startTime),
                    durationHours: durationHours,
                    date: dateFormatter.string(from: date),
                    vibe: vibe,
                    group: group,
                    budget: budget,
                    excludePlaceIds: excluded
                )
            )

            if result.empty == true || result.plan?.stops.isEmpty != false {
                error = "ما لقينا أماكن تناسب هذي المدخلات. وسّع النطاق أو غيّر الجو."
                response = nil
            } else {
                response = result
            }
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// أذونات الموقع ملفوفة في نوع صغير: الشاشة تسأل عن إحداثيات، لا عن مندوب.
@MainActor
@Observable
final class LocationProvider: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private(set) var coordinate: CLLocationCoordinate2D?
    private(set) var denied = false

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyKilometer
    }

    func request() {
        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .denied, .restricted:
            denied = true
        default:
            manager.requestLocation()
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor in
            switch manager.authorizationStatus {
            case .authorizedWhenInUse, .authorizedAlways:
                denied = false
                manager.requestLocation()
            case .denied, .restricted:
                denied = true
            default:
                break
            }
        }
    }

    nonisolated func locationManager(
        _ manager: CLLocationManager,
        didUpdateLocations locations: [CLLocation]
    ) {
        guard let latest = locations.last else { return }
        Task { @MainActor in self.coordinate = latest.coordinate }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // الفشل ليس رفضاً: حقل المدينة يبقى الطريق البديل
    }
}
