import SwiftUI
import CoreImage.CIFilterBuiltins

/// شاشة التصويت الجماعي.
///
/// الرابط *هو* السر — يُولَّد رمز الاستجابة السريعة على الجهاز ولا يمر بأي خدمة
/// خارجية، تماماً كما في النسخة الويب.
struct GroupVoteView: View {
    let code: String

    @Environment(\.palette) private var palette
    @Environment(\.dismiss) private var dismiss
    @State private var store: GroupVoteStore?
    @State private var showsQR = false

    var body: some View {
        Group {
            if let store {
                content(store)
            } else {
                Color.clear.onAppear { store = GroupVoteStore(code: code) }
            }
        }
        .background(palette.background.ignoresSafeArea())
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("إغلاق") { dismiss() }.foregroundStyle(palette.muted)
            }
        }
    }

    @ViewBuilder
    private func content(_ store: GroupVoteStore) -> some View {
        @Bindable var store = store

        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                switch store.state {
                case .loading:
                    ProgressView().tint(palette.accent)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 60)

                case .notFound:
                    SectionHeading(
                        title: "ما لقينا هذا التصويت",
                        sub: "تأكد من الرابط — أو اطلب من صاحبه يرسله من جديد."
                    )

                case .failed(let message):
                    SectionHeading(title: "تعثّر التحديث", sub: message)
                    GhostButton(title: "أعد المحاولة") {
                        Task { await store.refetch() }
                    }

                case .ready:
                    header(store)
                    if let verdict = store.verdict, verdict.closed {
                        verdictCard(verdict)
                    }
                    optionsList(store)
                    if store.isOpen { voterBox(store) }
                    if store.isCreator && store.isOpen { closeButton(store) }
                    shareBox(store)
                }
            }
            .padding(22)
        }
        .task { await store.start() }
        .onDisappear { store.stop() }
        .refreshable { await store.refetch() }
    }

    // MARK: - الأجزاء

    private func header(_ store: GroupVoteStore) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Eyebrow(text: store.isOpen ? "تصويت مفتوح" : "انقفل التصويت")
                Spacer()
                if store.present > 0 {
                    Label(
                        "\(store.present.arabicDigits) حاضر",
                        systemImage: "person.2.fill"
                    )
                    .font(Typo.caption(12))
                    .foregroundStyle(palette.muted)
                }
            }

            Text(store.decision?.title ?? "قرار المجموعة")
                .font(Typo.title(26))
                .foregroundStyle(palette.ink)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    /// عند التعادل يكسره الخادم ويتحمّل اللوم — والإعلان يقول ذلك بصوته.
    private func verdictCard(_ verdict: GroupVerdictService.Verdict) -> some View {
        InkCard(padding: 24) {
            VStack(alignment: .leading, spacing: 12) {
                Text("النتيجة")
                    .font(Typo.body(14))
                    .foregroundStyle(palette.onInkMuted)

                Text(verdict.winner ?? "—")
                    .font(Typo.display(34))
                    .foregroundStyle(palette.onInk)
                    .fixedSize(horizontal: false, vertical: true)

                if let announcement = verdict.announcement, !announcement.isEmpty {
                    Text(announcement)
                        .font(Typo.body(15))
                        .lineSpacing(5)
                        .foregroundStyle(palette.onInkMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    private func optionsList(_ store: GroupVoteStore) -> some View {
        VStack(spacing: 12) {
            ForEach(store.options) { option in
                optionRow(store: store, option: option)
            }
        }
    }

    private func optionRow(
        store: GroupVoteStore,
        option: GroupService.VoteOption
    ) -> some View {
        let isMine = store.myOptionId == option.id
        let share = store.share(of: option)

        return Button {
            guard store.isOpen else { return }
            Task { await store.vote(optionId: option.id) }
        } label: {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    if isMine {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 14))
                            .foregroundStyle(palette.accent)
                    }
                    Text(option.label)
                        .font(isMine ? Typo.bodySemibold(16) : Typo.body(16))
                        .foregroundStyle(palette.ink)
                        .fixedSize(horizontal: false, vertical: true)

                    Spacer(minLength: 8)

                    Text("\(Int(share * 100).arabicDigits)٪")
                        .font(Typo.body(14))
                        .foregroundStyle(palette.muted)
                }

                // الأشرطة تتحرك على كل شاشة مفتوحة لحظياً
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(palette.line)
                        Capsule()
                            .fill(palette.actionGradient)
                            .frame(width: geo.size.width * share)
                    }
                }
                .frame(height: 8)
                .animation(.easeOut(duration: 0.4), value: share)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(palette.cardSunken)
                    .overlay {
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .stroke(isMine ? palette.accent : .clear, lineWidth: 1.5)
                    }
            }
        }
        .buttonStyle(PressDownStyle())
        .disabled(!store.isOpen || store.busy)
        .accessibilityLabel("\(option.label)، \(Int(share * 100).arabicDigits) بالمئة")
        .accessibilityAddTraits(isMine ? [.isSelected] : [])
    }

    private func voterBox(_ store: GroupVoteStore) -> some View {
        @Bindable var store = store

        return VStack(alignment: .leading, spacing: 12) {
            // الضيوف يصوّتون بالاسم بلا حسابات
            UnderlineField(
                placeholder: "اسمك",
                text: $store.name,
                contentType: .name,
                submitLabel: .done
            )

            if let error = store.voteError {
                Text(error)
                    .font(Typo.body(14))
                    .foregroundStyle(palette.accentStrong)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Text(store.myOptionId == nil
                 ? "اكتب اسمك ثم اختر."
                 : "تقدر تغيّر صوتك ما دام التصويت مفتوحاً.")
                .font(Typo.caption(12))
                .foregroundStyle(palette.mutedSoft)
        }
    }

    private func closeButton(_ store: GroupVoteStore) -> some View {
        PrimaryButton(
            title: "اقفل التصويت وأعلن النتيجة",
            isLoading: store.busy
        ) {
            Task { await store.close() }
        }
    }

    private func shareBox(_ store: GroupVoteStore) -> some View {
        GlassCard(padding: 20) {
            VStack(alignment: .leading, spacing: 14) {
                Text("شارك الرابط")
                    .font(Typo.heading(17))
                    .foregroundStyle(palette.ink)

                Text(store.shareURL.absoluteString)
                    .font(Typo.label(12))
                    .foregroundStyle(palette.muted)
                    .lineLimit(2)
                    .truncationMode(.middle)
                    .environment(\.layoutDirection, .leftToRight)

                HStack(spacing: 12) {
                    ShareLink(item: store.shareURL) {
                        Label("أرسل", systemImage: "square.and.arrow.up")
                            .font(Typo.bodyMedium(15))
                            .padding(.vertical, 10)
                            .padding(.horizontal, 20)
                            .foregroundStyle(palette.onInk)
                            .background { Capsule().fill(palette.ink) }
                    }

                    GhostButton(title: showsQR ? "أخفِ الرمز" : "رمز QR") {
                        withAnimation { showsQR.toggle() }
                    }
                }

                if showsQR, let image = qrImage(for: store.shareURL) {
                    Image(uiImage: image)
                        .interpolation(.none)
                        .resizable()
                        .frame(width: 180, height: 180)
                        .padding(12)
                        .background { RoundedRectangle(cornerRadius: 16).fill(.white) }
                        .frame(maxWidth: .infinity)
                        .accessibilityLabel("رمز الاستجابة السريعة لرابط التصويت")
                }
            }
        }
    }

    /// يُولَّد على الجهاز: الرابط هو السر، فلا يُرسَل لخدمة رموز خارجية.
    private func qrImage(for url: URL) -> UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(url.absoluteString.utf8)
        filter.correctionLevel = "M"

        guard let output = filter.outputImage else { return nil }
        let scaled = output.transformed(by: CGAffineTransform(scaleX: 10, y: 10))
        let context = CIContext()
        guard let cg = context.createCGImage(scaled, from: scaled.extent) else { return nil }
        return UIImage(cgImage: cg)
    }
}
