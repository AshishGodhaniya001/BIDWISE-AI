"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useAuth } from "../_lib/AuthContext"
import { UserProfile } from "../_lib/types"

interface NavItem {
  href: string
  label: string
  icon: string
  roles?: UserProfile["role"][]
}

export const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "▦", roles: ["admin", "bid_manager", "reviewer"] },
  { href: "/tenders", label: "Tenders", icon: "◇" },
  { href: "/knowledge", label: "Knowledge Vault", icon: "▣" },
  { href: "/team", label: "Team & Roles", icon: "◌", roles: ["admin", "bid_manager"] },
  { href: "/calendar", label: "Calendar", icon: "◷", roles: ["admin", "bid_manager", "reviewer"] },
  { href: "/compare", label: "Compare", icon: "◫", roles: ["admin", "bid_manager", "reviewer"] },
  { href: "/activities", label: "Timeline", icon: "◎", roles: ["admin", "bid_manager", "reviewer"] },
  { href: "/notifications", label: "Alerts", icon: "○", roles: ["admin", "bid_manager"] },
  { href: "/profile", label: "Profile", icon: "●" },
]

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname()
  const { user, logout } = useAuth()

  const visibleNavItems = navItems.filter(item => {
    if (!item.roles) return true // public
    if (!user) return false // not logged in
    return item.roles.includes(user.role)
  })

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={onClose} />}
      <aside className={`fixed left-0 top-0 z-50 h-full w-64 transform border-r border-zinc-800 bg-zinc-950 transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-16 items-center gap-3 border-b border-zinc-800 px-6">
          <img src="/bidwise-icon.svg" alt="BidWise AI" className="h-8 w-8" />
          <div>
            <span className="flex items-center gap-1.5 text-lg font-semibold text-white">
              BidWise <span className="text-xs font-medium text-zinc-400">AI</span>
            </span>
            <span className="block text-[10px] uppercase tracking-[.16em] text-zinc-600">Decision Engine</span>
          </div>
        </div>
        <nav className="space-y-1 p-4">
          {visibleNavItems.map(item => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <Link key={item.href} href={item.href} onClick={onClose}
                className={`flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${active ? "bg-blue-600/20 text-blue-400" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-white"}`}>
                <span className="text-lg">{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 border-t border-zinc-800 p-4">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-violet-600 text-xs font-bold text-white">
              {user?.name?.charAt(0)?.toUpperCase() || "U"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{user?.name || "User"}</p>
              <p className="truncate text-xs text-zinc-500">{user?.organization_name || user?.email || ""}</p>
            </div>
            <button onClick={() => void logout()} aria-label="Sign out" className="text-xs text-zinc-500 hover:text-red-400">↩</button>
          </div>
        </div>
      </aside>
    </>
  )
}
