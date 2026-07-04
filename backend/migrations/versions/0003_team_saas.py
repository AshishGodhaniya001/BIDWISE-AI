"""Add organization tenancy, roles, reviews, reminders and tender chat."""

from datetime import datetime, timezone
import re

from alembic import op
import sqlalchemy as sa


revision = "0003_team_saas"
down_revision = "0002_bid_decision_engine"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    required = {"organizations", "memberships", "organization_invitations", "proposal_review_comments", "reminders", "tender_chat_messages"}
    user_columns = {c["name"] for c in inspector.get_columns("users")}
    if required.issubset(tables) and "active_organization_id" in user_columns:
        return

    if "organizations" not in tables:
        op.create_table("organizations",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("name", sa.String(200), nullable=False),
            sa.Column("slug", sa.String(200), nullable=False, unique=True),
            sa.Column("plan", sa.String(30), nullable=False, server_default="starter"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
    if "memberships" not in tables:
        op.create_table("memberships",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("role", sa.String(30), nullable=False, server_default="employee"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint("organization_id", "user_id", name="uq_membership_org_user"),
        )
    if "organization_invitations" not in tables:
        op.create_table("organization_invitations",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
            sa.Column("email", sa.String(320), nullable=False), sa.Column("role", sa.String(30), nullable=False),
            sa.Column("token", sa.String(128), nullable=False, unique=True),
            sa.Column("invited_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
    if "proposal_review_comments" not in tables:
        op.create_table("proposal_review_comments",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("proposal_id", sa.Integer(), sa.ForeignKey("proposals.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("action", sa.String(30), nullable=False), sa.Column("comment", sa.Text(), nullable=False, server_default=""),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
    if "reminders" not in tables:
        op.create_table("reminders",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
            sa.Column("tender_id", sa.Integer(), sa.ForeignKey("tenders.id", ondelete="CASCADE"), nullable=False),
            sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("recipient_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("remind_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("reminder_type", sa.String(40), nullable=False, server_default="deadline"),
            sa.Column("status", sa.String(30), nullable=False, server_default="scheduled"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
    if "tender_chat_messages" not in tables:
        op.create_table("tender_chat_messages",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
            sa.Column("tender_id", sa.Integer(), sa.ForeignKey("tenders.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("question", sa.Text(), nullable=False), sa.Column("answer", sa.Text(), nullable=False),
            sa.Column("citations", sa.Text(), nullable=False, server_default="[]"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )

    additions = {
        "users": [sa.Column("active_organization_id", sa.Integer(), nullable=True)],
        "tenders": [sa.Column("organization_id", sa.Integer(), nullable=True)],
        "knowledge_items": [sa.Column("organization_id", sa.Integer(), nullable=True)],
        "notifications": [sa.Column("organization_id", sa.Integer(), nullable=True)],
        "activities": [sa.Column("organization_id", sa.Integer(), nullable=True)],
        "proposals": [
            sa.Column("approval_status", sa.String(30), nullable=False, server_default="draft"),
            sa.Column("submitted_by", sa.Integer(), nullable=True), sa.Column("reviewed_by", sa.Integer(), nullable=True),
            sa.Column("review_comment", sa.Text(), nullable=False, server_default=""),
            sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True), sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        ],
    }
    for table, columns in additions.items():
        existing = {c["name"] for c in sa.inspect(bind).get_columns(table)}
        for column in columns:
            if column.name not in existing:
                op.add_column(table, column)

    now = datetime.now(timezone.utc)
    users = bind.execute(sa.text("SELECT id, name, company, email FROM users")).mappings().all()
    for user in users:
        base = user["company"] or f"{user['name']}'s Company"
        slug = re.sub(r"[^a-z0-9]+", "-", base.lower()).strip("-") or f"company-{user['id']}"
        slug = f"{slug}-{user['id']}"
        result = bind.execute(sa.text("INSERT INTO organizations (name, slug, plan, created_at) VALUES (:n,:s,'starter',:c) RETURNING id"), {"n": base, "s": slug, "c": now})
        row = result.fetchone()
        org_id = row[0] if row else None
        bind.execute(sa.text("INSERT INTO memberships (organization_id,user_id,role,created_at) VALUES (:o,:u,'admin',:c)"), {"o": org_id, "u": user["id"], "c": now})
        bind.execute(sa.text("UPDATE users SET active_organization_id=:o WHERE id=:u"), {"o": org_id, "u": user["id"]})
        for table in ("tenders", "knowledge_items", "notifications", "activities"):
            bind.execute(sa.text(f"UPDATE {table} SET organization_id=:o WHERE user_id=:u AND organization_id IS NULL"), {"o": org_id, "u": user["id"]})


def downgrade() -> None:
    for table, columns in {"proposals": ["reviewed_at","submitted_at","review_comment","reviewed_by","submitted_by","approval_status"], "activities":["organization_id"], "notifications":["organization_id"], "knowledge_items":["organization_id"], "tenders":["organization_id"], "users":["active_organization_id"]}.items():
        for column in columns:
            with op.batch_alter_table(table) as batch:
                batch.drop_column(column)
    for table in ("tender_chat_messages","reminders","proposal_review_comments","organization_invitations","memberships","organizations"):
        op.drop_table(table)
