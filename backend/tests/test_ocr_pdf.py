import importlib.util
import tempfile
import unittest
from pathlib import Path

from app.services.ocr import rasterize_pdf


@unittest.skipUnless(importlib.util.find_spec("pymupdf"), "PyMuPDF is an optional OCR dependency")
class PdfRasterizationTests(unittest.TestCase):
    def test_renders_each_pdf_page_to_png(self):
        import pymupdf

        with tempfile.TemporaryDirectory() as temp_dir:
            pdf_path = Path(temp_dir) / "invoice.pdf"
            with pymupdf.open() as document:
                document.new_page()
                document.new_page()
                document.save(pdf_path)

            output_dir = Path(temp_dir) / "pages"
            images = rasterize_pdf(str(pdf_path), str(output_dir))

            self.assertEqual(2, len(images))
            self.assertTrue(all(Path(image).read_bytes().startswith(b"\x89PNG\r\n\x1a\n") for image in images))


if __name__ == "__main__":
    unittest.main()
