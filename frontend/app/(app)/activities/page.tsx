"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { api } from "../../_lib/api"
import type { Activity } from "../../_lib/types"

const actionIcons: Record<string, string> = {
  uploaded_tender: "◇",
  analyzed_tender: "◉",
  favorited_tender: "★",
  unfavorited_tender: "☆",
  deleted_tender: "✕",
}

const actionColors: Record<string, string> = {
  uploaded_tender: "bg-blue-500/10 text-blue-400",
  analyzed_tender: "bg-green-500/10 text-green-400",
  favorited_tender: "bg-amber-500/10 text-amber-400",
  unfavorited_tender: "bg-zinc-500/10 text-zinc-400",
  deleted_tender: "bg-red-500/10 text-red-400",
}

export default function ActivitiesPage() {
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    api.activities.list().then(setActivities).catch(e => setError(e instanceof Error ? e.message : "Failed to load activities")).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
  if (error) return <div className="space-y-6 max-w-4xl animate-fade-in"><div><h1 className="text-2xl font-bold text-white">Activity Timeline</h1><p className="text-sm text-zinc-400 mt-1">Every action across your tenders</p></div><div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-red-300 text-sm">{error}</div></div>

  return (
    <div className="space-y-6 max-w-4xl animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">Activity Timeline</h1>
        <p className="text-sm text-zinc-400 mt-1">Every action across your tenders</p>
      </div>

      {activities.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-12 text-center">
          <div className="text-4xl mb-4 text-zinc-600">◎</div>
          <h3 className="text-lg font-semibold text-white mb-2">No activity yet</h3>
          <p className="text-sm text-zinc-500">Activities will appear as you upload and manage tenders</p>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-[19px] top-0 bottom-0 w-px bg-zinc-800" />
          <div className="space-y-0">
            {activities.map((a, i) => (
              <div key={a.id} className="flex items-start gap-4 pb-6 relative animate-slide-up" style={{ animationDelay: `${i * 30}ms` }}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm flex-shrink-0 z-10 ${actionColors[a.action] || "bg-zinc-800 text-zinc-400"}`}>
                  {actionIcons[a.action] || "•"}
                </div>
                <div className="flex-1 min-w-0 pt-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-white capitalize">{a.action.replace(/_/g, " ")}</p>
                    <span className="text-xs text-zinc-600">{a.created_at ? new Date(a.created_at).toLocaleString() : ""}</span>
                  </div>
                  {a.details && <p className="text-xs text-zinc-500 mt-0.5">{a.details}</p>}
                  {a.tender_id && (
                    <Link href={`/tenders/${a.tender_id}`} className="text-xs text-blue-400 hover:text-blue-300 mt-1 inline-block">
                      View tender →
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
