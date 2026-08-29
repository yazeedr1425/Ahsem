import Foundation

/// `POST /api/analyze` — خمسة وكلاء على التوالي، ومخرجهم يصل تدفّقاً NDJSON:
/// سطر JSON واحد لكل حدث.
///
/// التدفّق ليس زينة: الخط يستغرق دقيقة، وإظهار «من يشتغل الآن» يُبقي المستخدم
/// عارفاً بما يجري بدل شاشة انتظار صمّاء.
///
/// والمراجع النقدي وحده اختياري: لو سقط بعد كل المحاولات نكمل بدونه بدل رمي
/// دقيقة من شغل ثلاثة وكلاء قبله — لكن لا نخفيه، والواجهة تعرض ذلك بوضوح.
enum AnalyzeService {

    // MARK: - النماذج

    struct SwotPoint: Decodable, Identifiable, Hashable {
        let point: String
        /// الحقيقة التي يستند إليها البند — بلا سند يسقط البند نفسه.
        let evidence: String
        let confidence: String

        var id: String { point }
    }

    struct Swot: Decodable, Hashable {
        let strengths: [SwotPoint]
        let weaknesses: [SwotPoint]
        let opportunities: [SwotPoint]
        let threats: [SwotPoint]
    }

    struct Branch: Decodable, Hashable {
        let label: String?
        let detail: String?
    }

    struct Path: Decodable, Hashable {
        let label: String
        let summary: String
        let downside_likelihood: String?
        let downside_impact: String?
        let upside_likelihood: String?
        let upside_impact: String?
        let reversibility: String?
        let good_branch: Branch?
        let bad_branch: Branch?
    }

    struct Recommendation: Decodable, Hashable {
        let recommended_path: String
        let rationale: String
        /// ردّ التوصية على اعتراضات المراجع النقدي — لا تجاهلها.
        let answering_objections: String?
        let conditions: [String]?
        let would_change_my_mind: [String]?
        let confidence: String?
        let confidence_note: String?
    }

    struct Source: Decodable, Identifiable, Hashable {
        let title: String?
        let uri: String?

        var id: String { uri ?? title ?? UUID().uuidString }
    }

    struct Result: Decodable, Hashable {
        let statement: String
        let context: String?
        let findings: String?
        let sources: [Source]?
        let swot: Swot?
        let paths: [Path]?
        let challenges: String?
        let criticSkipped: Bool?
        let recommendation: Recommendation?
        let model: String?
    }

    // MARK: - أحداث التدفّق

    enum Event {
        case agentStart(id: String, label: String, en: String?, note: String?)
        case agentDone(id: String)
        /// المراجع النقدي سقط — والتحليل يمضي معلَناً أنه لم يُراجَع.
        case agentSkipped(id: String, message: String)
        case fatal(message: String)
        case result(Result)
        /// الحفظ إضافة لا شرط — تحليل غير محفوظ أفضل من تحليل ضائع.
        case saveNote(String)
    }

    private struct RawEvent: Decodable {
        let type: String
        let agent: String?
        let label: String?
        let en: String?
        let note: String?
        let message: String?
        let result: Result?
        let analysisId: String?
        let saveError: String?
        /// يظهر للضيف وحده: «سجّل دخولك ليُحفظ تحليلك.»
        let savedHint: String?
    }

    private struct Request: Encodable {
        let statement: String
        let context: String
    }

    struct Agent: Identifiable, Hashable {
        let id: String
        let label: String
        let note: String
    }

    /// أسماء الوكلاء الخمسة بترتيبهم — تُعرض قبل أن يبدأ أولهم، فيرى المستخدم
    /// الطريق كاملاً لا خطوةً معلّقة.
    static let pipeline: [Agent] = [
        Agent(id: "research", label: "الباحث", note: "يجمع الحقائق بلا رأي"),
        Agent(id: "swot", label: "محلل SWOT", note: "يبني التحليل الرباعي من الحقائق"),
        Agent(id: "scenarios", label: "باني السيناريوهات", note: "يرسم المسارات وفروعها"),
        Agent(id: "critic", label: "المراجع النقدي", note: "يراجع التحليل ويكشف الافتراضات الهشّة"),
        Agent(id: "synthesis", label: "المُركِّب", note: "يخرج بالتوصية وشروطها"),
    ]

    /// يبثّ الأحداث سطراً سطراً كما تصل.
    static func analyze(statement: String, context: String) -> AsyncThrowingStream<Event, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    var request = URLRequest(
                        url: AppConfig.apiBaseURL.appendingPathComponent("api/analyze")
                    )
                    request.httpMethod = "POST"
                    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                    request.httpBody = try JSONEncoder().encode(
                        Request(statement: statement, context: context)
                    )
                    if let token = await APIClient.shared.tokenProvider?() {
                        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
                    }

                    let (bytes, response) = try await URLSession.shared.bytes(for: request)
                    let status = (response as? HTTPURLResponse)?.statusCode ?? 0

                    guard (200..<300).contains(status) else {
                        // الأخطاء ترجع JSON عادياً لا تدفّقاً
                        var body = Data()
                        for try await byte in bytes { body.append(byte) }
                        struct Failure: Decodable { let error: String? }
                        let message = (try? JSONDecoder().decode(Failure.self, from: body))?.error
                        throw APIError.server(
                            status: status,
                            message: message ?? "تعذّر بدء التحليل."
                        )
                    }

                    let decoder = JSONDecoder()
                    for try await line in bytes.lines {
                        guard !line.isEmpty,
                              let data = line.data(using: .utf8),
                              let event = try? decoder.decode(RawEvent.self, from: data)
                        else { continue }

                        switch event.type {
                        case "agent_start":
                            continuation.yield(.agentStart(
                                id: event.agent ?? "",
                                label: event.label ?? "",
                                en: event.en,
                                note: event.note
                            ))
                        case "agent_done":
                            continuation.yield(.agentDone(id: event.agent ?? ""))
                        case "agent_skipped":
                            continuation.yield(.agentSkipped(
                                id: event.agent ?? "",
                                message: event.message ?? ""
                            ))
                        case "fatal":
                            continuation.yield(.fatal(message: event.message ?? "تعثّر التحليل."))
                        case "done":
                            if let result = event.result { continuation.yield(.result(result)) }
                            if let note = event.saveError ?? event.savedHint {
                                continuation.yield(.saveNote(note))
                            }
                        default:
                            break
                        }
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }

            continuation.onTermination = { _ in task.cancel() }
        }
    }
}
