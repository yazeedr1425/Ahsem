import SwiftUI
import MapKit

/// جدول اليوم كخط زمني — المحطات بترتيبها، وبينها زمن التنقّل الحقيقي.
///
/// زمن التنقّل يظهر *بين* البطاقتين لا داخل إحداهما: هو ملك المسافة لا ملك
/// المكان، ووضعه داخل بطاقة يجعل القارئ ينسبه لها.
struct PlanTimeline: View {
    let stops: [PlanService.Stop]
    /// «بدّل هذا المكان» — يُستثنى ويُعاد بناء الخطة.
    let onReplace: (String) -> Void

    @Environment(\.palette) private var palette

    var body: some View {
        VStack(spacing: 0) {
            ForEach(stops) { stop in
                let index = stops.firstIndex { $0.id == stop.id } ?? 0

                stopCard(stop, index: index)

                // زمن التنقّل يظهر *بين* البطاقتين لا داخل إحداهما: هو ملك
                // المسافة لا ملك المكان، ووضعه داخل بطاقة يجعل القارئ ينسبه لها.
                if let leg = stop.travel_to_next, index < stops.count - 1 {
                    travelRow(leg)
                }
            }
        }
    }

    private func stopCard(_ stop: PlanService.Stop, index: Int) -> some View {
        GlassCard(padding: 18) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 10) {
                    Text(stop.arrival_time.arabicDigits)
                        .font(Typo.label(13))
                        .foregroundStyle(palette.accentInk)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background { Capsule().fill(palette.accent) }

                    Text("\(stop.duration_minutes.arabicDigits) دقيقة")
                        .font(Typo.caption(12))
                        .foregroundStyle(palette.muted)

                    Spacer()

                    if let rating = stop.rating {
                        Label(
                            String(format: "%.1f", rating).arabicDigits,
                            systemImage: "star.fill"
                        )
                        .font(Typo.caption(12))
                        .foregroundStyle(palette.mutedSoft)
                    }
                }

                Text(stop.name)
                    .font(Typo.heading(18))
                    .foregroundStyle(palette.ink)
                    .fixedSize(horizontal: false, vertical: true)

                if !stop.why.isEmpty {
                    Text(stop.why)
                        .font(Typo.body(14))
                        .lineSpacing(4)
                        .foregroundStyle(palette.muted)
                        .fixedSize(horizontal: false, vertical: true)
                }

                if let address = stop.address {
                    Text(address)
                        .font(Typo.caption(12))
                        .foregroundStyle(palette.mutedSoft)
                        .fixedSize(horizontal: false, vertical: true)
                }

                HStack(spacing: 14) {
                    if let lat = stop.lat, let lng = stop.lng {
                        Button {
                            openInMaps(name: stop.name, lat: lat, lng: lng)
                        } label: {
                            Label("افتح بالخرائط", systemImage: "map")
                                .font(Typo.body(14))
                                .foregroundStyle(palette.accentStrong)
                        }
                        .buttonStyle(.plain)
                    }

                    QuietButton(title: "بدّل هذا المكان") {
                        onReplace(stop.place_id)
                    }
                }
            }
        }
    }

    private func travelRow(_ leg: PlanService.TravelLeg) -> some View {
        HStack(spacing: 8) {
            Rectangle()
                .fill(palette.lineStrong)
                .frame(width: 1, height: 18)

            Label(
                "\(leg.minutes.arabicDigits) دقيقة تنقّل",
                systemImage: "car"
            )
            .font(Typo.caption(12))
            .foregroundStyle(palette.mutedSoft)

            Spacer()
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 6)
    }

    private func openInMaps(name: String, lat: Double, lng: Double) {
        let placemark = MKPlacemark(coordinate: CLLocationCoordinate2D(latitude: lat, longitude: lng))
        let item = MKMapItem(placemark: placemark)
        item.name = name
        item.openInMaps()
    }
}
