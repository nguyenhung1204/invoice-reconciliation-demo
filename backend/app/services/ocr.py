from pathlib import Path
from statistics import mean
from tempfile import TemporaryDirectory
from threading import Lock

from app.core.config import settings


class OCRUnavailable(RuntimeError):
    pass


_engine = None
_engine_lock = Lock()
_inference_lock = Lock()


def preprocess_image(image_path: str, output_dir: str | None = None) -> str:
    """Deskew/denoise hook. If OpenCV is installed, normalize contrast before recognition."""
    try:
        import cv2
    except ImportError:
        return image_path
    image = cv2.imread(image_path)
    if image is None:
        return image_path
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    denoised = cv2.fastNlMeansDenoising(gray, None, 10, 7, 21)
    target_dir = Path(output_dir) if output_dir else Path(image_path).parent
    target_dir.mkdir(parents=True, exist_ok=True)
    target = str(target_dir / (Path(image_path).stem + "_processed.png"))
    cv2.imwrite(target, denoised)
    return target


def rasterize_pdf(pdf_path: str, output_dir: str) -> list[str]:
    """Render every PDF page to a PNG because text OCR models consume page images."""
    try:
        import pymupdf
    except ImportError as exc:
        raise OCRUnavailable("Cần cài PyMuPDF để nhận dạng hóa đơn PDF.") from exc

    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    pages = []
    with pymupdf.open(pdf_path) as document:
        for page_number, page in enumerate(document, start=1):
            pixmap = page.get_pixmap(matrix=pymupdf.Matrix(2, 2), alpha=False)
            page_path = output_path / f"page-{page_number:04d}.png"
            pixmap.save(str(page_path))
            pages.append(str(page_path))
    if not pages:
        raise OCRUnavailable("PDF không có trang để nhận dạng.")
    return pages


def _get_engine(PaddleOCR):
    global _engine
    if _engine is None:
        with _engine_lock:
            if _engine is None:
                _engine = PaddleOCR(device=settings.ocr_device, enable_mkldnn=False,
                                    use_doc_orientation_classify=False,
                                    use_doc_unwarping=False, use_textline_orientation=False)
    return _engine


def _recognize_images(engine, image_paths: list[str], work_dir: str) -> dict:
    blocks = []
    for page_number, image_path in enumerate(image_paths, start=1):
        processed_path = preprocess_image(image_path, work_dir)
        for item in engine.predict(processed_path):
            texts = item.get("rec_texts", [])
            scores = item.get("rec_scores", [])
            boxes = item.get("rec_boxes", [])
            for index, value in enumerate(texts):
                text = str(value).strip()
                if not text:
                    continue
                score = float(scores[index]) if index < len(scores) else None
                box = [int(x) for x in boxes[index]] if index < len(boxes) else []
                blocks.append({"text": text, "confidence": score, "box": box, "page": page_number})
    scores = [block["confidence"] for block in blocks if block["confidence"] is not None]
    return {"text": "\n".join(block["text"] for block in blocks),
            "confidence": mean(scores) if scores else None, "blocks": blocks}


def recognize_file(image_path: str) -> dict:
    """Lazy OCR adapter. Keep PaddleOCR out of app startup and allow CPU-only review workflows."""
    try:
        from paddleocr import PaddleOCR
    except Exception as exc:
        raise OCRUnavailable(f"PaddleOCR chưa sẵn sàng: {exc}") from exc
    try:
        with TemporaryDirectory(prefix="invoice-ocr-") as work_dir:
            if Path(image_path).suffix.lower() == ".pdf":
                image_paths = rasterize_pdf(image_path, work_dir)
            else:
                image_paths = [image_path]
            with _inference_lock:
                return _recognize_images(_get_engine(PaddleOCR), image_paths, work_dir)
    except OCRUnavailable:
        raise
    except Exception as exc:
        raise OCRUnavailable(f"Không thể chạy PaddleOCR: {exc}") from exc
