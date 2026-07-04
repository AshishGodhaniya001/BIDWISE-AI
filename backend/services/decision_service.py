import json
import re
from datetime import date

from models import ComplianceRequirement, KnowledgeItem, Tender


_STOP_WORDS = {"shall", "must", "with", "from", "that", "this", "have", "will", "and", "the", "for", "are", "bidder", "tender"}


def _terms(value: str) -> set[str]:
    return {word for word in re.findall(r"[a-z0-9]+", value.lower()) if len(word) > 3 and word not in _STOP_WORDS}


def match_requirement(requirement: str, knowledge: list[KnowledgeItem]) -> tuple[str, str, str]:
    if not knowledge:
        return "unknown", "", "Add verified company evidence before this requirement can be assessed."
    wanted = _terms(requirement)
    best: KnowledgeItem | None = None
    best_ratio = 0.0
    for item in knowledge:
        available = _terms(f"{item.title} {item.content}")
        ratio = len(wanted & available) / max(len(wanted), 1)
        if ratio > best_ratio:
            best, best_ratio = item, ratio
    if best and best_ratio >= 0.45 and best.is_verified:
        return "match", f"{best.title}: {best.content[:500]}", ""
    if best and best_ratio >= 0.2:
        return "partial", f"Potential evidence: {best.title}", "Verify and strengthen the supporting proof."
    return "gap", "", "No matching verified item exists in the company knowledge vault."


def enrich_requirements(requirements: list[ComplianceRequirement], knowledge: list[KnowledgeItem]) -> None:
    for requirement in requirements:
        match, evidence, missing = match_requirement(requirement.requirement, knowledge)
        requirement.company_match = match
        requirement.company_evidence = evidence
        requirement.missing_proof = missing


def _category_score(items: list[ComplianceRequirement]) -> int | None:
    if not items:
        return None
    if all(item.company_match == "unknown" for item in items):
        return None
    points = {"match": 100, "partial": 55, "unknown": 20, "gap": 0}
    weights = [2 if item.is_mandatory else 1 for item in items]
    return round(sum(points.get(item.company_match, 20) * weight for item, weight in zip(items, weights)) / sum(weights))


def calculate_decision(tender: Tender, requirements: list[ComplianceRequirement]) -> dict:
    by_category = lambda names: [item for item in requirements if item.category in names]
    scores = {
        "eligibility": _category_score(by_category({"eligibility"})),
        "technical_fit": _category_score(by_category({"technical"})),
        "financial_fit": _category_score(by_category({"financial", "commercial"})),
        "documentation_readiness": _category_score(by_category({"document"})),
        "timeline_risk": _category_score(by_category({"timeline"})),
    }
    if scores["timeline_risk"] is None and tender.deadline_date:
        days = (tender.deadline_date - date.today()).days
        scores["timeline_risk"] = 90 if days >= 30 else 70 if days >= 14 else 40 if days >= 7 else 10

    weighted = [("eligibility", .30), ("technical_fit", .25), ("financial_fit", .20), ("documentation_readiness", .15), ("timeline_risk", .10)]
    present = [(scores[key], weight) for key, weight in weighted if scores[key] is not None]
    overall = round(sum(score * weight for score, weight in present) / sum(weight for _, weight in present)) if present else None
    mandatory_gaps = [item for item in requirements if item.is_mandatory and item.company_match == "gap"]
    mandatory_unknown = [item for item in requirements if item.is_mandatory and item.company_match in {"unknown", "partial"}]
    if mandatory_gaps:
        recommendation = "NO_GO"
        reasons = [f"{len(mandatory_gaps)} mandatory requirement(s) have no verified company evidence."]
    elif mandatory_unknown or overall is None:
        recommendation = "REVIEW"
        reasons = [f"{len(mandatory_unknown)} mandatory requirement(s) are awaiting verified company evidence."]
    elif overall >= 70:
        recommendation = "GO"
        reasons = ["All mandatory requirements are supported and the weighted fit is at least 70%."]
    else:
        recommendation = "REVIEW"
        reasons = ["No mandatory gap was found, but the weighted fit is below 70%."]
    partial = sum(item.company_match == "partial" for item in requirements)
    effort = round(len(requirements) * 1.5 + len(mandatory_gaps) * 4 + partial * 2, 1)
    return {"overall": overall, "scores": scores, "recommendation": recommendation, "reasons": reasons, "effort": effort}


def apply_decision(tender: Tender, requirements: list[ComplianceRequirement]) -> dict:
    result = calculate_decision(tender, requirements)
    tender.bid_success_score = result["overall"]
    tender.eligibility_score = result["scores"]["eligibility"]
    tender.technical_fit_score = result["scores"]["technical_fit"]
    tender.financial_fit_score = result["scores"]["financial_fit"]
    tender.documentation_score = result["scores"]["documentation_readiness"]
    tender.timeline_score = result["scores"]["timeline_risk"]
    tender.recommendation = result["recommendation"]
    tender.recommendation_reasons = json.dumps(result["reasons"])
    tender.estimated_effort_hours = result["effort"]
    return result
