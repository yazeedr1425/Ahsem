import SwiftUI

/// موجّه التدفق الرئيسي — يقابل جسم `app/page.js`.
///
/// التفكير والنتيجة يجلبان سطحهما الحبري بنفسيهما؛ البطاقة الورقية للخطوات التي
/// يكتب فيها المستخدم.
struct DecideFlowView: View {
    @Environment(MoodTheme.self) private var theme
    @Environment(AuthStore.self) private var auth
    @Environment(\.palette) private var palette

    @State private var store: DecideFlowStore?

    var body: some View {
        Group {
            if let store {
                content(store)
            } else {
                Color.clear.onAppear {
                    store = DecideFlowStore(theme: theme, auth: auth)
                }
            }
        }
    }

    @ViewBuilder
    private func content(_ store: DecideFlowStore) -> some View {
        @Bindable var store = store

        NavigationStack {
            ScrollView {
                VStack(spacing: 28) {
                    switch store.step {
                    case .landing:
                        LandingView(store: store)
                        HistorySection()

                    case .reading, .thinking:
                        ThinkingView(isReading: store.step == .reading)
                            .padding(.top, 40)

                    case .result:
                        if store.scored.isEmpty {
                            ThinkingView(isReading: false)
                        } else {
                            ResultView(store: store)
                        }

                    case .questions:
                        if let category = store.category {
                            GlassCard {
                                QuestionStepView(
                                    category: category,
                                    index: store.questionIndex,
                                    answers: $store.answers,
                                    onAnswer: store.nextQuestion,
                                    onBack: store.backFromQuestion
                                )
                            }
                        }

                    case .ratings:
                        if let category = store.category {
                            GlassCard {
                                if store.isDuel, let frame = store.frame {
                                    DuelView(
                                        frame: frame,
                                        options: store.filledOptions,
                                        ratings: store.finalRatings,
                                        weights: store.weights,
                                        onChange: { store.ratings = $0 },
                                        onNext: { Task { await store.decide() } },
                                        onBack: store.backToQuestions
                                    )
                                } else {
                                    RatingGridView(
                                        category: category,
                                        options: store.filledOptions,
                                        ratings: store.finalRatings,
                                        weights: store.weights,
                                        onChange: { store.ratings = $0 },
                                        onNext: { Task { await store.decide() } },
                                        onBack: store.backToQuestions
                                    )
                                }
                            }
                        }

                    case .breakdown:
                        GlassCard {
                            BreakdownFlowView(
                                options: store.filledOptions.map(\.label),
                                onCancel: { store.step = .landing },
                                onRestart: store.restart
                            )
                        }

                    case .voice:
                        GlassCard {
                            VoiceModeView(
                                onCancel: { store.step = .landing }
                            )
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 24)
                .animation(.easeInOut(duration: 0.25), value: store.step)
                .animation(.easeInOut(duration: 0.25), value: store.questionIndex)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Color.clear)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.hidden, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Button {
                        store.restart()
                    } label: {
                        Text("احسم")
                            .font(Typo.heading(19))
                            .foregroundStyle(palette.titleGradient)
                    }
                    .buttonStyle(.plain)
                }

                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        store.step = .voice
                    } label: {
                        Image(systemName: "mic")
                            .foregroundStyle(palette.muted)
                    }
                    .accessibilityLabel("وضع المحادثة الصوتية")
                }
            }
            .sheet(item: $store.pendingVoteCode) { code in
                NavigationStack { GroupVoteView(code: code) }
                    .environment(\.palette, palette)
                    .environment(\.layoutDirection, .rightToLeft)
            }
            .sheet(isPresented: $store.needsSignIn) {
                NavigationStack { AuthView() }
                    .environment(\.palette, palette)
                    .environment(\.layoutDirection, .rightToLeft)
            }
        }
    }
}
