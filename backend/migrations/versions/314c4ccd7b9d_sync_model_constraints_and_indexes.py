"""Add missing indexes and align FKs with current models.

This migration syncs the database schema produced by earlier migrations
with the current model definitions. Operations are idempotent (use
IF NOT EXISTS where supported, ignore duplicates elsewhere).

Revision ID: 314c4ccd7b9d
Revises: 0003_team_saas
Create Date: 2026-07-05 03:16:33.591004
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "314c4ccd7b9d"
down_revision: Union[str, Sequence[str], None] = "0003_team_saas"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _index_exists(name: str) -> bool:
    conn = op.get_bind()
    result = conn.execute(
        sa.text("SELECT name FROM sqlite_master WHERE type='index' AND name=:n"),
        {"n": name},
    )
    return result.scalar() is not None


def upgrade() -> None:
    indexes: list[tuple[str, str | list[str], bool]] = [
        ("activities", "ix_activities_organization_id", ["organization_id"]),
        ("activities", "ix_activities_tender_id", ["tender_id"]),
        ("activities", "ix_activities_user_id", ["user_id"]),
        ("ai_analysis_cache", "ix_ai_analysis_cache_created_at", ["created_at"]),
        ("competitors", "ix_competitors_tender_id", ["tender_id"]),
        ("knowledge_items", "ix_knowledge_items_organization_id", ["organization_id"]),
        ("memberships", "ix_memberships_organization_id", ["organization_id"]),
        ("memberships", "ix_memberships_role", ["role"]),
        ("memberships", "ix_memberships_user_id", ["user_id"]),
        ("notifications", "ix_notifications_organization_id", ["organization_id"]),
        ("notifications", "ix_notifications_tender_id", ["tender_id"]),
        ("notifications", "ix_notifications_user_id", ["user_id"]),
        ("organization_invitations", "ix_organization_invitations_email", ["email"]),
        ("organization_invitations", "ix_organization_invitations_invited_by", ["invited_by"]),
        ("organization_invitations", "ix_organization_invitations_organization_id", ["organization_id"]),
        ("organization_invitations", "ix_organization_invitations_token", ["token"]),
        ("proposals", "ix_proposals_approval_status", ["approval_status"]),
        ("proposals", "ix_proposals_reviewed_by", ["reviewed_by"]),
        ("proposals", "ix_proposals_submitted_by", ["submitted_by"]),
        ("proposals", "ix_proposals_tender_id", ["tender_id"]),
        ("proposals", "ix_proposals_user_id", ["user_id"]),
        ("reminders", "ix_reminders_created_by", ["created_by"]),
        ("reminders", "ix_reminders_organization_id", ["organization_id"]),
        ("reminders", "ix_reminders_recipient_user_id", ["recipient_user_id"]),
        ("reminders", "ix_reminders_remind_at", ["remind_at"]),
        ("reminders", "ix_reminders_status", ["status"]),
        ("reminders", "ix_reminders_tender_id", ["tender_id"]),
        ("tender_chat_messages", "ix_tender_chat_messages_organization_id", ["organization_id"]),
        ("tender_chat_messages", "ix_tender_chat_messages_tender_id", ["tender_id"]),
        ("tender_chat_messages", "ix_tender_chat_messages_user_id", ["user_id"]),
        ("tenders", "ix_tenders_deadline_date", ["deadline_date"]),
        ("tenders", "ix_tenders_organization_id", ["organization_id"]),
        ("tenders", "ix_tenders_status", ["status"]),
        ("tenders", "ix_tenders_user_id", ["user_id"]),
        ("users", "ix_users_active_organization_id", ["active_organization_id"]),
    ]
    for table, name, columns in indexes:
        if not _index_exists(name):
            op.create_index(name, table, columns)

    # Add FK on users.active_organization_id for databases created by early migrations
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    fks = {fk["constrained_columns"][0] for fk in inspector.get_foreign_keys("users") if fk["constrained_columns"]}
    if "active_organization_id" not in fks:
        with op.batch_alter_table("users") as batch_op:
            batch_op.create_foreign_key(None, "organizations", ["active_organization_id"], ["id"], ondelete="SET NULL")


def downgrade() -> None:
    pass
