import type {
  Activity,
  DashboardStats,
  ForgotPasswordResponse,
  Notification,
  ProfileUpdate,
  Proposal,
  ProposalUpdate,
  ProposalVersion,
  Tender,
  TenderDetail,
  TenderSummary,
  UserProfile,
  KnowledgeItem,
  KnowledgeItemInput,
  ComplianceRequirement,
  DecisionSummary,
  Addendum,
  Invitation,
  InvitationPreview,
  Membership,
  Organization,
  ProposalReviewComment,
  Reminder,
  TenderChatMessage,
} from "./types"


const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/v1"

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json")
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "include",
  })
  if (response.status === 401 && typeof window !== "undefined" && !path.startsWith("/auth/")) {
    window.location.assign("/login")
  }
  if (!response.ok) {
    const body: { detail?: string } = await response.json().catch(() => ({}))
    throw new Error(body.detail || response.statusText || "Request failed")
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

async function download(path: string, filename: string) {
  const response = await fetch(`${API_BASE}${path}`, { credentials: "include" });
  if (!response.ok) {
    const body: { detail?: string } = await response.json().catch(() => ({}));
    throw new Error(body.detail || response.statusText || "Request failed");
  }
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  a.remove();
}

async function uploadFile(file: File): Promise<Tender> {
  const formData = new FormData()
  formData.append("file", file)
  return request<Tender>("/tenders/upload", { method: "POST", body: formData })
}

async function uploadAddendum(tenderId: number, file: File): Promise<Addendum> {
  const formData = new FormData()
  formData.append("file", file)
  return request<Addendum>(`/tenders/${tenderId}/addenda`, { method: "POST", body: formData })
}

export const api = {
  auth: {
    register: (data: { name: string; email: string; password: string }) =>
      request<{ message: string; user_id: number }>("/auth/register", { method: "POST", body: JSON.stringify(data) }),
    login: (data: { email: string; password: string }) =>
      request<{ message: string }>("/auth/login", { method: "POST", body: JSON.stringify(data) }),
    logout: () => request<void>("/auth/logout", { method: "POST" }),
    profile: () => request<UserProfile>("/auth/profile"),
    updateProfile: (data: ProfileUpdate) =>
      request<UserProfile>("/auth/profile", { method: "PUT", body: JSON.stringify(data) }),
    forgotPassword: (data: { email: string }) =>
      request<ForgotPasswordResponse>("/auth/forgot-password", { method: "POST", body: JSON.stringify(data) }),
    resetPassword: (data: { token: string; password: string }) =>
      request<{ message: string }>("/auth/reset-password", { method: "POST", body: JSON.stringify(data) }),
  },
  tenders: {
    list: () => request<TenderSummary[]>("/tenders"),
    get: (id: number) => request<TenderDetail>(`/tenders/${id}`),
    delete: (id: number) => request<void>(`/tenders/${id}`, { method: "DELETE" }),
    upload: uploadFile,
    analyze: (id: number) => request<Tender>(`/tenders/${id}/analyze`, { method: "POST" }),
    toggleFavorite: (id: number) => request<Tender>(`/tenders/${id}/favorite`, { method: "POST" }),
    compliance: (id: number) => request<ComplianceRequirement[]>(`/tenders/${id}/compliance`),
    updateCompliance: (id: number, requirementId: number, data: Partial<ComplianceRequirement>) => request<ComplianceRequirement>(`/tenders/${id}/compliance/${requirementId}`, { method: "PUT", body: JSON.stringify(data) }),
    decision: (id: number) => request<DecisionSummary>(`/tenders/${id}/decision`),
    addenda: (id: number) => request<Addendum[]>(`/tenders/${id}/addenda`),
    uploadAddendum,
    downloadComplianceMatrix: (id: number) => download(`/tenders/${id}/compliance-matrix`, `compliance-matrix-${id}.csv`),
  },
  proposals: {
    get: (tenderId: number) => request<{ exists: boolean; proposal: Proposal | null }>(`/proposals/${tenderId}`),
    generate: (tenderId: number) => request<Proposal>(`/proposals/generate/${tenderId}`, { method: "POST" }),
    update: (tenderId: number, data: ProposalUpdate) =>
      request<Proposal>(`/proposals/${tenderId}`, { method: "PUT", body: JSON.stringify(data) }),
    versions: (tenderId: number) => request<ProposalVersion[]>(`/proposals/${tenderId}/versions`),
    review: (tenderId: number, data: { action: ProposalReviewComment["action"]; comment?: string }) =>
      request<Proposal>(`/proposals/${tenderId}/review`, { method: "POST", body: JSON.stringify(data) }),
    reviews: (tenderId: number) => request<ProposalReviewComment[]>(`/proposals/${tenderId}/reviews`),
  },
  organizations: {
    list: () => request<Organization[]>("/organizations"),
    create: (data: { name: string }) => request<Organization>("/organizations", { method: "POST", body: JSON.stringify(data) }),
    switch: (organizationId: number) => request<void>(`/organizations/${organizationId}/switch`, { method: "POST" }),
    members: () => request<Membership[]>("/organizations/members"),
    invite: (data: { email: string; role: Membership["role"] }) =>
      request<Invitation>("/organizations/invitations", { method: "POST", body: JSON.stringify(data) }),
    invitation: (token: string) => request<InvitationPreview>(`/organizations/invitations/${token}`),
    accept: (token: string) => request<void>(`/organizations/invitations/${token}/accept`, { method: "POST" }),
    updateRole: (membershipId: number, role: Membership["role"]) =>
      request<Membership>(`/organizations/members/${membershipId}/${role}`, { method: "PUT" }),
    removeMember: (membershipId: number) => request<void>(`/organizations/members/${membershipId}`, { method: "DELETE" }),
  },
  notifications: {
    list: () => request<Notification[]>("/notifications"),
    send: (data: { tender_id: number; notification_type: "deadline_reminder" | "missing_document" | "proposal_ready" }) =>
      request<Notification>("/notifications/send", { method: "POST", body: JSON.stringify(data) }),
  },
  dashboard: { stats: () => request<DashboardStats>("/dashboard") },
  activities: { list: () => request<Activity[]>("/activities") },
  knowledge: {
    list: () => request<KnowledgeItem[]>("/knowledge"),
    create: (data: KnowledgeItemInput) => request<KnowledgeItem>("/knowledge", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: KnowledgeItemInput) => request<KnowledgeItem>(`/knowledge/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: number) => request<void>(`/knowledge/${id}`, { method: "DELETE" }),
  },
  reminders: {
    list: () => request<Reminder[]>("/reminders"),
    create: (data: { tender_id: number; recipient_user_id?: number | null; remind_at: string; reminder_type: Reminder["reminder_type"] }) =>
      request<Reminder>("/reminders", { method: "POST", body: JSON.stringify(data) }),
    delete: (id: number) => request<void>(`/reminders/${id}`, { method: "DELETE" }),
  },
  chat: {
    history: (tenderId: number) => request<TenderChatMessage[]>(`/tenders/${tenderId}/chat`),
    ask: (tenderId: number, question: string) =>
      request<TenderChatMessage>(`/tenders/${tenderId}/chat`, { method: "POST", body: JSON.stringify({ question }) }),
  },
}
