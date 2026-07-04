"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { api } from "../_lib/api"
import { errorMessage, type Addendum, type ComplianceRequirement, type DecisionSummary, type SourceReference } from "../_lib/types"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
const scoreNames: Record<string, string> = { eligibility: "Eligibility", technical_fit: "Technical fit", financial_fit: "Financial fit", documentation_readiness: "Documentation", timeline_risk: "Timeline readiness" }
type Tab = "decision" | "compliance" | "evidence" | "addenda"

export default function DecisionWorkbench({ tenderId, analyzed, sources = [] }: { tenderId: number; analyzed: boolean; sources?: SourceReference[] }) {
  const [requirements, setRequirements] = useState<ComplianceRequirement[]>([])
  const [decision, setDecision] = useState<DecisionSummary | null>(null)
  const [addenda, setAddenda] = useState<Addendum[]>([])
  const [page, setPage] = useState(1)
  const [message, setMessage] = useState("")
  const [filter, setFilter] = useState("all")
  const [query, setQuery] = useState("")
  const [tab, setTab] = useState<Tab>("decision")

  const load = async () => {
    if (!analyzed) return
    try {
      const [matrix, summary, revisions] = await Promise.all([api.tenders.compliance(tenderId), api.tenders.decision(tenderId), api.tenders.addenda(tenderId)])
      setRequirements(matrix); setDecision(summary); setAddenda(revisions)
    } catch (error) { setMessage(errorMessage(error)) }
  }
  useEffect(() => {
    let cancelled = false
    if (!analyzed) return () => { cancelled = true }
    Promise.all([api.tenders.compliance(tenderId), api.tenders.decision(tenderId), api.tenders.addenda(tenderId)])
      .then(([matrix, summary, revisions]) => { if (!cancelled) { setRequirements(matrix); setDecision(summary); setAddenda(revisions) } })
      .catch(error => { if (!cancelled) setMessage(errorMessage(error)) })
    return () => { cancelled = true }
  }, [tenderId, analyzed])

  const visible = useMemo(() => requirements.filter(item => {
    const matchesFilter = filter === "all" || (filter === "mandatory" ? item.is_mandatory : filter === "open" ? !["ready", "not_applicable"].includes(item.status) : item.company_match === filter)
    const needle = query.trim().toLowerCase()
    return matchesFilter && (!needle || `${item.requirement} ${item.category} ${item.responsible_employee}`.toLowerCase().includes(needle))
  }), [requirements, filter, query])

  async function update(id: number, values: Partial<ComplianceRequirement>) {
    try { await api.tenders.updateCompliance(tenderId, id, values); await load() } catch (error) { setMessage(errorMessage(error)) }
  }
  async function addAddendum(file?: File) {
    if (!file) return
    setMessage("Comparing the addendum with the original tender…")
    try { await api.tenders.uploadAddendum(tenderId, file); await load(); setMessage("Addendum comparison complete.") } catch (error) { setMessage(errorMessage(error)) }
  }
  function showEvidence(sourcePage: number | null) { setPage(sourcePage || 1); setTab("evidence") }
  if (!analyzed) return null

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "decision", label: "Decision" },
    { id: "compliance", label: "Compliance", count: requirements.length },
    { id: "evidence", label: "Source evidence", count: sources.length },
    { id: "addenda", label: "Addenda", count: addenda.length },
  ]

  return <section className="rounded-2xl border border-zinc-800 bg-zinc-950/40 overflow-hidden shadow-2xl shadow-black/10">
    <div className="flex gap-1 overflow-x-auto border-b border-zinc-800 bg-zinc-900/40 px-3 pt-3">
      {tabs.map(item => <button key={item.id} onClick={() => setTab(item.id)} className={`whitespace-nowrap rounded-t-lg px-4 py-3 text-sm font-medium transition-colors ${tab === item.id ? "border-b-2 border-blue-500 bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-200"}`}>{item.label}{item.count !== undefined && <span className="ml-2 rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">{item.count}</span>}</button>)}
    </div>
    {message && <div className="mx-5 mt-5 flex items-center justify-between gap-3 rounded-lg border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-sm text-blue-300"><span>{message}</span><button onClick={() => setMessage("")} className="text-blue-400">Dismiss</button></div>}

    {tab === "decision" && <DecisionPanel decision={decision} requirements={requirements} onOpenCompliance={() => setTab("compliance")} />}
    {tab === "compliance" && <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div><h2 className="text-lg font-semibold text-white">Requirement workspace</h2><p className="mt-1 text-sm text-zinc-500">Assign owners, connect evidence and move every clause toward ready.</p></div>
        <div className="flex flex-col sm:flex-row gap-2"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search requirements…" className="w-full sm:w-64 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-500" /><select value={filter} onChange={event => setFilter(event.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"><option value="all">All requirements</option><option value="mandatory">Mandatory only</option><option value="open">Open work</option><option value="gap">Evidence gaps</option><option value="partial">Partial matches</option><option value="match">Matched</option></select></div>
      </div>
      <ComplianceProgress decision={decision} />
      <div className="space-y-3">{visible.map((item, index) => <RequirementCard key={item.id} item={item} index={index + 1} onUpdate={values => void update(item.id, values)} onEvidence={() => showEvidence(item.source_page)} />)}</div>
      {visible.length === 0 && <div className="rounded-xl border border-dashed border-zinc-800 py-12 text-center"><p className="text-sm text-zinc-500">No requirements match this view.</p></div>}
    </div>}

    {tab === "evidence" && <div className="grid xl:grid-cols-[340px_1fr] min-h-[680px]">
      <div className="border-b xl:border-b-0 xl:border-r border-zinc-800 p-5"><div className="flex items-center justify-between"><div><h2 className="font-semibold text-white">Verified citations</h2><p className="mt-1 text-xs text-zinc-500">Select a citation to open its source page.</p></div><span className="text-xs text-zinc-600">{sources.length}</span></div><div className="mt-4 max-h-[590px] space-y-2 overflow-y-auto pr-1">{sources.map((source, index) => <button key={`${source.field}-${index}`} onClick={() => setPage(source.page || 1)} className={`w-full rounded-lg border p-3 text-left transition-colors ${page === source.page ? "border-blue-500/40 bg-blue-500/10" : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700"}`}><div className="flex justify-between gap-2"><span className="text-[10px] font-semibold uppercase tracking-wide text-blue-400">{source.field}</span><span className="text-[10px] text-zinc-600">Page {source.page || "—"}</span></div><p className="mt-2 line-clamp-3 text-xs leading-relaxed text-zinc-400">“{source.quote}”</p></button>)}{sources.length === 0 && <p className="rounded-lg bg-zinc-900 p-4 text-sm text-zinc-500">Local analysis found requirements, but no AI-verified citation summary is available.</p>}</div></div>
      <div className="bg-zinc-900/30"><div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3"><p className="text-sm font-medium text-zinc-300">Original tender · Page {page}</p><a target="_blank" href={`${API_BASE}/tenders/${tenderId}/document#page=${page}`} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-blue-400 hover:border-blue-500">Open full PDF</a></div><iframe title="Tender PDF" src={`${API_BASE}/tenders/${tenderId}/document#page=${page}`} className="h-[640px] w-full bg-white" /></div>
    </div>}

    {tab === "addenda" && <div className="p-5 sm:p-6"><div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"><div><h2 className="text-lg font-semibold text-white">Addendum change center</h2><p className="mt-1 text-sm text-zinc-500">Compare corrigenda and revised tender documents against the original.</p></div><label className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-blue-500">Upload addendum<input type="file" accept="application/pdf" className="hidden" onChange={event => void addAddendum(event.target.files?.[0])} /></label></div><div className="mt-6 space-y-3">{addenda.map(item => <details key={item.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4"><summary className="cursor-pointer list-none"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-medium text-zinc-200">{item.filename}</p><p className="mt-1 text-xs text-zinc-500">{item.summary}</p></div><span className="rounded-full bg-green-500/10 px-2.5 py-1 text-[11px] text-green-400">Compared</span></div></summary><pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-3 text-xs leading-relaxed text-zinc-400">{safeChanges(item.changes).join("\n")}</pre></details>)}{addenda.length === 0 && <div className="rounded-xl border border-dashed border-zinc-800 py-16 text-center"><p className="font-medium text-zinc-300">No addenda uploaded</p><p className="mt-1 text-sm text-zinc-600">When the buyer publishes a revision, upload it here to see exactly what changed.</p></div>}</div></div>}
  </section>
}

function DecisionPanel({ decision, requirements, onOpenCompliance }: { decision: DecisionSummary | null; requirements: ComplianceRequirement[]; onOpenCompliance: () => void }) {
  const recommendation = decision?.recommendation || "REVIEW"
  const tone = recommendation === "GO" ? "green" : recommendation === "NO_GO" ? "red" : "amber"
  const toneClasses = tone === "green" ? "border-green-500/20 bg-green-500/10 text-green-300" : tone === "red" ? "border-red-500/20 bg-red-500/10 text-red-300" : "border-amber-500/20 bg-amber-500/10 text-amber-300"
  return <div className="p-4 sm:p-6 space-y-5">
    {decision?.overall_score === null && <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-blue-500/20 bg-blue-500/10 p-4"><div><p className="font-medium text-blue-200">Complete your company evidence to unlock a decision score</p><p className="mt-1 text-sm text-blue-300/70">The tender is analyzed. Now add certificates, projects, team CVs and financial proof for a fair comparison.</p></div><Link href="/knowledge" className="whitespace-nowrap rounded-lg bg-blue-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-blue-500">Open Knowledge Vault</Link></div>}
    <div className="grid lg:grid-cols-[1.15fr_.85fr] gap-4">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5"><div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-zinc-500">Bid recommendation</p><div className="mt-3 flex items-center gap-3"><span className={`rounded-lg border px-3 py-1.5 text-sm font-bold ${toneClasses}`}>{recommendation.replace("_", "-")}</span><span className="text-sm text-zinc-500">Evidence-based decision</span></div><div className="mt-4 space-y-1.5">{decision?.reasons.map(reason => <p key={reason} className="text-sm leading-relaxed text-zinc-300">{reason}</p>)}</div></div><div className="text-right"><p className="text-4xl font-bold tracking-tight text-white">{decision?.overall_score ?? "—"}<span className="text-base font-medium text-zinc-600">/100</span></p><p className="mt-1 text-xs text-zinc-500">Overall decision score</p></div></div><div className="mt-6 grid grid-cols-2 gap-3 border-t border-zinc-800 pt-5"><Stat label="Estimated effort" value={decision?.estimated_effort_hours === null ? "Pending" : `${decision?.estimated_effort_hours || 0} hours`} /><Stat label="Mandatory clauses" value={String(requirements.filter(item => item.is_mandatory).length)} /></div></div>
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-white">Readiness snapshot</h3><button onClick={onOpenCompliance} className="text-xs text-blue-400 hover:text-blue-300">Open workspace →</button></div><div className="mt-5 space-y-4">{Object.entries(decision?.scores || {}).map(([name, score]) => <ScoreBar key={name} label={scoreNames[name] || name} score={score} />)}{!decision && <p className="text-sm text-zinc-500">Calculating decision…</p>}</div></div>
    </div>
    <ComplianceProgress decision={decision} />
  </div>
}

function ScoreBar({ label, score }: { label: string; score: number | null }) { return <div><div className="mb-1.5 flex justify-between text-xs"><span className="text-zinc-400">{label}</span><span className={score === null ? "text-zinc-600" : score >= 70 ? "text-green-400" : score >= 40 ? "text-amber-400" : "text-red-400"}>{score === null ? "Awaiting evidence" : `${score}%`}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-zinc-800"><div className={`h-full rounded-full ${score === null ? "bg-zinc-700" : score >= 70 ? "bg-green-500" : score >= 40 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${score ?? 0}%` }} /></div></div> }
function Stat({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-zinc-600">{label}</p><p className="mt-1 text-sm font-medium text-zinc-200">{value}</p></div> }

function ComplianceProgress({ decision }: { decision: DecisionSummary | null }) {
  const total = decision?.compliance_total || 0, ready = decision?.compliance_ready || 0, blocked = decision?.compliance_blocked || 0
  const readyWidth = total ? ready / total * 100 : 0, blockedWidth = total ? blocked / total * 100 : 0
  return <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium text-zinc-300">Compliance progress</p><div className="flex gap-4 text-xs"><span className="text-green-400">{ready} ready</span><span className="text-red-400">{blocked} blocked</span><span className="text-zinc-500">{Math.max(0, total - ready - blocked)} open</span></div></div><div className="mt-3 flex h-2 overflow-hidden rounded-full bg-zinc-800"><div className="bg-green-500" style={{width: `${readyWidth}%`}} /><div className="bg-red-500" style={{width: `${blockedWidth}%`}} /></div></div>
}

function RequirementCard({ item, index, onUpdate, onEvidence }: { item: ComplianceRequirement; index: number; onUpdate: (values: Partial<ComplianceRequirement>) => void; onEvidence: () => void }) {
  const [owner, setOwner] = useState(item.responsible_employee)
  const matchStyle = item.company_match === "match" ? "bg-green-500/10 text-green-400" : item.company_match === "gap" ? "bg-red-500/10 text-red-400" : item.company_match === "partial" ? "bg-amber-500/10 text-amber-400" : "bg-zinc-800 text-zinc-400"
  return <article className="rounded-xl border border-zinc-800 bg-zinc-900/35 p-4 transition-colors hover:border-zinc-700"><div className="flex flex-col lg:flex-row gap-4"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-xs text-zinc-600">#{index}</span><span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${item.is_mandatory ? "bg-red-500/10 text-red-400" : "bg-zinc-800 text-zinc-500"}`}>{item.is_mandatory ? "MANDATORY" : "OPTIONAL"}</span><span className="text-[10px] font-medium uppercase tracking-wide text-zinc-600">{item.category}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${matchStyle}`}>{item.company_match === "unknown" ? "Evidence pending" : item.company_match}</span></div><p className="mt-2 text-sm leading-relaxed text-zinc-200">{item.requirement}</p>{item.missing_proof && <p className="mt-2 text-xs leading-relaxed text-zinc-500">{item.missing_proof}</p>}<button onClick={onEvidence} className="mt-3 text-xs text-blue-400 hover:text-blue-300">View source{item.source_page ? ` · Page ${item.source_page}` : ""} →</button></div><div className="grid sm:grid-cols-2 lg:grid-cols-1 gap-3 lg:w-56"><label className="text-[11px] text-zinc-500">Responsible owner<input value={owner} onChange={event => setOwner(event.target.value)} onBlur={() => { if (owner !== item.responsible_employee) onUpdate({responsible_employee: owner}) }} placeholder="Unassigned" className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-blue-500" /></label><label className="text-[11px] text-zinc-500">Workflow status<select value={item.status} onChange={event => onUpdate({status: event.target.value as ComplianceRequirement["status"]})} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200"><option value="not_started">Not started</option><option value="in_progress">In progress</option><option value="ready">Ready</option><option value="blocked">Blocked</option><option value="not_applicable">Not applicable</option></select></label></div></div></article>
}

function safeChanges(value: string): string[] { try { const result: unknown = JSON.parse(value); return Array.isArray(result) ? result.map(String) : [] } catch { return [] } }
