"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { AuthProvider, useAuth } from "../../_lib/AuthContext"
import { api } from "../../_lib/api"
import { errorMessage, type InvitationPreview } from "../../_lib/types"

function InviteAcceptPageInner() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()
  const { user, loading, refreshUser } = useAuth()
  const [invite, setInvite] = useState<InvitationPreview | null>(null)
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.organizations.invitation(token)
      .then(setInvite)
      .catch(error => setMessage(errorMessage(error)))
  }, [token])

  async function accept() {
    setBusy(true)
    setMessage("")
    try {
      await api.organizations.accept(token)
      await refreshUser()
      router.push("/team")
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const next = encodeURIComponent(`/invite/${token}`)

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 shadow-xl shadow-black/20">
        <div className="mx-auto flex h-12 w-12 items-center justify-center">
          <img src="/bidwise-icon.svg" alt="BidWise AI" className="h-12 w-12" />
        </div>
        <div className="mt-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-blue-400">Workspace invitation</p>
          <h1 className="mt-2 text-2xl font-bold text-white">Join a BidWise team</h1>
        </div>

        {message && <div className="mt-5 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">{message}</div>}

        {invite ? (
          <div className="mt-5 rounded-xl border border-zinc-800 bg-black/20 p-4">
            <p className="text-sm text-zinc-400">You have been invited to</p>
            <p className="mt-1 text-lg font-semibold text-white">{invite.organization_name}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Info label="Invited email" value={invite.email} />
              <Info label="Role" value={invite.role.replace("_", " ")} />
            </div>
            <p className="mt-4 text-xs text-zinc-500">Expires {new Date(invite.expires_at).toLocaleString()}.</p>
          </div>
        ) : !message ? (
          <div className="mt-8 flex justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" /></div>
        ) : null}

        {!loading && invite && !user && (
          <div className="mt-5 rounded-lg border border-blue-500/20 bg-blue-500/10 p-4 text-sm text-blue-200">
            Sign in or create an account using <span className="font-semibold">{invite.email}</span>, then return here to accept.
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Link href={`/login?next=${next}`} className="rounded-lg bg-blue-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-blue-500">Sign in</Link>
              <Link href={`/register?next=${next}&email=${encodeURIComponent(invite.email)}`} className="rounded-lg border border-blue-500/30 px-4 py-2 text-center text-sm font-medium text-blue-200 hover:bg-blue-500/10">Create account</Link>
            </div>
          </div>
        )}

        {!loading && invite && user && (
          <div className="mt-5">
            {user.email.toLowerCase() !== invite.email.toLowerCase() ? (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-200">
                You are signed in as {user.email}. This invitation is for {invite.email}. Please sign out and use the invited email.
              </div>
            ) : (
              <button onClick={() => void accept()} disabled={busy} className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50">
                {busy ? "Joining…" : `Accept invitation as ${invite.role.replace("_", " ")}`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-zinc-950/70 p-3"><p className="text-[11px] uppercase tracking-[.12em] text-zinc-600">{label}</p><p className="mt-1 capitalize text-sm font-medium text-zinc-200">{value}</p></div>
}

export default function InviteAcceptPage() {
  return <AuthProvider><InviteAcceptPageInner /></AuthProvider>
}
