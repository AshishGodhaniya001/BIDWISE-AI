"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import { useEffect, useRef, useState } from "react"
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { api } from "../../_lib/api"
import { errorMessage, scoreColor, type DashboardStats, type TenderSummary } from "../../_lib/types"
import { showToast } from "../../_components/Toast"

const COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#06b6d4"]

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [tenders, setTenders] = useState<TenderSummary[]>([])
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    const ctrl = new AbortController()
    Promise.all([api.dashboard.stats(), api.tenders.list()])
      .then(([s, t]) => { if (mountedRef.current) { setStats(s); setTenders(t) } })
      .catch((e) => { if (mountedRef.current && e.name !== "AbortError") showToast(errorMessage(e)) })
      .finally(() => { if (mountedRef.current) setLoading(false) })
    return () => { mountedRef.current = false; ctrl.abort() }
  }, [])

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" /></div>
  if (!stats) return <div className="flex h-64 items-center justify-center"><p className="text-zinc-500">Could not load dashboard. Make sure the backend server is running.</p></div>

  const scoreData = tenders.filter(t => t.bid_success_score !== null).map(t => ({
    name: t.tender_name?.slice(0, 12) || "Tender",
    score: t.bid_success_score,
  })).slice(0, 8)

  const statusCounts = tenders.reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1
    return acc
  }, {})
  const pieData = Object.entries(statusCounts).map(([name, value]) => ({ name, value }))

  return (
    <div className="max-w-6xl space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-blue-400">Tender command center</p>
          <h1 className="mt-2 text-2xl font-bold text-white">Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-400">Track deadlines, readiness gaps, team workload, and approval bottlenecks.</p>
        </div>
        <Link href="/tenders/upload" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-blue-600/20 transition-colors hover:bg-blue-500">
          + Upload Tender
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-7">
        <Stat label="Total tenders" value={stats.total_tenders} accent="blue" />
        <Stat label="Active bids" value={stats.active_bids} accent="green" />
        <Stat label="Avg decision score" value={stats.avg_success_score === null ? "Needs evidence" : `${stats.avg_success_score}%`} accent="violet" />
        <Stat label="Revenue opportunity" value={stats.total_revenue_opportunity} accent="amber" wide />
        <Stat label="Blocked requirements" value={stats.blocked_requirements} accent="red" />
        <Stat label="Pending approvals" value={stats.pending_approvals} accent="cyan" />
        <Stat label="Team members" value={stats.team_members} accent="zinc" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Bid decision scores">
          {scoreData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={scoreData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="name" tick={{ fill: "#a1a1aa", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: "#a1a1aa", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                  {scoreData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty>No scored tenders yet. Upload and analyze a tender first.</Empty>}
        </ChartCard>

        <ChartCard title="Tender pipeline status">
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={78} dataKey="value" label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}>
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <Empty>No tender status data yet.</Empty>}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TenderList title="Upcoming deadlines" empty="No upcoming deadlines." tenders={stats.upcoming_deadlines} showDeadline />
        <TenderList title="Recent tenders" empty="Upload a tender to get started." tenders={stats.recent_tenders} />
      </div>
    </div>
  )
}

function Stat({ label, value, accent, wide = false }: { label: string; value: string | number; accent: string; wide?: boolean }) {
  const colors: Record<string, string> = {
    blue: "from-blue-500/20 to-blue-600/5",
    green: "from-green-500/20 to-green-600/5",
    violet: "from-violet-500/20 to-violet-600/5",
    amber: "from-amber-500/20 to-amber-600/5",
    red: "from-red-500/20 to-red-600/5",
    cyan: "from-cyan-500/20 to-cyan-600/5",
    zinc: "from-zinc-700/50 to-zinc-900/20",
  }
  return <div className={`rounded-xl border border-zinc-800 bg-gradient-to-br ${colors[accent]} p-4 ${wide ? "xl:col-span-2" : ""}`}><p className="text-2xl font-bold text-white">{value}</p><p className="mt-1 text-xs text-zinc-500">{label}</p></div>
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5"><h2 className="mb-4 text-sm font-semibold text-zinc-300">{title}</h2>{children}</section>
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-zinc-800 py-16 text-center text-sm text-zinc-600">{children}</p>
}

function TenderList({ title, tenders, empty, showDeadline = false }: { title: string; tenders: TenderSummary[]; empty: string; showDeadline?: boolean }) {
  return <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5"><h2 className="mb-4 text-sm font-semibold text-zinc-300">{title}</h2>{tenders?.length ? <div className="space-y-2">{tenders.map(t => <Link key={t.id} href={`/tenders/${t.id}`} className="flex items-center justify-between rounded-lg p-3 transition-colors hover:bg-zinc-800/50"><span className="min-w-0"><span className="block truncate text-sm font-medium text-white">{t.tender_name || "Untitled"}</span><span className="text-xs text-zinc-500">{showDeadline ? (t.department || "No department") : t.status}</span></span><span className={`ml-4 shrink-0 text-xs font-medium ${showDeadline ? "text-red-400" : scoreColor(t.bid_success_score)}`}>{showDeadline ? (t.deadline || "N/A") : (t.bid_success_score === null ? "Needs evidence" : `${t.bid_success_score}%`)}</span></Link>)}</div> : <p className="text-sm text-zinc-600">{empty}</p>}</section>
}
