import Foundation

/// خطأ يصل من الخادم أو من الشبكة نفسها.
///
/// كل رسائل `/api/*` عربية جاهزة للعرض — الخادم هو من يصوغها، فلا نعيد صياغتها
/// هنا. ما نصوغه نحن هو أعطال الشبكة التي لا يعرفها الخادم أصلاً.
enum APIError: LocalizedError, Equatable {
    /// الخادم ردّ برسالة عربية صريحة: نعرضها كما هي.
    case server(status: Int, message: String)
    /// انقطاع اتصال أو مهلة.
    case offline
    case timedOut
    /// رد غير مفهوم — شكل JSON خالف العقد.
    case decoding(String)
    case badURL

    var errorDescription: String? {
        switch self {
        case .server(_, let message): return message
        case .offline: return "ما فيه اتصال بالإنترنت. تحقق من الشبكة وأعد المحاولة."
        case .timedOut: return "تأخّر الرد. أعد المحاولة."
        case .decoding: return "وصل رد غير مفهوم من الخادم. أعد المحاولة."
        case .badURL: return "تعذّر تكوين عنوان الطلب."
        }
    }

    /// أعطال عابرة تستحق زر «أعد المحاولة»، بخلاف خطأ في المدخلات.
    var isRetryable: Bool {
        switch self {
        case .offline, .timedOut, .decoding: return true
        case .server(let status, _): return status >= 500 || status == 429
        case .badURL: return false
        }
    }
}

/// غلاف الخطأ الموحّد الذي ترجعه كل الراوتات: `{ ok: false, error: "..." }`
private struct ServerErrorEnvelope: Decodable {
    let ok: Bool?
    let error: String?
}

/// عميل HTTP وحيد لكل نداءات `/api/*`.
///
/// التوكن يُحقن عبر `tokenProvider` لا يُمرَّر في كل نداء: الهوية شأن عابر
/// للطبقات، وتمريرها يدوياً في ثلاثة عشر موضعاً يضمن نسيانها في أحدها. والخادم
/// يثق بالتوكن أكثر من `userId` القادم في جسم الطلب، فغيابه يعني فقدان السجل
/// بصمت لا فشلاً ظاهراً.
final class APIClient: @unchecked Sendable {

    static let shared = APIClient()

    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    /// يرجّع توكن الدخول الحالي — أو `nil` للضيف.
    var tokenProvider: (@Sendable () async -> String?)?

    init(session: URLSession? = nil) {
        if let session {
            self.session = session
        } else {
            let config = URLSessionConfiguration.default
            config.timeoutIntervalForRequest = 30
            config.waitsForConnectivity = false
            self.session = URLSession(configuration: config)
        }

        self.decoder = JSONDecoder()
        self.encoder = JSONEncoder()
    }

    // MARK: - النداء

    func post<Body: Encodable, Response: Decodable>(
        _ path: String,
        body: Body,
        authenticated: Bool = true
    ) async throws -> Response {
        try await send(path, method: "POST", body: body, authenticated: authenticated)
    }

    func get<Response: Decodable>(
        _ path: String,
        query: [String: String] = [:],
        authenticated: Bool = true
    ) async throws -> Response {
        try await send(
            path,
            method: "GET",
            body: Optional<EmptyBody>.none,
            query: query,
            authenticated: authenticated
        )
    }

    private struct EmptyBody: Encodable {}

    private func send<Body: Encodable, Response: Decodable>(
        _ path: String,
        method: String,
        body: Body?,
        query: [String: String] = [:],
        authenticated: Bool
    ) async throws -> Response {
        guard var components = URLComponents(
            url: AppConfig.apiBaseURL.appendingPathComponent(path),
            resolvingAgainstBaseURL: false
        ) else { throw APIError.badURL }

        if !query.isEmpty {
            components.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        guard let url = components.url else { throw APIError.badURL }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try encoder.encode(body)
        }

        if authenticated, let token = await tokenProvider?(), !token.isEmpty {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch let error as URLError {
            switch error.code {
            case .notConnectedToInternet, .networkConnectionLost, .dataNotAllowed:
                throw APIError.offline
            case .timedOut:
                throw APIError.timedOut
            default:
                throw APIError.offline
            }
        }

        let status = (response as? HTTPURLResponse)?.statusCode ?? 0

        guard (200..<300).contains(status) else {
            // الرسالة العربية من الخادم أدق مما نؤلفه هنا — نعرضها كما هي
            let envelope = try? decoder.decode(ServerErrorEnvelope.self, from: data)
            throw APIError.server(
                status: status,
                message: envelope?.error ?? fallbackMessage(for: status)
            )
        }

        do {
            return try decoder.decode(Response.self, from: data)
        } catch {
            throw APIError.decoding(String(describing: error))
        }
    }

    private func fallbackMessage(for status: Int) -> String {
        switch status {
        case 401: return "انتهت الجلسة. سجّل الدخول من جديد."
        case 429: return "محاولات كثيرة — انتظر دقيقة."
        case 500...599: return "الخادم متعثّر حالياً. أعد المحاولة."
        default: return "تعذّر إتمام الطلب."
        }
    }
}
