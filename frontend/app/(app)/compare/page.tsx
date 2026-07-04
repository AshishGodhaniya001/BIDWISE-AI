"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import { api } from "../../_lib/api"
import { scoreColor, type TenderSummary } from "../../_lib/types"

export default function ComparePage() {
  const [tenders, setTenders] = useState<TenderSummary[]>([])
  const [selected, setSelected] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    api.tenders.list().then(setTenders).catch(e => setError(e instanceof Error ? e.message : "Failed to load tenders")).finally(() => setLoading(false))
  }, [])

  function toggle(id: number) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 3 ? [...prev, id] : prev)
  }

  const compare = tenders.filter(t => selected.includes(t.id))

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
  if (error) return <div className="space-y-6 max-w-6xl animate-fade-in"><div><h1 className="text-2xl font-bold text-white">Compare Tenders</h1><p className="text-sm text-zinc-400 mt-1">Select up to 3 tenders to compare side by side</p></div><div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-red-300 text-sm">{error}</div></div>

  return (
    <div className="space-y-6 max-w-6xl animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">Compare Tenders</h1>
        <p className="text-sm text-zinc-400 mt-1">Select up to 3 tenders to compare side by side</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {tenders.map(t => (
          <button key={t.id} onClick={() => toggle(t.id)}
            className={`text-left p-4 rounded-xl border transition-all ${selected.includes(t.id) ? "border-blue-500 bg-blue-500/10" : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700"}`}>
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">{t.tender_name || "Untitled"}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{t.department || "N/A"}</p>
              </div>
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ml-2 ${selected.includes(t.id) ? "border-blue-500 bg-blue-500" : "border-zinc-600"}`}>
                {selected.includes(t.id) && <span className="text-white text-xs">✓</span>}
              </div>
            </div>
            <div className="flex items-center gap-3 mt-2 text-xs text-zinc-500">
              <span>{t.budget || "No budget"}</span>
              <span className={`font-medium ${scoreColor(t.bid_success_score)}`}>
                {t.bid_success_score === null ? "Needs profile" : `${t.bid_success_score}%`}
              </span>
            </div>
          </button>
        ))}
      </div>

      {compare.length >= 2 && (
        <div className="rounded-xl border border-zinc-800 overflow-hidden animate-fade-in">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900">
                <th className="text-left p-4 text-zinc-400 font-medium w-40">Field</th>
                {compare.map(t => (
                  <th key={t.id} className="text-left p-4 text-white font-medium">{t.tender_name || "Untitled"}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {[
                { label: "Department", get: (t: TenderSummary): ReactNode => t.department || "N/A" },
                { label: "Deadline", get: (t: TenderSummary): ReactNode => t.deadline || "N/A" },
                { label: "Budget", get: (t: TenderSummary): ReactNode => t.budget || "N/A" },
                { label: "Success Score", get: (t: TenderSummary): ReactNode => t.bid_success_score === null ? "Needs company profile" : `${t.bid_success_score}%` },
                { label: "Status", get: (t: TenderSummary): ReactNode => <span className={`text-xs px-1.5 py-0.5 rounded ${t.status === "analyzed" ? "bg-green-500/10 text-green-400" : "bg-zinc-800 text-zinc-400"}`}>{t.status}</span> },
                { label: "Created", get: (t: TenderSummary): ReactNode => t.created_at ? new Date(t.created_at).toLocaleDateString() : "N/A" },
              ].map((row) => (
                <tr key={row.label} className="hover:bg-zinc-900/50">
                  <td className="p-4 text-zinc-400 font-medium">{row.label}</td>
                  {compare.map(t => (
                    <td key={t.id} className="p-4 text-white">{row.get(t)}</td>
                  ))}
                </tr>
              ))}
              <tr className="hover:bg-zinc-900/50">
                <td className="p-4 text-zinc-400 font-medium">Actions</td>
                {compare.map(t => (
                  <td key={t.id} className="p-4">
                    <Link href={`/tenders/${t.id}`} className="text-blue-400 hover:text-blue-300 text-xs">View Details →</Link>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {compare.length < 2 && selected.length > 0 && (
        <p className="text-sm text-zinc-500 text-center py-4">Select at least 2 tenders to compare</p>
      )}
      {selected.length === 0 && (
        <p className="text-sm text-zinc-600 text-center py-12">Select tenders above to compare them side by side</p>
      )}
    </div>
  )
}
