"""Adopt legacy schema and add the production foundation."""

from alembic import op
import sqlalchemy as sa


revision = "0001_production_foundation"
down_revision = None
branch_labels = None
depends_on = None


ADDITIONS = {
    "users": [
        sa.Column("capabilities", sa.Text(), nullable=False, server_default=""),
        sa.Column("certifications", sa.Text(), nullable=False, server_default=""),
        sa.Column("years_experience", sa.Integer(), nullable=True),
        sa.Column("annual_turnover", sa.Numeric(18, 2), nullable=True),
    ],
    "tenders": [
        sa.Column("deadline_date", sa.Date(), nullable=True),
        sa.Column("budget_amount", sa.Numeric(18, 2), nullable=True),
        sa.Column("currency", sa.String(3), nullable=False, server_default="INR"),
        sa.Column("source_references", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("analysis_confidence", sa.Float(), nullable=True),
        sa.Column("analysis_error", sa.Text(), nullable=False, server_default=""),
        sa.Column("analysis_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("analysis_completed_at", sa.DateTime(timezone=True), nullable=True),
    ],
    "proposals": [
        sa.Column("error", sa.Text(), nullable=False, server_default=""),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
    ],
    "competitors": [
        sa.Column("evidence", sa.Text(), nullable=False, server_default=""),
        sa.Column("is_ai_estimate", sa.Boolean(), nullable=False, server_default=sa.true()),
    ],
    "notifications": [
        sa.Column("status", sa.String(30), nullable=False, server_default="queued"),
        sa.Column("error", sa.Text(), nullable=False, server_default=""),
    ],
}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "users" not in inspector.get_table_names():
        from database import Base
        import models  # noqa: F401

        Base.metadata.create_all(bind=bind)
        return

    for table_name, columns in ADDITIONS.items():
        existing = {column["name"] for column in inspector.get_columns(table_name)}
        for column in columns:
            if column.name not in existing:
                op.add_column(table_name, column)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    for table_name, columns in reversed(list(ADDITIONS.items())):
        if table_name not in inspector.get_table_names():
            continue
        existing = {column["name"] for column in inspector.get_columns(table_name)}
        for column in reversed(columns):
            if column.name in existing:
                with op.batch_alter_table(table_name) as batch_op:
                    batch_op.drop_column(column.name)
