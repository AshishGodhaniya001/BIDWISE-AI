"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { api } from "../../_lib/api"
import { scoreColor, type TenderSummary } from "../../_lib/types"

const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export default function CalendarPage() {
  const [tenders, setTenders] = useState<TenderSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [month, setMonth] = useState(new Date().getMonth())
  const [year, setYear] = useState(new Date().getFullYear())

  useEffect(() => {
    api.tenders.list().then(setTenders).catch(e => setError(e instanceof Error ? e.message : "Failed to load tenders")).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
  if (error) return <div className="space-y-6 max-w-5xl animate-fade-in"><div><h1 className="text-2xl font-bold text-white">Bid Calendar</h1><p className="text-sm text-zinc-400 mt-1">Track all tender deadlines in one view</p></div><div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-red-300 text-sm">{error}</div></div>

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  function getDeadlines(day: number) {
    const isoDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    return tenders.filter(tender => tender.deadline_date === isoDate)
  }

  const calendar = []
  for (let i = 0; i < firstDay; i++) calendar.push(null)
  for (let d = 1; d <= daysInMonth; d++) calendar.push(d)

  return (
    <div className="space-y-6 max-w-5xl animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">Bid Calendar</h1>
        <p className="text-sm text-zinc-400 mt-1">Track all tender deadlines in one view</p>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => { if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1) }} className="text-zinc-400 hover:text-white text-lg p-1">←</button>
          <h2 className="text-lg font-semibold text-white">{months[month]} {year}</h2>
          <button onClick={() => { if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1) }} className="text-zinc-400 hover:text-white text-lg p-1">→</button>
        </div>

        <div className="grid grid-cols-7 gap-px bg-zinc-800 rounded-lg overflow-hidden">
          {days.map(d => <div key={d} className="bg-zinc-900 p-2 text-center text-xs text-zinc-500 font-medium">{d}</div>)}
          {calendar.map((day, i) => {
            if (!day) return <div key={`e${i}`} className="bg-zinc-900/50 p-2 min-h-[80px]" />
            const deadlines = getDeadlines(day)
            const isToday = day === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear()
            return (
              <div key={day} className={`bg-zinc-900 p-2 min-h-[80px] ${isToday ? "ring-1 ring-blue-500/50" : ""}`}>
                <span className={`text-xs font-medium ${isToday ? "text-blue-400" : "text-zinc-400"}`}>{day}</span>
                <div className="mt-1 space-y-0.5">
                  {deadlines.slice(0, 2).map(t => (
                    <Link key={t.id} href={`/tenders/${t.id}`} className="block text-[10px] px-1 py-0.5 rounded bg-blue-500/10 text-blue-400 truncate hover:bg-blue-500/20 transition-colors">
                      {t.tender_name || "Tender"}
                    </Link>
                  ))}
                  {deadlines.length > 2 && <span className="text-[10px] text-zinc-500 px-1">+{deadlines.length - 2} more</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {tenders.filter(t => t.deadline).length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
          <h2 className="text-sm font-semibold text-zinc-300 mb-4">⬛ All Deadlines</h2>
          <div className="space-y-2">
            {tenders.filter(t => t.deadline_date).sort((a, b) => (a.deadline_date || "").localeCompare(b.deadline_date || "")).map(t => (
              <Link key={t.id} href={`/tenders/${t.id}`} className="flex items-center justify-between p-3 rounded-lg hover:bg-zinc-800/50 transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{t.tender_name || "Untitled"}</p>
                  <p className="text-xs text-zinc-500">{t.department || "N/A"}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                  <span className="text-xs font-medium text-red-400">{t.deadline}</span>
                  <span className={`text-xs font-medium ${scoreColor(t.bid_success_score)}`}>
                    {t.bid_success_score === null ? "Needs profile" : `${t.bid_success_score}%`}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
