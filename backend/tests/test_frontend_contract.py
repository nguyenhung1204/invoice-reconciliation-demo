import re
import unittest
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class IdCollector(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []

    def handle_starttag(self, tag, attrs):
        self.ids.extend(value for key, value in attrs if key == "id")


class FrontendContractTests(unittest.TestCase):
    def test_script_selectors_exist_and_ids_are_unique(self):
        html = (ROOT / "frontend/index.html").read_text(encoding="utf-8")
        script = (ROOT / "frontend/src/app.js").read_text(encoding="utf-8")
        parser = IdCollector()
        parser.feed(html)
        ids = set(parser.ids)
        selectors = set(re.findall(r"\$\('#([^']+)'\)", script))
        self.assertEqual([], sorted(selectors - ids))
        self.assertEqual([], [key for key, count in Counter(parser.ids).items() if count > 1])


if __name__ == "__main__":
    unittest.main()
