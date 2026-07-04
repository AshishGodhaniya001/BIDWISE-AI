"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { api } from "../../_lib/api"
import { errorMessage, scoreColor, type TenderSummary } from "../../_lib/types"
import { showToast } from "../../_components/Toast"

export default function TendersPage() {
  const [tenders, setTenders] = useState<TenderSummary[]>([])
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)

  async function load() {
    try {
      const data = await api.tenders.list()
      if (mountedRef.current) setTenders(data)
    } catch (e) { if (mountedRef.current) showToast(errorMessage(e)) }
    finally { if (mountedRef.current) setLoading(false) }
  }

  useEffect(() => {
    mountedRef.current = true
    void api.tenders.list().then((data) => { if (mountedRef.current) setTenders(data) }).catch((e) => { if (mountedRef.current) showToast(errorMessage(e)) }).finally(() => { if (mountedRef.current) setLoading(false) })
    return () => { mountedRef.current = false }
  }, [])

  async function handleDelete(id: number) {
    if (!confirm("Delete this tender?")) return
    try {
      await api.tenders.delete(id)
      load()
    } catch (e) { showToast(errorMessage(e)) }
  }

  async function handleFavorite(id: number) {
    try {
      await api.tenders.toggleFavorite(id)
      load()
    } catch (e) { showToast(errorMessage(e)) }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="space-y-6 max-w-6xl animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Tenders</h1>
          <p className="text-sm text-zinc-400 mt-1">All uploaded government tenders</p>
        </div>
        <Link href="/tenders/upload" className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors shadow-lg shadow-blue-600/20">
          + Upload PDF
        </Link>
      </div>

{tenders.length === 0 ? (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-12 text-center">
      <div className="text-4xl mb-4 text-zinc-600">◇</div>
      <h3 className="text-lg font-semibold text-white mb-2">No tenders yet</h3>
      <p className="text-sm text-zinc-500 mb-6">Upload your first government tender PDF to get started</p>
      <Link href="/tenders/upload" className="inline-flex px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors">
        Upload Tender PDF
      </Link>
    </div>
  ) : (
    <div className="grid grid-cols-1 gap-3">
      {tenders.map((t, i) => (
        <div key={t.id} className="group flex items-center justify-between p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-900 hover:border-zinc-700 transition-all animate-slide-up" style={{ animationDelay: `${i * 50}ms` }}>
          <Link href={`/tenders/${t.id}`} className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{t.tender_name || t.filename || "Untitled"}</p>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs text-zinc-500">{t.department || "N/A"}</span>
              <span className="text-xs text-zinc-600">•</span>
              <span className="text-xs text-zinc-500">{t.budget || "No budget"}</span>
              <span className="text-xs text-zinc-600">•</span>
              <span className={`text-xs font-medium ${scoreColor(t.bid_success_score)}`}>
                {t.bid_success_score === null ? "Needs profile" : `${t.bid_success_score}%`}
              </span>
              <span className="text-xs text-zinc-600">•</span>
              <span className={`text-xs px-1.5 py-0.5 rounded ${t.status === "analyzed" ? "bg-green-500/10 text-green-400" : "bg-zinc-800 text-zinc-400"}`}>
                {t.status}
              </span>
            </div>
          </Link>
          <div className="flex items-center gap-2 flex-shrink-0 ml-4">
            <button onClick={() => handleFavorite(t.id)} className={`text-sm transition-colors ${t.is_favorite ? "text-amber-400" : "text-zinc-600 hover:text-amber-400"}`}>
              {t.is_favorite ? "★" : "☆"}
            </button>
            <Link href={`/tenders/${t.id}`} className="text-xs text-zinc-500 hover:text-blue-400 transition-colors">View</Link>
            <button onClick={() => handleDelete(t.id)} className="text-xs text-zinc-600 hover:text-red-400 transition-colors">Delete</button>
          </div>
        </div>
      ))}
    </div>
  )}
    </div>
  )
}
