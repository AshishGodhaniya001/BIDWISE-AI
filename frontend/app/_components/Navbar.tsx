"use client"

export default function Navbar({ onMenuClick }: { onMenuClick: () => void }) {
  return (
    <header className="h-16 border-b border-zinc-800 flex items-center justify-between px-4 lg:px-6 bg-zinc-950">
      <div className="flex items-center gap-3">
        <button onClick={onMenuClick} aria-label="Open navigation" className="lg:hidden text-zinc-400 hover:text-white text-xl p-1">☰</button>
        <img src="/bidwise-icon.svg" alt="BidWise AI" className="h-7 w-7 lg:hidden" />
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-2 text-xs text-zinc-500">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          System Online
        </div>
      </div>
    </header>
  )
}
