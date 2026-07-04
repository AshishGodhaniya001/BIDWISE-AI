"use client"

import { useEffect, useMemo, useState } from "react"
import { useAuth } from "../../_lib/AuthContext"
import { api } from "../../_lib/api"
import { errorMessage, type Invitation, type Membership, type Organization } from "../../_lib/types"

const roleDetails: Record<Membership["role"], { title: string; purpose: string; permissions: string[] }> = {
  admin: {
    title: "Admin",
    purpose: "Has full control over the workspace, including managing team members, changing roles, and handling billing. Typically the company owner or a senior manager.",
    permissions: ["Manage workspace", "Invite any role", "Change roles", "Remove members", "Full bid access"],
  },
  bid_manager: {
    title: "Bid Manager",
    purpose: "Responsible for the entire bid lifecycle, from analyzing tenders to preparing and submitting proposals. Can invite other team members to collaborate.",
    permissions: ["Upload tenders", "Manage evidence", "Generate proposals", "Invite reviewers/employees"],
  },
  reviewer: {
    title: "Reviewer",
    purpose: "Focuses on quality assurance. Reviews proposals for accuracy, completeness, and compliance before they are submitted. Can approve or request changes.",
    permissions: ["Review proposals", "Approve or request changes", "Ask tender questions"],
  },
  employee: {
    title: "Employee",
    purpose: "A team member who contributes to specific parts of the bid, such as filling in compliance details or providing technical information. Has limited access to the platform.",
    permissions: ["View tenders", "Answer assigned gaps", "Use tender assistant"],
  },
}

const allRoles = Object.keys(roleDetails) as Membership["role"][]
const bidManagerInviteRoles: Membership["role"][] = ["reviewer", "employee"]

export default function TeamPage() {
  const { user, refreshUser } = useAuth()
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [members, setMembers] = useState<Membership[]>([])
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<Membership["role"]>("reviewer")
  const [orgName, setOrgName] = useState("")
  const [invite, setInvite] = useState<Invitation | null>(null)
  const [copied, setCopied] = useState(false)
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(true)

  const isAuthorized = !!(user && (user.role === "admin" || user.role === "bid_manager"))
  const canInvite = isAuthorized
  const canManageRoles = user?.role === "admin"
  const inviteRoles = useMemo(() => user?.role === "admin" ? allRoles : bidManagerInviteRoles, [user?.role])

  useEffect(() => {
    if (!isAuthorized) {
      return
    }
    let cancelled = false
    Promise.all([api.organizations.list(), api.organizations.members()])
      .then(([orgs, team]) => {
        if (cancelled) return
        setOrganizations(orgs)
        setMembers(team)
      })
      .catch(error => { if (!cancelled) setMessage(errorMessage(error)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [user, isAuthorized])

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
  if (!user || (user.role !== "admin" && user.role !== "bid_manager")) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 py-12 text-center animate-fade-in">
        <h1 className="text-3xl font-bold text-white">Access Denied</h1>
        <p className="text-zinc-400">You must be an Admin or Bid Manager to access this page.</p>
      </div>
    )
  }


  const activeRole = inviteRoles.includes(role) ? role : inviteRoles[0] || "employee"
  const selectedRole = roleDetails[activeRole]
  const link = invite ? inviteUrl(invite.token) : ""

  async function load() {
    try {
      const [orgs, team] = await Promise.all([api.organizations.list(), api.organizations.members()])
      setOrganizations(orgs)
      setMembers(team)
    } catch (error) {
      setMessage(errorMessage(error))
    }
  }



  async function switchOrg(id: number) {
    try {
      await api.organizations.switch(id)
      await refreshUser()
      await load()
      setMessage("Workspace switched.")
    } catch (error) {
      setMessage(errorMessage(error))
    }
  }

  async function createOrg() {
    if (!orgName.trim()) return
    try {
      await api.organizations.create({ name: orgName.trim() })
      setOrgName("")
      await refreshUser()
      await load()
      setMessage("New company workspace created. You are the admin.")
    } catch (error) {
      setMessage(errorMessage(error))
    }
  }

  async function sendInvite() {
    if (!email.trim()) return
    try {
      const created = await api.organizations.invite({ email, role: activeRole })
      setInvite(created)
      setCopied(false)
      setEmail("")
      setMessage(`Invite ready for ${created.email} as ${roleDetails[created.role].title}. Share the invite link below.`)
    } catch (error) {
      setMessage(errorMessage(error))
    }
  }
  
  async function copyLink() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  async function updateRole(member: Membership, nextRole: Membership["role"]) {
    try {
      const updated = await api.organizations.updateRole(member.id, nextRole)
      setMembers(items => items.map(item => item.id === updated.id ? updated : item))
      setMessage("Role updated.")
    } catch (error) {
      setMessage(errorMessage(error))
    }
  }

  async function removeMember(member: Membership) {
    try {
      await api.organizations.removeMember(member.id)
      setMembers(items => items.filter(item => item.id !== member.id))
      setMessage("Member removed from this workspace.")
    } catch (error) {
      setMessage(errorMessage(error))
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-in">
      <header className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-blue-400">SaaS workspace</p>
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Team, roles & companies</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
              Declare exactly what a teammate can do before sending the invite link.
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-black/20 px-4 py-3">
            <p className="text-xs text-zinc-500">Current workspace</p>
            <p className="font-medium text-white">{user?.organization_name || "Personal workspace"}</p>
            <p className="text-xs capitalize text-blue-400">{user?.role?.replace("_", " ")}</p>
          </div>
        </div>
      </header>

      {message && <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-3 text-sm text-blue-300">{message}</div>}

      <section className="grid gap-4 lg:grid-cols-[1fr_.95fr]">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/45 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-200">Members</h2>
            <span className="rounded-full bg-zinc-800 px-2.5 py-1 text-xs text-zinc-400">{members.length} total</span>
          </div>
          <div className="mt-4 divide-y divide-zinc-800">
            {members.map(member => (
              <div key={member.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-white">{member.name}</p>
                  <p className="text-xs text-zinc-500">{member.email}</p>
                </div>
                {canManageRoles ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <select value={member.role} onChange={event => void updateRole(member, event.target.value as Membership["role"])} className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200">
                      {allRoles.map(item => <option key={item} value={item}>{roleDetails[item].title}</option>)}
                    </select>
                    <button onClick={() => void removeMember(member)} className="rounded-lg border border-red-500/20 px-2.5 py-2 text-xs text-red-300 hover:bg-red-500/10">Remove</button>
                  </div>
                ) : (
                  <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-300">{roleDetails[member.role].title}</span>
                )}
              </div>
            ))}
            {members.length === 0 && <p className="py-8 text-sm text-zinc-500">No team members found.</p>}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/45 p-5">
            <h2 className="text-sm font-semibold text-zinc-200">Invite teammate</h2>
            <p className="mt-1 text-xs text-zinc-500">Enter the teammate email, then declare the role they will receive.</p>
            <div className="mt-4 space-y-4">
              <input value={email} onChange={event => setEmail(event.target.value)} disabled={!canInvite} placeholder="teammate@company.com" className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-blue-500 disabled:opacity-50" />

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-[.14em] text-zinc-500">Role to assign</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {inviteRoles.map(item => (
                    <button key={item} type="button" disabled={!canInvite} onClick={() => setRole(item)} className={`rounded-lg border p-3 text-left transition-colors disabled:opacity-50 ${activeRole === item ? "border-blue-500/50 bg-blue-500/10" : "border-zinc-800 bg-black/20 hover:bg-zinc-800/60"}`}>
                      <span className="block text-sm font-semibold text-white">{roleDetails[item].title}</span>
                      <span className="mt-1 block text-xs leading-5 text-zinc-500">{roleDetails[item].purpose}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-3">
                <p className="text-xs uppercase tracking-[.14em] text-blue-300/70">Selected role</p>
                <p className="mt-1 text-base font-semibold text-blue-100">{selectedRole.title}</p>
                <p className="mt-1 text-xs leading-5 text-blue-200/70">
                  {email.trim() || "This teammate"} will join this workspace as {selectedRole.title} after accepting the invite link.
                </p>
              </div>

              <div className="rounded-lg border border-zinc-800 bg-black/20 p-3">
                <p className="text-xs font-medium text-zinc-300">This role can:</p>
                <ul className="mt-2 space-y-1">
                  {selectedRole.permissions.map(item => <li key={item} className="text-xs text-zinc-500">- {item}</li>)}
                </ul>
              </div>

              <button onClick={() => void sendInvite()} disabled={!canInvite || !email.trim()} className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50">
                Create invite link for {selectedRole.title}
              </button>
            </div>

            {invite && (
              <div className="mt-4 rounded-lg border border-green-500/20 bg-green-500/10 p-3">
                <p className="text-sm font-medium text-green-300">Invite link ready</p>
                <p className="mt-1 text-xs text-green-300/80">Send this link to {invite.email}. They must sign in or register with this same email.</p>
                <div className="mt-3 flex gap-2">
                  <input readOnly value={link} className="min-w-0 flex-1 rounded-lg border border-green-500/20 bg-black/30 px-3 py-2 text-xs text-green-100" />
                  <button onClick={() => void copyLink()} className="rounded-lg bg-green-600 px-3 py-2 text-xs font-medium text-white hover:bg-green-500">{copied ? "Copied" : "Copy"}</button>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/45 p-5">
            <h2 className="text-sm font-semibold text-zinc-200">Company workspaces</h2>
            <p className="mt-1 text-xs text-zinc-500">Create another company/account when you manage bids for multiple legal entities.</p>
            <div className="mt-4 flex gap-2">
              <input value={orgName} onChange={event => setOrgName(event.target.value)} placeholder="New company name" className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-blue-500" />
              <button onClick={() => void createOrg()} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800">Create</button>
            </div>
            <div className="mt-3 space-y-2">
              {organizations.map(org => (
                <button key={org.id} onClick={() => void switchOrg(org.id)} className={`flex w-full items-center justify-between rounded-lg border px-3 py-3 text-left ${org.id === user?.active_organization_id ? "border-blue-500/40 bg-blue-500/10" : "border-zinc-800 bg-black/20 hover:bg-zinc-800/50"}`}>
                  <span>
                    <span className="block text-sm font-medium text-white">{org.name}</span>
                    <span className="text-xs text-zinc-500">{org.member_count} member(s) | {org.plan}</span>
                  </span>
                  <span className="text-xs text-zinc-400">{roleDetails[org.role].title}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function inviteUrl(token: string) {
  if (typeof window === "undefined") return `/invite/${token}`
  return `${window.location.origin}/invite/${token}`
}
