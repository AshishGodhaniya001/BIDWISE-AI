"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { AuthProvider, useAuth } from "../_lib/AuthContext"
import { errorMessage } from "../_lib/types"

function RegisterForm() {
  const { register } = useAuth()
  const router = useRouter()
  const [form, setForm] = useState(() => {
    const params = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search)
    return { name: "", email: params.get("email") || "", password: "" }
  })
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (form.password.length < 10) { setError("Password must be at least 10 characters"); return }
    setLoading(true)
    try {
      await register(form.name, form.email, form.password)
      const nextPath = new URLSearchParams(window.location.search).get("next") || "/dashboard"
      router.push(nextPath)
    } catch (err: unknown) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <img src="/bidwise-icon.svg" alt="BidWise AI" className="h-10 w-10" />
          </Link>
          <h1 className="mt-4 text-2xl font-bold text-white">Create account</h1>
          <p className="mt-1 text-sm text-zinc-400">Start with BidWise AI free trial</p>
        </div>

        <form onSubmit={handleSubmit} className="glass rounded-xl p-6 space-y-4 animate-slide-up">
          {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Full Name</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="John Doe"
              className="w-full px-3 py-2.5 rounded-lg bg-zinc-800/50 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm transition-all" />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required placeholder="you@company.com"
              className="w-full px-3 py-2.5 rounded-lg bg-zinc-800/50 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm transition-all" />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Password</label>
            <input type="password" minLength={10} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required placeholder="Min. 10 characters"
              className="w-full px-3 py-2.5 rounded-lg bg-zinc-800/50 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm transition-all" />
          </div>

          <button type="submit" disabled={loading}
            className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-600/20">
            {loading ? "Creating account..." : "Create account"}
          </button>

          <p className="text-center text-sm text-zinc-500">
            Already have an account?{" "}
            <Link href="/login" className="text-blue-400 hover:text-blue-300">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  )
}

export default function RegisterPage() {
  return <AuthProvider><RegisterForm /></AuthProvider>
}
