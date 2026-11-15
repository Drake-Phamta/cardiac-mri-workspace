"""Export the Beamer slides (slides/main.pdf) to slides/main.pptx.

The submission asks for both .pdf and .pptx; every PDF page is rendered at
high resolution and placed as a full-slide picture (16:9).
"""
import io
import sys
from pathlib import Path

import pymupdf
from pptx import Presentation
from pptx.util import Emu

REPO = Path(__file__).resolve().parents[1]


def main(pdf=REPO / "slides" / "main.pdf", out=REPO / "slides" / "main.pptx", dpi=200):
    doc = pymupdf.open(pdf)
    prs = Presentation()
    w, h = doc[0].rect.width, doc[0].rect.height
    prs.slide_width = Emu(int(12192000))                  # 13.333 in, 16:9
    prs.slide_height = Emu(int(12192000 * h / w))
    blank = prs.slide_layouts[6]
    for page in doc:
        png = page.get_pixmap(dpi=dpi).tobytes("png")
        slide = prs.slides.add_slide(blank)
        slide.shapes.add_picture(io.BytesIO(png), 0, 0, width=prs.slide_width, height=prs.slide_height)
    prs.save(out)
    print(f"saved {out} ({len(doc)} slides)")


if __name__ == "__main__":
    main(*map(Path, sys.argv[1:]))
