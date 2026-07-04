from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from database import Base


def _utcnow():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    email = Column(String(320), unique=True, index=True, nullable=False)
    password = Column(String(255), nullable=False)
    company = Column(String(200), default="", nullable=False)
    phone = Column(String(40), default="", nullable=False)
    capabilities = Column(Text, default="", nullable=False)
    certifications = Column(Text, default="", nullable=False)
    years_experience = Column(Integer, nullable=True)
    annual_turnover = Column(Numeric(18, 2), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    active_organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True, index=True)

    tenders = relationship("Tender", back_populates="user", cascade="all, delete-orphan")
    knowledge_items = relationship("KnowledgeItem", back_populates="user", cascade="all, delete-orphan")
    memberships = relationship("Membership", back_populates="user", cascade="all, delete-orphan", foreign_keys="Membership.user_id")


class Organization(Base):
    __tablename__ = "organizations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    slug = Column(String(200), unique=True, nullable=False, index=True)
    plan = Column(String(30), default="starter", nullable=False)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)

    memberships = relationship("Membership", back_populates="organization", cascade="all, delete-orphan")


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("organization_id", "user_id", name="uq_membership_org_user"),)

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(30), default="employee", nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)

    organization = relationship("Organization", back_populates="memberships")
    user = relationship("User", back_populates="memberships", foreign_keys=[user_id])


class OrganizationInvitation(Base):
    __tablename__ = "organization_invitations"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    email = Column(String(320), nullable=False, index=True)
    role = Column(String(30), default="employee", nullable=False)
    token = Column(String(128), unique=True, nullable=False, index=True)
    invited_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    accepted_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)


class Tender(Base):
    __tablename__ = "tenders"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True, index=True)
    filename = Column(String(255), nullable=False)
    filepath = Column(String(1024), nullable=False)

    tender_name = Column(String(500), default="", nullable=False)
    department = Column(String(500), default="", nullable=False)
    deadline = Column(String(120), default="", nullable=False)  # raw source value
    deadline_date = Column(Date, nullable=True, index=True)
    budget = Column(String(250), default="", nullable=False)  # raw source value
    budget_amount = Column(Numeric(18, 2), nullable=True)
    currency = Column(String(3), default="INR", nullable=False)
    eligibility_criteria = Column(Text, default="", nullable=False)
    required_documents = Column(Text, default="", nullable=False)
    summary = Column(Text, default="", nullable=False)
    risk_analysis = Column(Text, default="", nullable=False)
    bid_success_score = Column(Integer, nullable=True)
    eligibility_score = Column(Integer, nullable=True)
    technical_fit_score = Column(Integer, nullable=True)
    financial_fit_score = Column(Integer, nullable=True)
    documentation_score = Column(Integer, nullable=True)
    timeline_score = Column(Integer, nullable=True)
    recommendation = Column(String(20), default="REVIEW", nullable=False)
    recommendation_reasons = Column(Text, default="[]", nullable=False)
    estimated_effort_hours = Column(Float, nullable=True)
    cost_estimation = Column(Text, default="", nullable=False)
    source_references = Column(Text, default="[]", nullable=False)
    analysis_confidence = Column(Float, nullable=True)
    analysis_error = Column(Text, default="", nullable=False)

    status = Column(String(30), default="queued", nullable=False, index=True)
    is_favorite = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False)
    analysis_started_at = Column(DateTime(timezone=True), nullable=True)
    analysis_completed_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="tenders")
    proposals = relationship("Proposal", back_populates="tender", cascade="all, delete-orphan")
    competitors = relationship("Competitor", back_populates="tender", cascade="all, delete-orphan")
    requirements = relationship("ComplianceRequirement", back_populates="tender", cascade="all, delete-orphan")
    addenda = relationship("TenderAddendum", back_populates="tender", cascade="all, delete-orphan")


class Proposal(Base):
    __tablename__ = "proposals"

    id = Column(Integer, primary_key=True, index=True)
    tender_id = Column(Integer, ForeignKey("tenders.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    technical_proposal = Column(Text, default="", nullable=False)
    cover_letter = Column(Text, default="", nullable=False)
    executive_summary = Column(Text, default="", nullable=False)
    scope_of_work = Column(Text, default="", nullable=False)
    status = Column(String(30), default="draft", nullable=False)
    error = Column(Text, default="", nullable=False)
    version = Column(Integer, default=1, nullable=False)
    approval_status = Column(String(30), default="draft", nullable=False, index=True)
    submitted_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    reviewed_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    review_comment = Column(Text, default="", nullable=False)
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False)

    tender = relationship("Tender", back_populates="proposals")
    versions = relationship("ProposalVersion", back_populates="proposal", cascade="all, delete-orphan")


class ProposalVersion(Base):
    __tablename__ = "proposal_versions"

    id = Column(Integer, primary_key=True, index=True)
    proposal_id = Column(Integer, ForeignKey("proposals.id", ondelete="CASCADE"), nullable=False, index=True)
    version = Column(Integer, nullable=False)
    technical_proposal = Column(Text, default="", nullable=False)
    cover_letter = Column(Text, default="", nullable=False)
    executive_summary = Column(Text, default="", nullable=False)
    scope_of_work = Column(Text, default="", nullable=False)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)

    proposal = relationship("Proposal", back_populates="versions")


class KnowledgeItem(Base):
    __tablename__ = "knowledge_items"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True, index=True)
    category = Column(String(40), nullable=False, index=True)
    title = Column(String(300), nullable=False)
    content = Column(Text, nullable=False)
    reference = Column(String(1000), default="", nullable=False)
    expires_on = Column(Date, nullable=True)
    is_verified = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False)

    user = relationship("User", back_populates="knowledge_items")


class ComplianceRequirement(Base):
    __tablename__ = "compliance_requirements"

    id = Column(Integer, primary_key=True, index=True)
    tender_id = Column(Integer, ForeignKey("tenders.id", ondelete="CASCADE"), nullable=False, index=True)
    requirement = Column(Text, nullable=False)
    category = Column(String(40), default="technical", nullable=False, index=True)
    is_mandatory = Column(Boolean, default=True, nullable=False)
    source_page = Column(Integer, nullable=True)
    source_quote = Column(Text, default="", nullable=False)
    company_match = Column(String(20), default="unknown", nullable=False)
    company_evidence = Column(Text, default="", nullable=False)
    missing_proof = Column(Text, default="", nullable=False)
    responsible_employee = Column(String(200), default="", nullable=False)
    status = Column(String(30), default="not_started", nullable=False, index=True)
    notes = Column(Text, default="", nullable=False)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False)

    tender = relationship("Tender", back_populates="requirements")


class TenderAddendum(Base):
    __tablename__ = "tender_addenda"

    id = Column(Integer, primary_key=True, index=True)
    tender_id = Column(Integer, ForeignKey("tenders.id", ondelete="CASCADE"), nullable=False, index=True)
    filename = Column(String(255), nullable=False)
    filepath = Column(String(1024), nullable=False)
    summary = Column(Text, default="", nullable=False)
    changes = Column(Text, default="[]", nullable=False)
    status = Column(String(30), default="analyzed", nullable=False)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)

    tender = relationship("Tender", back_populates="addenda")


class AIAnalysisCache(Base):
    __tablename__ = "ai_analysis_cache"

    id = Column(Integer, primary_key=True, index=True)
    content_hash = Column(String(64), unique=True, nullable=False, index=True)
    operation = Column(String(40), nullable=False)
    model = Column(String(120), nullable=False)
    response_json = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False, index=True)

    @classmethod
    def evict_expired(cls, db_session, ttl_days: int = 30):
        from datetime import datetime, timezone, timedelta
        cutoff = datetime.now(timezone.utc) - timedelta(days=ttl_days)
        deleted = db_session.query(cls).filter(cls.created_at < cutoff).delete()
        db_session.commit()
        return deleted


class Competitor(Base):
    __tablename__ = "competitors"

    id = Column(Integer, primary_key=True, index=True)
    tender_id = Column(Integer, ForeignKey("tenders.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(300), nullable=False)
    estimated_winning_amount = Column(String(250), default="", nullable=False)
    win_probability = Column(Float, default=0.0, nullable=False)
    evidence = Column(Text, default="", nullable=False)
    is_ai_estimate = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)

    tender = relationship("Tender", back_populates="competitors")


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True, index=True)
    tender_id = Column(Integer, ForeignKey("tenders.id", ondelete="SET NULL"), nullable=True, index=True)
    subject = Column(String(500), nullable=False)
    body = Column(Text, default="", nullable=False)
    status = Column(String(30), default="queued", nullable=False)
    error = Column(Text, default="", nullable=False)
    email_sent = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)


class Activity(Base):
    __tablename__ = "activities"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True, index=True)
    tender_id = Column(Integer, ForeignKey("tenders.id", ondelete="SET NULL"), nullable=True, index=True)
    action = Column(String(80), nullable=False)
    details = Column(Text, default="", nullable=False)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)


class ProposalReviewComment(Base):
    __tablename__ = "proposal_review_comments"

    id = Column(Integer, primary_key=True, index=True)
    proposal_id = Column(Integer, ForeignKey("proposals.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    action = Column(String(30), nullable=False)
    comment = Column(Text, default="", nullable=False)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)


class Reminder(Base):
    __tablename__ = "reminders"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    tender_id = Column(Integer, ForeignKey("tenders.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    recipient_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    remind_at = Column(DateTime(timezone=True), nullable=False, index=True)
    reminder_type = Column(String(40), default="deadline", nullable=False)
    status = Column(String(30), default="scheduled", nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)


class TenderChatMessage(Base):
    __tablename__ = "tender_chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    tender_id = Column(Integer, ForeignKey("tenders.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=False)
    citations = Column(Text, default="[]", nullable=False)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
