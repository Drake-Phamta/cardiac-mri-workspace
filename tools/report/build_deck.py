#!/usr/bin/env python3
"""
Build the DRAFT presentation deck (16:9, Vietnamese) from the aggregate results.

    python tools/report/build_deck.py [--assets management/presentation/final] [--out management/presentation/final]

Reads    <assets>/results_aggregate.json        (written by build_report_assets.py)
         <assets>/figures/fig_*.png             (aggregate-only figures, same builder)
         tools/report/deck_facts.json           (process facts, each checked against its committed source)
         management/PROJECT_STATE.yaml          (team and verticals)
         .github/workflows/guardrails.yml       (CI job count)
Writes   <out>/CARDIAC_MRI_DECK_DRAFT.pptx
         <out>/DECK_OUTLINE.md                  (slide list, visible text and speaker notes, for review on GitHub)

RULES THE DECK FOLLOWS
    * Every experiment number is read from results_aggregate.json at build time; nothing is typed by hand.
      Process facts (counts of tests, CI jobs, device evidence...) come from deck_facts.json, whose entries are
      re-checked against their source file on every run (a stale fact is reported, never silently shipped).
    * Aggregate-only: no per-case value, case identifier, MRI or mask image appears in the deck.
    * A slide that needs the UNet results shows a marked placeholder, "CHỜ KẾT QUẢ UNET (Khánh)", until EXP-U-*
      runs appear in the aggregate; then the same slide fills itself with their numbers.
    * After saving, the deck is re-opened and linted: no text box may overflow its shape or leave the slide, and
      text shapes may not overlap (approximate extents from the Calibri metrics; see lint()).
"""

from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import re
import sys
import uuid
from pathlib import Path

from lxml import etree
from PIL import Image, ImageFont
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.dml import MSO_LINE
from pptx.enum.shapes import MSO_CONNECTOR, MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, MSO_AUTO_SIZE, PP_ALIGN
from pptx.opc.constants import RELATIONSHIP_TYPE as RT
from pptx.oxml.ns import qn
from pptx.util import Inches, Pt

sys.path.insert(0, str(Path(__file__).resolve().parent))
from report_common import AQUA, EXPECTED_UNET, NBSP, ORANGE, ci_text, nb, pct, sgn, thou, vn  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DIR = ROOT / "management" / "presentation" / "final"
FACTS_PATH = Path(__file__).resolve().parent / "deck_facts.json"
DECK_NAME = "CARDIAC_MRI_DECK_DRAFT.pptx"
OUTLINE_NAME = "DECK_OUTLINE.md"
UNET_PLACEHOLDER = "CHỜ KẾT QUẢ UNET (Khánh)"

# --- design tokens ---------------------------------------------------------------------------------------------
FONT = "Calibri"
W, H = 13.333, 7.5
MX = 0.6                                   # left/right margin
CW = W - 2 * MX                            # content width
TOP = 1.8                                  # content top
BOTTOM = 6.85                              # content bottom
COL = {
    "bg": "FCFCFB", "white": "FFFFFF", "ink": "1B2430", "ink2": "4A5565", "muted": "6B7482", "line": "D9DEE6",
    "wash": "F2F5F9", "accent": "184F95", "accent2": "2A78D6", "accent_wash": "E8F0FB", "dark": "0D366B",
    "dark2": "184F95", "orange": ORANGE.lstrip("#"), "aqua": AQUA.lstrip("#"), "orange_wash": "FDEEE7",
}
LENS = {"ml": "HỌC MÁY", "ip": "XỬ LÝ ẢNH", "ds": "KHOA HỌC DỮ LIỆU", "mob": "PHÁT TRIỂN DI ĐỘNG"}


def rgb(h: str) -> RGBColor:
    return RGBColor.from_string(h)


def plain(s: str) -> str:
    return s.replace("**", "")


# =================================================================================================================
# data access: the aggregate, plus verified process facts
# =================================================================================================================
class Data:
    def __init__(self, agg: dict, facts: dict, root: Path):
        self.agg, self.root = agg, root
        self.runs = agg["runs"]
        self.by_id = {r["experiment_id"]: r for r in self.runs}
        self.comps = agg.get("comparisons") or []
        self.n = agg["n"]
        self.facts_raw = facts["facts"]
        self.fact_problems: list[str] = []
        self.build_problems: list[str] = []
        self.verified: set[str] = set()
        self._check_facts()

    # ---- facts
    def _check_facts(self) -> None:
        cache: dict[str, str] = {}
        for key, f in self.facts_raw.items():
            src = self.root / f["source"]
            if f["source"] not in cache:
                cache[f["source"]] = re.sub(r"\s+", " ", src.read_text(encoding="utf-8", errors="replace")) if src.is_file() else ""
            if not cache[f["source"]]:
                self.fact_problems.append(f"{key}: source {f['source']} not found")
            elif re.sub(r"\s+", " ", f["needle"]) not in cache[f["source"]]:
                self.fact_problems.append(f"{key}: needle not found in {f['source']}")
            else:
                self.verified.add(key)

    def f(self, key: str) -> str:
        return self.facts_raw[key]["value"]

    def src(self, key: str) -> str:
        return self.facts_raw[key]["source"]

    # ---- runs
    def run(self, rid: str) -> dict | None:
        return self.by_id.get(rid)

    def lab(self, r: dict) -> str:
        return nb(r["label"])

    @property
    def raw(self) -> list[dict]:
        return [r for r in self.runs if not str(r["variant"]).startswith("PROCESSED")]

    @property
    def processed(self) -> list[dict]:
        return [r for r in self.runs if str(r["variant"]).startswith("PROCESSED")]

    def family(self, fam: str) -> list[dict]:
        return sorted((r for r in self.raw if r["family"] == fam and r.get("training_fraction")), key=lambda r: r["training_fraction"])

    @property
    def unet(self) -> list[dict]:
        return [r for r in self.runs if r["family"] == "unet"]

    @property
    def unet_present(self) -> bool:
        return bool(self.unet)

    @property
    def unet_missing(self) -> list[str]:
        return [i for i in EXPECTED_UNET if i not in self.by_id]

    def best(self) -> dict:
        return max(self.runs, key=lambda r: r["dice_mean"])

    def comp(self, a: str, b: str) -> dict | None:
        for c in self.comps:
            if c["a"] == a and c["b"] == b:
                return c
        return None

    def comps_of(self, q: str) -> list[dict]:
        return [c for c in self.comps if c["question"] == q]

    def pp_pair(self) -> tuple[dict, dict, dict | None] | None:
        """(raw source run, processed run, paired comparison) of the first post-processing ablation."""
        for p in self.processed:
            src = self.by_id.get(p.get("derived_from") or "")
            if src:
                return src, p, self.comp(src["experiment_id"], p["experiment_id"])
        return None

    # ---- aggregate-derived helpers
    def span(self, key: str, runs: list[dict] | None = None) -> tuple[float, float]:
        vals = [r[key] for r in (runs or self.runs) if r.get(key) is not None]
        return min(vals), max(vals)

    @property
    def ci_jobs(self) -> int | None:
        p = self.root / ".github" / "workflows" / "guardrails.yml"
        if not p.is_file():
            return None
        text = p.read_text(encoding="utf-8")
        body = text.split("\njobs:", 1)[-1]
        return len(re.findall(r"^  [a-z][a-z0-9-]*:\s*$", body, flags=re.M))

    def fig(self, key: str, assets: Path) -> Path | None:
        names = {"a": "fig_a_dice_mean_ci", "b": "fig_b_data_scarcity", "c": "fig_c_gate_img_01", "d": "fig_d_slice_profile",
                 "e": "fig_e_training_val_dice", "f": "fig_f_paired_deltas"}
        p = assets / "figures" / f"{names[key]}.png"
        return p if p.is_file() else None


# =================================================================================================================
# python-pptx helpers
# =================================================================================================================
def strip_style(shape) -> None:
    st = shape._element.find(qn("p:style"))
    if st is not None:
        shape._element.remove(st)


def set_bullet(p, indent_in: float = 0.24, color: str | None = None) -> None:
    pPr = p._p.get_or_add_pPr()
    pPr.set("marL", str(int(Inches(indent_in))))
    pPr.set("indent", str(-int(Inches(indent_in))))
    for tag in ("a:buClr", "a:buFont", "a:buNone", "a:buChar", "a:buAutoNum"):
        for el in pPr.findall(qn(tag)):
            pPr.remove(el)
    if color:
        clr = etree.SubElement(pPr, qn("a:buClr"))
        etree.SubElement(clr, qn("a:srgbClr")).set("val", color)
    etree.SubElement(pPr, qn("a:buFont")).set("typeface", "Arial")
    etree.SubElement(pPr, qn("a:buChar")).set("char", "•")


def fill_text(tf, paras, size=16, color="ink", bold=False, align="l", bullets=False, space_after=6, line_spacing=None) -> list[str]:
    """Fill a text frame. A paragraph is 'text' or ('text', {size,bold,color,bullet,space_after,align,italic}); **x** = bold."""
    texts: list[str] = []
    first = True
    for item in paras:
        opts: dict = {}
        if isinstance(item, tuple):
            item, opts = item
        p = tf.paragraphs[0] if first else tf.add_paragraph()
        first = False
        sz, col, b = opts.get("size", size), COL.get(opts.get("color", color), opts.get("color", color)), opts.get("bold", bold)
        for part in re.split(r"(\*\*.+?\*\*)", item):
            if not part:
                continue
            is_b = part.startswith("**") and part.endswith("**")
            run = p.add_run()
            run.text = part[2:-2] if is_b else part
            f = run.font
            f.name = FONT
            f.size = Pt(sz)
            f.bold = bool(is_b or b)
            f.italic = bool(opts.get("italic", False))
            f.color.rgb = rgb(col)
        al = opts.get("align", align)
        p.alignment = {"l": PP_ALIGN.LEFT, "c": PP_ALIGN.CENTER, "r": PP_ALIGN.RIGHT}[al]
        p.space_after = Pt(opts.get("space_after", space_after))
        p.space_before = Pt(opts.get("space_before", 0))
        if line_spacing:
            p.line_spacing = line_spacing
        if opts.get("bullet", bullets):
            set_bullet(p, color=COL["accent2"])
        texts.append(plain(item))
    return texts


class Slide:
    """One slide plus what we need to write DECK_OUTLINE.md."""

    def __init__(self, deck: "Deck", slide, title: str, kicker: str | None, notes: str, dark: bool = False):
        self.deck, self.s, self.title, self.kicker, self.dark = deck, slide, title, kicker, dark
        self.rec = {"title": title, "kicker": kicker or "", "texts": [], "figures": [], "unet": None, "sources": [], "notes": notes}
        if notes:
            slide.notes_slide.notes_text_frame.text = notes
        bg = slide.background.fill
        bg.solid()
        bg.fore_color.rgb = rgb(COL["dark"] if dark else COL["bg"])

    # ---- text
    def textbox(self, x, y, w, h, paras, name="text", anchor="t", margin=0.0, record=True, **kw):
        tb = self.s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
        tb.name = name
        tf = tb.text_frame
        tf.word_wrap = True
        tf.auto_size = MSO_AUTO_SIZE.NONE
        tf.margin_left = tf.margin_right = Inches(margin)
        tf.margin_top = tf.margin_bottom = Inches(margin)
        tf.vertical_anchor = {"t": MSO_ANCHOR.TOP, "m": MSO_ANCHOR.MIDDLE, "b": MSO_ANCHOR.BOTTOM}[anchor]
        texts = fill_text(tf, paras, **kw)
        if record:
            self.rec["texts"] += texts
        return tb

    def shape(self, x, y, w, h, fill=None, line=None, line_w=1.0, radius=0.06, dash=False, name="bg", paras=None, anchor="m",
              margin=0.14, record=True, **kw):
        shp = self.s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE if radius else MSO_SHAPE.RECTANGLE,
                                      Inches(x), Inches(y), Inches(w), Inches(h))
        strip_style(shp)
        if radius:
            shp.adjustments[0] = radius
        if fill:
            shp.fill.solid()
            shp.fill.fore_color.rgb = rgb(COL.get(fill, fill))
        else:
            shp.fill.background()
        if line:
            shp.line.color.rgb = rgb(COL.get(line, line))
            shp.line.width = Pt(line_w)
            if dash:
                shp.line.dash_style = MSO_LINE.DASH
        else:
            shp.line.fill.background()
        shp.name = name
        tf = shp.text_frame
        tf.word_wrap = True
        tf.auto_size = MSO_AUTO_SIZE.NONE
        tf.margin_left = tf.margin_right = Inches(margin)
        tf.margin_top = tf.margin_bottom = Inches(margin * 0.8)
        tf.vertical_anchor = {"t": MSO_ANCHOR.TOP, "m": MSO_ANCHOR.MIDDLE, "b": MSO_ANCHOR.BOTTOM}[anchor]
        if paras:
            texts = fill_text(tf, paras, **kw)
            if record:
                self.rec["texts"] += texts
        return shp

    def card(self, x, y, w, h, paras, fill="white", line="line", name="card", anchor="t", **kw):
        return self.shape(x, y, w, h, fill=fill, line=line, name=name, paras=paras, anchor=anchor, **kw)

    def tile(self, x, y, w, h, value, label, sub=None, color="accent", fill="white", vsize=40):
        paras = [(value, {"size": vsize, "bold": True, "color": color, "space_after": 2}),
                 (label, {"size": 14, "color": "ink", "space_after": 2})]
        if sub:
            paras.append((sub, {"size": 12, "color": "muted", "space_after": 0}))
        return self.shape(x, y, w, h, fill=fill, line="line", name="tile", paras=paras, anchor="m", margin=0.18)

    def arrow(self, x1, y1, x2, y2, color="ink2", w=2.0, both=False):
        c = self.s.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, Inches(x1), Inches(y1), Inches(x2), Inches(y2))
        strip_style(c)
        c.line.color.rgb = rgb(COL.get(color, color))
        c.line.width = Pt(w)
        ln = c.line._get_or_add_ln()
        if both:
            etree.SubElement(ln, qn("a:headEnd")).set("type", "triangle")
        etree.SubElement(ln, qn("a:tailEnd")).set("type", "triangle")
        c.name = "arrow"
        return c

    def picture(self, path: Path | None, x, y, w, h, alt: str):
        """Fit the picture inside the (w, h) box, left/top aligned, aspect preserved."""
        if path is None:
            self.unavailable(x, y, w, h, "Chưa có hình (thiếu tệp trong figures/). Chạy lại build_report_assets.py.")
            return None
        with Image.open(path) as im:
            ar = im.size[0] / im.size[1]
        fw, fh = (w, w / ar) if w / h <= ar else (h * ar, h)
        pic = self.s.shapes.add_picture(str(path), Inches(x), Inches(y), width=Inches(fw), height=Inches(fh))
        pic.name = "figure"
        pic._element.nvPicPr.cNvPr.set("descr", alt)
        self.rec["figures"].append(path.name)
        return pic

    def unavailable(self, x, y, w, h, text):
        self.shape(x, y, w, h, fill="wash", line="line", dash=True, name="card:missing", paras=[(text, {"size": 14, "color": "muted", "align": "c"})])

    def unet_placeholder(self, x, y, w, h, detail: str | None = None, size=16):
        """The marked placeholder; the slide builder only calls it while UNet results are absent."""
        paras = [(UNET_PLACEHOLDER, {"size": size, "bold": True, "color": "accent", "align": "c", "space_after": 4})]
        if detail:
            paras.append((detail, {"size": 18 if size >= 24 else max(12, size - 4), "color": "ink2", "align": "c", "space_after": 0}))
        self.rec["unet"] = "placeholder"
        return self.shape(x, y, w, h, fill="accent_wash", line="accent", line_w=1.5, dash=True, name="card:unet-placeholder", paras=paras,
                          anchor="m")

    def table(self, x, y, col_w: list[float], rows: list[list[str]], size=13, row_h=0.42, header_h=0.5, align=None, bold_first_col=False,
              highlight_rows: set[int] | None = None):
        nr, nc = len(rows), len(rows[0])
        total_w = sum(col_w)
        gs = self.s.shapes.add_table(nr, nc, Inches(x), Inches(y), Inches(total_w), Inches(header_h + row_h * (nr - 1)))
        gs.name = "table"
        tbl = gs.table
        tblPr = tbl._tbl.tblPr
        sid = tblPr.find(qn("a:tableStyleId"))
        if sid is None:
            sid = etree.SubElement(tblPr, qn("a:tableStyleId"))
        sid.text = "{2D5ABB26-0587-4C30-8999-92F81FD0307C}"          # No Style, No Grid
        tblPr.set("firstRow", "1")
        tblPr.set("bandRow", "0")
        align = align or ["l"] * nc
        for j, cw in enumerate(col_w):
            tbl.columns[j].width = Inches(cw)
        for i in range(nr):
            tbl.rows[i].height = Inches(header_h if i == 0 else row_h)
            for j in range(nc):
                cell = tbl.cell(i, j)
                cell.margin_left = cell.margin_right = Inches(0.1)
                cell.margin_top = cell.margin_bottom = Inches(0.04)
                cell.vertical_anchor = MSO_ANCHOR.MIDDLE
                head = i == 0
                hl = bool(highlight_rows and i in highlight_rows)
                cell.fill.solid()
                cell.fill.fore_color.rgb = rgb(COL["accent"] if head else (COL["accent_wash"] if hl else COL["white"]))
                tf = cell.text_frame
                tf.word_wrap = True
                texts = fill_text(tf, [rows[i][j]], size=size, color="white" if head else "ink", bold=head or (bold_first_col and j == 0),
                                  align=align[j], space_after=0)
                self.rec["texts"] += texts
                tcPr = cell._tc.get_or_add_tcPr()
                lnB = etree.Element(qn("a:lnB"), w="9525", cap="flat", cmpd="sng", algn="ctr")
                sf = etree.SubElement(lnB, qn("a:solidFill"))
                etree.SubElement(sf, qn("a:srgbClr")).set("val", COL["line"])
                tcPr.insert(0, lnB)
        return gs

    def source(self, text: str, y: float = 6.62):
        self.textbox(MX, y, CW, 0.28, [(text, {"size": 10.5, "color": "muted"})], name="source", record=False)
        self.rec["sources"].append(text)


class Deck:
    def __init__(self, data: Data, assets: Path):
        self.d, self.assets = data, assets
        self.prs = Presentation()
        self.prs.slide_width, self.prs.slide_height = Inches(W), Inches(H)
        self._rescale_layouts()
        self._theme()
        self.slides: list[Slide] = []
        self.sections: list[tuple[str, int]] = []      # (name, index of first slide)
        self.digest = ""

    def _rescale_layouts(self) -> None:
        k = W / 10.0
        for holder in [self.prs.slide_master, *self.prs.slide_layouts]:
            for ph in holder.placeholders:
                ph.left, ph.width = int(ph.left * k), int(ph.width * k)

    def _theme(self) -> None:
        part = self.prs.slide_master.part.part_related_by(RT.THEME)
        root = etree.fromstring(part.blob)
        ns = {"a": "http://schemas.openxmlformats.org/drawingml/2006/main"}
        scheme = root.find(".//a:clrScheme", ns)
        scheme.set("name", "Cardiac MRI Draft")
        vals = {"dk1": COL["ink"], "lt1": "FFFFFF", "dk2": COL["dark"], "lt2": COL["wash"], "accent1": COL["accent"],
                "accent2": COL["accent2"], "accent3": COL["orange"], "accent4": COL["aqua"], "accent5": COL["ink2"],
                "accent6": COL["muted"], "hlink": COL["accent2"], "folHlink": COL["ink2"]}
        for name, val in vals.items():
            el = scheme.find(f"a:{name}", ns)
            for ch in list(el):
                el.remove(ch)
            etree.SubElement(el, "{%s}srgbClr" % ns["a"]).set("val", val)
        fonts = root.find(".//a:fontScheme", ns)
        fonts.set("name", "Calibri")
        for tag in ("majorFont", "minorFont"):
            fonts.find(f"a:{tag}/a:latin", ns).set("typeface", FONT)
        part._blob = etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)

    # ---- slide factories
    def section(self, name: str) -> None:
        self.sections.append((name, len(self.slides)))

    def content(self, title: str, kicker: str, notes: str) -> Slide:
        layout = self.prs.slide_layouts[5]                       # Title Only
        sl = self.prs.slides.add_slide(layout)
        s = Slide(self, sl, title, kicker, notes)
        t = sl.shapes.title
        t.left, t.top, t.width, t.height = Inches(MX), Inches(0.62), Inches(CW), Inches(1.05)
        tf = t.text_frame
        tf.word_wrap = True
        tf.auto_size = MSO_AUTO_SIZE.NONE
        tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
        tf.vertical_anchor = MSO_ANCHOR.TOP
        fill_text(tf, [title], size=30, bold=True, color="ink", space_after=0, line_spacing=0.95)
        t.name = "title"
        s.textbox(MX, 0.3, CW, 0.3, [(kicker, {"size": 12, "bold": True, "color": "accent"})], name="kicker", record=False)
        self.slides.append(s)
        return s

    def title_slide(self, title: str, subtitle: str, kicker: str, notes: str) -> Slide:
        sl = self.prs.slides.add_slide(self.prs.slide_layouts[0])
        s = Slide(self, sl, title, kicker, notes, dark=True)
        t = sl.shapes.title
        t.left, t.top, t.width, t.height = Inches(MX), Inches(1.3), Inches(CW), Inches(1.0)
        tf = t.text_frame
        tf.word_wrap = True
        tf.auto_size = MSO_AUTO_SIZE.NONE
        tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
        tf.vertical_anchor = MSO_ANCHOR.TOP
        fill_text(tf, [title], size=48, bold=True, color="white", space_after=0)
        t.name = "title"
        sub = sl.placeholders[1]
        sub.left, sub.top, sub.width, sub.height = Inches(MX), Inches(2.4), Inches(CW), Inches(1.2)
        stf = sub.text_frame
        stf.word_wrap = True
        stf.auto_size = MSO_AUTO_SIZE.NONE
        stf.margin_left = stf.margin_right = stf.margin_top = stf.margin_bottom = 0
        s.rec["texts"] += fill_text(stf, subtitle if isinstance(subtitle, list) else [subtitle], size=22, color="E8F0FB", space_after=8)
        sub.name = "subtitle"
        s.textbox(MX, 0.7, 9.0, 0.3, [(kicker, {"size": 13, "bold": True, "color": "9EC5F4"})], name="kicker", record=False)
        self.slides.append(s)
        return s

    def finalize(self) -> None:
        n = len(self.slides)
        for i, s in enumerate(self.slides, 1):
            if i == 1:
                continue
            s.textbox(MX, 7.06, 9.5, 0.26, [(f"Cardiac MRI Workspace · bản nháp tự sinh · dữ liệu {self.digest}", {"size": 10, "color": "muted"})],
                      name="footer", record=False)
            s.textbox(W - MX - 1.5, 7.06, 1.5, 0.26, [(f"{i} / {n}", {"size": 10, "color": "muted", "align": "r"})], name="slide-number",
                      record=False)
        self._sections()

    def _sections(self) -> None:
        if not self.sections:
            return
        pres = self.prs.part._element
        p14 = "http://schemas.microsoft.com/office/powerpoint/2010/main"
        ids = [el.get("id") for el in pres.find(qn("p:sldIdLst"))]
        ext_lst = pres.find(qn("p:extLst"))
        if ext_lst is None:
            ext_lst = etree.SubElement(pres, qn("p:extLst"))
        ext = etree.SubElement(ext_lst, qn("p:ext"))
        ext.set("uri", "{521415D9-36F7-43E2-AB2F-B90AF26B5E84}")
        lst = etree.SubElement(ext, "{%s}sectionLst" % p14, nsmap={"p14": p14})
        bounds = [i for _n, i in self.sections] + [len(ids)]
        for k, (name, start) in enumerate(self.sections):
            sec = etree.SubElement(lst, "{%s}section" % p14)
            sec.set("name", name)
            sec.set("id", "{%s}" % str(uuid.uuid5(uuid.NAMESPACE_URL, "cardiac-deck/" + name)).upper())
            sl = etree.SubElement(sec, "{%s}sldIdLst" % p14)
            for sid in ids[start:bounds[k + 1]]:
                etree.SubElement(sl, "{%s}sldId" % p14).set("id", sid)


# =================================================================================================================
# the slides
# =================================================================================================================
def team(root: Path) -> list[dict]:
    names = {"pham_tuan_anh": "Phạm Tuấn Anh", "vu_hung_anh": "Vũ Hùng Anh", "be_quoc_khanh": "Bế Quốc Khánh",
             "nguyen_gia_duc_trung": "Nguyễn Gia Đức Trung"}
    roles = {"pham_tuan_anh": "Trưởng nhóm · Project Control", "vu_hung_anh": "Imaging / Geometry",
             "be_quoc_khanh": "ML training / evaluation", "nguyen_gia_duc_trung": "Backend / persistence"}
    screens = {"pham_tuan_anh": "SCR-02 · 03 · 04", "vu_hung_anh": "SCR-05", "be_quoc_khanh": "SCR-01 · 07", "nguyen_gia_duc_trung": "SCR-06 · 08"}
    vert: dict[str, str] = {}
    p = root / "management" / "PROJECT_STATE.yaml"
    try:
        import yaml
        state = yaml.safe_load(p.read_text(encoding="utf-8"))
        for k, m in (state.get("members") or {}).items():
            vert[k] = str(m.get("vertical", ""))
    except Exception:  # noqa: BLE001 - the team slide must not stop the deck
        pass
    out = []
    for k in names:
        out.append({"name": names[k], "role": roles[k], "vertical": vert.get(k) or "—", "screens": screens[k]})
    return out


def s_title(D: Deck, d: Data, root: Path) -> None:
    team_ = team(root)
    s = D.title_slide(
        "Cardiac MRI Workspace",
        ["Ứng dụng di động kiểm tra vì sao AI phân đoạn sai trên MRI tim (tâm nhĩ trái)",
         (f"Nghiệm thu và bảo vệ {d.f('acceptance_date')} · Học máy · Xử lý ảnh · Khoa học dữ liệu · Phát triển ứng dụng di động",
          {"size": 16, "color": "9EC5F4"})],
        "BẢN NHÁP · SINH TỰ ĐỘNG TỪ ARTIFACT THÍ NGHIỆM",
        "Slide mở đầu. Đây là bản nháp do bộ dựng tự sinh từ artifact thí nghiệm: khi có kết quả UNet, chạy lại một lệnh (tools/report/build_all.py) thì các slide cần UNet tự điền. "
        "Giới thiệu nhóm bốn người và vai trò: Phạm Tuấn Anh (trưởng nhóm, vertical V1 Case Explorer / 2D MRI), Vũ Hùng Anh (V2 3D / sai số không gian), "
        "Bế Quốc Khánh (V3 Experiment / cohort, phụ trách huấn luyện), Nguyễn Gia Đức Trung (V4 Review / findings, backend). "
        "Mỗi người sở hữu một chức năng di động riêng và sẽ bảo vệ chức năng đó trong môn Phát triển ứng dụng di động.")
    x0, gap, w = MX, 0.2, (CW - 3 * 0.2) / 4
    for i, m in enumerate(team_):
        s.shape(x0 + i * (w + gap), 4.55, w, 1.7, fill="dark2", line=None, name="card:team", anchor="t", margin=0.18, paras=[
            (m["name"], {"size": 18, "bold": True, "color": "white", "space_after": 3}),
            (m["role"], {"size": 14, "color": "E8F0FB", "space_after": 6}),
            (m["vertical"], {"size": 13, "bold": True, "color": "9EC5F4", "space_after": 2}),
            (m["screens"], {"size": 13, "color": "E8F0FB", "space_after": 0}),
        ])
    s.textbox(MX, 4.05, CW, 0.35, [("NHÓM VÀ VERTICAL PHỤ TRÁCH", {"size": 12, "bold": True, "color": "9EC5F4"})], name="label", record=False)


def s_north_star(D: Deck, d: Data) -> None:
    s = D.content(
        "Một câu hỏi dẫn dắt cả dự án", "MỞ ĐẦU",
        "Câu hỏi bắc đẩu của dự án không phải là liệt kê tính năng. Một chỉ số Dice trung bình không cho biết mô hình sai ở đâu, sai ở lát nào, "
        "hay hai mô hình khác nhau thế nào trên cùng một giải phẫu. Sản phẩm biến luồng input → mask → metric thành một cuộc điều tra nhiều tầng: "
        "cohort → thí nghiệm → case → lát → vùng/pixel → giải phẫu 3D, và mọi số liệu đều lần ngược được về bằng chứng MRI. "
        "Bốn môn học là bốn góc nhìn lên cùng một sản phẩm (spec 16 §3, §4), không phải bốn dự án riêng.")
    s.shape(MX, TOP, CW, 1.25, fill="accent", line=None, radius=0.05, name="card:question", anchor="m", margin=0.35, paras=[
        ("“Vì sao AI sai trên ca MRI này, và nhà nghiên cứu làm được gì?”", {"size": 30, "bold": True, "color": "white", "align": "c"})])
    cards = [
        ("Học máy", nb("DINOv2 so với UNet thế nào, nhất là khi giảm dữ liệu gán nhãn xuống 25 % và 50 %?")),
        ("Xử lý ảnh", "Voxel và mặt nạ thành biểu diễn 2D/3D xem được ra sao, và hậu xử lý tất định có giúp không?"),
        ("Khoa học dữ liệu", "Mô hình hành xử thế nào trên cả cohort; ngoại lệ và profile theo lát cho thấy gì ngoài số trung bình?"),
        ("Phát triển di động", "Quy trình ảnh y khoa kèm AI phức tạp thành một tương tác nghiên cứu dùng được trên điện thoại thế nào?"),
    ]
    gap, w = 0.2, (CW - 3 * 0.2) / 4
    for i, (t, q) in enumerate(cards):
        s.card(MX + i * (w + gap), 3.3, w, 2.5, [(t, {"size": 21, "bold": True, "color": "accent", "space_after": 8}),
                                                 (q, {"size": 16.5, "color": "ink"})], margin=0.2)
    s.textbox(MX, 6.1, CW, 0.5, [("Một sản phẩm, bốn góc nhìn: mỗi chức năng demo phục vụ ít nhất hai môn (spec 16 §4).",
                                   {"size": 15, "color": "ink2"})], name="note")


def s_hero(D: Deck, d: Data) -> None:
    s = D.content(
        "Luồng demo H1–H10 đi qua tám màn hình", "SẢN PHẨM",
        "Kịch bản demo dài 60 đến 90 giây, một lượt quay liên tục, trên ca demo đại diện, chọn theo quy tắc chứ không phải vì mô hình trông tốt trên ca đó. "
        "Luồng bắt đầu ở tổng quan cohort (H1), tìm ca ngoại lệ (H2), mở ca trong trình khám MRI (H3), đến lát có vấn đề (H4), so sánh dự đoán với ground truth "
        "và bản đồ lỗi (H5), mở 3D (H6), chọn vùng lỗi và nhảy về lát 2D (H7), gắn cờ hoặc sửa bằng brush (H8), lưu mask đã duyệt mà vẫn giữ nguyên dự đoán gốc (H9) "
        "và quay về so sánh mô hình / ít dữ liệu (H10). Tám màn hình SCR-01 đến SCR-08 chia cho bốn vertical. Nguồn: management/DEMO_STANDARD.md §3 và §4.")
    steps = [
        ("H1", "Mở tổng quan cohort / thí nghiệm", "SCR-01"), ("H2", "Tìm ca ngoại lệ", "SCR-01"),
        ("H3", "Mở trình khám MRI", "SCR-02 → 03"), ("H4", "Đến lát có vấn đề", "SCR-03 · 04"),
        ("H5", "So sánh dự đoán, ground truth, lỗi", "SCR-03 · 04"), ("H6", "Mở 3D và bản đồ lỗi", "SCR-05"),
        ("H7", "Chọn vùng lỗi, nhảy về lát 2D", "SCR-05 → 03"), ("H8", "Gắn cờ hoặc sửa bằng brush", "SCR-06 · 08"),
        ("H9", "Lưu mask đã duyệt, giữ dự đoán gốc", "SCR-06"), ("H10", "Về so sánh mô hình và ít dữ liệu", "SCR-07"),
    ]
    gap = 0.17
    w, h = (CW - 4 * gap) / 5, 1.45
    for i, (hid, txt, scr) in enumerate(steps):
        r, c = divmod(i, 5)
        s.card(MX + c * (w + gap), TOP + r * (h + 0.18), w, h, [
            (hid, {"size": 20, "bold": True, "color": "accent", "space_after": 2}),
            (txt, {"size": 14, "color": "ink", "space_after": 3}),
            (scr, {"size": 12, "bold": True, "color": "muted", "space_after": 0})], margin=0.14)
    y = TOP + 2 * (h + 0.18) + 0.1
    scr = [("SCR-01", "Study Overview", "V3"), ("SCR-02", "Case List", "V1"), ("SCR-03", "Case Explorer 2D", "V1"), ("SCR-04", "Error Inspector", "V1"),
           ("SCR-05", "3D Inspector", "V2"), ("SCR-06", "Review / Correction", "V4"), ("SCR-07", "Experiment Comparison", "V3"),
           ("SCR-08", "Findings", "V4")]
    g2, w2 = 0.1, (CW - 7 * 0.1) / 8
    for i, (sid, nm, v) in enumerate(scr):
        s.shape(MX + i * (w2 + g2), y, w2, 0.95, fill="accent_wash", line=None, name="card:screen", anchor="m", margin=0.08, paras=[
            (sid, {"size": 12, "bold": True, "color": "accent", "align": "c", "space_after": 1}),
            (nm, {"size": 11.5, "color": "ink", "align": "c", "space_after": 1}),
            (v, {"size": 11.5, "bold": True, "color": "ink2", "align": "c", "space_after": 0})])
    s.source("Mục tiêu 60–90 giây, một lượt quay, ca demo đại diện (chọn theo quy tắc, không theo kết quả). Nguồn: management/DEMO_STANDARD.md §3–§4.", y=6.62)


def s_arch(D: Deck, d: Data) -> None:
    s = D.content(
        "Kiến trúc: điện thoại chỉ hiển thị, việc nặng nằm ở backend và ML", "SẢN PHẨM",
        "Kiến trúc logic theo spec 09. Bên trái là ứng dụng di động Expo / React Native, chạy trên Galaxy A17 5G: 2D dùng view native với lớp phủ SVG và brush, "
        "3D là WebGL2 chạy trong react-native-webview, và lớp app/core viết bằng JavaScript thuần chịu trách nhiệm hợp đồng, vận chuyển và bảy trạng thái màn hình. "
        f"Ở giữa là backend FastAPI + SQLite chạy trên Mac mini M2, điện thoại gọi qua mạng overlay riêng ZeroTier; {d.f('endpoints_total')} endpoint, "
        f"trong đó {d.f('endpoints_hero')} endpoint của hero flow, phiên bản API Contract {d.f('api_contract')}. "
        "Bên phải là pipeline ML (PyTorch, máy tính riêng): suy luận, hậu xử lý, chấm điểm rồi xuất gói Contract 2; kết quả đến ứng dụng chỉ qua các gói này. "
        "Thanh dưới cùng là các hợp đồng dùng chung, được CI kiểm: không ai tự viết một biến đổi hình học riêng.")
    bw, gap = 3.25, (CW - 3 * 3.25) / 2
    xs = [MX, MX + bw + gap, MX + 2 * (bw + gap)]
    y, h = TOP, 3.55
    boxes = [
        ("Điện thoại", d.f("device"), ["Ứng dụng " + d.f("stack_expo"), "2D: view native + lớp phủ SVG, brush", "3D: WebGL2 trong react-native-webview",
                                      "app/core: hợp đồng, vận chuyển, 7 trạng thái màn hình"]),
        ("Backend", "Mac mini M2 · FastAPI + SQLite", [f"{d.f('endpoints_total')} endpoint ({d.f('endpoints_hero')} cho hero flow)",
                                                        "Review (bất biến) và finding trong SQLite", "Artifact trên đĩa: PNG theo lát, mesh L0, sha256",
                                                        f"{d.f('backend_cases')} case phục vụ"]),
        ("Pipeline ML", "PyTorch · máy tính riêng", ["ml.infer → ml.postprocess → ml.evaluate", "DINOv2 và UNet, cùng công thức",
                                                      "Xuất gói Contract 2 (dự đoán, chỉ số, 3D)", "Chỉ số theo case, CI bootstrap"]),
    ]
    for x, (t, sub, items) in zip(xs, boxes):
        s.card(x, y, bw, h, [(t, {"size": 20, "bold": True, "color": "accent", "space_after": 1}),
                             (sub, {"size": 13, "color": "muted", "space_after": 8})] +
               [(it, {"size": 14, "bullet": True, "space_after": 5}) for it in items], margin=0.2)
    ym = y + 1.2
    s.arrow(xs[0] + bw + 0.08, ym, xs[1] - 0.08, ym, color="accent", both=True)
    s.textbox(xs[0] + bw + 0.05, ym - 0.95, gap - 0.1, 0.85, [("HTTP/JSON qua overlay riêng", {"size": 12, "color": "ink2", "align": "c", "space_after": 0})],
              name="arrow-label", anchor="b")
    s.textbox(xs[0] + bw + 0.05, ym + 0.1, gap - 0.1, 0.75, [("ảnh theo lát, không tải cả khối", {"size": 12, "color": "ink2", "align": "c", "space_after": 0})],
              name="arrow-label")
    s.arrow(xs[2] - 0.08, ym, xs[1] + bw + 0.08, ym, color="accent")
    s.textbox(xs[1] + bw + 0.05, ym - 0.95, gap - 0.1, 0.85, [("gói Contract 2", {"size": 12, "color": "ink2", "align": "c", "space_after": 0})],
              name="arrow-label", anchor="b")
    s.shape(MX, 5.6, CW, 1.0, fill="accent_wash", line=None, name="card:contracts", anchor="m", margin=0.25, paras=[
        ("**Hợp đồng dùng chung, CI kiểm:** API Contract " + d.f("api_contract") + " · Contract 2 (gói thí nghiệm) · geometry contract "
         "(fixture voxel ↔ lát ↔ thế giới, cả backend và app đều phải qua cùng fixture)", {"size": 15, "color": "ink"})])
    s.source("Nguồn: docs/specs/v1.0/09, management/adr/TECH_STACK_ADR.md, backend/README.md, mobile/README.md.", y=6.7)


def s_data(D: Deck, d: Data) -> None:
    sp = d.agg.get("split") or {}
    if not sp:
        s = D.content("Dữ liệu chia đóng băng, holdout khoá, không rò rỉ theo từng case", "DỮ LIỆU VÀ QUẢN TRỊ",
                      "Chưa có thông tin chia dữ liệu trong results_aggregate.json (thiếu manifests/split_manifest.json trong thư mục run).")
        s.unavailable(MX, TOP, CW, 2.0, "Thiếu khối split trong results_aggregate.json (không đọc được manifests/split_manifest.json của run).")
        return
    tn, te, va, ho = sp.get("train_nominal"), sp.get("train_effective"), sp.get("validation"), sp.get("final_holdout")
    sub = sp.get("subsets_effective") or {}
    s = D.content(
        "Dữ liệu chia đóng băng, holdout khoá, không rò rỉ theo từng case", "DỮ LIỆU VÀ QUẢN TRỊ",
        f"Bộ dữ liệu LASC 2018 gồm {sum(x for x in (tn, va, ho) if x)} case MRI tim. Phép chia Path A, seed {sp.get('seed')}, đóng băng bằng sha256: train danh nghĩa {tn} case "
        f"(hiệu dụng {te} sau khi loại {sp.get('training_excluded_n')} case do nghi trùng bệnh nhân với một case holdout, DR-002b), validation {va} case dùng để chọn checkpoint và cấu hình, "
        f"holdout {ho} case chính là tập kiểm thử của cuộc thi, chỉ dùng để chấm cuối. Các tập con 25, 50, 100 phần trăm lồng nhau: "
        f"{sub.get('25_percent')} ⊂ {sub.get('50_percent')} ⊂ {sub.get('100_percent')} case hiệu dụng. "
        "Quản trị: holdout bị khoá cho tới khi GATE-IMG-01 đóng, mỗi run được dự đoán và chấm đúng một lần; kho mã công khai chỉ chứa số tổng hợp, "
        "số theo từng case nằm ngoài git; case INT-12 là case chỉ-suy-luận trong app, ẩn nhưng không làm mù (DR-017): nó vẫn nằm trong 54 case nên thống kê cohort có thể suy ra giá trị của nó.")
    total = (tn or 0) + (va or 0) + (ho or 0)
    sc = 6.6 / total if total else 0
    x = MX
    s.textbox(MX, TOP, 6.6, 0.3, [(f"Chia theo case (dữ liệu gốc {total} case)", {"size": 13, "bold": True, "color": "ink2"})], name="label", record=False)
    for lab, n_, col, tc in (("Train", tn, "accent", "white"), ("Val", va, "accent2", "white"), ("Holdout", ho, "dark", "white")):
        w = n_ * sc
        s.shape(x, TOP + 0.4, w - 0.04, 0.95, fill=col, line=None, radius=0.0, name="bar", anchor="m", margin=0.04, paras=[
            (f"{lab}", {"size": 13, "bold": True, "color": tc, "align": "c", "space_after": 0}),
            (f"{n_}", {"size": 18, "bold": True, "color": tc, "align": "c", "space_after": 0})])
        x += w
    s.textbox(MX, TOP + 1.42, 3.3, 0.5, [(f"hiệu dụng {te} sau DR-002b", {"size": 12, "color": "muted"})], name="caption", record=False)
    s.textbox(MX, TOP + 2.15, 6.6, 0.3, [("Tập con huấn luyện lồng nhau (case hiệu dụng)", {"size": 13, "bold": True, "color": "ink2"})], name="label", record=False)
    mx_ = max([v for v in sub.values() if v] or [1])
    for i, (k, lab) in enumerate((("25_percent", "25 %"), ("50_percent", "50 %"), ("100_percent", "100 %"))):
        n_ = sub.get(k) or 0
        yy = TOP + 2.6 + i * 0.5
        s.textbox(MX, yy, 0.7, 0.38, [(nb(lab), {"size": 14, "bold": True})], name="bar-label", anchor="m", record=False)
        s.shape(MX + 0.8, yy + 0.04, 4.6 * n_ / mx_, 0.3, fill="accent2", line=None, radius=0.0, name="bar")
        s.textbox(MX + 0.9 + 4.6 * n_ / mx_, yy, 1.0, 0.38, [(f"{n_} case", {"size": 14})], name="bar-value", anchor="m", record=False)
    s.rec["texts"].append(f"Tập con lồng nhau: {sub.get('25_percent')} ⊂ {sub.get('50_percent')} ⊂ {sub.get('100_percent')} case hiệu dụng")
    xr, wr = 7.7, W - MX - 7.7
    cards = [
        ("Holdout khoá", f"{ho} case chỉ chấm đúng một lần, sau khi GATE-IMG-01 đóng; không dùng để chọn mô hình, ngưỡng hay hậu xử lý."),
        ("Không rò rỉ theo case", "Kho mã công khai chỉ có số tổng hợp (trung bình, CI, delta). Số theo từng case, ảnh MRI và mặt nạ nằm ngoài git."),
        ("INT-12: ẩn, không mù", "Một case holdout dùng như case chỉ-suy-luận trong app. Vẫn nằm trong 54 case, nên thống kê cohort có thể suy ra giá trị của nó (DR-017)."),
    ]
    for i, (t, b) in enumerate(cards):
        s.card(xr, TOP + i * 1.62, wr, 1.5, [(t, {"size": 17, "bold": True, "color": "accent", "space_after": 4}), (b, {"size": 14})], margin=0.18)
    s.source("Nguồn: management/spikes/SPIKE_D_DATASET/SPLIT_RESULT.md, management/day39/RESULTS_HOLDOUT_DINOV2.md, DR-002b, DR-017.", y=6.66)


def matrix(s: Slide, d: Data, x: float, y: float, w: float, h: float) -> None:
    """Experiment matrix: families x fractions; DINOv2 cells show the Dice, missing UNet cells carry the placeholder."""
    labw = 1.2
    cw = (w - labw - 2 * 0.1) / 3
    sub = (d.agg.get("split") or {}).get("subsets_effective") or {}
    fr = [(0.25, "25_percent"), (0.5, "50_percent"), (1.0, "100_percent")]
    for j, (f, k) in enumerate(fr):
        tc = sub.get(k) or next((r["train_cases"] for r in d.runs if r.get("train_cases") and r.get("training_fraction")
                                 and abs(r["training_fraction"] - f) < 1e-9), None)
        s.textbox(x + labw + 0.1 + j * (cw + 0.1), y, cw, 0.5, [(nb(f"{int(f * 100)} %"), {"size": 15, "bold": True, "align": "c", "space_after": 0}),
                                                              (f"{tc} case" if tc else "", {"size": 12, "color": "muted", "align": "c", "space_after": 0})],
                  name="matrix-head", record=False)
    rh = (h - 0.6) / 2
    for i, (fam, nm) in enumerate((("dinov2", "DINOv2"), ("unet", "UNet"))):
        yy = y + 0.6 + i * rh
        s.textbox(x, yy, labw, rh - 0.1, [(nm, {"size": 16, "bold": True, "color": "accent"})], name="matrix-row", anchor="m", record=False)
        for j, (f, _k) in enumerate(fr):
            xx = x + labw + 0.1 + j * (cw + 0.1)
            r = next((r for r in d.family(fam) if abs(r["training_fraction"] - f) < 1e-9), None)
            if r:
                s.card(xx, yy, cw, rh - 0.1, [(vn(r["dice_mean"]), {"size": 22, "bold": True, "color": "ink", "align": "c", "space_after": 0}),
                                              (ci_text(r["dice_ci95"]), {"size": 11.5, "color": "muted", "align": "c", "space_after": 0})],
                       anchor="m", margin=0.06, name="card:run")
            elif fam == "unet":
                s.shape(xx, yy, cw, rh - 0.1, fill="accent_wash", line="accent", line_w=1.25, dash=True, name="card:unet-placeholder", anchor="m",
                        margin=0.08, paras=[(UNET_PLACEHOLDER, {"size": 12, "bold": True, "color": "accent", "align": "c", "space_after": 0})])
                s.rec["unet"] = "placeholder"
            else:
                s.card(xx, yy, cw, rh - 0.1, [("chưa có", {"size": 13, "color": "muted", "align": "c"})], anchor="m", name="card:missing")


def s_method(D: Deck, d: Data) -> None:
    s = D.content(
        "Một công thức huấn luyện, chỉ khác dữ liệu và mô hình", "HỌC MÁY · PHƯƠNG PHÁP",
        "ADR-ML-001, đóng băng ngày 01/10, quy định một công thức duy nhất cho sáu run huấn luyện lõi: DINOv2 và UNet, mỗi họ ở 25, 50 và 100 phần trăm dữ liệu. "
        f"DINOv2: {d.f('recipe_dinov2')}. UNet: {d.f('recipe_unet')}. Dùng chung: đầu vào {d.f('recipe_input')}, loss {d.f('recipe_loss')}, {d.f('recipe_opt')}, "
        f"{d.f('recipe_epochs')}, checkpoint là {d.f('recipe_checkpoint')}. Mục tiêu là công bằng khoa học: cùng dữ liệu, cùng tiền xử lý, cùng loss, optimizer, batch, epoch, seed, "
        "ngưỡng và luật chọn checkpoint, nên chênh lệch kết quả là do mô hình và lượng dữ liệu. Kết quả không như kỳ vọng vẫn là kết quả hợp lệ (PR-SCI-03); không chỉnh gì sau khi thấy kết quả. "
        "EXP-D-PP không huấn luyện thêm: nó áp hậu xử lý đã đóng băng lên dự đoán của EXP-D-100. "
        + ("Hàng UNet đang chờ kết quả do Khánh huấn luyện." if not d.unet_present else "Hàng UNet đã có kết quả."))
    rows = [["Hạng mục", "Giá trị đóng băng"],
            ["DINOv2", d.f("recipe_dinov2")], ["UNet", d.f("recipe_unet")], ["Đầu vào", d.f("recipe_input")], ["Loss", d.f("recipe_loss")],
            ["Tối ưu", d.f("recipe_opt")], ["Lịch huấn luyện", d.f("recipe_epochs")], ["Chọn checkpoint", d.f("recipe_checkpoint")]]
    s.table(MX, TOP, [1.7, 4.7], rows, size=13, row_h=0.56, header_h=0.45, bold_first_col=True)
    xm, wm = 7.5, W - MX - 7.5
    matrix(s, d, xm, TOP, wm, 3.1)
    pp = d.pp_pair()
    if pp:
        src, p, _c = pp
        s.shape(xm, TOP + 3.3, wm, 0.95, fill="orange_wash", line=None, name="card:pp", anchor="m", margin=0.18, paras=[
            (f"**{d.lab(p)}**: {vn(p['dice_mean'])}", {"size": 16, "color": "ink", "space_after": 2}),
            (f"không huấn luyện thêm: hậu xử lý áp lên dự đoán của {d.lab(src)}", {"size": 12.5, "color": "ink2", "space_after": 0})])
    s.textbox(xm, TOP + 4.4, wm, 0.6, [("Ô: Dice 3D trung bình trên holdout và CI 95 %.", {"size": 12, "color": "muted"})], name="caption", record=False)
    s.source("Nguồn: management/adr/ADR_ML_001.md; số trong ô lấy từ results_aggregate.json.", y=6.66)


def s_results_table(D: Deck, d: Data) -> None:
    b = d.best()
    s = D.content(
        f"Dice 3D trung bình cao nhất: {nb(b['label'])}, {vn(b['dice_mean'])} (n = {d.n})", "HỌC MÁY · KẾT QUẢ",
        f"Kết quả cuối trên holdout khoá, n = {d.n} case, mỗi run dự đoán và chấm đúng một lần. Dice 3D tính theo từng case rồi lấy trung bình; CI 95 % là bootstrap phân vị của "
        f"trung bình theo case, {thou((d.agg.get('bootstrap') or {}).get('resamples'))} lần, seed {(d.agg.get('bootstrap') or {}).get('seed')}. "
        + " ".join(f"{d.lab(r)}: {vn(r['dice_mean'])} {ci_text(r['dice_ci95'])}, trung vị {vn(r['dice_median'])}." for r in d.runs)
        + " Sai lệch thể tích (RVE) tính theo số voxel vì spacing là placeholder đơn vị. "
        + ("Chưa có UNet nên chưa so sánh được hai họ mô hình." if not d.unet_present else "Bảng gồm cả họ UNet."))
    rows = [["Run", "Dice 3D TB [CI 95 %]", "Trung vị (Q1–Q3)", "SD", "IoU TB", "Sai lệch thể tích TB"]]
    for r in d.runs:
        rows.append([d.lab(r), f"**{vn(r['dice_mean'])}**  {ci_text(r['dice_ci95'])}",
                     f"{vn(r['dice_median'])} ({vn(r['dice_q1'])}–{vn(r['dice_q3'])})", vn(r["dice_sd"]), vn(r["iou_mean"]),
                     pct(r["rve_percent_mean"], 1, True)])
    row_h = 0.52 if len(rows) <= 6 else 0.46
    best_i = 1 + d.runs.index(b)
    s.table(MX, TOP, [3.3, 3.1, 2.4, 0.9, 1.0, 1.43], rows, size=14, row_h=row_h, header_h=0.5, bold_first_col=True,
            align=["l", "l", "l", "r", "r", "r"], highlight_rows={best_i})
    ytab = TOP + 0.5 + row_h * (len(rows) - 1)
    if d.unet_missing:
        s.unet_placeholder(MX, ytab + 0.3, CW, 0.9, ("Ba run UNet (25 %, 50 %, 100 %) sẽ xuất hiện trong bảng này khi có kết quả holdout." if not d.unet_present
                                                     else f"còn thiếu: {', '.join(d.unet_missing)}"), size=18)
    s.source(f"Hàng được tô = Dice cao nhất. Sai lệch thể tích = (V dự đoán − V ground truth) / V ground truth, theo voxel. "
             f"Nguồn: results_aggregate.json (n = {d.n}).", y=6.62)


def figure_slide(D: Deck, d: Data, title, kicker, key, alt, bullets, notes, tile=None, y_source=6.62, unet_note=False) -> Slide:
    s = D.content(title, kicker, notes)
    fw = 8.55
    s.picture(d.fig(key, D.assets), MX, TOP - 0.05, fw, 4.8, alt)
    xr, wr = MX + fw + 0.3, W - MX - (MX + fw + 0.3)
    y = TOP
    if tile:
        s.tile(xr, y, wr, 1.8, tile[0], tile[1], tile[2] if len(tile) > 2 else None, color=tile[3] if len(tile) > 3 else "accent", vsize=36)
        y += 2.0
    s.textbox(xr, y, wr, 4.7 - (y - TOP), [(b, {"bullet": True, "size": 14, "space_after": 8}) for b in bullets], name="bullets")
    if unet_note and d.unet_missing:
        s.unet_placeholder(xr, 5.55, wr, 0.95, ("họ UNet sẽ thành đường thứ hai trong hình" if not d.unet_present else f"còn thiếu: {', '.join(d.unet_missing)}"),
                           size=15)
    s.source(f"Nguồn: results_aggregate.json (n = {d.n}); hình sinh bởi tools/report/build_report_assets.py.", y=y_source)
    return s


def s_fig_a(D: Deck, d: Data) -> None:
    b = d.best()
    ov = [(r, q) for i, r in enumerate(d.runs) for q in d.runs[i + 1:] if r["dice_ci95"][1] > q["dice_ci95"][0] and q["dice_ci95"][1] > r["dice_ci95"][0]]
    npairs = len(d.runs) * (len(d.runs) - 1) // 2
    title = ("CI của từng run chồng nhau, nên cần so sánh cặp theo case" if ov else "Dice 3D theo từng run: các CI tách bạch")
    figure_slide(D, d, title, "HỌC MÁY · KẾT QUẢ", "a",
                 "Dice 3D trung bình và khoảng tin cậy 95 % theo từng run",
                 [f"Các run xếp từ ít đến nhiều dữ liệu, rồi đến bản hậu xử lý; điểm là trung bình, vạch là CI 95 %.",
                  f"{len(ov)} trong {npairs} cặp run có CI chồng nhau: nhìn riêng từng CI không đủ để kết luận.",
                  "Phép so sánh đúng là so sánh cặp theo từng case (slide sau)."],
                 f"Hình này là số trung bình Dice 3D và CI 95 % của từng run trên {d.n} case. Cao nhất là {d.lab(b)} với {vn(b['dice_mean'])} {ci_text(b['dice_ci95'])}. "
                 f"Điểm cần nói rõ: nhiều khoảng tin cậy của các run khác nhau chồng lên nhau ({len(ov)} trên {npairs} cặp), vì mỗi CI chỉ mô tả độ bất định của một run. "
                 "Khi các run được chấm trên cùng tập case, phép so sánh mạnh hơn là delta cặp theo từng case, ở slide kế tiếp.",
                 tile=(vn(b["dice_mean"]), f"Dice 3D TB cao nhất: {d.lab(b)}", f"CI 95 % {ci_text(b['dice_ci95'])}", "orange" if str(b['variant']).startswith("PROCESSED") else "accent"))


def s_fig_b(D: Deck, d: Data) -> None:
    dino = d.family("dinov2")
    lo, hi = (dino[0], dino[-1]) if len(dino) > 1 else (None, None)
    full = d.comp(lo["experiment_id"], hi["experiment_id"]) if lo else None
    fr = [r["training_fraction"] for r in dino]
    adj = []
    for c in d.comps_of("data_scarcity"):
        ra, rb = d.by_id.get(c["a"]), d.by_id.get(c["b"])
        if ra and rb and ra["family"] == "dinov2" and rb["family"] == "dinov2"                 and fr.index(rb["training_fraction"]) - fr.index(ra["training_fraction"]) == 1:
            adj.append(c)
    zero = [c for c in adj if c["ci95"][0] <= 0 <= c["ci95"][1]]
    bul = []
    if full:
        bul.append(f"Họ DINOv2, {lo['train_cases']} → {hi['train_cases']} case: Dice {sgn(full['mean_delta'])} {ci_text(full['ci95'], 3, True)}"
                   + (", CI chứa 0." if full["ci95"][0] <= 0 <= full["ci95"][1] else ", CI không chứa 0."))
    for c in adj:
        ra, rb = d.by_id[c["a"]], d.by_id[c["b"]]
        bul.append(f"{nb(ra['label'].split(' ', 1)[1])} → {nb(rb['label'].split(' ', 1)[1])}: {sgn(c['mean_delta'])} {ci_text(c['ci95'], 3, True)}"
                   + (" (CI chạm 0)" if c in zero else ""))
    bul.append("Mỗi mức là một run, một seed: chênh lệch gồm cả phương sai giữa các lần chạy.")
    if full and full["ci95"][0] > 0:
        front = bool(adj) and adj[0]["mean_delta"] / full["mean_delta"] > 0.5
        title = ("Ít dữ liệu hơn thì Dice thấp hơn; mức tăng chủ yếu ở nửa đầu" if front else "Ít dữ liệu hơn thì Dice thấp hơn")
        if d.unet_present:
            title = "Dice theo lượng dữ liệu huấn luyện, theo từng họ mô hình"
    else:
        title = "Dice theo lượng dữ liệu huấn luyện: chưa tách khỏi nhiễu"
    figure_slide(D, d, title, "HỌC MÁY · KẾT QUẢ", "b",
                 "Dice 3D trung bình theo số case huấn luyện hiệu dụng, vùng mờ là CI 95 %", bul,
                 "Đây là đường scarcity của họ DINOv2: Dice theo số case huấn luyện hiệu dụng, vùng mờ là CI 95 %. "
                 + (f"Từ {lo['train_cases']} lên {hi['train_cases']} case Dice tăng {sgn(full['mean_delta'])} {ci_text(full['ci95'], 3, True)}. " if full else "")
                 + ("Có bước mà CI chạm 0, nên thí nghiệm này không thể khẳng định lợi ích của bước đó. " if zero else "")
                 + "Lưu ý quan trọng: mỗi mức là một lần huấn luyện (seed 2024) và checkpoint được chọn ở các epoch rất sớm, không ổn định (xem slide giới hạn), "
                 "nên chênh lệch giữa các mức gồm cả phương sai giữa các lần chạy mà thiết kế này không tách ra được. Điểm hình thoi là bản hậu xử lý PP-4 áp lên run 100 %. "
                 + ("Họ UNet sẽ là đường thứ hai khi có kết quả; hình tự cập nhật." if not d.unet_present else "Họ UNet đã có đường riêng trong hình."),
                 unet_note=True)


def s_fig_f(D: Deck, d: Data) -> None:
    pp = d.pp_pair()
    ppc = pp[2] if pp else None
    zero = [c for c in d.comps if c["ci95"][0] <= 0 <= c["ci95"][1]]
    nz = len(d.comps) - len(zero)
    bul = ["Chấm đặc: CI không chứa 0. Chấm rỗng: CI chứa 0, chưa khẳng định được."]
    if ppc:
        bul.append(f"Hậu xử lý: {sgn(ppc['mean_delta'])} {ci_text(ppc['ci95'], 3, True)}; {ppc['b_higher']}/{ppc['n']} case tốt hơn.")
    if 0 < len(zero) <= 2:
        for c in zero:
            bul.append(f"{c['label']}: CI chạm hoặc chứa 0.")
    elif zero:
        bul.append(f"{len(zero)}/{len(d.comps)} phép so sánh có CI chạm hoặc chứa 0: chưa khẳng định được.")
    bul.append("Không hiệu chỉnh đa so sánh; mỗi mức dữ liệu một seed.")
    figure_slide(D, d, "So sánh cặp từng case: delta Dice kèm CI 95 %", "HỌC MÁY · KẾT QUẢ", "f",
                 "Biểu đồ forest: delta Dice trung bình theo cặp run, kèm CI 95 %", bul,
                 f"Mỗi dòng là một phép so sánh cặp theo từng case (run B trừ run A) trên cùng {d.n} case, kèm CI 95 % bootstrap theo cặp. "
                 f"{nz} trong {len(d.comps)} phép so sánh có CI không chứa 0 (chấm đặc); chấm rỗng là CI chứa 0, tức chưa khẳng định được. "
                 + (f"Hậu xử lý: {sgn(ppc['mean_delta'])} {ci_text(ppc['ci95'], 3, True)}, {ppc['b_higher']} trên {ppc['n']} case tốt hơn. " if ppc else "")
                 + f"{len(d.comps)} khoảng tin cậy này không được hiệu chỉnh đa so sánh. Ứng dụng cố ý trả comparable = false cho cặp mặt nạ thô với đã xử lý; dòng hậu xử lý là phân tích ablation ngoại tuyến "
                 "(spec 08 §2). " + ("Các phép so sánh UNet với DINOv2 sẽ xuất hiện ở đây khi có kết quả UNet." if not d.unet_present else ""))


def s_rqa(D: Deck, d: Data) -> None:
    mc = d.comps_of("model_comparison")
    notes_base = ("Câu hỏi nghiên cứu RQ-A: DINOv2 so với UNet khi giảm dữ liệu. ")
    if not d.unet_present:
        s = D.content("RQ-A: UNet so với DINOv2 khi giảm dữ liệu", "HỌC MÁY · SO SÁNH MÔ HÌNH",
                      notes_base + f"Hiện chưa trả lời được: họ UNet (EXP-U-025, EXP-U-050, EXP-U-100) chưa huấn luyện xong; Bế Quốc Khánh phụ trách, kế hoạch là xong {d.f('unet_due')}. "
                      "Khi có kết quả, chạy lại bộ dựng: bảng này sẽ điền Dice của ba mức, delta cặp UNet và DINOv2 tại từng mức kèm CI, và hình scarcity thêm đường UNet. "
                      "Cho đến lúc đó, đừng nói bất kỳ điều gì về việc mô hình nào tốt hơn. Nếu UNet không kịp, báo cáo ghi rõ điều đó (rủi ro đã nêu trong kế hoạch).")
        s.unet_placeholder(MX, TOP, CW, 2.2, "Chưa có run UNet nào trong results_aggregate.json. Câu hỏi RQ-A chưa trả lời được.", size=30)
        cards = [("Sẽ hiện ở đây", ["Dice 3D của ba mức × hai mô hình", "Delta cặp UNet − DINOv2 tại từng mức, kèm CI 95 %"]),
                 ("Cách điền tự động", ["Thêm EXP-U-* vào --runs và chạy lại tools/report/build_all.py", "Không sửa slide bằng tay"]),
                 ("Lịch và rủi ro", [f"UNet 3/3 dự kiến {d.f('unet_due')}", "Đường găng: " + d.f("critical_path")])]
        gap, w = 0.2, (CW - 2 * 0.2) / 3
        for i, (t, items) in enumerate(cards):
            s.card(MX + i * (w + gap), TOP + 2.5, w, 2.2, [(t, {"size": 17, "bold": True, "color": "accent", "space_after": 6})] +
                   [(it, {"size": 14, "bullet": True, "space_after": 4}) for it in items], margin=0.2)
        s.source("Nguồn: management/day40/REPLAN_TO_2026-10-31.md; ADR-ML-001; DR-016a.", y=6.62)
        return
    parts = []
    for f_ in (0.25, 0.5, 1.0):
        du = next((r for r in d.family("dinov2") if abs(r["training_fraction"] - f_) < 1e-9), None)
        un = next((r for r in d.family("unet") if abs(r["training_fraction"] - f_) < 1e-9), None)
        if du and un:
            parts.append(f"{int(f_ * 100)} %: DINOv2 {vn(du['dice_mean'])} so với UNet {vn(un['dice_mean'])}.")
    s = D.content("RQ-A: UNet so với DINOv2 khi giảm dữ liệu", "HỌC MÁY · SO SÁNH MÔ HÌNH",
                  notes_base + "Kết quả holdout của họ UNet đã có. " + " ".join(parts) +
                  " Đọc cùng delta cặp theo từng case bên phải: CI chứa 0 thì chưa khẳng định khác biệt. Mỗi mức vẫn là một run, một seed.")
    matrix(s, d, MX, TOP, 6.1, 3.4)
    miss = d.unet_missing
    if miss:
        s.unet_placeholder(MX, TOP + 3.6, 6.1, 0.95, f"còn thiếu: {', '.join(miss)}", size=15)
    rows = [["Cặp (A → B)", "Δ Dice [CI 95 %]"]]
    take = []
    for c in mc:
        zero = c["ci95"][0] <= 0 <= c["ci95"][1]
        rows.append([c["label"], f"{sgn(c['mean_delta'])} {ci_text(c['ci95'], 3, True)}" + (" (chứa 0)" if zero else "")])
        ra, rb = d.by_id[c["a"]], d.by_id[c["b"]]
        if zero:
            take.append(f"{nb(ra['label'])} và {nb(rb['label'])}: chưa khác biệt rõ (CI chứa 0).")
        else:
            hi_, lo_ = (rb, ra) if c["mean_delta"] > 0 else (ra, rb)
            take.append(f"{nb(hi_['label'])} cao hơn {nb(lo_['label'])} (CI không chứa 0).")
    xt = MX + 6.4
    wt = W - MX - xt
    if mc:
        s.table(xt, TOP, [2.55, wt - 2.55], rows, size=12.5, row_h=0.6, header_h=0.5)
        s.textbox(xt, TOP + 0.5 + 0.6 * len(mc) + 0.35, wt, 2.0, [(t, {"bullet": True, "size": 14, "space_after": 6}) for t in take], name="bullets")
    else:
        s.unavailable(xt, TOP, wt, 1.6, "Chưa có tệp so sánh cặp UNet–DINOv2 (chạy ml.evaluate compare).")
    s.source("Nguồn: results_aggregate.json; Δ = B − A trên cùng các case holdout.", y=6.62)


def s_ip_pipeline(D: Deck, d: Data) -> None:
    s = D.content("Từ voxel đến mặt nạ: chuẩn hoá theo volume, hai biến thể tách bạch", "XỬ LÝ ẢNH · CHUẨN HOÁ VÀ RESIZE",
                  f"Chuỗi xử lý ảnh của dự án. Volume NRRD được cắt thành các lát theo trục z. Chuẩn hoá: {d.f('norm_rule')} (DR-011), tuyệt đối không dùng thống kê của cả cohort, nên không có rò rỉ. "
                  "Resize: ảnh nội suy bilinear có antialias về 560×560; mặt nạ dùng nearest-exact để giữ nguyên nhãn, không sinh giá trị lạ. Mô hình xuất logits, được resize ngược về kích thước lát gốc bằng bilinear, "
                  "rồi lấy ngưỡng 0,5 ra mặt nạ THÔ, và mặt nạ thô là bất biến. Hậu xử lý PP-4 tạo mặt nạ ĐÃ XỬ LÝ riêng; hai biến thể không bao giờ bị thay thế âm thầm cho nhau. "
                  "Chỉ số 3D tính trên khối đã xếp từ các lát; mesh bề mặt L0 giữ ánh xạ voxel – thế giới để 2D và 3D dùng chung một hợp đồng hình học.")
    steps = [
        ("1 · Volume NRRD", "mảng [z, y, x]; tách thành lát theo trục z"),
        ("2 · Chuẩn hoá", d.f("norm_rule") + "; không dùng thống kê cohort"),
        ("3 · Resize về 560×560", "ảnh: bilinear + antialias · mask: nearest-exact, giữ nguyên nhãn"),
        ("4 · Mô hình", "DINOv2 hoặc UNet cho ra logits trên từng lát"),
        ("5 · Về kích thước gốc", "logits resize bilinear về lát gốc, ngưỡng 0,5 → mặt nạ THÔ (bất biến)"),
        ("6 · Hậu xử lý PP-4", d.f("pp4_ops")),
        ("7 · Khối 3D và chỉ số", "xếp lát thành khối; Dice, IoU, sai lệch thể tích tính theo từng case"),
        ("8 · Bề mặt L0", "mesh giữ ánh xạ voxel ↔ thế giới; 2D ↔ 3D dùng chung hợp đồng hình học"),
    ]
    gap = 0.4
    w, h = (CW - 3 * gap) / 4, 1.85
    pos = []
    for i, (t, b) in enumerate(steps):
        r, c = divmod(i, 4)
        col = c if r == 0 else 3 - c
        x, y = MX + col * (w + gap), TOP + r * (h + 0.55)
        pos.append((x, y))
        fill = "orange_wash" if i == 5 else "white"
        s.card(x, y, w, h, [(t, {"size": 17, "bold": True, "color": "accent", "space_after": 5}), (b, {"size": 15})], fill=fill, margin=0.16)
    for i in range(7):
        (x1, y1), (x2, y2) = pos[i], pos[i + 1]
        if y1 == y2:
            if x2 > x1:
                s.arrow(x1 + w + 0.03, y1 + h / 2, x2 - 0.03, y2 + h / 2, color="accent")
            else:
                s.arrow(x1 - 0.03, y1 + h / 2, x2 + w + 0.03, y2 + h / 2, color="accent")
        else:
            s.arrow(x1 + w / 2, y1 + h + 0.03, x2 + w / 2, y2 - 0.03, color="accent")
    s.source("Nguồn: docs/specs/v1.0/07, management/adr/ADR_ML_001.md (ml-preproc-1.0.0), DR-011.", y=6.62)


def s_gate(D: Deck, d: Data) -> None:
    gm = d.agg.get("gate_img_01") or {}
    cands = d.agg.get("gate_img_01_validation") or []
    win = next((c for c in cands if c.get("selected")), None)
    ref = next((c for c in cands if c["id"] == "PP-0"), None)
    s = D.content("Hậu xử lý được chọn từ danh sách khai báo trước, chỉ trên validation", "XỬ LÝ ẢNH · GATE-IMG-01",
                  f"GATE-IMG-01 là cổng đóng băng cấu hình hình thái học bằng bằng chứng trên validation. Luật chọn và danh sách ứng viên PP-0 đến PP-5 được merge vào repo trước khi chạy "
                  f"({d.f('gate_rule_pr')}), nên không thể tinh chỉnh theo kết quả. Chọn trên {gm.get('n')} case validation của mặt nạ thô EXP-D-100; hoà trong {vn(gm.get('tie_tolerance'))} thì lấy mã thấp hơn. "
                  + (f"Người thắng {win['id']} ({win.get('operations')}) với Dice {vn(win['dice'], 4)}, hơn mặt nạ thô PP-0 ({vn(ref['dice'], 4)}) {sgn(gm.get('delta_vs_pp0'), 4)}. " if win and ref else "")
                  + f"Cấu hình được đóng băng bằng sha256 {(gm.get('frozen_config_sha256') or '')[:8]}…, rồi áp nguyên cho 54 case holdout, không chỉnh tay theo case. "
                  "Đây là số validation dùng để chọn, không phải kết quả; 20 case này cũng đã chọn checkpoint, nên mức +0,0218 có thể lạc quan.")
    s.picture(d.fig("c", D.assets), MX, TOP - 0.05, 8.2, 4.7, "Dice 3D trung bình trên validation của sáu ứng viên hậu xử lý")
    xr, wr = MX + 8.2 + 0.3, W - MX - (MX + 8.2 + 0.3)
    items = [f"Danh sách ứng viên và luật chọn ghi vào repo ({d.f('gate_rule_pr')}) trước khi chạy.",
             f"Chọn trên {gm.get('n')} case validation; hoà trong {vn(gm.get('tie_tolerance'))} thì lấy mã thấp.",
             (f"Thắng: {win['id']}, {d.f('pp4_ops')}." if win else "Chưa có ứng viên thắng."),
             "Đóng băng bằng sha256, áp nguyên cho holdout, không chỉnh theo case."]
    s.textbox(xr, TOP, wr, 4.7, [(it, {"bullet": True, "size": 14, "space_after": 8}) for it in items], name="bullets")
    s.source("Số validation dùng để chọn, không phải kết quả. Nguồn: management/day39/gate_img_01/SELECTION.md, results_aggregate.json.", y=6.62)


def s_pp_effect(D: Deck, d: Data) -> None:
    pp = d.pp_pair()
    if not pp:
        s = D.content("Tác động của hậu xử lý", "XỬ LÝ ẢNH · PP-4", "Chưa có run hậu xử lý trong aggregate.")
        s.unavailable(MX, TOP, CW, 2, "Chưa có run đã xử lý (EXP-D-PP) trong results_aggregate.json.")
        return
    src, p, c = pp
    if not c:
        s = D.content("Tác động của hậu xử lý", "XỬ LÝ ẢNH · TÁC ĐỘNG CỦA HẬU XỬ LÝ", "Chưa có tệp so sánh cặp cho hậu xử lý trong aggregate.")
        s.unavailable(MX, TOP, CW, 2, "Chưa có so sánh cặp thô và đã xử lý (chạy ml.evaluate compare --allow-variant-mismatch).")
        return
    fp_pct = (p["fp_voxels_mean"] - src["fp_voxels_mean"]) / src["fp_voxels_mean"] * 100
    fn_pct = (p["fn_voxels_mean"] - src["fn_voxels_mean"]) / src["fn_voxels_mean"] * 100
    ttl = ("PP-4 bớt dương tính giả và gần như xoá sai lệch thể tích"
           if fp_pct < 0 and abs(p["rve_percent_mean"]) < 0.5 * abs(src["rve_percent_mean"]) else "Tác động của hậu xử lý trên holdout")
    s = D.content(ttl, "XỬ LÝ ẢNH · TÁC ĐỘNG CỦA HẬU XỬ LÝ",
                  f"Hậu xử lý PP-4 áp lên dự đoán của {d.lab(src)}. Dice 3D tăng {sgn(c['mean_delta'])} {ci_text(c['ci95'], 3, True)}; {c['b_higher']} trên {c['n']} case tốt hơn và {c['a_higher']} case xấu đi nhẹ. "
                  f"Voxel dương tính giả trung bình giảm {abs(fp_pct):.1f} phần trăm ({thou(src['fp_voxels_mean'])} xuống {thou(p['fp_voxels_mean'])}); voxel âm tính giả thay đổi {fn_pct:+.1f} phần trăm "
                  f"({thou(src['fn_voxels_mean'])} lên {thou(p['fn_voxels_mean'])}), nên đây là đánh đổi chứ không phải miễn phí. Sai lệch thể tích tương đối trung bình giảm từ {pct(src['rve_percent_mean'], 1, True)} xuống "
                  f"{pct(p['rve_percent_mean'], 1, True)}: mặt nạ thô vốn to hơn ground truth, hậu xử lý kéo về sát. Holdout xác nhận hướng và độ lớn đã thấy trên validation. "
                  "Kết luận thận trọng: spec 07 §5 yêu cầu báo cáo cải thiện, xấu đi hay không đổi, không giả định xử lý ảnh luôn giúp; ở đây nó giúp, với bằng chứng trên cả hai tập.")
    gap, w = 0.25, (CW - 3 * 0.25) / 4
    tiles = [(sgn(c["mean_delta"]), "Δ Dice 3D trung bình", f"CI 95 % {ci_text(c['ci95'], 3, True)}", "orange"),
             (f"{c['b_higher']} / {c['n']}", "case được cải thiện", f"{c['a_higher']} case xấu đi nhẹ", "orange"),
             (pct(fp_pct, 0, True), "voxel dương tính giả TB", f"{thou(src['fp_voxels_mean'])} → {thou(p['fp_voxels_mean'])}", "orange"),
             (f"{sgn(src['rve_percent_mean'], 1)} → {sgn(p['rve_percent_mean'], 1)}{NBSP}%", "sai lệch thể tích TB", "RVE theo voxel", "orange")]
    for i, (v, lab, sub, col) in enumerate(tiles):
        s.tile(MX + i * (w + gap), TOP, w, 2.2, v, lab, sub, color=col, vsize=26 if i == 3 else 36)
    bul = [f"PP-4: {d.f('pp4_ops')}.",
           f"Âm tính giả đổi {pct(fn_pct, 1, True)} ({thou(src['fn_voxels_mean'])} → {thou(p['fn_voxels_mean'])} voxel): hậu xử lý là một đánh đổi, không miễn phí.",
           f"Cấu hình chọn trên validation ({sgn((d.agg.get('gate_img_01') or {}).get('delta_vs_pp0'), 4)}); holdout xác nhận hướng và độ lớn.",
           f"Dice 2D trung bình theo lát tăng {vn(src['mean_slice_dice'])} → {vn(p['mean_slice_dice'])}: PP-4 xoá dự đoán thừa ở hai đầu stack (profile theo lát: phần Khoa học dữ liệu).",
           "Không giả định xử lý ảnh luôn giúp (spec 07 §5): báo cáo cả case xấu đi."]
    s.textbox(MX, TOP + 2.55, CW, 2.2, [(b, {"bullet": True, "size": 16, "space_after": 9}) for b in bul], name="bullets")
    s.source("FP/FN tính theo voxel, trung bình theo case, mặt nạ thô so với đã xử lý. Nguồn: results_aggregate.json (fp_voxels_mean, rve_percent_mean).", y=6.62)


def s_mesh(D: Deck, d: Data) -> None:
    s = D.content("Bề mặt 3D: chỉ mức L0 giữ đúng lát được chọn trong ±1", "XỬ LÝ ẢNH · TÁI DỰNG 3D",
                  "Spike B kiểm bề mặt 3D theo hai bài: chọn một điểm trên mặt 3D thì nhảy đúng lát nguồn (sai lệch tối đa một lát), và độ mượt khi xoay trên thiết bị. "
                  f"Chỉ mức L0, bề mặt voxel không decimate, giữ mọi lần chọn trong ±1 lát, không trượt và không điều hướng sai. Bốn mức giảm tam giác L1 đến L4 đều trượt, sai tới {d.f('b_l1_l4_error')} lát. "
                  f"Trên Galaxy A17 5G, L0 chạy trung vị {d.f('b_fps')} FPS với khung dừng dài nhất {d.f('b_stall_ms')} ms và {d.f('b_frames_over_500')} khung quá 500 ms; FPS bị trần 60 Hz nên không phân biệt được các mức về chi phí render. "
                  "Quyết định DR-008c là L0. Giới hạn cần nói: một thiết bị, một phiên, một case huấn luyện, một người thao tác; mô-đun 3D vẫn ở mức có điều kiện cho tới khi Spike B được chấp nhận chính thức.")
    rows = [["Mức", "Bề mặt", "Chọn lát chính xác (offline)", "Trên thiết bị (A17)"],
            ["L0", "voxel, không decimate", "tối đa 1 lát, không trượt", f"đạt B6 (đúng lát), B7, B9 · {d.f('b_fps')} FPS · dừng ≤ {d.f('b_stall_ms')} ms"],
            ["L1–L4", "giảm tam giác (gom đỉnh)", f"sai tới {d.f('b_l1_l4_error')} lát", "B6 trượt ở cả bốn mức"]]
    s.table(MX, TOP, [1.3, 3.0, 3.4, 4.43], rows, size=15, row_h=0.95, header_h=0.55, bold_first_col=True, highlight_rows={1})
    s.card(MX, TOP + 2.65, 5.9, 1.9, [("Quyết định DR-008c = L0", {"size": 18, "bold": True, "color": "accent", "space_after": 6}),
                                      ("Mức nhanh nhất vẫn giữ đúng lát trong ±1. Các mức decimate thất bại cả offline lẫn trên thiết bị, không phải ứng viên.", {"size": 14})], margin=0.2)
    s.card(MX + 6.2, TOP + 2.65, CW - 6.2, 1.9, [("Giới hạn nói thẳng", {"size": 18, "bold": True, "color": "accent", "space_after": 6}),
                                                  ("Một thiết bị, một phiên, một case huấn luyện. FPS bị trần 60 Hz nên không so được chi phí render giữa các mức. 3D vẫn là mô-đun có điều kiện.", {"size": 14})],
           margin=0.2)
    s.source("Nguồn: management/spikes/SPIKE_B_3D/RESULT.md (S-1, 01/10), management/adr/TECH_STACK_ADR.md §3.", y=6.62)


def s_ds_dist(D: Deck, d: Data) -> None:
    all_skew = all(r["dice_median"] > r["dice_mean"] for r in d.runs)
    sens = [abs(r["sensitivity_dice_mean"] - r["dice_mean"]) for r in d.runs if r.get("sensitivity_dice_mean") is not None]
    s = D.content("Phân phối trên cohort: vài ca rất thấp kéo trung bình xuống" if all_skew else "Phân phối trên cohort: trung vị, tứ phân vị và độ lệch chuẩn",
                  "KHOA HỌC DỮ LIỆU · PHÂN PHỐI VÀ NGOẠI LỆ",
                  f"Một con số trung bình che đi hình dạng phân phối. Trên {d.n} case: " + " ".join(f"{d.lab(r)}: trung bình {vn(r['dice_mean'])}, trung vị {vn(r['dice_median'])}, Q1–Q3 {vn(r['dice_q1'])}–{vn(r['dice_q3'])}, SD {vn(r['dice_sd'])}." for r in d.runs)
                  + (" Trung vị cao hơn trung bình ở mọi run: phân phối lệch trái, có đuôi các ca rất thấp. " if all_skew else " ")
                  + f"Ngoại lệ được định nghĩa bằng luật DR-010 cố định: {d.f('dr010_rule')}; ứng dụng mở thẳng các ca này (bước H2) để xem bằng chứng, còn giá trị theo từng case không được công bố trong bộ slide. "
                  + (f"Tập độ nhạy bỏ một case nghi trùng bệnh nhân (DR-002b), n = {d.n - ((d.agg.get('split') or {}).get('sensitivity_excluded_n') or 1)}: Dice trung bình đổi tối đa {max(sens):.4f}, kết luận không đổi." if sens else ""))
    rows = [["Run", "Trung vị", "Q1–Q3", "SD", "Trung bình"]]
    for r in d.runs:
        rows.append([d.lab(r), vn(r["dice_median"]), f"{vn(r['dice_q1'])}–{vn(r['dice_q3'])}", vn(r["dice_sd"]), vn(r["dice_mean"])])
    rh = 0.58 if len(rows) <= 6 else 0.44
    s.table(MX, TOP, [2.9, 1.2, 1.9, 0.8, 1.3], rows, size=15, row_h=rh, header_h=0.5, bold_first_col=True, align=["l", "r", "r", "r", "r"])
    dino = d.family("dinov2")
    read = []
    if all_skew:
        read.append("Trung vị cao hơn trung bình ở mọi run: phân phối lệch trái, đuôi là vài ca rất thấp.")
    if len(dino) > 1 and all(dino[i]["dice_sd"] > dino[i + 1]["dice_sd"] for i in range(len(dino) - 1)):
        read.append(f"SD giảm khi có thêm dữ liệu: {vn(dino[0]['dice_sd'])} → {vn(dino[-1]['dice_sd'])}.")
    if read:
        ytab = TOP + 0.5 + rh * (len(rows) - 1)
        s.card(MX, ytab + 0.3, 8.1, 1.35, [("Cách đọc", {"size": 15, "bold": True, "color": "accent", "space_after": 4})] +
               [(t, {"size": 14, "bullet": True, "space_after": 3}) for t in read], margin=0.18)
    xr, wr = MX + 8.4, W - MX - (MX + 8.4)
    n_sens = (d.agg.get("split") or {}).get("sensitivity_excluded_n") or 1
    bul = [f"Luật ngoại lệ DR-010: {d.f('dr010_rule')}.",
           "App mở thẳng ca ngoại lệ (H2); số theo case không công bố ở đây.",
           (f"Tập độ nhạy bỏ {n_sens} case nghi trùng bệnh nhân (DR-002b): Dice TB đổi tối đa {vn(max(sens), 4)}." if sens else "Không có tập độ nhạy."),
           "Mọi kết luận giữ nguyên trên tập độ nhạy."]
    s.textbox(xr, TOP, wr, 4.7, [(b, {"bullet": True, "size": 14, "space_after": 8}) for b in bul], name="bullets")
    s.source(f"Nguồn: results_aggregate.json (n = {d.n}); luật DR-010 trong management/readiness/OPEN_DECISIONS.md.", y=6.62)


def s_ds_profile(D: Deck, d: Data) -> None:
    prof = d.agg.get("slice_profile") or {}
    best_raw = max((r for r in d.runs if r["family"] == "dinov2" and not str(r["variant"]).startswith("PROCESSED")), key=lambda r: r.get("training_fraction") or 0, default=None)
    peak = None
    if prof and best_raw:
        pr = next((p for p in prof["runs"] if p["experiment_id"] == best_raw["experiment_id"]), None)
        if pr:
            vals = [v for v in pr["mean_dice"] if v is not None]
            peak = max(vals) if vals else None
    pp = d.pp_pair()
    edge = None
    if prof and best_raw:
        pr0 = next((p for p in prof["runs"] if p["experiment_id"] == best_raw["experiment_id"]), None)
        if pr0 and pr0["mean_dice"][0] is not None and pr0["mean_dice"][-1] is not None:
            edge = max(pr0["mean_dice"][0], pr0["mean_dice"][-1])
    shape_ok = peak is not None and edge is not None and peak > 0.5 and edge < 0.15
    s = D.content("Lỗi theo lát: Dice cao ở giữa stack, về gần 0 ở hai đầu" if shape_ok else "Dice theo vị trí lát trong stack",
                  "KHOA HỌC DỮ LIỆU VÀ XỬ LÝ ẢNH · PROFILE THEO LÁT",
                  "Profile Dice 2D theo vị trí lát chuẩn hoá: mỗi case được chia thành 20 bin theo vị trí, lấy trung bình các lát trong bin, rồi trung bình trên case. "
                  + (f"Giữa stack, run {d.lab(best_raw)} đạt Dice lát khoảng {vn(peak, 2)}; " if peak else "")
                  + "ở hai đầu stack ground truth thường vắng nên mọi dự đoán thừa tính Dice bằng 0, và đó là phần lớn lý do Dice trung bình theo lát thấp hơn Dice 3D. Theo quy tắc spec 07 §6 lát mà cả hai mặt nạ rỗng bị loại khỏi trung bình, không tính là 1. "
                  + (f"Hậu xử lý PP-4 xoá bớt dự đoán thừa ở các đầu: Dice trung bình theo lát từ {vn(pp[0]['mean_slice_dice'])} lên {vn(pp[1]['mean_slice_dice'])}. " if pp else "")
                  + "Đây là một mẫu hình mà con số trung bình không cho thấy, và là lý do ứng dụng có màn hình Error Inspector để nhảy tới lát tệ nhất.")
    s.picture(d.fig("d", D.assets), MX, TOP - 0.05, 8.55, 4.8, "Dice 2D trung bình theo vị trí lát chuẩn hoá, theo từng run, kèm tỉ lệ case có ground truth")
    xr, wr = MX + 8.55 + 0.3, W - MX - (MX + 8.55 + 0.3)
    bul = [(f"Giữa stack: Dice lát tới {vn(peak, 2)} ({d.lab(best_raw)})." if peak else "Giữa stack Dice lát cao nhất."),
           "Hai đầu: ground truth vắng, dự đoán thừa tính Dice = 0.",
           (f"PP-4 xoá bớt dự đoán thừa: Dice lát TB {vn(pp[0]['mean_slice_dice'])} → {vn(pp[1]['mean_slice_dice'])}." if pp else "Hậu xử lý không có trong dữ liệu."),
           "Lát cả hai rỗng bị loại khỏi trung bình (spec 07 §6)."]
    s.textbox(xr, TOP, wr, 4.7, [(b, {"bullet": True, "size": 14, "space_after": 8}) for b in bul], name="bullets")
    s.source(f"Trung bình theo case trong {prof.get('bins', 20)} bin; n = {d.n} case. Nguồn: results_aggregate.json (slice_profile).", y=6.62)


def s_mob_cache(D: Deck, d: Data) -> None:
    s = D.content("Bộ nhớ đệm lát có giới hạn: không bao giờ tải cả khối cho mỗi cử chỉ", "PHÁT TRIỂN DI ĐỘNG · HIỆU NĂNG",
                  f"Yêu cầu hiệu năng NFR-PERF-001 có hai nhánh: chuyển lát đã cache có p95 không quá {d.f('a9_limit_ms')} ms, và không tải cả khối ảnh cho mỗi cử chỉ. "
                  f"Nhánh một đo trong Spike A: p95 chuyển lát đã cache {d.f('a9_p95_ms')} ms trên kích thước thật 576×576×88. Nhánh hai không đo được trong Spike A, nên được đo trên app sản phẩm tối 01/10 "
                  f"trên Galaxy A17 5G với backend thật (L4 PASS): {d.f('l4_gestures')} lát mới, trung vị {d.f('l4_new_median_kb')} KB mỗi lần chuyển, lớn nhất {d.f('l4_new_max_kb')} KB, tức {d.f('l4_volume_share')} một khối; "
                  f"{d.f('l4_gestures')} lần quay lại lát đã xem tải {d.f('l4_revisit_bytes')} byte; log của server khớp. Số đo lấy từ tệp thô đã commit, thống kê như NFR định nghĩa, không loại outlier. "
                  "Giới hạn: phép đo L4 chỉ gồm MRI và ground truth của một case, chưa có dự đoán; TC-PERF-001 chính thức trên app sản phẩm chưa chạy. "
                  f"Bộ nhớ đệm hiện thực ở mobile/src/runtime/sliceCache.mjs: lưu theo từng lát, LRU tối đa {d.f('cache_max_entries')} mục, khoá bằng URL băm nội dung nên RAW và PROCESSED không dùng chung mục, không lưu lỗi. "
                  f"Bitmap đã giải mã nằm ngoài heap Java {d.f('java_heap_mb')} MB, nên một cửa sổ cache ở mức component không chặn được bộ nhớ ảnh: mức này sẽ được đo trên A17 trong TC-PERF-001.")
    gap, w = 0.25, (CW - 2 * 0.25) / 3
    tiles = [(f"≤ {d.f('l4_new_max_kb')} KB", "mỗi lát mới", f"trung vị {d.f('l4_new_median_kb')} KB · {d.f('l4_volume_share')} một khối"),
             (f"{d.f('l4_revisit_bytes')} byte", "khi quay lại lát đã xem", f"{d.f('l4_gestures')}/{d.f('l4_gestures')} lần quay lại"),
             (f"{d.f('a9_p95_ms')} ms", "p95 chuyển lát đã cache", f"ngưỡng {d.f('a9_limit_ms')} ms · 576×576×88")]
    for i, (v, lab, sub) in enumerate(tiles):
        s.tile(MX + i * (w + gap), TOP, w, 2.05, v, lab, sub, vsize=40)
    bul = [f"Cache {d.f('cache_per_slice')} (DR-015); LRU có giới hạn: tối đa {d.f('cache_max_entries')} mục.",
           "Khoá cache là URL băm nội dung kèm case/run, lát và biến thể: mặt nạ THÔ và ĐÃ XỬ LÝ không dùng chung mục; lỗi không bị lưu.",
           f"Đo trên {d.f('device')}, app sản phẩm, backend thật: L4 PASS (01/10); byte tải về băm ra đúng checksum.",
           f"Giới hạn: bitmap giải mã nằm ngoài heap Java {d.f('java_heap_mb')} MB nên cửa sổ cache không chặn được bộ nhớ ảnh (sẽ đo trong TC-PERF-001); L4 chỉ gồm MRI và ground truth."]
    s.textbox(MX, TOP + 2.35, CW, 2.4, [(b, {"bullet": True, "size": 15, "space_after": 8}) for b in bul], name="bullets")
    s.source("Nguồn: management/spikes/SPIKE_A_2D/RESULT.md (A9, L4), management/adr/TECH_STACK_ADR.md §3, §7.", y=6.62)


def s_mob_arch(D: Deck, d: Data) -> None:
    jobs = d.ci_jobs
    s = D.content("Hợp đồng, trạng thái và tính bất biến đều được kiểm bằng máy", "PHÁT TRIỂN DI ĐỘNG · KIẾN TRÚC VÀ ĐỘ TIN CẬY",
                  f"Sáu điểm kỹ thuật chính của phần di động. Một: mọi ảnh, mặt nạ và mesh có sha256 và app kiểm tra. Hai: bảy trạng thái màn hình trong app/core (tải, trống, đang xử lý, lỗi có thể thử lại, dữ liệu không hợp lệ...) dùng chung cho mọi vertical, "
                  f"không có màn hình tự bịa tiến độ. Ba: 3D chạy WebGL2 trong react-native-webview, trung vị {d.f('b_fps')} FPS, {d.f('b_frames_over_500')} khung quá 500 ms trên A17 ở mức L0. Bốn: review bất biến: mỗi lần commit tạo một phiên bản mới của mặt nạ đã duyệt, trigger SQLite từ chối UPDATE và DELETE, "
                  f"dự đoán gốc không bao giờ bị ghi. Năm: CI chạy {jobs if jobs else 'nhiều'} job độc lập, gồm checksum {d.f('spec_checksums')} của spec, quét byte cấm và địa chỉ IPv4, test app/core, kiểm tra app/core không phụ thuộc framework, test mobile và render smoke kèm bundle. "
                  f"Sáu: hero flow H1–H10 chạy mức API trên dữ liệu thật: {d.f('e2e_pass')} PASS, {d.f('e2e_fail')} FAIL, {d.f('e2e_skip')} SKIP (bước UNet); đây là bằng chứng mức API, chưa thay video trên thiết bị. "
                  f"Số test lúc kiểm ngày 18/10: mobile {d.f('tests_mobile')}, backend {d.f('tests_backend')}, brush {d.f('tests_brush')}.")
    cards = [
        ("Checksum mọi artifact", "Ảnh, mask, mesh đánh địa chỉ theo sha256; app kiểm checksum của byte tải về, ETag = checksum."),
        (f"{d.f('states_count')} trạng thái màn hình", "Dùng chung: tải, đang xử lý, thành công, không khả dụng, lỗi thử lại, không hợp lệ, lệch phiên bản. Không bịa tiến độ."),
        ("3D trong WebView", f"WebGL2 trong react-native-webview: {d.f('b_fps')} FPS trung vị, {d.f('b_frames_over_500')} khung quá 500 ms (A17, mức L0)."),
        ("Review bất biến", "Commit tạo phiên bản mới; trigger SQLite chặn UPDATE/DELETE; dự đoán gốc không bao giờ bị ghi."),
        (f"CI: {jobs if jobs else '11'} job độc lập", f"Checksum spec {d.f('spec_checksums')}, quét byte cấm và IPv4, app-core, framework-neutral, mobile-shell, render smoke và bundle."),
        (f"E2E API: {d.f('e2e_pass')} / {d.f('e2e_fail')} / {d.f('e2e_skip')}", "PASS / FAIL / SKIP của hero flow H1–H10 trên dữ liệu thật; SKIP là bước UNet. Mức API, chưa phải video thiết bị."),
    ]
    gap = 0.22
    w, h = (CW - 2 * gap) / 3, 2.25
    for i, (t, b) in enumerate(cards):
        r, c = divmod(i, 3)
        s.card(MX + c * (w + gap), TOP + r * (h + 0.22), w, h, [(t, {"size": 17, "bold": True, "color": "accent", "space_after": 5}), (b, {"size": 14})], margin=0.18)
    s.source(f"Nguồn: .github/workflows/guardrails.yml, backend/README.md, mobile/README.md, management/day39/E2E_EVIDENCE.md, management/day40/ACCEPTANCE_TRACE.md (số test ngày 18/10).", y=6.66)


def s_quality(D: Deck, d: Data) -> None:
    s = D.content("Chất lượng: luật khai báo trước, QA độc lập, spec đóng băng", "CHẤT LƯỢNG VÀ KẾ HOẠCH",
                  f"Ba cơ chế giữ cho kết quả đáng tin. Một: luật khai báo trước. Luật chọn hậu xử lý được merge ({d.f('gate_rule_pr')}) trước khi có ứng viên nào được đánh giá; holdout chỉ mở bằng một bản ghi cho phép mang sha256 và mỗi run chấm đúng một lần; {d.f('gates_closed')} cổng đã đóng. "
                  "Hai: duyệt và QA độc lập. Quy trình thường (CP-07, hiệu lực từ 19/10): mỗi PR cần một duyệt hợp lệ đúng SHA đầu của người được chỉ định cộng với CI xanh. "
                  "Trong các ngày override (01/10 và 18/10) duyệt người được thay bằng một phiên QA bằng LLM độc lập cộng CI xanh; cần nói rõ đó là QA bằng LLM, không phải reviewer người, và biên bản được lưu trong management/day39/qa. "
                  f"Ba: spec đóng băng. {d.f('specs_frozen')} spec v1.0 được CI kiểm checksum ({d.f('spec_checksums')}) và không PR nào được sửa docs/specs/v1.0; mọi thay đổi đi qua Decision Request. "
                  f"Về trạng thái trung thực: tính đến ngày lập tài liệu truy vết, {d.f('must_accepted')} trên {d.f('req_must')} yêu cầu MUST ở mức ACCEPTED chính thức, vì còn thiếu bằng chứng thiết bị; chúng tôi không tuyên bố hơn bằng chứng đang có.")
    cards = [
        ("Luật khai báo trước", [f"Luật chọn hậu xử lý merge ({d.f('gate_rule_pr')}) trước mọi ứng viên", "Holdout mở bằng bản ghi cho phép (sha256), chấm đúng một lần",
                                 f"{d.f('gates_closed')} cổng đã đóng (DATA, SPLIT, ML, MOB, IMG)"]),
        ("Duyệt và QA độc lập", ["Quy trình thường (CP-07): mỗi PR cần một duyệt hợp lệ đúng SHA + CI xanh", "Ngày override: QA LLM độc lập thay duyệt người, ghi rõ là QA LLM, không phải reviewer người",
                                 "Biên bản QA lưu trong management/day39/qa"]),
        ("Spec đóng băng", [f"{d.f('specs_frozen')} spec v1.0, checksum {d.f('spec_checksums')} trong CI", "Không PR nào được sửa docs/specs/v1.0", "Đổi spec chỉ qua Decision Request"]),
    ]
    gap, w = 0.25, (CW - 2 * 0.25) / 3
    for i, (t, items) in enumerate(cards):
        s.card(MX + i * (w + gap), TOP, w, 3.1, [(t, {"size": 19, "bold": True, "color": "accent", "space_after": 8})] +
               [(it, {"size": 14, "bullet": True, "space_after": 6}) for it in items], margin=0.2)
    s.shape(MX, TOP + 3.4, CW, 1.15, fill="accent_wash", line=None, name="card:honest", anchor="m", margin=0.25, paras=[
        (f"**Trạng thái trung thực:** {d.f('must_accepted')} trên {d.f('req_must')} yêu cầu MUST đã ACCEPTED chính thức; chưa có TC nào được ghi PASS trên thiết bị cho màn hình sản phẩm. "
         "Chỉ bằng chứng đã commit mới được tính.", {"size": 15, "color": "ink"})])
    s.source("Nguồn: management/day39/GATE_IMG_01_DECISION.md, management/day40/ACCEPTANCE_TRACE.md, .github/workflows/guardrails.yml.", y=6.62)


def s_limits(D: Deck, d: Data) -> None:
    lo, hi = d.span("dice_mean")
    tr = d.agg.get("training") or []
    drops = sum(t["sharp_drop_epochs"] for t in tr)
    s = D.content("Giới hạn đã biết, nói thẳng", "CHẤT LƯỢNG VÀ KẾ HOẠCH",
                  "Các giới hạn cần nói trước khi bị hỏi. Không có augmentation và learning rate hằng số: Dice validation tụt mạnh rồi hồi phục ở cả ba run huấn luyện (hình bên phải), "
                  f"tổng cộng {drops} lần tụt từ 0,10 trở lên, nên checkpoint được chọn ở các epoch sớm và không ổn định. Mỗi mức dữ liệu chỉ một seed. Huấn luyện 2D theo lát; spacing là placeholder đơn vị nên sai lệch thể tích tính theo voxel, chưa có mm hay mL. "
                  + ("UNet chưa có nên RQ-A chưa trả lời được. " if not d.unet_present else "")
                  + f"Dice tuyệt đối khiêm tốn, khoảng {vn(lo, 2)} đến {vn(hi, 2)}; kết quả khiêm tốn hay null vẫn là kết quả hợp lệ theo PR-SCI-03. "
                  "Bằng chứng thiết bị mới có L4 và S-1 (01/10); chưa có TC chính thức nào trên Galaxy A17 cho màn hình sản phẩm.")
    bul = ["Không augmentation, lr hằng số: Dice validation tụt mạnh rồi hồi phục (hình).",
           "Một seed cho mỗi mức dữ liệu; huấn luyện 2D theo lát.",
           "Spacing là placeholder đơn vị: sai lệch thể tích theo voxel, chưa có mm hay mL.",
           ("UNet chưa có: RQ-A chưa trả lời được." if not d.unet_present else
            (f"UNet chưa đủ ba mức (thiếu {', '.join(d.unet_missing)}): RQ-A chưa trả lời đầy đủ." if d.unet_missing else "UNet đã có; mỗi mức vẫn một seed.")),
           f"Dice tuyệt đối khiêm tốn ({vn(lo, 2)}–{vn(hi, 2)}); kết quả khiêm tốn vẫn hợp lệ (PR-SCI-03).",
           "Bằng chứng thiết bị mới có L4 và S-1; chưa có TC chính thức trên A17."]
    s.textbox(MX, TOP, 5.3, 4.8, [(b, {"bullet": True, "size": 14.5, "space_after": 9}) for b in bul], name="bullets")
    s.picture(d.fig("e", D.assets), MX + 5.55, TOP - 0.05, W - MX - (MX + 5.55), 4.2, "Dice 3D validation theo epoch của các run huấn luyện, chấm tròn là epoch được chọn")
    s.source("Chấm tròn = epoch được chọn làm checkpoint. Nguồn: results_aggregate.json (training), management/day39/RESULTS_HOLDOUT_DINOV2.md §4.", y=6.62)


def s_next(D: Deck, d: Data) -> None:
    s = D.content(f"Từ nay đến {d.f('acceptance_date').rsplit('/', 1)[0]}: bốn chặng, đường găng đi qua UNet", "CHẤT LƯỢNG VÀ KẾ HOẠCH",
                  f"Kế hoạch lại tới nghiệm thu {d.f('acceptance_date')}. Bốn chặng: C1 ({d.f('c1_window')}) nhận lại và khởi động, chạy hàng đợi UNet, đưa backend thật lên Mac mini; "
                  f"C2 ({d.f('c2_window')}) hoàn thiện vertical và UNet, đánh giá holdout UNet để RQ-A trả lời được; C3 ({d.f('c3_window')}) hội tụ: TC-E2E-001 trên A17 quay một lượt hero flow, rà 33 MUST, 0 lỗi P0 P1; "
                  f"C4 ({d.f('c4_window')}) báo cáo, slide theo từng môn, bảng bằng chứng, hai lần tổng duyệt có bấm giờ. Đường găng: {d.f('critical_path')}. "
                  + ("Slide này, cùng các slide cần UNet, sẽ tự cập nhật khi chạy lại bộ dựng sau khi có kết quả UNet." if not d.unet_present else "Họ UNet đã có kết quả."))
    ch = [("C1", d.f("c1_window"), "Nhận lại, khởi động", ["Hàng đợi UNet chạy", "Backend thật lên Mac mini"]),
          ("C2", d.f("c2_window"), "Hoàn thiện vertical + UNet", ["SCR-05, 06, 08 trên app", "Đánh giá holdout UNet: RQ-A"]),
          ("C3", d.f("c3_window"), "Hội tụ, nghiệm thu nội bộ", ["TC-E2E-001 trên A17", f"Rà {d.f('req_must')} MUST, 0 lỗi P0/P1"]),
          ("C4", d.f("c4_window"), "Báo cáo, slide, tổng duyệt", ["Slide theo từng môn", "2 lần tổng duyệt có bấm giờ"])]
    gap = 0.2
    w = (CW - 3 * gap) / 4
    for i, (c, win, t, items) in enumerate(ch):
        x = MX + i * (w + gap)
        s.shape(x, TOP, w, 0.95, fill="accent", line=None, radius=0.05, name="card:phase", anchor="m", margin=0.16, paras=[
            (f"{c} · {win}", {"size": 18, "bold": True, "color": "white", "space_after": 1}), (t, {"size": 13, "color": "E8F0FB", "space_after": 0})])
        s.card(x, TOP + 1.1, w, 1.55, [(it, {"size": 15, "bullet": True, "space_after": 6}) for it in items], margin=0.18)
    s.shape(MX, TOP + 2.95, CW, 1.2, fill="accent_wash", line=None, name="card:critical", anchor="m", margin=0.25, paras=[
        (f"**Đường găng:** {d.f('critical_path')}", {"size": 16, "color": "ink", "space_after": 5}),
        (f"**{d.f('acceptance_date')}**: nghiệm thu và bảo vệ bốn môn.", {"size": 16, "color": "accent", "space_after": 0})])
    s.source("Nguồn: management/day40/REPLAN_TO_2026-10-31.md.", y=6.62)


def qa_slide(D: Deck, d: Data, title: str, kicker: str, blocks: list[tuple[str, list[tuple[str, str]]]], notes: str) -> None:
    s = D.content(title, kicker, notes)
    gap = 0.3
    w = (CW - gap) / 2
    for i, (subj, qas) in enumerate(blocks):
        paras: list = [(subj, {"size": 18, "bold": True, "color": "accent", "space_after": 8})]
        for q, a in qas:
            paras.append((q, {"size": 15.5, "bold": True, "space_after": 3}))
            paras.append((a, {"size": 14.5, "color": "ink2", "space_after": 11}))
        s.card(MX + i * (w + gap), TOP - 0.05, w, 4.8, paras, margin=0.22)
    s.source("Câu trả lời lấy số từ results_aggregate.json và deck_facts.json; cập nhật khi chạy lại bộ dựng.", y=6.68)


def qa_last_step(d: Data, dino: list[dict]) -> str:
    c = d.comp(dino[-2]["experiment_id"], dino[-1]["experiment_id"]) if len(dino) > 1 else None
    if c and c["ci95"][0] <= 0 <= c["ci95"][1]:
        return f"bước {nb(dino[-2]['label'].split(' ', 1)[1])} → {nb(dino[-1]['label'].split(' ', 1)[1])} có CI chạm 0, chưa khẳng định được."
    return "các bước liền kề đều có CI không chứa 0."


def s_qa1(D: Deck, d: Data) -> None:
    pp = d.pp_pair()
    full = None
    dino = d.family("dinov2")
    if len(dino) > 1:
        full = d.comp(dino[0]["experiment_id"], dino[-1]["experiment_id"])
    lo, hi = d.span("dice_mean")
    if d.unet_present:
        a_unet = "Đã có kết quả UNet; xem slide RQ-A: đọc delta cặp theo case kèm CI, chỉ khẳng định khi CI không chứa 0, và nhắc mỗi mức một seed."
    else:
        a_unet = f"Chưa trả lời được: họ UNet chưa huấn luyện xong (Khánh, dự kiến {d.f('unet_due')}). Chúng tôi không đoán trước kết quả."
    ml = [("UNet hay DINOv2 tốt hơn?", a_unet),
          (f"Sao Dice chỉ khoảng {vn(lo, 2)}–{vn(hi, 2)}?", "Không augmentation, lr hằng số, huấn luyện 2D, một seed; kết quả khiêm tốn vẫn hợp lệ (PR-SCI-03) và được đo trung thực trên holdout khoá."),
          ("Nhiều dữ liệu hơn có chắc tốt hơn?", (f"{dino[0]['train_cases']} → {dino[-1]['train_cases']} case: {sgn(full['mean_delta'])} {ci_text(full['ci95'], 3, True)}; " + qa_last_step(d, dino) + " Mỗi mức một seed." if full else "Cần ít nhất hai mức dữ liệu."))]
    ip = [("Hậu xử lý có tune trên test không?", (f"Không. PP-4 chọn trên validation từ danh sách khai báo trước; holdout chỉ xác nhận: {sgn(pp[2]['mean_delta'])} {ci_text(pp[2]['ci95'], 3, True)}, {pp[2]['b_higher']}/{pp[2]['n']} case tốt hơn." if pp and pp[2] else "Hậu xử lý chọn chỉ trên validation.")),
          ("Chuẩn hoá và resize thế nào?", "Cắt theo phân vị 0,5–99,5 của từng volume rồi đưa về [0, 1], không dùng thống kê cohort (DR-011); ảnh bilinear, mask nearest-exact để giữ nhãn."),
          ("Sao dùng mesh L0, không giảm tam giác?", f"Chỉ L0 giữ chọn lát trong ±1; các mức giảm tam giác sai tới {d.f('b_l1_l4_error')} lát và trượt B6 trên thiết bị (Spike B).")]
    qa_slide(D, d, "Chuẩn bị Q&A (1/2): Học máy và Xử lý ảnh", "CHUẨN BỊ Q&A", [("Học máy", ml), ("Xử lý ảnh", ip)],
             "Các câu hỏi giảng viên có thể hỏi và đáp án ngắn có số liệu. Học máy: so sánh mô hình (hiện " + ("chưa có UNet" if not d.unet_present else "đã có UNet") + "), vì sao Dice khiêm tốn, và ý nghĩa của chênh lệch giữa các mức dữ liệu. "
             "Xử lý ảnh: hậu xử lý có bị tune trên test không (không, chọn trước trên validation), chuẩn hoá và resize, và lý do chọn mesh L0. Luôn quay lại nguyên tắc: không bịa số, nêu giới hạn trước.")


def s_qa2(D: Deck, d: Data) -> None:
    sens = [abs(r["sensitivity_dice_mean"] - r["dice_mean"]) for r in d.runs if r.get("sensitivity_dice_mean") is not None]
    boot = d.agg.get("bootstrap") or {}
    ds = [("Số trung bình có che ngoại lệ không?", f"Có thể, nên chúng tôi báo thêm trung vị, Q1–Q3 và SD. Ngoại lệ theo luật DR-010 (ba case Dice thấp nhất) mở thẳng trong app; không công bố giá trị theo case."),
          ("Kết quả có nhạy với một case nghi trùng bệnh nhân?", (f"Không đáng kể: bỏ case đó (n = {d.n - ((d.agg.get('split') or {}).get('sensitivity_excluded_n') or 1)}) Dice TB đổi tối đa {vn(max(sens), 4)} và kết luận giữ nguyên." if sens else "Có tập độ nhạy bỏ case nghi trùng (DR-002b).")),
          ("CI tính thế nào, có hiệu chỉnh đa so sánh?", f"Bootstrap phân vị của trung bình theo case, {thou(boot.get('resamples'))} lần, seed {boot.get('seed')}. Không hiệu chỉnh đa so sánh, và chúng tôi nói rõ điều đó.")]
    mob = [("Sao React Native và WebView, không native?", f"Chọn theo bằng chứng spike trên A17; Kotlin và PWA bị loại vì chưa có bằng chứng. 3D là mô-đun có điều kiện ({d.f('b_fps')} FPS trung vị ở L0)."),
           ("Hiệu năng chuyển lát?", f"p95 {d.f('a9_p95_ms')} ms (ngưỡng {d.f('a9_limit_ms')} ms); lát mới ≤ {d.f('l4_new_max_kb')} KB, quay lại {d.f('l4_revisit_bytes')} byte (L4)."),
           ("Brush có đúng pixel sau zoom? Quyền riêng tư?", f"Spike A: {d.f('a5_cases')} ca, lệch {d.f('a5_tolerance_px')} pixel nguồn (fixture nhỏ, giới hạn L5). Case ẩn danh, kho công khai chỉ có số tổng hợp, CI quét IPv4 và byte cấm.")]
    qa_slide(D, d, "Chuẩn bị Q&A (2/2): Khoa học dữ liệu và Di động", "CHUẨN BỊ Q&A", [("Khoa học dữ liệu", ds), ("Phát triển di động", mob)],
             "Khoa học dữ liệu: trung bình có che ngoại lệ không (nên báo trung vị, tứ phân vị, SD và luật ngoại lệ DR-010), độ nhạy với case nghi trùng, và cách tính CI. "
             "Di động: lý do chọn React Native cùng WebView theo bằng chứng spike, số đo hiệu năng chuyển lát, độ chính xác brush sau zoom (đo trên fixture nhỏ, đây là giới hạn L5) và quyền riêng tư. "
             "Mỗi thành viên cần giải thích được chức năng mình sở hữu: yêu cầu, thiết kế UI, kiến trúc và API, commit và PR, test, demo tích hợp, riêng tư, giới hạn (spec 16 §6).")


# =================================================================================================================
# outline, lint, main
# =================================================================================================================
def write_outline(D: Deck, d: Data, path: Path, lint_issues: list[str]) -> None:
    L = ["# Dàn ý bộ slide nháp (sinh tự động)", "",
         "> Tệp này do `tools/report/build_deck.py` sinh cùng `CARDIAC_MRI_DECK_DRAFT.pptx`: **không sửa tay**. Nó liệt kê từng slide, chữ hiển thị và ghi chú diễn thuyết "
         "để cả nhóm duyệt ngay trên GitHub. Mọi số liệu thí nghiệm lấy từ `results_aggregate.json`; số liệu quy trình lấy từ `tools/report/deck_facts.json` "
         "(mỗi mục được kiểm lại với tệp nguồn trong repo mỗi lần dựng).", "",
         f"- Số slide: **{len(D.slides)}** (16:9)",
         f"- Dữ liệu: `results_aggregate.json`, mã {D.digest}; các run: {', '.join(r['experiment_id'] for r in d.runs)}",
         f"- UNet: **{'đã có' if d.unet_present else 'chưa có (slide cần UNet hiện khung chờ ' + chr(34) + UNET_PLACEHOLDER + chr(34) + ')'}**", "",
         "| # | Slide | Phần | Cần UNet |", "|---|---|---|---|"]
    for i, s in enumerate(D.slides, 1):
        need = "khung chờ" if s.rec["unet"] == "placeholder" else "—"
        L.append(f"| {i} | {s.title} | {s.kicker} | {need} |")
    L.append("")
    if d.fact_problems:
        L += ["## Cảnh báo kiểm nguồn", "", "Các mục `deck_facts.json` mà tệp nguồn không còn nói đúng như vậy (cần xem lại trước khi trình bày):", ""]
        L += [f"- {p}" for p in d.fact_problems] + [""]
    if d.build_problems:
        L += ["## Slide không dựng được", ""] + [f"- {p}" for p in d.build_problems] + [""]
    if lint_issues:
        L += ["## Cảnh báo bố cục", ""] + [f"- {p}" for p in lint_issues] + [""]
    for i, s in enumerate(D.slides, 1):
        L += [f"## {i}. {s.title}", ""]
        meta = []
        if s.kicker:
            meta.append(f"Phần: {s.kicker}")
        if s.rec["figures"]:
            meta.append("Hình: " + ", ".join(f"`figures/{f}`" for f in s.rec["figures"]))
        if s.rec["unet"] == "placeholder":
            meta.append(f"Khung chờ: **{UNET_PLACEHOLDER}** (tự thay khi có EXP-U-*)")
        if meta:
            L += [" · ".join(meta), ""]
        texts = [t for t in s.rec["texts"] if t.strip()]
        seen: list[str] = []
        for t in texts:
            if t not in seen:
                seen.append(t)
        if seen:
            L += ["**Trên slide**", ""] + [f"- {t}" for t in seen[:40]] + [""]
        if s.rec["sources"]:
            L += ["Nguồn: " + " ".join(s.rec["sources"]), ""]
        L += ["**Ghi chú diễn thuyết**", "", s.rec["notes"] or "(chưa có)", ""]
    path.write_text("\n".join(L).rstrip("\n") + "\n", encoding="utf-8", newline="\n")


class Metrics:
    """Approximate text extents from the Calibri metrics (Carlito, Arial or DejaVu Sans as fallbacks), found through
    matplotlib's font manager so that no font path is written into the source."""

    FAMILIES = ("Calibri", "Carlito", "Arial", "DejaVu Sans")

    def __init__(self):
        from matplotlib import font_manager as fm
        self.fonts = {}
        self.exact = False
        for bold in (False, True):
            for fam in self.FAMILIES:
                try:
                    path = fm.findfont(fm.FontProperties(family=fam, weight="bold" if bold else "normal"), fallback_to_default=False)
                    self.fonts[bold] = ImageFont.truetype(path, 200)
                    self.exact = self.exact or fam in ("Calibri", "Carlito")
                    break
                except Exception:  # noqa: BLE001 - family not installed: try the next one
                    continue

    def width_pt(self, text: str, size: float, bold: bool) -> float:
        f = self.fonts.get(bold) or self.fonts.get(False)
        if f is None:
            return len(text) * size * 0.5
        return f.getlength(text) * size / 200.0


def para_lines(m: Metrics, runs: list[tuple[str, float, bool]], width_pt: float) -> tuple[int, float]:
    """Greedy word wrap of one paragraph; returns (lines, largest font size)."""
    size = max((r[1] for r in runs), default=14.0)
    words: list[tuple[str, float, bool]] = []
    for text, sz, b in runs:
        for tok in re.findall(r"\S+\s*", text):
            words.append((tok, sz, b))
    if not words:
        return 1, size
    lines, cur = 1, 0.0
    for tok, sz, b in words:
        w = m.width_pt(tok.rstrip(), sz, b)
        wsp = m.width_pt(tok, sz, b)
        if cur > 0 and cur + w > width_pt:
            lines += 1
            cur = wsp
        else:
            cur += wsp
    return lines, size


def frame_height_pt(m: Metrics, tf, width_in: float) -> float:
    """Required text height for a text frame (points)."""
    bodyPr = tf._txBody.find(qn("a:bodyPr"))
    ml = int(bodyPr.get("lIns", 91440)) / 12700
    mr = int(bodyPr.get("rIns", 91440)) / 12700
    mt = int(bodyPr.get("tIns", 45720)) / 12700
    mb = int(bodyPr.get("bIns", 45720)) / 12700
    total = mt + mb
    for p in tf.paragraphs:
        runs = [(r.text, r.font.size.pt if r.font.size else 18.0, bool(r.font.bold)) for r in p.runs]
        pPr = p._p.find(qn("a:pPr"))
        indent = (int(pPr.get("marL", 0)) / 12700) if pPr is not None else 0
        avail = width_in * 72 - ml - mr - indent
        lines, size = para_lines(m, runs, avail)
        sa = p.space_after.pt if p.space_after is not None else 0
        sb = p.space_before.pt if p.space_before is not None else 0
        ls = p.line_spacing if isinstance(p.line_spacing, float) else 1.0
        total += lines * size * 1.2 * ls + sa + sb
    return total


def lint(path: Path) -> list[str]:
    """Re-open the saved deck and check every slide: shapes inside the slide, text inside its shape, no overlapping text shapes."""
    prs = Presentation(str(path))
    m = Metrics()
    sw, sh = prs.slide_width / 914400, prs.slide_height / 914400
    issues: list[str] = []
    if not m.exact:
        issues.append("(chú ý: không có phông Calibri/Carlito, nên ước lượng chữ dùng phông thay thế và chỉ mang tính gần đúng)")
    for n, slide in enumerate(prs.slides, 1):
        boxes = []
        for sp in slide.shapes:
            x, y, w, h = (v / 914400 for v in (sp.left or 0, sp.top or 0, sp.width or 0, sp.height or 0))
            if x < -0.01 or y < -0.01 or x + w > sw + 0.01 or y + h > sh + 0.01:
                issues.append(f"slide {n}: shape '{sp.name}' ra ngoài slide ({x:.2f}, {y:.2f}, {w:.2f} x {h:.2f})")
            if sp.has_text_frame and sp.text_frame.text.strip():
                need = frame_height_pt(m, sp.text_frame, w) / 72
                if need > h + 0.02:
                    issues.append(f"slide {n}: chữ tràn trong '{sp.name}': cần {need:.2f} in, hộp cao {h:.2f} in ({sp.text_frame.text[:40]!r})")
                if sp.name not in ("footer", "slide-number"):
                    boxes.append((sp.name, x, y, w, min(h, need) if sp.name.startswith(("text", "bullets", "caption", "label")) else h, sp.text_frame.text[:30]))
            if sp.shape_type == 13:
                boxes.append((sp.name, x, y, w, h, "picture"))
            if sp.has_table if hasattr(sp, "has_table") else False:
                tbl = sp.table
                tot = 0.0
                for r in tbl.rows:
                    row_need = 0.0
                    for ci, c in enumerate(r.cells):
                        cw = tbl.columns[ci].width / 914400
                        row_need = max(row_need, frame_height_pt(m, c.text_frame, cw) / 72 + 0.08)
                    tot += max(r.height / 914400, row_need)
                if y + tot > 6.9:
                    issues.append(f"slide {n}: bảng cao ước lượng {tot:.2f} in, đáy {y + tot:.2f} in")
                boxes.append((sp.name, x, y, w, tot, "table"))
        for i in range(len(boxes)):
            for j in range(i + 1, len(boxes)):
                a, b = boxes[i], boxes[j]
                ox = min(a[1] + a[3], b[1] + b[3]) - max(a[1], b[1])
                oy = min(a[2] + a[4], b[2] + b[4]) - max(a[2], b[2])
                if ox > 0.05 and oy > 0.05:
                    issues.append(f"slide {n}: '{a[0]}' ({a[5]!r}) chồng lên '{b[0]}' ({b[5]!r}) {ox:.2f} x {oy:.2f} in")
    return issues


def safe(D: Deck, d: Data, fn, *extra) -> None:
    """Build one slide; if the data it needs is missing or odd, drop the half-built slide and leave a visible marker
    instead, so one gap never costs the whole deck (and the gap is reported in the log and in DECK_OUTLINE.md)."""
    before = len(D.slides)
    try:
        fn(D, d, *extra)
    except Exception as exc:  # noqa: BLE001
        d.build_problems.append(f"{fn.__name__}: {type(exc).__name__}: {exc}")
        lst = D.prs.slides._sldIdLst
        for sid in list(lst)[before:]:
            D.prs.part.drop_rel(sid.rId)
            lst.remove(sid)
        del D.slides[before:]
        s = D.content("Chưa dựng được slide này", "CẢNH BÁO",
                      f"Bộ dựng gặp lỗi khi dựng slide ({fn.__name__}): {exc}. Kiểm tra artifact đầu vào rồi chạy lại.")
        s.unavailable(MX, TOP, CW, 2.0, f"Thiếu dữ liệu cho slide này ({fn.__name__}). Xem DECK_OUTLINE.md và log của bộ dựng.")


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--assets", type=Path, default=DEFAULT_DIR, help="dir with results_aggregate.json and figures/")
    ap.add_argument("--out", type=Path, default=DEFAULT_DIR, help="where the pptx and DECK_OUTLINE.md go")
    ap.add_argument("--facts", type=Path, default=FACTS_PATH)
    ap.add_argument("--repo-root", type=Path, default=ROOT)
    ap.add_argument("--strict", action="store_true", help="exit 3 on any lint issue or unverified fact")
    args = ap.parse_args(argv)

    assets = args.assets.resolve()
    agg_path = assets / "results_aggregate.json"
    if not agg_path.is_file():
        print("ERROR results_aggregate.json not found; run tools/report/build_report_assets.py first")
        return 1
    agg = json.loads(agg_path.read_text(encoding="utf-8"))
    facts = json.loads(args.facts.read_text(encoding="utf-8"))
    d = Data(agg, facts, args.repo_root.resolve())
    D = Deck(d, assets)
    D.digest = hashlib.sha256(agg_path.read_bytes()).hexdigest()[:8]

    D.section("Mở đầu")
    safe(D, d, s_title, args.repo_root.resolve())
    safe(D, d, s_north_star)
    D.section("Sản phẩm")
    safe(D, d, s_hero)
    safe(D, d, s_arch)
    D.section("Dữ liệu và phương pháp")
    safe(D, d, s_data)
    safe(D, d, s_method)
    D.section("Kết quả (Học máy)")
    safe(D, d, s_results_table)
    safe(D, d, s_fig_a)
    safe(D, d, s_fig_b)
    safe(D, d, s_fig_f)
    safe(D, d, s_rqa)
    D.section("Góc nhìn Xử lý ảnh")
    safe(D, d, s_ip_pipeline)
    safe(D, d, s_gate)
    safe(D, d, s_pp_effect)
    safe(D, d, s_mesh)
    D.section("Góc nhìn Khoa học dữ liệu")
    safe(D, d, s_ds_dist)
    safe(D, d, s_ds_profile)
    D.section("Góc nhìn Phát triển di động")
    safe(D, d, s_mob_cache)
    safe(D, d, s_mob_arch)
    D.section("Chất lượng và kế hoạch")
    safe(D, d, s_quality)
    safe(D, d, s_limits)
    safe(D, d, s_next)
    D.section("Chuẩn bị Q&A")
    safe(D, d, s_qa1)
    safe(D, d, s_qa2)
    D.finalize()

    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    cp = D.prs.core_properties
    cp.title = "Cardiac MRI Workspace — bản nháp bộ slide nghiệm thu"
    cp.subject = "Bản nháp tự sinh từ results_aggregate.json"
    cp.author = "Nhóm Cardiac MRI Workspace"
    cp.last_modified_by = "tools/report/build_deck.py"
    cp.created = cp.modified = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None, microsecond=0)
    cp.keywords = "cardiac MRI, DINOv2, UNet, mobile"
    pptx_path = out / DECK_NAME
    D.prs.save(str(pptx_path))
    issues = lint(pptx_path)
    write_outline(D, d, out / OUTLINE_NAME, issues)

    size_mb = pptx_path.stat().st_size / 1e6
    print(f"slides: {len(D.slides)}   pptx: {size_mb:.2f} MB   UNet present: {d.unet_present}   facts verified: {len(d.verified)}/{len(d.facts_raw)}")
    for p in d.fact_problems:
        print(f"WARN  fact not verified: {p}")
    for p in d.build_problems:
        print(f"WARN  slide not built: {p}")
    for i in issues:
        print(f"WARN  layout: {i}")
    if size_mb >= 10:
        print("ERROR the deck is larger than 10 MB")
        return 2
    return 3 if (args.strict and (issues or d.fact_problems or d.build_problems)) else 0


if __name__ == "__main__":
    raise SystemExit(main())
