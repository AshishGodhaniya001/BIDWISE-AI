"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useState } from "react"
import { api } from "../../_lib/api"
import { errorMessage } from "../../_lib/types"

export default function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (password !== confirm) {
      setError("Passwords do not match")
      return
    }
    if (password.length < 10) {
      setError("Password must be at least 10 characters")
      return
    }
    setLoading(true)
    try {
      await api.auth.resetPassword({ token, password })
      setDone(true)
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
          <h1 className="mt-4 text-2xl font-bold text-white">Set new password</h1>
          <p className="mt-1 text-sm text-zinc-400">Choose a strong password for your account</p>
        </div>

        {done ? (
          <div className="glass rounded-xl p-6 space-y-4 animate-slide-up">
            <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
              Password reset successfully. You can now sign in with your new password.
            </div>
            <Link href="/login"
              className="block w-full text-center py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition-colors shadow-lg shadow-blue-600/20">
              Sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="glass rounded-xl p-6 space-y-4 animate-slide-up">
            {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">New password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Min. 10 characters"
                className="w-full px-3 py-2.5 rounded-lg bg-zinc-800/50 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 text-sm transition-all" />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">Confirm password</label>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required placeholder="Repeat your password"
                className="w-full px-3 py-2.5 rounded-lg bg-zinc-800/50 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 text-sm transition-all" />
            </div>

            <button type="submit" disabled={loading}
              className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-600/20">
              {loading ? "Resetting..." : "Reset password"}
            </button>

            <p className="text-center text-sm text-zinc-500">
              <Link href="/login" className="text-blue-400 hover:text-blue-300">Back to sign in</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
