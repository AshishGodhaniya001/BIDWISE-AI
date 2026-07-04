import logging
import os
import re
import uuid
from pathlib import Path

import pypdf
from fastapi import HTTPException, UploadFile, status

from config import MAX_PDF_PAGES, MAX_UPLOAD_BYTES, UPLOAD_DIR


logger = logging.getLogger("bidwise.pdf")
_CHUNK_SIZE = 1024 * 1024


def _safe_filename(filename: str | None) -> str:
    base = Path(filename or "tender.pdf").name
    base = re.sub(r"[^A-Za-z0-9._ -]", "_", base).strip(" .")
    return (base or "tender.pdf")[:180]


async def save_uploaded_pdf(upload_file: UploadFile, user_id: int) -> tuple[str, str, int]:
    original_name = _safe_filename(upload_file.filename)
    if not original_name.lower().endswith(".pdf"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only PDF files are accepted")
    if upload_file.content_type not in {"application/pdf", "application/x-pdf", "application/octet-stream"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid PDF content type")

    first_chunk = await upload_file.read(_CHUNK_SIZE)
    if not first_chunk.startswith(b"%PDF-"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The uploaded file is not a valid PDF")

    user_dir = (UPLOAD_DIR / str(user_id)).resolve()
    user_dir.mkdir(parents=True, exist_ok=True)
    stored_name = f"{uuid.uuid4().hex}.pdf"
    filepath = (user_dir / stored_name).resolve()
    if user_dir not in filepath.parents:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid filename")

    total = 0
    try:
        with filepath.open("wb") as output:
            chunk = first_chunk
            while chunk:
                total += len(chunk)
                if total > MAX_UPLOAD_BYTES:
                    raise HTTPException(
                        status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                        detail=f"PDF exceeds the {MAX_UPLOAD_BYTES // (1024 * 1024)} MB upload limit",
                    )
                output.write(chunk)
                chunk = await upload_file.read(_CHUNK_SIZE)
        _validate_pdf(filepath)
    except Exception:
        filepath.unlink(missing_ok=True)
        raise
    finally:
        await upload_file.close()

    return str(filepath), original_name, total


def _validate_pdf(filepath: Path) -> None:
    try:
        reader = pypdf.PdfReader(str(filepath))
        if reader.is_encrypted:
            raise HTTPException(status_code=400, detail="Password-protected PDFs are not supported")
        if not reader.pages:
            raise HTTPException(status_code=400, detail="PDF contains no pages")
        if len(reader.pages) > MAX_PDF_PAGES:
            raise HTTPException(status_code=413, detail=f"PDF exceeds the {MAX_PDF_PAGES}-page limit")
    except HTTPException:
        raise
    except Exception as exc:
        logger.info("Rejected malformed PDF %s: %s", filepath, exc)
        raise HTTPException(status_code=400, detail="The PDF is malformed or unreadable") from exc


def extract_text_from_pdf(filepath: str) -> str:
    return _extract_text_hybrid(filepath)


def _extract_text_hybrid(filepath: str) -> str:
    try:
        reader = pypdf.PdfReader(filepath)
        embedded = [(page.extract_text() or "").strip() for page in reader.pages]
    except Exception as exc:
        logger.warning("PDF text extraction failed for %s: %s", filepath, exc)
        embedded = []
    blank_pages = [index for index, text in enumerate(embedded) if not text]
    ocr_pages: dict[int, str] = {}
    if blank_pages and _is_ocr_available():
        logger.info("Using OCR for %s blank/scanned page(s) in %s", len(blank_pages), filepath)
        try:
            import pypdfium2 as pdfium
            import pytesseract
            pdf = pdfium.PdfDocument(filepath)
            try:
                for index in blank_pages:
                    bitmap = pdf[index].render(scale=2)
                    ocr_pages[index] = pytesseract.image_to_string(bitmap.to_pil()).strip()
            finally:
                pdf.close()
        except Exception as exc:
            logger.error("Selective OCR failed for %s: %s", filepath, exc)
    parts = []
    for index, text in enumerate(embedded):
        content = text or ocr_pages.get(index, "")
        if content:
            parts.append(f"[Page {index + 1}]\n{content}")
    return "\n\n".join(parts)


def _extract_text_pypdf(filepath: str) -> str:
    parts: list[str] = []
    try:
        reader = pypdf.PdfReader(filepath)
        for page_number, page in enumerate(reader.pages, start=1):
            page_text = page.extract_text() or ""
            if page_text.strip():
                parts.append(f"[Page {page_number}]\n{page_text.strip()}")
    except Exception as exc:
        logger.warning("PDF text extraction failed for %s: %s", filepath, exc)
    return "\n\n".join(parts)


def _is_ocr_available() -> bool:
    try:
        import pytesseract

        configured = os.getenv("TESSERACT_PATH", "").strip()
        if configured:
            pytesseract.pytesseract.tesseract_cmd = configured
        pytesseract.get_tesseract_version()
        return True
    except Exception:
        return False


def _extract_text_ocr(filepath: str) -> str:
    try:
        import pypdfium2 as pdfium
        import pytesseract

        parts: list[str] = []
        pdf = pdfium.PdfDocument(filepath)
        try:
            for page_number in range(len(pdf)):
                bitmap = pdf[page_number].render(scale=2)
                page_text = pytesseract.image_to_string(bitmap.to_pil()).strip()
                if page_text:
                    parts.append(f"[Page {page_number + 1}]\n{page_text}")
        finally:
            pdf.close()
        return "\n\n".join(parts)
    except Exception as exc:
        logger.error("OCR extraction failed for %s: %s", filepath, exc, exc_info=True)
        return ""


def delete_uploaded_file(filepath: str) -> None:
    try:
        candidate = Path(filepath).resolve()
        if UPLOAD_DIR == candidate or UPLOAD_DIR not in candidate.parents:
            logger.warning("Refused to delete path outside upload directory: %s", candidate)
            return
        candidate.unlink(missing_ok=True)
    except OSError as exc:
        logger.warning("Could not delete uploaded file %s: %s", filepath, exc)
