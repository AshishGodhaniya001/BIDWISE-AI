"use client"

import { useState } from "react"
import { api } from "../../_lib/api"
import { useAuth } from "../../_lib/AuthContext"
import { errorMessage } from "../../_lib/types"


export default function ProfilePage() {
  const { user, refreshUser } = useAuth()
  const [form, setForm] = useState({
    name: user?.name || "",
    company: user?.company || "",
    phone: user?.phone || "",
    capabilities: user?.capabilities || "",
    certifications: user?.certifications || "",
    years_experience: user?.years_experience?.toString() || "",
    annual_turnover: user?.annual_turnover || "",
  })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setMessage("")
    try {
      await api.auth.updateProfile({
        ...form,
        years_experience: form.years_experience ? Number(form.years_experience) : null,
        annual_turnover: form.annual_turnover || null,
      })
      await refreshUser()
      setMessage("Profile saved. Future bid scores will use these capabilities.")
    } catch (error: unknown) {
      setMessage(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const initials = user?.name?.split(" ").map(name => name[0]).join("").toUpperCase().slice(0, 2) || "U"

  return (
    <div className="max-w-2xl mx-auto mt-4 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">Company Profile</h1>
        <p className="text-sm text-zinc-400 mt-1">Used to assess eligibility and create grounded proposal drafts</p>
      </div>

      <div className="flex items-center gap-4 p-5 rounded-xl border border-zinc-800 bg-zinc-900/50">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white font-bold text-lg">{initials}</div>
        <div><p className="text-lg font-semibold text-white">{user?.name}</p><p className="text-sm text-zinc-400">{user?.email}</p></div>
      </div>

      <form onSubmit={handleSubmit} className="glass rounded-xl p-6 space-y-4">
        {message && <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 text-sm">{message}</div>}
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Full name" value={form.name} onChange={value => setForm({ ...form, name: value })} />
          <Field label="Company" value={form.company} onChange={value => setForm({ ...form, company: value })} />
          <Field label="Phone" value={form.phone} onChange={value => setForm({ ...form, phone: value })} type="tel" />
          <Field label="Years of experience" value={form.years_experience} onChange={value => setForm({ ...form, years_experience: value })} type="number" />
          <Field label="Annual turnover (INR)" value={form.annual_turnover} onChange={value => setForm({ ...form, annual_turnover: value })} type="number" />
        </div>
        <TextArea label="Capabilities and past project experience" value={form.capabilities} onChange={value => setForm({ ...form, capabilities: value })} />
        <TextArea label="Certifications and registrations" value={form.certifications} onChange={value => setForm({ ...form, certifications: value })} />
        <button type="submit" disabled={saving} className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm disabled:opacity-50">
          {saving ? "Saving..." : "Save Company Profile"}
        </button>
      </form>
    </div>
  )
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="block text-sm font-medium text-zinc-300">{label}<input type={type} min={type === "number" ? 0 : undefined} value={value} onChange={event => onChange(event.target.value)} className="mt-1.5 w-full px-3 py-2.5 rounded-lg bg-zinc-800/50 border border-zinc-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50" /></label>
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block text-sm font-medium text-zinc-300">{label}<textarea rows={4} value={value} onChange={event => onChange(event.target.value)} className="mt-1.5 w-full px-3 py-2.5 rounded-lg bg-zinc-800/50 border border-zinc-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50" /></label>
}
