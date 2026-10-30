"""Utilities for turning formal chatbot drafts into informal conversation."""

from __future__ import annotations

import hashlib
import re


class ChatStyleEngine:
    """Rule-based humanizer for chatbot output."""

    _OPENERS = (
        "Got it, ",
        "Yep, ",
        "Yeah, ",
        "Sounds good, ",
    )

    _AI_PHRASE_PATTERNS = (
        re.compile(r"\bas an ai language model[:,]?\s*", flags=re.IGNORECASE),
        re.compile(r"\bas an ai[:,]?\s*", flags=re.IGNORECASE),
    )

    _FORMAL_PREFIX_REPLACEMENTS = (
        (re.compile(r"^\s*certainly[, ]*", flags=re.IGNORECASE), "Sure, "),
        (re.compile(r"^\s*additionally[, ]*", flags=re.IGNORECASE), "Also, "),
        (re.compile(r"^\s*therefore[, ]*", flags=re.IGNORECASE), "So, "),
    )

    _PHRASE_REPLACEMENTS = (
        (re.compile(r"\bi will\b", flags=re.IGNORECASE), "I'll"),
        (re.compile(r"\bi am\b", flags=re.IGNORECASE), "I'm"),
        (re.compile(r"\bi have\b", flags=re.IGNORECASE), "I've"),
        (re.compile(r"\bi do not\b", flags=re.IGNORECASE), "I don't"),
        (re.compile(r"\bwe are\b", flags=re.IGNORECASE), "we're"),
        (re.compile(r"\bwe will\b", flags=re.IGNORECASE), "we'll"),
        (re.compile(r"\bthat is\b", flags=re.IGNORECASE), "that's"),
        (re.compile(r"\bit is\b", flags=re.IGNORECASE), "it's"),
        (re.compile(r"\bcannot\b", flags=re.IGNORECASE), "can't"),
        (re.compile(r"\bdo not worry\b", flags=re.IGNORECASE), "no worries"),
        (re.compile(r"\bi apologize\b", flags=re.IGNORECASE), "sorry"),
    )

    def humanize(self, draft: str, include_follow_up: bool = True) -> dict[str, object]:
        text = draft.strip()
        if not text:
            raise ValueError("Draft text is required.")

        applied_rules: list[str] = []
        text = re.sub(r"\s+", " ", text)

        for pattern in self._AI_PHRASE_PATTERNS:
            new_text, count = pattern.subn("", text)
            if count > 0:
                text = new_text.strip()
                applied_rules.append("removed_ai_self_reference")

        for pattern, replacement in self._FORMAL_PREFIX_REPLACEMENTS:
            new_text, count = pattern.subn(replacement, text, count=1)
            if count > 0:
                text = new_text
                applied_rules.append("softened_formal_prefix")

        for pattern, replacement in self._PHRASE_REPLACEMENTS:
            new_text, count = pattern.subn(replacement, text)
            if count > 0:
                text = new_text
                applied_rules.append("added_contractions")

        text = self._ensure_opener(text, applied_rules)

        if include_follow_up and "?" not in text:
            text = text.rstrip(".! ")
            text = f"{text}. want me to keep going?"
            applied_rules.append("added_casual_follow_up")

        return {
            "message": text,
            "applied_rules": sorted(set(applied_rules)),
            "style": "informal",
        }

    def _ensure_opener(self, text: str, applied_rules: list[str]) -> str:
        lowered = text.lower()
        if lowered.startswith(("got it", "yep", "yeah", "sounds good")):
            return text

        index = self._stable_index(text, len(self._OPENERS))
        applied_rules.append("added_casual_opener")
        return f"{self._OPENERS[index]}{text}" if text else text

    @staticmethod
    def _stable_index(text: str, modulus: int) -> int:
        digest = hashlib.sha1(text.encode("utf-8")).hexdigest()
        return int(digest[:8], 16) % modulus
