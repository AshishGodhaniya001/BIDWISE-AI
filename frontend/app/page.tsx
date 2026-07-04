import Link from "next/link"

const features = [
  { title: "AI Tender Analyzer", desc: "Upload a government PDF and track extraction of eligibility, budget, deadlines, and required documents.", icon: "◇" },
  { title: "Smart Proposal Writer", desc: "Generate technical proposals, cover letters, and executive summaries with one click.", icon: "○" },
  { title: "Risk Assessment", desc: "Automatic detection of missing documents, eligibility mismatches, and financial risks.", icon: "◎" },
  { title: "Evidence-linked Analysis", desc: "Trace extracted deadlines, budgets, and requirements back to exact source pages.", icon: "◉" },
  { title: "Email Notifications", desc: "Never miss a deadline. Get reminders and alerts for missing documents.", icon: "◈" },
  { title: "Analytics Dashboard", desc: "Track all tenders, active bids, success predictions, and revenue opportunities.", icon: "◐" },
]

export default function HomePage() {
  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="relative border-b border-zinc-800">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-600/20 via-transparent to-transparent" />
        <nav className="relative flex items-center justify-between px-6 h-16 max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <img src="/bidwise-icon.svg" alt="BidWise AI" className="h-8 w-8" />
            <span className="font-semibold text-white text-lg">BidWise AI</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm text-zinc-400 hover:text-white transition-colors">Log in</Link>
            <Link href="/register" className="text-sm px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors">Get Started</Link>
          </div>
        </nav>
      </header>

      <section className="relative px-6 pt-24 pb-20 text-center max-w-4xl mx-auto">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-500/10 via-transparent to-transparent" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium mb-8">
            ✦ Powered by Gemini AI
          </div>
          <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-white leading-tight">
            Intelligent Tender Analysis &{" "}
            <span className="bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">Proposal Generation</span>
          </h1>
          <p className="mt-6 text-lg text-zinc-400 max-w-2xl mx-auto leading-relaxed">
            BidWise AI automates government tender analysis, risk assessment, and proposal writing.
            Upload a PDF and let AI do the heavy lifting.
          </p>
          <div className="flex items-center justify-center gap-4 mt-10">
            <Link href="/register" className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors shadow-lg shadow-blue-600/25">
              Create Account
            </Link>
            <Link href="/login" className="px-6 py-3 rounded-xl border border-zinc-700 hover:border-zinc-500 text-zinc-300 font-medium transition-colors">
              Sign In
            </Link>
          </div>
        </div>
      </section>

      <section className="px-6 pb-24 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f, i) => (
            <div key={i} className="group p-6 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-900 hover:border-zinc-700 transition-all duration-300 animate-fade-in" style={{ animationDelay: `${i * 80}ms` }}>
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500/20 to-violet-600/20 flex items-center justify-center text-lg mb-4 text-blue-400 group-hover:scale-110 transition-transform">{f.icon}</div>
              <h3 className="text-white font-semibold mb-2">{f.title}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-zinc-800 py-8 px-6">
        <p className="text-center text-sm text-zinc-600">© 2026 BidWise AI. All rights reserved.</p>
      </footer>
    </div>
  )
}
