"""Cache Word TOC page fields from its final rendered PDF, verifying destinations."""
import argparse
import re
from pathlib import Path

from docx import Document
from docx.oxml.ns import qn
from pypdf import PdfReader


def normalized(value):
    return re.sub(r"[^a-z0-9]", "", value.lower())


def refresh(docx_path, pdf_path):
    doc = Document(docx_path)
    pdf = PdfReader(pdf_path)
    pages = [p.extract_text() or "" for p in pdf.pages]
    contents = next(text for text in pages if "Table of contents" in text)
    references = {}
    for line in contents.splitlines():
        match = re.match(r"(.+?)\.{2,}\s*(\d+)\s*$", line)
        if match:
            references[normalized(match[1])] = int(match[2])
    count = 0
    for paragraph in doc.paragraphs:
        for field in paragraph._p.findall(qn("w:fldSimple")):
            if not field.get(qn("w:instr"), "").strip().startswith("PAGEREF "):
                continue
            labels = paragraph._p.findall(qn("w:hyperlink"))
            title = "".join(t.text or "" for link in labels for t in link.iter(qn("w:t")))
            page = references.get(normalized(title))
            if page is None or not 1 <= page <= len(pages):
                raise ValueError(f"Missing rendered page reference: {title}")
            if normalized(title) not in normalized(pages[page - 1]):
                raise ValueError(f"Page {page} does not contain heading: {title}")
            field.find('.//' + qn('w:t')).text = str(page)
            count += 1
    if count != len(references) or count < 2:
        raise ValueError(f"Incomplete TOC: {count} Word fields, {len(references)} PDF references")
    doc.save(docx_path)
    print(f"Verified and cached {count} page references across {len(pages)} pages.")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pdf', type=Path)
    parser.add_argument('--docx', type=Path, default=Path(__file__).resolve().parents[1] / 'docs/user/Hope-Sojourns-MMT-User-Guide.docx')
    args = parser.parse_args()
    refresh(args.docx, args.pdf)
