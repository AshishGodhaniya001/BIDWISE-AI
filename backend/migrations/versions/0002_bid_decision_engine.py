"""Add explainable decision engine, vault, compliance, and addenda."""

from alembic import op
import sqlalchemy as sa


revision = "0002_bid_decision_engine"
down_revision = "0001_production_foundation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    tender_columns = {
        "eligibility_score": sa.Column("eligibility_score", sa.Integer(), nullable=True),
        "technical_fit_score": sa.Column("technical_fit_score", sa.Integer(), nullable=True),
        "financial_fit_score": sa.Column("financial_fit_score", sa.Integer(), nullable=True),
        "documentation_score": sa.Column("documentation_score", sa.Integer(), nullable=True),
        "timeline_score": sa.Column("timeline_score", sa.Integer(), nullable=True),
        "recommendation": sa.Column("recommendation", sa.String(20), nullable=False, server_default="REVIEW"),
        "recommendation_reasons": sa.Column("recommendation_reasons", sa.Text(), nullable=False, server_default="[]"),
        "estimated_effort_hours": sa.Column("estimated_effort_hours", sa.Float(), nullable=True),
    }
    inspector = sa.inspect(op.get_bind())
    existing = {column["name"] for column in inspector.get_columns("tenders")}
    for name, column in tender_columns.items():
        if name not in existing:
            op.add_column("tenders", column)

    # The foundational migration bootstraps a fresh database from current metadata.
    # In that path these tables already exist; upgrades from an older deployment create them below.
    new_tables = {"knowledge_items", "compliance_requirements", "tender_addenda", "proposal_versions", "ai_analysis_cache"}
    if new_tables.issubset(set(inspector.get_table_names())):
        return

    op.create_table("knowledge_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("category", sa.String(40), nullable=False, index=True),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("reference", sa.String(1000), nullable=False, server_default=""),
        sa.Column("expires_on", sa.Date(), nullable=True),
        sa.Column("is_verified", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table("compliance_requirements",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tender_id", sa.Integer(), sa.ForeignKey("tenders.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("requirement", sa.Text(), nullable=False),
        sa.Column("category", sa.String(40), nullable=False, server_default="technical", index=True),
        sa.Column("is_mandatory", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("source_page", sa.Integer(), nullable=True),
        sa.Column("source_quote", sa.Text(), nullable=False, server_default=""),
        sa.Column("company_match", sa.String(20), nullable=False, server_default="unknown"),
        sa.Column("company_evidence", sa.Text(), nullable=False, server_default=""),
        sa.Column("missing_proof", sa.Text(), nullable=False, server_default=""),
        sa.Column("responsible_employee", sa.String(200), nullable=False, server_default=""),
        sa.Column("status", sa.String(30), nullable=False, server_default="not_started", index=True),
        sa.Column("notes", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table("tender_addenda",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tender_id", sa.Integer(), sa.ForeignKey("tenders.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("filepath", sa.String(1024), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False, server_default=""),
        sa.Column("changes", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("status", sa.String(30), nullable=False, server_default="analyzed"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table("proposal_versions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("proposal_id", sa.Integer(), sa.ForeignKey("proposals.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("technical_proposal", sa.Text(), nullable=False, server_default=""),
        sa.Column("cover_letter", sa.Text(), nullable=False, server_default=""),
        sa.Column("executive_summary", sa.Text(), nullable=False, server_default=""),
        sa.Column("scope_of_work", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table("ai_analysis_cache",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("content_hash", sa.String(64), nullable=False, unique=True, index=True),
        sa.Column("operation", sa.String(40), nullable=False),
        sa.Column("model", sa.String(120), nullable=False),
        sa.Column("response_json", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    for table in ["ai_analysis_cache", "proposal_versions", "tender_addenda", "compliance_requirements", "knowledge_items"]:
        op.drop_table(table)
    for column in ["estimated_effort_hours", "recommendation_reasons", "recommendation", "timeline_score", "documentation_score", "financial_fit_score", "technical_fit_score", "eligibility_score"]:
        op.drop_column("tenders", column)
