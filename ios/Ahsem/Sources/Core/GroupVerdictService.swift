import Foundation

/// `GET /api/group?code=…` — إعلان النتيجة لأي زائر بعد الإقفال.
/// `POST /api/group` — إقفال التصويت. للمنشئ فقط، بتوكنه.
///
/// الخادم يفرز، ويكسر التعادل بالنموذج إن وقع، ويخزّن الفائز، ثم يرجّع الإعلان.
/// وعند التعادل **يكسره بنفسه ويتحمّل اللوم**: «ما قدر أحد يحسمها، فحسمتها أنا».
enum GroupVerdictService {

    struct Verdict: Decodable {
        let ok: Bool
        let closed: Bool
        let winner: String?
        /// الإعلان تحسين — الفائز نفسه معروف، فيصل فارغاً بدل أن يسقط الطلب.
        let announcement: String?
    }

    private struct CloseRequest: Encodable {
        let decisionId: String
    }

    /// النتيجة المعلَنة إن كان التصويت مقفلاً — وإلا `closed: false`.
    static func verdict(code: String) async throws -> Verdict {
        try await APIClient.shared.get("api/group", query: ["code": code])
    }

    /// الإقفال للمنشئ وحده، والتوكن هو ما يثبته.
    static func close(decisionId: UUID) async throws -> Verdict {
        try await APIClient.shared.post(
            "api/group",
            body: CloseRequest(decisionId: decisionId.uuidString)
        )
    }
}
