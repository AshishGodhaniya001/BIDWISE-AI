"use client"

import { useEffect, useState } from "react"
import { api } from "../../_lib/api"
import type { Notification } from "../../_lib/types"

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    api.notifications.list().then(setNotifications).catch(e => setError(e instanceof Error ? e.message : "Failed to load notifications")).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
  if (error) return <div className="space-y-6 max-w-4xl animate-fade-in"><div><h1 className="text-2xl font-bold text-white">Notifications</h1><p className="text-sm text-zinc-400 mt-1">Email notifications and alerts</p></div><div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-red-300 text-sm">{error}</div></div>

  return (
    <div className="space-y-6 max-w-4xl animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">Notifications</h1>
        <p className="text-sm text-zinc-400 mt-1">Email notifications and alerts</p>
      </div>

      {notifications.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-12 text-center">
          <div className="text-4xl mb-4 text-zinc-600">◎</div>
          <h3 className="text-lg font-semibold text-white mb-2">No notifications yet</h3>
          <p className="text-sm text-zinc-500">Send deadline reminders or document alerts from a tender page</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n, i) => (
            <div key={n.id} className="flex items-start gap-4 p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 animate-slide-up" style={{ animationDelay: `${i * 50}ms` }}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0 ${n.email_sent ? "bg-green-500/10 text-green-400" : "bg-amber-500/10 text-amber-400"}`}>
                {n.email_sent ? "✓" : "!"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">{n.subject}</p>
                <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{n.body}</p>
                <p className="text-xs text-zinc-600 mt-2">{n.created_at ? new Date(n.created_at).toLocaleString() : ""}</p>
              </div>
              <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${n.email_sent ? "bg-green-500/10 text-green-400" : "bg-amber-500/10 text-amber-400"}`}>
                {n.email_sent ? "Sent" : "Failed"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
