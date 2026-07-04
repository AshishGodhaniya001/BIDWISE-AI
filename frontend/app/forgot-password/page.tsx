"use client"

import Link from "next/link"
import { useState } from "react"
import { api } from "../_lib/api"
import { errorMessage } from "../_lib/types"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState("")
  const [link, setLink] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const res = await api.auth.forgotPassword({ email })
      setMessage(res.message)
      if (res.reset_link) setLink(res.reset_link)
      setSent(true)
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
          <h1 className="mt-4 text-2xl font-bold text-white">Reset your password</h1>
          <p className="mt-1 text-sm text-zinc-400">Enter your email and we&apos;ll send you a reset link</p>
        </div>

        {sent ? (
          <div className="glass rounded-xl p-6 space-y-4 animate-slide-up">
            <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
              {message}
            </div>
            {link && (
              <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700 text-xs text-zinc-400 break-all">
                <p className="text-zinc-500 mb-1">Dev mode — reset link:</p>
                <a href={link} className="text-blue-400 hover:text-blue-300 underline">{link}</a>
              </div>
            )}
            <Link href="/login"
              className="block w-full text-center py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-sm transition-colors">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="glass rounded-xl p-6 space-y-4 animate-slide-up">
            {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@company.com"
                className="w-full px-3 py-2.5 rounded-lg bg-zinc-800/50 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 text-sm transition-all" />
            </div>

            <button type="submit" disabled={loading}
              className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-600/20">
              {loading ? "Sending..." : "Send reset link"}
            </button>

            <p className="text-center text-sm text-zinc-500">
              Remember your password?{" "}
              <Link href="/login" className="text-blue-400 hover:text-blue-300">Sign in</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
