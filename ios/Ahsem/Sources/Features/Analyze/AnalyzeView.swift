import SwiftUI

/// تحليل المخاطر — خمسة وكلاء على التوالي، ومسار عملهم معروض لحظة بلحظة.
///
/// إظهار «من يشتغل الآن» ليس زينة: الخط يستغرق دقيقة، وشاشة انتظار صمّاء تلك
/// المدة تُقرأ كتعليق لا كعمل.
struct AnalyzeView: View {
    @Environment(\.palette) private var palette

    @State private var statement = ""
    @State private var context = ""
    @State private var running = false
    @State private var activeAgent: String?
    @State private var doneAgents: Set<String> = []
    @State private var skipped: [String: String] = [:]
    @State private var result: AnalyzeService.Result?
    @State private var error: String?
    @State private var saveNote: String?
    @State private var task: Task<Void, Never>?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    if let result {
                        resultBody(result)
                    } else if running {
                        agentTrail
                    } else {
                        composer
                    }
                }
                .padding(22)
            }
            .background(Color.clear)
            .navigationTitle("تحليل المخاطر")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.hidden, for: .navigationBar)
        }
        .onDisappear { task?.cancel() }
    }

    // MARK: - المدخلات

    private var composer: some View {
        VStack(alignment: .leading, spacing: 20) {
            SectionHeading(
                title: "قرار واحد كبير، مفكَّك",
                sub: "تحليل رباعي وشجرة مسارات بمصادر — والأرقام محسوبة في الكود لا مكتوبة من النموذج."
            )

            GlassCard(padding: 20) {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("القرار")
                            .font(Typo.bodyMedium(14))
                            .foregroundStyle(palette.muted)
                        TextEditor(text: $statement)
                            .font(Typo.body(16))
                            .frame(minHeight: 90)
                            .scrollContentBackground(.hidden)
                            .padding(10)
                            .background {
                                RoundedRectangle(cornerRadius: 14, style: .continuous)
                                    .fill(palette.cardSunken)
                            }
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        Text("سياق إضافي (اختياري)")
                            .font(Typo.bodyMedium(14))
                            .foregroundStyle(palette.muted)
                        TextEditor(text: $context)
                            .font(Typo.body(16))
                            .frame(minHeight: 70)
                            .scrollContentBackground(.hidden)
                            .padding(10)
                            .background {
                                RoundedRectangle(cornerRadius: 14, style: .continuous)
                                    .fill(palette.cardSunken)
                            }
                    }
                }
            }

            if let error {
                Text(error)
                    .font(Typo.body(14))
                    .foregroundStyle(palette.accentStrong)
                    .fixedSize(horizontal: false, vertical: true)
            }

            PrimaryButton(
                title: "حلّل",
                isEnabled: !statement.trimmingCharacters(in: .whitespaces).isEmpty
            ) {
                start()
            }
        }
    }

    // MARK: - أثر الوكلاء

    private var agentTrail: some View {
        VStack(alignment: .leading, spacing: 18) {
            SectionHeading(title: "يشتغل عليها الآن", sub: statement)

            VStack(spacing: 0) {
                ForEach(AnalyzeService.pipeline) { agent in
                    agentRow(agent)
                }
            }

            QuietButton(title: "إلغاء") {
                task?.cancel()
                running = false
            }
        }
    }

    private func agentRow(_ agent: AnalyzeService.Agent) -> some View {
        let isDone = doneAgents.contains(agent.id)
        let isActive = activeAgent == agent.id
        let wasSkipped = skipped[agent.id] != nil

        return HStack(alignment: .top, spacing: 12) {
            Group {
                if wasSkipped {
                    Image(systemName: "exclamationmark.circle")
                        .foregroundStyle(palette.accentStrong)
                } else if isDone {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(palette.accent)
                } else if isActive {
                    ProgressView().scaleEffect(0.7)
                } else {
                    Image(systemName: "circle")
                        .foregroundStyle(palette.line)
                }
            }
            .font(.system(size: 16))
            .frame(width: 22)

            VStack(alignment: .leading, spacing: 2) {
                Text(agent.label)
                    .font(isActive ? Typo.bodySemibold(16) : Typo.body(16))
                    .foregroundStyle(isActive || isDone ? palette.ink : palette.mutedSoft)

                Text(skipped[agent.id] ?? agent.note)
                    .font(Typo.caption(12))
                    .foregroundStyle(wasSkipped ? palette.accentStrong : palette.mutedSoft)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 0)
        }
        .padding(.vertical, 12)
    }

    // MARK: - النتيجة

    private func resultBody(_ result: AnalyzeService.Result) -> some View {
        VStack(alignment: .leading, spacing: 20) {
            if let recommendation = result.recommendation {
                recommendationCard(recommendation)
            }

            // لا يُخفى أن المراجعة لم تكتمل: تحليل بلا مراجعة يُقرأ كتحليل مراجَع
            // ما لم يُقَل غير ذلك.
            if result.criticSkipped == true {
                calloutCard(
                    "التحليل أدناه ما راجعه أحد — المراجعة النقدية ما اكتملت.",
                    icon: "exclamationmark.triangle"
                )
            }

            if let challenges = result.challenges, !challenges.isEmpty {
                GlassCard(padding: 20) {
                    VStack(alignment: .leading, spacing: 8) {
                        Label("ما يعترض عليه المراجع", systemImage: "questionmark.bubble")
                            .font(Typo.heading(17))
                            .foregroundStyle(palette.ink)
                        Text(challenges)
                            .font(Typo.body(15))
                            .lineSpacing(4)
                            .foregroundStyle(palette.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }

            if let swot = result.swot { SwotGrid(swot: swot) }

            if let paths = result.paths, !paths.isEmpty {
                PathTree(paths: Risk.rank(paths))
            }

            if let sources = result.sources, !sources.isEmpty {
                sourcesCard(sources)
            }

            if let saveNote {
                Text(saveNote)
                    .font(Typo.caption(12))
                    .foregroundStyle(palette.mutedSoft)
            }

            GhostButton(title: "حلّل قراراً آخر") {
                self.result = nil
                statement = ""
                context = ""
                doneAgents = []
                skipped = [:]
                saveNote = nil
            }
        }
    }

    private func recommendationCard(_ recommendation: AnalyzeService.Recommendation) -> some View {
        InkCard(padding: 24) {
            VStack(alignment: .leading, spacing: 14) {
                Text("التوصية")
                    .font(Typo.body(14))
                    .foregroundStyle(palette.onInkMuted)

                Text(recommendation.recommended_path)
                    .font(Typo.display(30))
                    .foregroundStyle(palette.onInk)
                    .fixedSize(horizontal: false, vertical: true)

                Text(recommendation.rationale)
                    .font(Typo.body(15))
                    .lineSpacing(5)
                    .foregroundStyle(palette.onInk)
                    .fixedSize(horizontal: false, vertical: true)

                // التوصية تردّ على اعتراضات المراجع ولا تتجاهلها
                if let objections = recommendation.answering_objections, !objections.isEmpty {
                    Text(objections)
                        .font(Typo.body(14))
                        .lineSpacing(4)
                        .foregroundStyle(palette.onInkMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }

                if let conditions = recommendation.conditions, !conditions.isEmpty {
                    listBlock("بشرط", items: conditions, onInk: true)
                }

                // «ما الذي يغيّر رأيي» — أصدق سطر في الشاشة: توصية بلا شرطِ نقضٍ
                // ليست حكماً بل دعاية
                if let changes = recommendation.would_change_my_mind, !changes.isEmpty {
                    listBlock("يغيّر التوصية", items: changes, onInk: true)
                }

                if let note = recommendation.confidence_note, !note.isEmpty {
                    Text(note)
                        .font(Typo.caption(12))
                        .foregroundStyle(palette.onInkMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    private func listBlock(_ title: String, items: [String], onInk: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(Typo.bodySemibold(14))
                .foregroundStyle(onInk ? palette.onInk : palette.ink)

            ForEach(items.indices, id: \.self) { index in
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "circle.fill")
                        .font(.system(size: 5))
                        .padding(.top, 7)
                    Text(items[index])
                        .fixedSize(horizontal: false, vertical: true)
                }
                .font(Typo.body(14))
                .foregroundStyle(onInk ? palette.onInkMuted : palette.muted)
            }
        }
        .padding(.top, 4)
    }

    private func calloutCard(_ text: String, icon: String) -> some View {
        Label(text, systemImage: icon)
            .font(Typo.body(14))
            .foregroundStyle(palette.accentStrong)
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(palette.accentSoft)
            }
    }

    private func sourcesCard(_ sources: [AnalyzeService.Source]) -> some View {
        GlassCard(padding: 20) {
            VStack(alignment: .leading, spacing: 10) {
                Text("المصادر")
                    .font(Typo.heading(17))
                    .foregroundStyle(palette.ink)

                ForEach(sources) { source in
                    if let uri = source.uri, let url = URL(string: uri) {
                        Link(destination: url) {
                            Text(source.title ?? uri)
                                .font(Typo.body(14))
                                .foregroundStyle(palette.accentStrong)
                                .multilineTextAlignment(.leading)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    } else if let title = source.title {
                        Text(title)
                            .font(Typo.body(14))
                            .foregroundStyle(palette.muted)
                    }
                }
            }
        }
    }

    // MARK: -

    private func start() {
        running = true
        error = nil
        result = nil
        doneAgents = []
        skipped = [:]
        activeAgent = nil

        task = Task {
            do {
                for try await event in AnalyzeService.analyze(
                    statement: statement.trimmingCharacters(in: .whitespacesAndNewlines),
                    context: context.trimmingCharacters(in: .whitespacesAndNewlines)
                ) {
                    switch event {
                    case .agentStart(let id, _, _, _):
                        activeAgent = id
                    case .agentDone(let id):
                        doneAgents.insert(id)
                        if activeAgent == id { activeAgent = nil }
                    case .agentSkipped(let id, let message):
                        skipped[id] = message
                        if activeAgent == id { activeAgent = nil }
                    case .fatal(let message):
                        error = message
                        running = false
                    case .result(let value):
                        result = value
                        running = false
                    case .saveNote(let note):
                        saveNote = note
                    }
                }
            } catch {
                self.error = error.localizedDescription
            }
            running = false
        }
    }
}
