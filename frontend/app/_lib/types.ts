export interface UserProfile {
  id: number
  name: string
  email: string
  company: string
  phone: string
  capabilities: string
  certifications: string
  years_experience: number | null
  annual_turnover: string | null
  created_at: string
  active_organization_id: number | null
  organization_name: string
  role: "admin" | "bid_manager" | "reviewer" | "employee"
}

export interface ProfileUpdate {
  name?: string
  company?: string
  phone?: string
  capabilities?: string
  certifications?: string
  years_experience?: number | null
  annual_turnover?: string | null
}

export interface TenderSummary {
  id: number
  filename: string
  tender_name: string
  department: string
  deadline: string
  deadline_date: string | null
  budget: string
  budget_amount: string | null
  currency: string
  status: string
  analysis_error: string
  bid_success_score: number | null
  is_favorite: boolean
  created_at: string | null
}

export interface Tender extends TenderSummary {
  eligibility_criteria: string
  required_documents: string
  summary: string
  risk_analysis: string
  cost_estimation: string
  source_references: string
  analysis_confidence: number | null
  filename: string
  updated_at: string | null
  eligibility_score: number | null
  technical_fit_score: number | null
  financial_fit_score: number | null
  documentation_score: number | null
  timeline_score: number | null
  recommendation: "GO" | "NO_GO" | "REVIEW"
  recommendation_reasons: string
  estimated_effort_hours: number | null
}

export interface SourceReference {
  field: string
  page: number | null
  quote: string
}

export interface Competitor {
  id: number
  name: string
  estimated_winning_amount: string
  win_probability: number
  evidence: string
  is_ai_estimate: boolean
}

export interface TenderDetail {
  tender: Tender
  competitors: Competitor[]
}

export interface Proposal {
  id: number
  tender_id: number
  technical_proposal: string
  cover_letter: string
  executive_summary: string
  scope_of_work: string
  status: string
  error: string
  version: number
  created_at: string | null
  updated_at: string | null
  approval_status: "draft" | "in_review" | "approved" | "changes_requested"
  submitted_by: number | null
  reviewed_by: number | null
  review_comment: string
  submitted_at: string | null
  reviewed_at: string | null
}

export interface ProposalVersion {
  id: number
  version: number
  technical_proposal: string
  cover_letter: string
  executive_summary: string
  scope_of_work: string
  created_at: string | null
}

export type ProposalUpdate = Pick<Proposal, "technical_proposal" | "cover_letter" | "executive_summary" | "scope_of_work">

export interface DashboardStats {
  total_tenders: number
  active_bids: number
  avg_success_score: number | null
  total_revenue_opportunity: string
  upcoming_deadlines: TenderSummary[]
  recent_tenders: TenderSummary[]
  blocked_requirements: number
  pending_approvals: number
  team_members: number
}

export interface Activity {
  id: number
  tender_id: number | null
  action: string
  details: string
  created_at: string | null
}

export interface Notification {
  id: number
  subject: string
  body: string
  status: string
  error: string
  email_sent: boolean
  created_at: string | null
}

export interface KnowledgeItem {
  id: number
  category: "certificate" | "project" | "cv" | "product" | "past_proposal" | "capability" | "financial" | "other"
  title: string
  content: string
  reference: string
  expires_on: string | null
  is_verified: boolean
  created_at: string
  updated_at: string
}

export type KnowledgeItemInput = Omit<KnowledgeItem, "id" | "created_at" | "updated_at">

export interface ComplianceRequirement {
  id: number
  tender_id: number
  requirement: string
  category: string
  is_mandatory: boolean
  source_page: number | null
  source_quote: string
  company_match: "match" | "partial" | "gap" | "unknown"
  company_evidence: string
  missing_proof: string
  responsible_employee: string
  status: "not_started" | "in_progress" | "ready" | "blocked" | "not_applicable"
  notes: string
}

export interface DecisionSummary {
  overall_score: number | null
  scores: Record<string, number | null>
  recommendation: "GO" | "NO_GO" | "REVIEW"
  reasons: string[]
  estimated_effort_hours: number | null
  compliance_total: number
  compliance_ready: number
  compliance_blocked: number
  proposal_coverage: number
}

export interface Addendum {
  id: number
  tender_id: number
  filename: string
  summary: string
  changes: string
  status: string
  created_at: string
}

export interface Organization {
  id: number
  name: string
  slug: string
  plan: string
  role: UserProfile["role"]
  member_count: number
}

export interface Membership {
  id: number
  user_id: number
  name: string
  email: string
  role: UserProfile["role"]
}

export interface Invitation {
  id: number
  email: string
  role: UserProfile["role"]
  token: string
  expires_at: string
  accepted_at: string | null
}

export interface InvitationPreview {
  email: string
  role: UserProfile["role"]
  organization_name: string
  expires_at: string
}

export interface Reminder {
  id: number
  tender_id: number
  recipient_user_id: number
  remind_at: string
  reminder_type: "deadline" | "clarification" | "document" | "review"
  status: string
  created_at: string
}

export interface TenderChatMessage {
  id: number
  question: string
  answer: string
  citations: string
  created_at: string
}

export interface ProposalReviewComment {
  id: number
  user_id: number
  action: "submit" | "approve" | "request_changes" | "return_to_draft"
  comment: string
  created_at: string
}

export interface ForgotPasswordResponse {
  message: string
  reset_link?: string
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong"
}

export function displayScore(score: number | null): string {
  return score === null ? "Needs profile" : `${score}%`
}

export function scoreColor(score: number | null): string {
  if (score === null) return "text-zinc-500"
  if (score >= 70) return "text-green-400"
  if (score >= 40) return "text-amber-400"
  return "text-red-400"
}
