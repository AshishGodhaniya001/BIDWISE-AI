from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class RegisterSchema(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        return value.strip()


class LoginSchema(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)


class ProfileUpdateSchema(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    company: str | None = Field(default=None, max_length=200)
    phone: str | None = Field(default=None, max_length=40)
    capabilities: str | None = Field(default=None, max_length=10_000)
    certifications: str | None = Field(default=None, max_length=5_000)
    years_experience: int | None = Field(default=None, ge=0, le=200)
    annual_turnover: Decimal | None = Field(default=None, ge=0)


class UserProfileSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    email: str
    company: str
    phone: str
    capabilities: str
    certifications: str
    years_experience: int | None
    annual_turnover: Decimal | None
    created_at: datetime
    active_organization_id: int | None = None
    organization_name: str = ""
    role: str = "employee"


class OrganizationResponse(BaseModel):
    id: int
    name: str
    slug: str
    plan: str
    role: str
    member_count: int = 0


class OrganizationCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        return " ".join(value.strip().split())


class InvitationCreate(BaseModel):
    email: EmailStr
    role: Literal["admin", "bid_manager", "reviewer", "employee"]


class InvitationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    role: str
    token: str
    expires_at: datetime
    accepted_at: datetime | None


class InvitationPreview(BaseModel):
    email: str
    role: str
    organization_name: str
    expires_at: datetime


class MembershipResponse(BaseModel):
    id: int
    user_id: int
    name: str
    email: str
    role: str


class SourceReference(BaseModel):
    field: str
    page: int | None = None
    quote: str


class TenderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    tender_name: str = ""
    department: str = ""
    deadline: str = ""
    deadline_date: date | None = None
    budget: str = ""
    budget_amount: Decimal | None = None
    currency: str = "INR"
    eligibility_criteria: str = ""
    required_documents: str = ""
    summary: str = ""
    risk_analysis: str = ""
    bid_success_score: int | None = None
    eligibility_score: int | None = None
    technical_fit_score: int | None = None
    financial_fit_score: int | None = None
    documentation_score: int | None = None
    timeline_score: int | None = None
    recommendation: str = "REVIEW"
    recommendation_reasons: str = "[]"
    estimated_effort_hours: float | None = None
    cost_estimation: str = ""
    source_references: str = "[]"
    analysis_confidence: float | None = None
    analysis_error: str = ""
    status: str
    is_favorite: bool = False
    filename: str
    created_at: datetime | None = None
    updated_at: datetime | None = None


class TenderListResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    filename: str = ""
    tender_name: str = ""
    department: str = ""
    deadline: str = ""
    deadline_date: date | None = None
    budget: str = ""
    budget_amount: Decimal | None = None
    currency: str = "INR"
    status: str
    analysis_error: str = ""
    bid_success_score: int | None = None
    is_favorite: bool = False
    created_at: datetime | None = None


class ProposalUpdateSchema(BaseModel):
    technical_proposal: str = Field(max_length=100_000)
    cover_letter: str = Field(max_length=30_000)
    executive_summary: str = Field(max_length=30_000)
    scope_of_work: str = Field(max_length=100_000)


class ProposalResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    tender_id: int
    technical_proposal: str = ""
    cover_letter: str = ""
    executive_summary: str = ""
    scope_of_work: str = ""
    status: str
    error: str = ""
    version: int = 1
    created_at: datetime | None = None
    updated_at: datetime | None = None
    approval_status: str = "draft"
    submitted_by: int | None = None
    reviewed_by: int | None = None
    review_comment: str = ""
    submitted_at: datetime | None = None
    reviewed_at: datetime | None = None


class ProposalReviewRequest(BaseModel):
    action: Literal["submit", "approve", "request_changes", "return_to_draft"]
    comment: str = Field(default="", max_length=10_000)


class ProposalReviewCommentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int
    action: str
    comment: str
    created_at: datetime


class ProposalVersionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    version: int
    technical_proposal: str
    cover_letter: str
    executive_summary: str
    scope_of_work: str
    created_at: datetime


KnowledgeCategory = Literal["certificate", "project", "cv", "product", "past_proposal", "capability", "financial", "other"]


class KnowledgeItemCreate(BaseModel):
    category: KnowledgeCategory
    title: str = Field(min_length=2, max_length=300)
    content: str = Field(min_length=3, max_length=100_000)
    reference: str = Field(default="", max_length=1000)
    expires_on: date | None = None
    is_verified: bool = False


class KnowledgeItemResponse(KnowledgeItemCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime
    updated_at: datetime


class ComplianceRequirementResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    tender_id: int
    requirement: str
    category: str
    is_mandatory: bool
    source_page: int | None
    source_quote: str
    company_match: str
    company_evidence: str
    missing_proof: str
    responsible_employee: str
    status: str
    notes: str


class ComplianceRequirementUpdate(BaseModel):
    responsible_employee: str | None = Field(default=None, max_length=200)
    status: Literal["not_started", "in_progress", "ready", "blocked", "not_applicable"] | None = None
    notes: str | None = Field(default=None, max_length=10_000)
    company_match: Literal["match", "partial", "gap", "unknown"] | None = None
    company_evidence: str | None = Field(default=None, max_length=20_000)
    missing_proof: str | None = Field(default=None, max_length=20_000)


class AddendumResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    tender_id: int
    filename: str
    summary: str
    changes: str
    status: str
    created_at: datetime


class TenderChatRequest(BaseModel):
    question: str = Field(min_length=3, max_length=2000)


class TenderChatResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    question: str
    answer: str
    citations: str
    created_at: datetime


class DecisionSummary(BaseModel):
    overall_score: int | None
    scores: dict[str, int | None]
    recommendation: str
    reasons: list[str]
    estimated_effort_hours: float | None
    compliance_total: int
    compliance_ready: int
    compliance_blocked: int
    proposal_coverage: float


class CompetitorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    estimated_winning_amount: str = ""
    win_probability: float = 0.0
    evidence: str = ""
    is_ai_estimate: bool = True


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    subject: str
    body: str = ""
    status: str
    error: str = ""
    email_sent: bool = False
    created_at: datetime | None = None


class ReminderCreate(BaseModel):
    tender_id: int
    recipient_user_id: int | None = None
    remind_at: datetime
    reminder_type: Literal["deadline", "clarification", "document", "review"] = "deadline"


class ReminderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    tender_id: int
    recipient_user_id: int
    remind_at: datetime
    reminder_type: str
    status: str
    created_at: datetime


class DashboardResponse(BaseModel):
    total_tenders: int = 0
    active_bids: int = 0
    avg_success_score: float | None = None
    total_revenue_opportunity: str = "N/A"
    upcoming_deadlines: list[TenderListResponse] = Field(default_factory=list)
    recent_tenders: list[TenderListResponse] = Field(default_factory=list)
    blocked_requirements: int = 0
    pending_approvals: int = 0
    team_members: int = 0


class AnalyzeResponse(BaseModel):
    tender: TenderResponse
    competitors: list[CompetitorResponse] = Field(default_factory=list)


class ForgotPasswordSchema(BaseModel):
    email: EmailStr


class ResetPasswordSchema(BaseModel):
    token: str
    password: str = Field(min_length=10, max_length=128)


class SendEmailSchema(BaseModel):
    tender_id: int
    notification_type: Literal["deadline_reminder", "missing_document", "proposal_ready"]


class ActivityResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    tender_id: int | None = None
    action: str
    details: str = ""
    created_at: datetime | None = None
