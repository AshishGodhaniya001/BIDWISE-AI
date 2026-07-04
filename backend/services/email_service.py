import logging
import smtplib
from email.message import EmailMessage

from config import EMAIL_FROM, SMTP_PASSWORD, SMTP_PORT, SMTP_SERVER, SMTP_USERNAME


logger = logging.getLogger("bidwise.email")


def send_email(to_email: str, subject: str, body: str) -> bool:
    if not SMTP_USERNAME or not SMTP_PASSWORD:
        return False

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = EMAIL_FROM
    msg["To"] = to_email
    msg.set_content(body)

    try:
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.send_message(msg)
        return True
    except Exception as exc:
        logger.warning("Email delivery to %s failed: %s", to_email, exc)
        return False


def build_notification_body(notification_type: str, tender_name: str, details: str = "") -> str:
    bodies = {
        "deadline_reminder": f"Reminder: The deadline for tender '{tender_name}' is approaching.\n{details}",
        "missing_document": f"Alert: Missing documents detected for tender '{tender_name}'.\n{details}",
        "proposal_ready": f"Your proposal for tender '{tender_name}' is ready for review.\n{details}",
    }
    return bodies.get(notification_type, details)
