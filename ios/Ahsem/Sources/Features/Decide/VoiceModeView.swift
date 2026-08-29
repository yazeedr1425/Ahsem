import SwiftUI
import Speech
import AVFoundation

/// وضع المحادثة الصوتية: تتكلم طبيعياً، والوكيل يستخرج كل شيء ويسأل عن الناقص
/// وحده.
///
/// والبديل المكتوب ليس حاشية: الميكروفون قد يكون ممنوعاً أو المكان صاخباً، ومن
/// يفقد الصوت يفقد الميزة كلها لو لم يوجد حقل يكتب فيه.
struct VoiceModeView: View {
    let onCancel: () -> Void
    /// يُستدعى حين يكتمل كل ما يلزم للحسم.
    var onComplete: ((AssistService.State) -> Void)?

    @Environment(\.palette) private var palette
    @State private var recognizer = SpeechRecognizer()

    @State private var history: [AssistService.Turn] = []
    @State private var lastReply = "قل لي بين إيش محتار."
    @State private var typed = ""
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            SectionHeading(
                tag: "محادثة",
                title: "كلّمني عادي",
                sub: "قل خياراتك وظرفك بجملة واحدة — وأنا أسأل عن الناقص."
            )

            // ردّ الوكيل هو الشاشة كلها: من يتكلم لا يقرأ قوائم
            InkCard(padding: 24) {
                Text(lastReply)
                    .font(Typo.bodySemibold(19))
                    .lineSpacing(6)
                    .foregroundStyle(palette.onInk)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .accessibilityAddTraits(.updatesFrequently)

            if !recognizer.transcript.isEmpty {
                Text(recognizer.transcript)
                    .font(Typo.body(15))
                    .foregroundStyle(palette.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }

            micButton

            // البديل المكتوب — حاضر دائماً لا عند الفشل فقط
            VStack(alignment: .leading, spacing: 10) {
                Text(recognizer.isUnavailable ? "الميكروفون غير متاح — اكتب بدلاً منه." : "أو اكتبها")
                    .font(Typo.caption(12))
                    .foregroundStyle(palette.mutedSoft)

                HStack(spacing: 10) {
                    UnderlineField(
                        placeholder: "مثال: محتار بين برجر وسوشي ومستعجل",
                        text: $typed,
                        submitLabel: .send,
                        onSubmit: { Task { await send(typed) } }
                    )

                    Button {
                        Task { await send(typed) }
                    } label: {
                        Image(systemName: "arrow.up")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(palette.onInk)
                            .frame(width: 38, height: 38)
                            .background {
                                Circle().fill(typed.isEmpty ? palette.line : palette.ink)
                            }
                    }
                    .buttonStyle(PressDownStyle())
                    .disabled(typed.isEmpty || busy)
                    .accessibilityLabel("أرسل")
                }
            }

            if let error {
                Text(error)
                    .font(Typo.body(14))
                    .foregroundStyle(palette.accentStrong)
                    .fixedSize(horizontal: false, vertical: true)
            }

            QuietButton(title: "إلغاء") {
                recognizer.stop()
                onCancel()
            }
        }
        .onDisappear { recognizer.stop() }
    }

    private var micButton: some View {
        Button {
            Task { await toggleMic() }
        } label: {
            HStack(spacing: 10) {
                Image(systemName: recognizer.isRecording ? "stop.fill" : "mic.fill")
                Text(recognizer.isRecording ? "خلصت" : "تكلّم")
            }
            .font(Typo.bodySemibold(17))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .foregroundStyle(palette.accentInk)
            .background {
                Capsule().fill(palette.actionGradient)
            }
            .shadow(color: palette.glow.opacity(0.3), radius: 18, y: 8)
        }
        .buttonStyle(PressDownStyle())
        .disabled(busy || recognizer.isUnavailable)
        .opacity(recognizer.isUnavailable ? 0.4 : 1)
    }

    private func toggleMic() async {
        if recognizer.isRecording {
            let text = recognizer.transcript
            recognizer.stop()
            await send(text)
        } else {
            await recognizer.start()
        }
    }

    private func send(_ text: String) async {
        let utterance = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !utterance.isEmpty, !busy else { return }

        busy = true
        error = nil
        typed = ""
        recognizer.clear()
        defer { busy = false }

        history.append(AssistService.Turn(role: "user", text: utterance))

        do {
            let response = try await AssistService.send(utterance: utterance, history: history)
            lastReply = response.reply
            history.append(AssistService.Turn(role: "assistant", text: response.reply))

            if response.ready {
                onComplete?(response.state)
            }
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// تعرّف الكلام العربي، ملفوفاً بحيث تسأل الشاشة عن نص لا عن جلسة صوتية.
@MainActor
@Observable
final class SpeechRecognizer {
    private(set) var transcript = ""
    private(set) var isRecording = false
    private(set) var isUnavailable = false

    private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "ar-SA"))
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private let engine = AVAudioEngine()

    func clear() { transcript = "" }

    func start() async {
        guard !isRecording else { return }

        let speechOK = await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status == .authorized)
            }
        }
        let micOK = await withCheckedContinuation { continuation in
            AVAudioApplication.requestRecordPermission { continuation.resume(returning: $0) }
        }

        guard speechOK, micOK, let recognizer, recognizer.isAvailable else {
            isUnavailable = true
            return
        }

        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .measurement, options: .duckOthers)
            try session.setActive(true, options: .notifyOthersOnDeactivation)

            let request = SFSpeechAudioBufferRecognitionRequest()
            request.shouldReportPartialResults = true
            self.request = request

            let input = engine.inputNode
            input.installTap(onBus: 0, bufferSize: 1024, format: input.outputFormat(forBus: 0)) {
                buffer, _ in
                request.append(buffer)
            }

            engine.prepare()
            try engine.start()
            isRecording = true

            task = recognizer.recognitionTask(with: request) { [weak self] result, error in
                guard let self else { return }
                Task { @MainActor in
                    if let result { self.transcript = result.bestTranscription.formattedString }
                    if error != nil || result?.isFinal == true { self.stop() }
                }
            }
        } catch {
            isUnavailable = true
            stop()
        }
    }

    func stop() {
        guard isRecording || engine.isRunning else { return }
        engine.stop()
        engine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        task?.cancel()
        request = nil
        task = nil
        isRecording = false
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}
