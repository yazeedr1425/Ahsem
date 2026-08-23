import Link from "next/link";

// فوتر زجاجي: يقفل الصفحة بلوح شفاف يكمل الشفق بدل ما يقطعه بلوح
// حبري. الحبر انسحب من الأطراف وبقي محجوزاً للحكم وحده.
export default function SiteFooter() {
  return (
    <footer className="glass mt-16 border-t border-line bg-white/55">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-10 text-sm sm:px-6">
        <div className="flex items-center gap-3">
          <span className="grad-fill flex h-8 w-8 items-center justify-center rounded-full text-base font-bold">
            حـ
          </span>
          <p className="text-muted">
            احسم — يساعدك تحسم قراراتك اليومية بسرعة، مع السبب.
          </p>
        </div>
        <nav className="flex items-center gap-5 text-muted">
          <Link href="/pricing" className="transition-colors hover:text-ink">
            الأسعار
          </Link>
          <Link href="/how" className="transition-colors hover:text-ink">
            منهجية التقييم
          </Link>
          <Link href="/#history" className="transition-colors hover:text-ink">
            سجل القرارات
          </Link>
          <Link href="/settings" className="transition-colors hover:text-ink">
            الإعدادات
          </Link>
        </nav>
      </div>
    </footer>
  );
}
