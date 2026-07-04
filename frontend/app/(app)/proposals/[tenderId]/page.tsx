"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { api } from "../../../_lib/api"
import { useAuth } from "../../../_lib/AuthContext"
import { errorMessage, type ComplianceRequirement, type DecisionSummary, type Proposal, type ProposalReviewComment, type ProposalUpdate, type ProposalVersion } from "../../../_lib/types"

type SectionKey = keyof ProposalUpdate
const sectionInfo: { key: SectionKey; label: string; short: string; description: string }[] = [
  { key: "cover_letter", label: "Cover Letter", short: "Letter", description: "Formal submission letter, authority details and high-level commitment." },
  { key: "executive_summary", label: "Executive Summary", short: "Summary", description: "A concise buyer-focused case for why this proposal is credible and valuable." },
  { key: "technical_proposal", label: "Technical Proposal", short: "Technical", description: "Requirement-by-requirement approach grounded in verified company evidence." },
  { key: "scope_of_work", label: "Scope of Work", short: "Scope", description: "Phases, deliverables, dependencies, acceptance points and responsibilities." },
]

export default function ProposalPage() {
  const { tenderId: tenderIdParam } = useParams<{ tenderId: string }>()
  const { user } = useAuth()
  const tenderId = Number(tenderIdParam)
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [decision, setDecision] = useState<DecisionSummary | null>(null)
  const [requirements, setRequirements] = useState<ComplianceRequirement[]>([])
  const [versions, setVersions] = useState<ProposalVersion[]>([])
  const [activeSection, setActiveSection] = useState<SectionKey>("executive_summary")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState("")
  const [message, setMessage] = useState("")
  const [dirty, setDirty] = useState(false)
  const [lastSaved, setLastSaved] = useState<string | null>(null)
  const [reviews, setReviews] = useState<ProposalReviewComment[]>([])
  const [reviewComment, setReviewComment] = useState("")

  useEffect(() => {
    let cancelled = false
    Promise.all([api.proposals.get(tenderId), api.tenders.decision(tenderId), api.tenders.compliance(tenderId)])
      .then(async ([proposalResult, decisionResult, complianceResult]) => {
        if (cancelled) return
        setProposal(proposalResult.proposal); setDecision(decisionResult); setRequirements(complianceResult)
        setLastSaved(proposalResult.proposal?.updated_at || null)
        if (proposalResult.proposal) {
          const [versionRows, reviewRows] = await Promise.all([
            api.proposals.versions(tenderId).catch(() => []),
            api.proposals.reviews(tenderId).catch(() => []),
          ])
          setVersions(versionRows); setReviews(reviewRows)
        }
      })
      .catch(error => { if (!cancelled) setMessage(errorMessage(error)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [tenderId])

  useEffect(() => {
    if (proposal?.status !== "generating") return
    let cancelled = false
    let timer: number | undefined
    const poll = async () => {
      try {
        const result = await api.proposals.get(tenderId)
        if (!cancelled && result.proposal) {
          setProposal(result.proposal)
          if (result.proposal.status === "generated") {
            setMessage("Draft generated. Review every highlighted evidence request before submission.")
            setVersions(await api.proposals.versions(tenderId).catch(() => []))
          } else if (result.proposal.status === "generating") timer = window.setTimeout(poll, 2000)
        }
      } catch (error) { if (!cancelled) setMessage(errorMessage(error)) }
    }
    timer = window.setTimeout(poll, 2000)
    return () => { cancelled = true; if (timer) window.clearTimeout(timer) }
  }, [proposal?.status, tenderId])

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault() }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  const reviewItems = useMemo(() => {
    if (!proposal) return []
    const items: { section: SectionKey; text: string }[] = []
    for (const section of sectionInfo) {
      const matches = proposal[section.key].matchAll(/\[REVIEW REQUIRED:\s*([^\]]+)\]/gi)
      for (const match of matches) items.push({ section: section.key, text: match[1] })
    }
    return items
  }, [proposal])

  async function handleGenerate() {
    setBusy("generate"); setMessage("")
    try { setProposal(await api.proposals.generate(tenderId)); setDirty(false); setMessage("Generating four proposal sections from verified evidence…") }
    catch (error) { setMessage(errorMessage(error)) }
    finally { setBusy("") }
  }
  async function handleSave() {
    if (!proposal) return
    setBusy("save"); setMessage("")
    try {
      const saved = await api.proposals.update(tenderId, proposalPayload(proposal))
      setProposal(saved); setDirty(false); setLastSaved(saved.updated_at); setMessage("All sections saved as a new version.")
      setVersions(await api.proposals.versions(tenderId).catch(() => []))
    } catch (error) { setMessage(errorMessage(error)) }
    finally { setBusy("") }
  }
  async function handleReview(action: ProposalReviewComment["action"]) {
    if (!proposal) return
    setBusy(action); setMessage("")
    try {
      const updated = await api.proposals.review(tenderId, { action, comment: reviewComment })
      setProposal(updated); setReviewComment("")
      setReviews(await api.proposals.reviews(tenderId).catch(() => []))
      setMessage(reviewActionLabel(action))
    } catch (error) { setMessage(errorMessage(error)) }
    finally { setBusy("") }
  }
  function updateSection(value: string) {
    if (!proposal) return
    setProposal({ ...proposal, [activeSection]: value }); setDirty(true)
  }
  function loadVersion(version: ProposalVersion) {
    if (!proposal) return
    setProposal({ ...proposal, ...proposalPayload(version) }); setDirty(true)
    setMessage(`Version ${version.version} loaded as an unsaved draft. Save to make it current.`)
  }
  async function handleExport() {
    if (!proposal) return
    setBusy("export"); setMessage("")
    try {
      const jsPDF = (await import("jspdf")).default
      const pdf = new jsPDF("p", "mm", "a4"), margin = 18, width = pdf.internal.pageSize.getWidth() - margin * 2, bottom = pdf.internal.pageSize.getHeight() - 18
      let y = 20
      const ensureSpace = (height: number) => { if (y + height > bottom) { pdf.addPage(); y = 20 } }
      const addSection = (title: string, content: string) => {
        ensureSpace(16); pdf.setFont("helvetica", "bold"); pdf.setFontSize(14); pdf.setTextColor(30, 64, 110); pdf.text(title, margin, y); y += 8
        pdf.setFont("helvetica", "normal"); pdf.setFontSize(10); pdf.setTextColor(35, 35, 35)
        for (const line of pdf.splitTextToSize(content || "[Not provided]", width) as string[]) { ensureSpace(5); pdf.text(line, margin, y); y += 5 }
        y += 6
      }
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(20); pdf.setTextColor(20, 42, 75); pdf.text("Tender Proposal", margin, y); y += 8
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.setTextColor(100, 100, 100); pdf.text(`BidWise AI draft · Tender ${tenderId} · Version ${proposal.version}`, margin, y); y += 12
      sectionInfo.forEach(section => addSection(section.label, proposal[section.key]))
      const pages = pdf.getNumberOfPages()
      for (let page = 1; page <= pages; page++) { pdf.setPage(page); pdf.setFontSize(8); pdf.setTextColor(120, 120, 120); pdf.text(`Page ${page} of ${pages}`, pdf.internal.pageSize.getWidth() - margin, pdf.internal.pageSize.getHeight() - 8, { align: "right" }) }
      pdf.save(`proposal-${tenderId}-v${proposal.version}.pdf`); setMessage("Proposal PDF exported successfully.")
    } catch (error) { setMessage(`Export failed: ${errorMessage(error)}`) }
    finally { setBusy("") }
  }

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" /></div>
  const active = sectionInfo.find(section => section.key === activeSection) || sectionInfo[0]
  const completedSections = proposal ? sectionInfo.filter(section => proposal[section.key].trim().length > 80).length : 0
  const openRequirements = requirements.filter(item => !["ready", "not_applicable"].includes(item.status))

  return <div className="mx-auto max-w-7xl space-y-5 animate-fade-in">
    <header className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900/90 to-zinc-950 p-5 sm:p-6 shadow-xl shadow-black/10">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5"><div><Link href={`/tenders/${tenderId}`} className="text-xs text-zinc-500 hover:text-blue-400">← Back to tender</Link><div className="mt-3 flex flex-wrap items-center gap-2"><span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-[11px] font-medium text-blue-400">Proposal workspace</span>{proposal && <span className="rounded-full bg-zinc-800 px-2.5 py-1 text-[11px] text-zinc-400">Version {proposal.version}</span>}<SaveState dirty={dirty} lastSaved={lastSaved} /></div><h1 className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-white">Build a submission-ready proposal</h1><p className="mt-2 max-w-2xl text-sm text-zinc-400">Draft section by section, resolve evidence gaps, then export a clean review copy.</p></div><div className="flex flex-wrap gap-2"><button onClick={() => void handleGenerate()} disabled={Boolean(busy) || proposal?.status === "generating"} className="rounded-lg border border-zinc-700 px-3.5 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50">{proposal ? "Regenerate draft" : "Generate draft"}</button>{proposal && <><button onClick={() => void handleSave()} disabled={Boolean(busy) || !dirty} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40">{busy === "save" ? "Saving…" : "Save version"}</button><button onClick={() => void handleExport()} disabled={Boolean(busy)} className="rounded-lg border border-zinc-700 px-3.5 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50">Export PDF</button></>}</div></div>
    </header>

    {message && <div className="flex items-center justify-between gap-3 rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-sm text-blue-300"><span>{message}</span><button onClick={() => setMessage("")} className="text-xs font-medium">Dismiss</button></div>}
    {proposal?.status === "generating" && <GenerationState />}
    {proposal?.error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">{proposal.error}</div>}

    {!proposal ? <EmptyProposal onGenerate={() => void handleGenerate()} busy={busy === "generate"} readiness={decision?.proposal_coverage || 0} /> : <div className="grid xl:grid-cols-[260px_minmax(0,1fr)_280px] gap-4 items-start">
      <aside className="space-y-4 xl:sticky xl:top-4"><nav className="rounded-xl border border-zinc-800 bg-zinc-900/45 p-2"><p className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[.15em] text-zinc-600">Proposal sections</p>{sectionInfo.map((section, index) => { const text = proposal[section.key], selected = section.key === activeSection, reviews = reviewItems.filter(item => item.section === section.key).length; return <button key={section.key} onClick={() => setActiveSection(section.key)} className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors ${selected ? "bg-blue-500/10 text-blue-300" : "text-zinc-400 hover:bg-zinc-800/60 hover:text-white"}`}><span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${text.trim().length > 80 ? "bg-green-500/10 text-green-400" : "bg-zinc-800 text-zinc-600"}`}>{text.trim().length > 80 ? "✓" : index + 1}</span><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{section.short}</span><span className="block text-[10px] text-zinc-600">{wordCount(text)} words</span></span>{reviews > 0 && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-400">{reviews}</span>}</button>})}</nav><VersionHistory versions={versions} current={proposal.version} onLoad={loadVersion} /></aside>

      <main className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40"><div className="border-b border-zinc-800 px-5 py-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-white">{active.label}</h2><p className="mt-1 text-xs text-zinc-500">{active.description}</p></div><div className="text-right"><p className="text-xs text-zinc-500">{wordCount(proposal[activeSection])} words</p><p className="mt-1 text-[10px] text-zinc-600">Plain text · PDF ready</p></div></div></div><textarea aria-label={active.label} value={proposal[activeSection]} onChange={event => updateSection(event.target.value)} className="min-h-[620px] w-full resize-y bg-transparent px-5 py-5 text-sm leading-7 text-zinc-200 outline-none placeholder:text-zinc-700" placeholder={`Write the ${active.label.toLowerCase()} here…`} /><div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-zinc-800 px-5 py-3"><p className="text-xs text-zinc-600">Use [REVIEW REQUIRED: ...] for claims that still need evidence.</p><div className="flex gap-2"><button onClick={() => moveSection(activeSection, -1, setActiveSection)} className="rounded px-2 py-1 text-xs text-zinc-500 hover:text-white">Previous</button><button onClick={() => moveSection(activeSection, 1, setActiveSection)} className="rounded px-2 py-1 text-xs text-blue-400 hover:text-blue-300">Next section →</button></div></div></main>

      <aside className="space-y-4 xl:sticky xl:top-4"><ApprovalPanel proposal={proposal} role={user?.role || "employee"} comment={reviewComment} setComment={setReviewComment} onAction={action => void handleReview(action)} busy={busy} history={reviews} /><ReadinessCard coverage={decision?.proposal_coverage || 0} completed={completedSections} open={openRequirements.length} reviews={reviewItems.length} /><ReviewQueue items={reviewItems} onOpen={setActiveSection} /><details className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4"><summary className="cursor-pointer text-sm font-medium text-zinc-300">Open requirements ({openRequirements.length})</summary><div className="mt-3 max-h-64 space-y-2 overflow-auto">{openRequirements.slice(0, 20).map(item => <p key={item.id} className="rounded-lg bg-black/20 p-2.5 text-xs leading-relaxed text-zinc-500">{item.requirement}</p>)}</div></details></aside>
    </div>}
  </div>
}

function proposalPayload(proposal: Proposal | ProposalVersion): ProposalUpdate { return { cover_letter: proposal.cover_letter, executive_summary: proposal.executive_summary, technical_proposal: proposal.technical_proposal, scope_of_work: proposal.scope_of_work } }
function wordCount(value: string) { return value.trim() ? value.trim().split(/\s+/).length : 0 }
function moveSection(current: SectionKey, direction: number, set: (section: SectionKey) => void) { const index = sectionInfo.findIndex(section => section.key === current); const next = Math.min(sectionInfo.length - 1, Math.max(0, index + direction)); set(sectionInfo[next].key) }
function reviewActionLabel(action: ProposalReviewComment["action"]) {
  return {
    submit: "Proposal submitted for review.",
    approve: "Proposal approved for submission.",
    request_changes: "Changes requested.",
    return_to_draft: "Proposal returned to draft.",
  }[action]
}

function SaveState({ dirty, lastSaved }: { dirty: boolean; lastSaved: string | null }) { return <span className={`rounded-full px-2.5 py-1 text-[11px] ${dirty ? "bg-amber-500/10 text-amber-400" : "bg-green-500/10 text-green-400"}`}>{dirty ? "Unsaved changes" : lastSaved ? `Saved ${new Date(lastSaved).toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"})}` : "Saved"}</span> }
function GenerationState() { return <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-5"><div className="flex items-center gap-3"><div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" /><div><p className="text-sm font-medium text-blue-200">Building your evidence-grounded draft</p><p className="mt-1 text-xs text-blue-300/70">Generating the cover letter, executive summary, technical response and scope of work.</p></div></div></div> }
function EmptyProposal({ onGenerate, busy, readiness }: { onGenerate: () => void; busy: boolean; readiness: number }) { return <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/25 px-6 py-20 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10 text-xl text-blue-400">✦</div><h2 className="mt-5 text-xl font-semibold text-white">Create your first proposal draft</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-zinc-500">BidWise will draft four editable sections using the tender requirements and verified Knowledge Vault evidence. Current compliance readiness: {readiness}%.</p><button onClick={onGenerate} disabled={busy} className="mt-6 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50">{busy ? "Starting…" : "Generate proposal draft"}</button></div> }
function ReadinessCard({ coverage, completed, open, reviews }: { coverage: number; completed: number; open: number; reviews: number }) { return <div className="rounded-xl border border-zinc-800 bg-zinc-900/45 p-4"><div className="flex items-end justify-between"><div><p className="text-sm font-medium text-zinc-200">Submission readiness</p><p className="mt-1 text-xs text-zinc-600">Evidence and drafting progress</p></div><p className="text-2xl font-bold text-white">{coverage}%</p></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-800"><div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-green-500" style={{width: `${coverage}%`}} /></div><div className="mt-4 grid grid-cols-3 gap-2 text-center"><MiniStat value={`${completed}/4`} label="Sections" /><MiniStat value={String(open)} label="Open" /><MiniStat value={String(reviews)} label="Reviews" /></div></div> }
function MiniStat({ value, label }: { value: string; label: string }) { return <div className="rounded-lg bg-black/20 py-2"><p className="text-sm font-semibold text-zinc-200">{value}</p><p className="text-[10px] text-zinc-600">{label}</p></div> }
function ApprovalPanel({ proposal, role, comment, setComment, onAction, busy, history }: { proposal: Proposal; role: string; comment: string; setComment: (value: string) => void; onAction: (action: ProposalReviewComment["action"]) => void; busy: string; history: ProposalReviewComment[] }) {
  const canSubmit = ["admin", "bid_manager"].includes(role) && ["draft", "changes_requested"].includes(proposal.approval_status)
  const canReview = ["admin", "reviewer"].includes(role) && proposal.approval_status === "in_review"
  const canReturn = ["admin", "bid_manager"].includes(role) && ["in_review", "changes_requested"].includes(proposal.approval_status)
  const statusStyle = {
    draft: "bg-zinc-800 text-zinc-300",
    in_review: "bg-blue-500/10 text-blue-300",
    approved: "bg-green-500/10 text-green-400",
    changes_requested: "bg-amber-500/10 text-amber-400",
  }[proposal.approval_status]
  return <div className="rounded-xl border border-zinc-800 bg-zinc-900/45 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-zinc-200">Approval workflow</p><p className="mt-1 text-xs text-zinc-600">Human review gate before final submission.</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-medium capitalize ${statusStyle}`}>{proposal.approval_status.replace("_", " ")}</span></div><textarea value={comment} onChange={event => setComment(event.target.value)} placeholder="Optional review comment…" className="mt-3 min-h-20 w-full resize-y rounded-lg border border-zinc-800 bg-black/20 px-3 py-2 text-xs leading-5 text-zinc-200 outline-none focus:border-blue-500" /><div className="mt-3 grid grid-cols-2 gap-2">{canSubmit && <button onClick={() => onAction("submit")} disabled={Boolean(busy)} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50">Submit review</button>}{canReview && <button onClick={() => onAction("approve")} disabled={Boolean(busy)} className="rounded-lg bg-green-600 px-3 py-2 text-xs font-medium text-white hover:bg-green-500 disabled:opacity-50">Approve</button>}{canReview && <button onClick={() => onAction("request_changes")} disabled={Boolean(busy)} className="rounded-lg border border-amber-500/30 px-3 py-2 text-xs font-medium text-amber-300 hover:bg-amber-500/10 disabled:opacity-50">Request changes</button>}{canReturn && <button onClick={() => onAction("return_to_draft")} disabled={Boolean(busy)} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-50">Return draft</button>}</div>{!canSubmit && !canReview && !canReturn && <p className="mt-3 rounded-lg bg-black/20 p-3 text-xs text-zinc-500">No approval action available for your role or current status.</p>}<details className="mt-3"><summary className="cursor-pointer text-xs font-medium text-zinc-400">Review history ({history.length})</summary><div className="mt-2 max-h-40 space-y-2 overflow-auto">{history.map(item => <div key={item.id} className="rounded-lg bg-black/20 p-2"><p className="text-[10px] uppercase text-blue-400">{item.action.replace("_", " ")}</p>{item.comment && <p className="mt-1 text-xs text-zinc-400">{item.comment}</p>}<p className="mt-1 text-[10px] text-zinc-600">{new Date(item.created_at).toLocaleString()}</p></div>)}{history.length === 0 && <p className="text-xs text-zinc-600">No review actions yet.</p>}</div></details></div>
}
function ReviewQueue({ items, onOpen }: { items: { section: SectionKey; text: string }[]; onOpen: (section: SectionKey) => void }) { return <div className="rounded-xl border border-zinc-800 bg-zinc-900/45 p-4"><div className="flex justify-between"><p className="text-sm font-medium text-zinc-200">Review queue</p><span className={`rounded-full px-2 py-0.5 text-[10px] ${items.length ? "bg-amber-500/10 text-amber-400" : "bg-green-500/10 text-green-400"}`}>{items.length}</span></div><div className="mt-3 max-h-60 space-y-2 overflow-auto">{items.slice(0, 12).map((item, index) => <button key={`${item.section}-${index}`} onClick={() => onOpen(item.section)} className="w-full rounded-lg border border-amber-500/10 bg-amber-500/5 p-2.5 text-left"><span className="block text-[10px] font-medium uppercase text-amber-500/70">{sectionInfo.find(section => section.key === item.section)?.short}</span><span className="mt-1 block text-xs leading-relaxed text-zinc-400">{item.text}</span></button>)}{items.length === 0 && <p className="rounded-lg bg-green-500/5 p-3 text-xs leading-relaxed text-green-400/80">No unresolved review markers in the current draft.</p>}</div></div> }
function VersionHistory({ versions, current, onLoad }: { versions: ProposalVersion[]; current: number; onLoad: (version: ProposalVersion) => void }) { return <details className="rounded-xl border border-zinc-800 bg-zinc-900/45 p-4"><summary className="cursor-pointer text-sm font-medium text-zinc-300">Version history <span className="ml-1 text-xs text-zinc-600">({versions.length})</span></summary><div className="mt-3 max-h-56 space-y-2 overflow-auto">{versions.map(version => <button key={version.id} onClick={() => onLoad(version)} disabled={version.version === current} className="flex w-full items-center justify-between rounded-lg bg-black/20 px-3 py-2 text-left disabled:opacity-50"><span className="text-xs text-zinc-300">Version {version.version}</span><span className="text-[10px] text-zinc-600">{version.created_at ? new Date(version.created_at).toLocaleDateString() : "Saved draft"}</span></button>)}{versions.length === 0 && <p className="text-xs text-zinc-600">Save the draft to create version history.</p>}</div></details> }
