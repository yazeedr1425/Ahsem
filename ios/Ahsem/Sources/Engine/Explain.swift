import Foundation

/// «ليش هذا القرار؟» — تفسير مبني على الأوزان الفعلية، لا أرقام مرمية.
enum Explain {

    private static let weightWords: [Int: String] = [
        4: "كان الأهم عندك اليوم، ومزاجك زاده وزن",
        3: "كان الأهم عندك اليوم",
        2: "كان مهم",
        1: "ما كان يفرق كثير",
    ]

    private static let ratingWords: [Int: String] = [
        3: "ممتاز",
        2: "متوسط",
        1: "ضعيف",
    ]

    /// سطر تفصيلي واحد في شاشة «وضّح أكثر».
    struct DetailRow: Identifiable, Hashable {
        let key: String
        let label: String
        let importance: String
        let rating: String
        let verdict: String
        // للعرض البصري
        let ratingValue: Int
        let ratingMax: Int
        let weight: Int

        var id: String { key }
    }

    /// المعيار الذي صنع الفرق: أكبر (فرق الدرجة × الوزن) بين الفائز والوصيف.
    static func decidingCriterion(_ scored: [ScoredOption]) -> BreakdownRow? {
        guard scored.count >= 2 else { return nil }
        let winner = scored[0]
        let runnerUp = scored[1]

        let gaps = winner.breakdown.map { row -> (row: BreakdownRow, gain: Int) in
            let rivalRating = runnerUp.breakdown.first { $0.key == row.key }?.rating ?? 0
            return (row, (row.rating - rivalRating) * row.weight)
        }

        guard let best = gaps.max(by: { $0.gain < $1.gain }), best.gain > 0 else { return nil }
        return best.row
    }

    /// جملة السبب المختصرة، تُركّب داخل رد الشخصية في `Voice`.
    static func reasonPhrase(_ scored: [ScoredOption]) -> String {
        guard let deciding = decidingCriterion(scored) else {
            return "الفرق بينهم بسيط، بس هذا اللي طلع أعلى شوي"
        }
        let weightWord = weightWords[deciding.weight] ?? "كان مهم"
        return "\(deciding.label) \(weightWord)، وهو الأفضل فيها"
    }

    /// تفاصيل «وضّح أكثر» — بجمل مفهومة لكل معيار.
    static func detailedBreakdown(_ scored: [ScoredOption]) -> [DetailRow] {
        guard let winner = scored.first else { return [] }
        let runnerUp = scored.count > 1 ? scored[1] : nil

        return winner.breakdown.map { row in
            let rival = runnerUp?.breakdown.first { $0.key == row.key }
            let diff = rival.map { row.rating - $0.rating } ?? 0

            let verdict: String
            if let runnerUp, rival != nil {
                if diff > 0 {
                    verdict = "أفضل من «\(runnerUp.label)» هنا"
                } else if diff < 0 {
                    verdict = "أقل من «\(runnerUp.label)» هنا"
                } else {
                    verdict = "متساوي مع «\(runnerUp.label)» هنا"
                }
            } else {
                verdict = "تقييمه \(ratingWords[row.rating] ?? "متوسط")"
            }

            return DetailRow(
                key: row.key,
                label: row.label,
                importance: weightWords[row.weight] ?? "كان مهم",
                rating: ratingWords[row.rating] ?? "متوسط",
                verdict: verdict,
                ratingValue: row.rating,
                ratingMax: ScoreEngine.ratingScale.count,
                weight: row.weight
            )
        }
    }
}
