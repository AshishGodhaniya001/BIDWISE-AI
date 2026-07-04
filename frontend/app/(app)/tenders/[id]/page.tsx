"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { useEffect, useState } from "react"
import DecisionWorkbench from "../../../_components/DecisionWorkbench"
import { api } from "../../../_lib/api"
import { displayScore, errorMessage, type Membership, type SourceReference, type TenderChatMessage, type TenderDetail } from "../../../_lib/types"

const ACTIVE_STATUSES = new Set(["queued", "extracting", "analyzing"])

export default function TenderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const tenderId = Number(id)
  const [data, setData] = useState<TenderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [action, setAction] = useState("")

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      try {
        const result = await api.tenders.get(tenderId)
        if (cancelled) return
        setData(result)
        setError("")
        if (ACTIVE_STATUSES.has(result.tender.status)) timer = setTimeout(poll, 2000)
      } catch (caught: unknown) {
        if (!cancelled) setError(errorMessage(caught))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void poll()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [tenderId])

  async function retryAnalysis() {
    setAction("Queuing a fresh analysis…")
    try {
      await api.tenders.analyze(tenderId)
      setData(await api.tenders.get(tenderId))
      setAction("Analysis queued. Progress will update automatically.")
    } catch (caught: unknown) {
      setAction(errorMessage(caught))
    }
  }

  async function sendAlert(type: "deadline_reminder" | "missing_document") {
    setAction("Queuing notification…")
    try {
      await api.notifications.send({ tender_id: tenderId, notification_type: type })
      setAction("Notification queued. Delivery status is available under Alerts.")
    } catch (caught: unknown) {
      setAction(errorMessage(caught))
    }
  }

  async function downloadMatrix() {
    setAction("Preparing download...");
    try {
      await api.tenders.downloadComplianceMatrix(tenderId);
      setAction("Download started.");
    } catch (caught: unknown) {
      setAction(errorMessage(caught));
    }
  }

  if (loading) return <Loading />
  if (error) return <div className="mx-auto mt-16 max-w-lg rounded-xl border border-red-500/20 bg-red-500/10 p-5 text-center text-red-300">Failed to load tender: {error}</div>
  if (!data) return <div className="mt-16 text-center text-zinc-500">Tender not found</div>

  const { tender } = data
  const sources = parseSources(tender.source_references)
  const isActive = ACTIVE_STATUSES.has(tender.status)

  return (
    <div className="mx-auto max-w-7xl space-y-6 animate-fade-in">
      <header className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900/90 to-zinc-950 p-5 shadow-xl shadow-black/10 sm:p-7">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
          <div className="min-w-0">
            <Link href="/tenders" className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-blue-400">← All tenders</Link>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${tender.status === "analyzed" ? "bg-green-500/10 text-green-400" : "bg-blue-500/10 text-blue-400"}`}>{friendlyStatus(tender.status)}</span>
              {tender.is_favorite && <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-400">Priority</span>}
              <span className="rounded-full bg-zinc-800 px-2.5 py-1 text-[11px] text-zinc-400">{tender.currency || "INR"}</span>
            </div>
            <h1 className="mt-3 max-w-4xl text-2xl font-bold tracking-tight text-white sm:text-3xl">{tender.tender_name || "Untitled tender"}</h1>
            <p className="mt-2 text-sm text-zinc-400">{tender.department || tender.filename}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => void downloadMatrix()} className="rounded-lg border border-zinc-700 px-3.5 py-2.5 text-sm text-zinc-300 hover:border-zinc-600 hover:bg-zinc-800">Download Matrix</button>
            <button onClick={() => void sendAlert("deadline_reminder")} className="rounded-lg border border-zinc-700 px-3.5 py-2.5 text-sm text-zinc-300 hover:border-zinc-600 hover:bg-zinc-800">Quick alert</button>
            <Link href={`/proposals/${tender.id}`} className={`rounded-lg px-4 py-2.5 text-sm font-medium text-white ${tender.status === "analyzed" ? "bg-blue-600 hover:bg-blue-500" : "pointer-events-none bg-zinc-700 opacity-60"}`}>Open proposal workspace</Link>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 divide-x divide-zinc-800 rounded-xl border border-zinc-800 bg-black/15 lg:grid-cols-4">
          <Metric label="Submission deadline" value={tender.deadline || "Not found"} />
          <Metric label="Estimated value" value={tender.budget || "Not found"} />
          <Metric label="Decision score" value={displayScore(tender.bid_success_score)} />
          <Metric label="Preparation effort" value={tender.estimated_effort_hours === null ? "Pending evidence" : `${tender.estimated_effort_hours} hours`} />
        </div>
      </header>

      {isActive && <Notice tone="blue" text={`Analysis is ${friendlyStatus(tender.status).toLowerCase()}. This page updates automatically.`} />}
      {tender.analysis_error && <Notice tone="red" text={tender.analysis_error} action="Retry analysis" onAction={() => void retryAnalysis()} />}
      {action && <Notice tone="blue" text={action} />}

      <section className="grid gap-4 lg:grid-cols-[1.25fr_.75fr]">
        <BriefCard title="Executive summary" text={tender.summary} empty="Analysis has not produced a summary yet." />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <BriefCard title="Primary risks" text={tender.risk_analysis} empty="No risks identified." compact />
          <BriefCard title="Cost perspective" text={tender.cost_estimation} empty="No cost estimate available." compact />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <DecisionWorkbench tenderId={tender.id} analyzed={tender.status === "analyzed"} sources={sources} />
        <div className="space-y-4">
          <AssistantPanel tenderId={tender.id} disabled={tender.status !== "analyzed"} />
          <ReminderPanel tenderId={tender.id} deadline={tender.deadline_date} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <BriefCard title="Eligibility criteria" text={tender.eligibility_criteria} empty="No eligibility criteria extracted." />
        <BriefCard title="Required documents" text={tender.required_documents} empty="No required documents extracted." />
      </section>

      <div className="flex flex-col justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/30 px-4 py-3 sm:flex-row sm:items-center">
        <p className="text-xs leading-relaxed text-zinc-600">AI output is a review aid, not legal or procurement advice. Verify every requirement against the source tender.</p>
        <button onClick={() => void sendAlert("missing_document")} className="whitespace-nowrap text-xs font-medium text-blue-400 hover:text-blue-300">Send missing-document alert</button>
      </div>
    </div>
  )
}

function AssistantPanel({ tenderId, disabled }: { tenderId: number; disabled: boolean }) {
  const [messages, setMessages] = useState<TenderChatMessage[]>([])
  const [question, setQuestion] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    api.chat.history(tenderId).then(setMessages).catch(() => undefined)
  }, [tenderId])

  async function ask() {
    if (!question.trim()) return
    setBusy(true)
    setError("")
    try {
      const answer = await api.chat.ask(tenderId, question.trim())
      setMessages(items => [...items, answer])
      setQuestion("")
    } catch (caught: unknown) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside className="rounded-xl border border-zinc-800 bg-zinc-900/45 p-4">
      <h2 className="text-sm font-semibold text-zinc-200">Tender AI assistant</h2>
      <p className="mt-1 text-xs text-zinc-500">Ask questions grounded in the uploaded PDF. Answers include page references when found.</p>
      <div className="mt-4 max-h-72 space-y-3 overflow-auto pr-1">
        {messages.map(message => <ChatBubble key={message.id} message={message} />)}
        {messages.length === 0 && <p className="rounded-lg border border-dashed border-zinc-800 p-4 text-xs text-zinc-600">Try: “What are mandatory certificates?” or “What is the submission deadline?”</p>}
      </div>
      <div className="mt-3 flex gap-2">
        <input value={question} onChange={event => setQuestion(event.target.value)} disabled={disabled || busy} onKeyDown={event => { if (event.key === "Enter") void ask() }} placeholder={disabled ? "Analyze tender first" : "Ask about this tender…"} className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-blue-500 disabled:opacity-50" />
        <button onClick={() => void ask()} disabled={disabled || busy} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50">{busy ? "…" : "Ask"}</button>
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </aside>
  )
}

function ChatBubble({ message }: { message: TenderChatMessage }) {
  const citations = parseCitations(message.citations)
  return <div className="rounded-lg bg-black/20 p-3"><p className="text-xs font-medium text-blue-300">Q: {message.question}</p><p className="mt-2 whitespace-pre-line text-sm leading-6 text-zinc-300">{message.answer}</p>{citations.length > 0 && <p className="mt-2 text-[11px] text-zinc-500">Pages: {citations.map(item => item.page).filter(Boolean).join(", ")}</p>}</div>
}

function ReminderPanel({ tenderId, deadline }: { tenderId: number; deadline: string | null }) {
  const [members, setMembers] = useState<Membership[]>([])
  const [recipient, setRecipient] = useState<number | "">("")
  const [type, setType] = useState<"deadline" | "clarification" | "document" | "review">("deadline")
  const [date, setDate] = useState(defaultReminderDate(deadline))
  const [message, setMessage] = useState("")

  useEffect(() => {
    api.organizations.members().then(items => {
      setMembers(items)
      if (items[0]) setRecipient(items[0].user_id)
    }).catch(() => undefined)
  }, [])

  async function create() {
    try {
      await api.reminders.create({ tender_id: tenderId, recipient_user_id: recipient === "" ? null : recipient, remind_at: new Date(date).toISOString(), reminder_type: type })
      setMessage("Reminder scheduled. If SMTP is unavailable, BidWise will create an in-app alert.")
    } catch (caught: unknown) {
      setMessage(errorMessage(caught))
    }
  }

  return (
    <aside className="rounded-xl border border-zinc-800 bg-zinc-900/45 p-4">
      <h2 className="text-sm font-semibold text-zinc-200">Deadline reminders</h2>
      <div className="mt-4 space-y-3">
        <select value={recipient} onChange={event => setRecipient(Number(event.target.value))} className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white">
          {members.map(member => <option key={member.id} value={member.user_id}>{member.name} · {member.role.replace("_", " ")}</option>)}
        </select>
        <select value={type} onChange={event => setType(event.target.value as typeof type)} className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white">
          <option value="deadline">Deadline</option>
          <option value="document">Missing document</option>
          <option value="review">Proposal review</option>
          <option value="clarification">Clarification</option>
        </select>
        <input type="datetime-local" value={date} onChange={event => setDate(event.target.value)} className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white" />
        <button onClick={() => void create()} className="w-full rounded-lg border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800">Schedule reminder</button>
      </div>
      {message && <p className="mt-3 text-xs text-blue-300">{message}</p>}
    </aside>
  )
}

function parseSources(value: string): SourceReference[] { try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) ? parsed as SourceReference[] : [] } catch { return [] } }
function parseCitations(value: string): Array<{ page?: number; text?: string }> { try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) ? parsed as Array<{ page?: number; text?: string }> : [] } catch { return [] } }
function friendlyStatus(value: string) { return value.replaceAll("_", " ").replace(/^./, letter => letter.toUpperCase()) }
function Loading() { return <div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" /></div> }
function Metric({ label, value }: { label: string; value: string }) { return <div className="min-w-0 p-3 sm:p-4"><p className="text-[11px] text-zinc-600">{label}</p><p className="mt-1 truncate text-sm font-semibold text-zinc-100 sm:text-base" title={value}>{value}</p></div> }
function BriefCard({ title, text, empty, compact = false }: { title: string; text: string; empty: string; compact?: boolean }) { return <article className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5"><h2 className="text-sm font-semibold text-zinc-200">{title}</h2><p className={`mt-3 whitespace-pre-line text-sm leading-6 text-zinc-400 ${compact ? "line-clamp-5" : ""}`}>{text || empty}</p></article> }
function Notice({ text, tone, action, onAction }: { text: string; tone: "blue" | "red"; action?: string; onAction?: () => void }) { const style = tone === "red" ? "border-red-500/20 bg-red-500/10 text-red-300" : "border-blue-500/20 bg-blue-500/10 text-blue-300"; return <div className={`flex items-center justify-between gap-3 rounded-lg border p-3 text-sm ${style}`}><span>{text}</span>{action && <button onClick={onAction} className="whitespace-nowrap font-medium underline">{action}</button>}</div> }
function defaultReminderDate(deadline: string | null) {
  const date = deadline ? new Date(`${deadline}T09:00:00`) : new Date(Date.now() + 24 * 60 * 60 * 1000)
  if (Number.isNaN(date.getTime())) date.setTime(Date.now() + 24 * 60 * 60 * 1000)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
