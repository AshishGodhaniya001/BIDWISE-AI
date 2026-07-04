from datetime import datetime, timezone

from database import SyncSessionLocal
from models import Notification, Reminder, Tender, User
from services.email_service import send_email


def process_due_reminders() -> int:
    db = SyncSessionLocal(); processed = 0
    try:
        due = db.query(Reminder).filter(Reminder.status == "scheduled", Reminder.remind_at <= datetime.now(timezone.utc)).limit(100).all()
        for reminder in due:
            tender = db.query(Tender).filter(Tender.id == reminder.tender_id).first()
            user = db.query(User).filter(User.id == reminder.recipient_user_id).first()
            if not tender or not user:
                reminder.status = "cancelled"; continue
            subject = f"BidWise - {reminder.reminder_type.title()} reminder"
            body = f"Reminder for tender '{tender.tender_name}'. Deadline: {tender.deadline or 'not specified'}."
            sent = send_email(user.email, subject, body)
            db.add(Notification(user_id=user.id, organization_id=reminder.organization_id, tender_id=tender.id, subject=subject, body=body, status="sent" if sent else "in_app", email_sent=sent, error="" if sent else "SMTP unavailable; delivered in app"))
            reminder.status = "sent"; processed += 1
        db.commit(); return processed
    except Exception:
        db.rollback(); raise
    finally:
        db.close()
