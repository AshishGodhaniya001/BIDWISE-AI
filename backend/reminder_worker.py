import logging
import random
import signal
import time

from services.reminder_service import process_due_reminders

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("bidwise.reminder_worker")

_shutdown = False


def _handle_signal(signum, frame):
    global _shutdown
    logger.info("Received signal %s, shutting down gracefully...", signum)
    _shutdown = True


signal.signal(signal.SIGTERM, _handle_signal)
signal.signal(signal.SIGINT, _handle_signal)

while not _shutdown:
    try:
        count = process_due_reminders()
        if count:
            logger.info("Processed %s reminder(s)", count)
    except Exception:
        logger.exception("Reminder worker cycle failed")
    for _ in range(6):
        if _shutdown:
            break
        time.sleep(5 + random.uniform(-1, 1))
