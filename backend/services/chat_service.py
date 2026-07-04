import json
import re

from services.gemini_service import QuotaExceededError, _call_gemini, _clean_json, is_gemini_configured


def answer_question(question: str, pdf_text: str) -> tuple[str, list[dict]]:
    terms = {word for word in re.findall(r"[a-z0-9]+", question.lower()) if len(word) > 3}
    pages = []
    matches = list(re.finditer(r"\[Page (\d+)\]\s*", pdf_text))
    for index, match in enumerate(matches):
        text = pdf_text[match.end():matches[index + 1].start() if index + 1 < len(matches) else len(pdf_text)]
        sentences = re.split(r"(?<=[.!?])\s+|\n+", " ".join(text.split()))
        for sentence in sentences:
            score = len(terms & set(re.findall(r"[a-z0-9]+", sentence.lower())))
            if score and len(sentence) > 20: pages.append((score, int(match.group(1)), sentence[:700]))
    pages.sort(key=lambda item: (-item[0], item[1]))
    citations = [{"page": page, "quote": quote} for _, page, quote in pages[:4]]
    if not citations:
        return "I could not find a supported answer in the tender. Try a more specific question or verify the source PDF manually.", []
    context = "\n".join(f"[Page {item['page']}] {item['quote']}" for item in citations)
    if is_gemini_configured():
        prompt = f"""Answer the question using only the cited tender excerpts. If the excerpts are insufficient, say so. Keep the answer concise and mention source pages. Return JSON {{"answer":"..."}}.\nQuestion: {question}\nExcerpts:\n{context}"""
        try:
            payload = json.loads(_clean_json(_call_gemini(prompt, operation="tender_chat")))
            return str(payload["answer"]), citations
        except (QuotaExceededError, RuntimeError, ValueError, KeyError, TypeError):
            pass
    return "Based on the most relevant tender evidence:\n\n" + "\n".join(f"• Page {item['page']}: {item['quote']}" for item in citations), citations
