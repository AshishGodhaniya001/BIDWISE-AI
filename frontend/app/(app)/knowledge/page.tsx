"use client"

import { useEffect, useState } from "react"
import { api } from "../../_lib/api"
import { errorMessage, type KnowledgeItem, type KnowledgeItemInput } from "../../_lib/types"

const empty: KnowledgeItemInput = { category: "certificate", title: "", content: "", reference: "", expires_on: null, is_verified: false }
const categories = ["certificate", "project", "cv", "product", "past_proposal", "capability", "financial", "other"] as const

export default function KnowledgeVaultPage() {
  const [items, setItems] = useState<KnowledgeItem[]>([])
  const [form, setForm] = useState<KnowledgeItemInput>(empty)
  const [editing, setEditing] = useState<number | null>(null)
  const [message, setMessage] = useState("")
  const load = () => api.knowledge.list().then(setItems).catch(error => setMessage(errorMessage(error)))
  useEffect(() => { void load() }, [])

  async function save(event: React.FormEvent) {
    event.preventDefault(); setMessage("")
    try {
      if (editing) await api.knowledge.update(editing, form); else await api.knowledge.create(form)
      setForm(empty); setEditing(null); await load(); setMessage("Vault updated. Tender decisions were recalculated.")
    } catch (error) { setMessage(errorMessage(error)) }
  }
  function edit(item: KnowledgeItem) {
    setEditing(item.id); setForm({ category: item.category, title: item.title, content: item.content, reference: item.reference, expires_on: item.expires_on, is_verified: item.is_verified })
  }

  return <div className="space-y-6 max-w-6xl animate-fade-in">
    <div><h1 className="text-2xl font-bold text-white">Company Knowledge Vault</h1><p className="text-sm text-zinc-400 mt-1">The only source AI may use for company claims. Mark evidence verified only after human review.</p></div>
    {message && <div className="p-3 rounded-lg border border-blue-500/20 bg-blue-500/10 text-blue-300 text-sm">{message}</div>}
    <div className="grid lg:grid-cols-[360px_1fr] gap-5">
      <form onSubmit={save} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-3 h-fit">
        <h2 className="font-semibold text-white">{editing ? "Edit evidence" : "Add verified evidence"}</h2>
        <select value={form.category} onChange={e => setForm({...form, category: e.target.value as KnowledgeItemInput["category"]})} className="input w-full">{categories.map(value => <option key={value} value={value}>{value.replace("_", " ")}</option>)}</select>
        <input required placeholder="Title" value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="input w-full" />
        <textarea required rows={7} placeholder="Facts, credentials, project outcomes, skills…" value={form.content} onChange={e => setForm({...form, content: e.target.value})} className="input w-full" />
        <input placeholder="Document / URL reference" value={form.reference} onChange={e => setForm({...form, reference: e.target.value})} className="input w-full" />
        <input type="date" value={form.expires_on || ""} onChange={e => setForm({...form, expires_on: e.target.value || null})} className="input w-full" />
        <label className="flex gap-2 text-sm text-zinc-300"><input type="checkbox" checked={form.is_verified} onChange={e => setForm({...form, is_verified: e.target.checked})} /> Human verified</label>
        <div className="flex gap-2"><button className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm">Save</button>{editing && <button type="button" onClick={() => {setEditing(null); setForm(empty)}} className="px-4 py-2 rounded-lg border border-zinc-700 text-zinc-300 text-sm">Cancel</button>}</div>
      </form>
      <div className="grid sm:grid-cols-2 gap-3 content-start">{items.map(item => <article key={item.id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="flex justify-between gap-3"><div><span className="text-[10px] uppercase tracking-wide text-blue-400">{item.category.replace("_", " ")}</span><h3 className="font-medium text-white">{item.title}</h3></div><span className={item.is_verified ? "text-green-400 text-xs" : "text-amber-400 text-xs"}>{item.is_verified ? "Verified" : "Unverified"}</span></div>
        <p className="text-sm text-zinc-400 mt-2 line-clamp-4 whitespace-pre-line">{item.content}</p>
        <div className="flex gap-3 mt-3"><button onClick={() => edit(item)} className="text-xs text-blue-400">Edit</button><button onClick={() => void api.knowledge.delete(item.id).then(load)} className="text-xs text-red-400">Delete</button></div>
      </article>)}{items.length === 0 && <p className="text-zinc-500 text-sm">Add certificates, completed projects, CVs, products, financial records, and past proposals.</p>}</div>
    </div>
  </div>
}
