import json
import os
from pathlib import Path
from threading import RLock

from app.core.config import settings

SETTINGS_PATH = Path(__file__).resolve().parents[2] / "data" / "reconciliation_settings.json"
_lock = RLock()


def defaults():
    return {"currency_tolerance": float(settings.currency_tolerance),
            "item_similarity_threshold": int(settings.item_similarity_threshold),
            "ocr_confidence_min": float(settings.ocr_min_confidence)}


def get_reconciliation_settings():
    with _lock:
        try:
            saved = json.loads(SETTINGS_PATH.read_text(encoding="utf-8"))
        except FileNotFoundError:
            saved = {}
        except (OSError, json.JSONDecodeError):
            saved = {}
        return {**defaults(), **{key: saved[key] for key in defaults() if key in saved}}


def save_reconciliation_settings(values):
    normalized = {"currency_tolerance": float(values["currency_tolerance"]),
                  "item_similarity_threshold": int(values["item_similarity_threshold"]),
                  "ocr_confidence_min": float(values["ocr_confidence_min"])}
    with _lock:
        SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
        temporary = SETTINGS_PATH.with_suffix(".json.tmp")
        temporary.write_text(json.dumps(normalized, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        os.replace(temporary, SETTINGS_PATH)
    return normalized
