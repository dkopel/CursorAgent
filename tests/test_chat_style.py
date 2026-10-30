import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from chat_style import ChatStyleEngine


class ChatStyleEngineTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = ChatStyleEngine()

    def test_removes_ai_reference_and_adds_informal_tone(self) -> None:
        result = self.engine.humanize(
            "As an AI language model, I will provide that information."
        )
        self.assertNotIn("As an AI language model", result["message"])
        self.assertIn("I'll", result["message"])
        self.assertIn("want me to keep going?", result["message"])
        self.assertIn("removed_ai_self_reference", result["applied_rules"])
        self.assertEqual(result["style"], "informal")

    def test_can_skip_follow_up_question(self) -> None:
        result = self.engine.humanize(
            "Certainly, I am ready to help.",
            include_follow_up=False,
        )
        self.assertNotIn("want me to keep going?", result["message"])
        self.assertIn("I'm ready", result["message"])

    def test_requires_non_empty_input(self) -> None:
        with self.assertRaisesRegex(ValueError, "Draft text is required"):
            self.engine.humanize("   ")


if __name__ == "__main__":
    unittest.main()
