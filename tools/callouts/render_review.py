"""Render a read-only sign-off PDF and CSV. Never imports or writes the seed."""
import argparse
import csv
import hashlib
import json
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A3, landscape
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[2]
REVIEW = Path(__file__).parent / 'review'
OUT = ROOT / 'output/pdf'
INK = colors.HexColor('#1e293b')
ORANGE = colors.HexColor('#bd6200')
PURPLE = colors.HexColor('#9b247c')
BLUE = colors.HexColor('#126aab')
MUTED = colors.HexColor('#526174')


def wrap(text, width, size=11, font='Helvetica'):
    lines, current = [], ''
    for word in text.split():
        proposed = f'{current} {word}'.strip()
        if current and stringWidth(proposed, font, size) > width:
            lines.append(current)
            current = word
        else:
            current = proposed
    return lines + ([current] if current else [])


def paragraph(c, text, x, y, width, size=11, color=INK):
    c.setFillColor(color)
    c.setFont('Helvetica', size)
    for line in wrap(text, width, size):
        c.drawString(x, y, line)
        y -= size * 1.45
    return y


def figure_name(figure_id, text):
    match = re.search(r'id: "' + re.escape(figure_id) + r'",.*?name: "([^"]+)",\s*groupNo: "([^"]+)"', text, re.S)
    if not match:
        raise ValueError(f'Cannot resolve figure name: {figure_id}')
    return f'{match[2]} - {match[1]}'


def validate_review(data):
    if data.get('status') != 'NOT_FOR_CUSTOMER_USE' or data.get('reviewer') is not None:
        raise ValueError('Exporter accepts only an unreviewed proposal, not an approval record.')
    if hashlib.sha256((ROOT / 'src/data/ft3-wagon.ts').read_bytes()).hexdigest() != data.get('catalogueSha256'):
        raise ValueError('Catalogue changed since proposal preparation; re-review before exporting.')
    for figure in data['figures']:
        expected_status = 'existing-reference' if figure['figureId'] in ('fig-cabin-6-1', 'fig-filters-1-1') else 'pending-rufdiamond-signoff'
        if figure.get('reviewStatus') != expected_status:
            raise ValueError('Exporter accepts only an unreviewed proposal with the original oracle references.')
    # Refuse stale artwork: percentages are meaningful only for this version.
    for figure in data['figures']:
        if hashlib.sha256((ROOT / figure['drawingPath']).read_bytes()).hexdigest() != figure['sha256']:
            raise ValueError(f"Artwork changed: {figure['drawingPath']}. Re-review positions.")


def output_paths(directory, overwrite=False):
    pdf = directory / 'rufdiamond-callout-review-2026-09-07.pdf'
    csv_path = directory / 'rufdiamond-callout-review-2026-09-07.csv'
    if not overwrite and (pdf.exists() or csv_path.exists()):
        raise FileExistsError('Review output already exists. Use --output-dir for a new revision; --overwrite explicitly replaces existing PDF/CSV and may erase reviewer corrections.')
    return pdf, csv_path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, default=OUT, help='Use a new directory to preserve previous review records.')
    parser.add_argument('--overwrite', action='store_true', help='Explicitly replace existing PDF and CSV; back up reviewer corrections first.')
    args = parser.parse_args()
    data = json.loads((REVIEW / 'proposals.json').read_text())
    validate_review(data)
    target, csv_path = output_paths(args.output_dir, args.overwrite)
    source = (ROOT / 'src/data/ft3-wagon.ts').read_text()
    figures = sorted(data['figures'], key=lambda f: tuple(map(int, figure_name(f['figureId'], source).split(' - ')[0].split('.'))))
    args.output_dir.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(target), pagesize=landscape(A3))
    c.setTitle('RUF Diamond - exploded drawing callout review - NOT APPROVED')
    c.setAuthor('RUF Diamond Parts Portal - engineering review')
    width, height = landscape(A3)

    def footer(page):
        c.setStrokeColor(colors.HexColor('#cbd5e1'))
        c.line(42, 66, width - 42, 66)
        c.setFont('Helvetica', 9)
        c.setFillColor(MUTED)
        c.drawString(42, 45, 'REVIEW ONLY | 07 Sep 2026 | No new positions applied to the catalogue')
        c.drawRightString(width - 42, 45, f'{page} / {len(figures) + 1}')

    c.setFillColor(INK)
    c.setFont('Helvetica-Bold', 30)
    c.drawString(42, height - 65, 'Exploded drawing callout review')
    c.setFont('Helvetica-Bold', 16)
    c.setFillColor(ORANGE)
    c.drawString(42, height - 99, 'RUF DIAMOND SIGN-OFF REQUIRED - NOT CUSTOMER DATA')
    y = paragraph(c, 'Purpose: make each printed reference on the drawing select the correct part, and make selecting that part highlight every confirmed occurrence. This pack proposes positions; it does not certify the part associations.', 42, height - 138, width - 84, 14)
    y -= 30
    for title, text in [
        ('What is included', '44 supplied plates; 568 annotated positions including 15 existing reference markers. 558 of the 572 imported reference numbers have a visible proposed position (543 newly proposed). The pack also records two repeated printed occurrences and eight source-only numbers. These totals are coverage, not accuracy or approval.'),
        ('What the automated test proves', 'Windows and Filters: 15/15 known markers recovered within 2 percentage points, with no extra detections. Across the complete catalogue, the detector still leaves 259 expected figure/number pairs unmatched and produces three unexpected pairs. Automation is NOT reliable unattended. The other pages are agent-prepared visual proposals, not automatic approvals.'),
        ('How to read a page', 'Blue rings: existing hand-placed reference markers. Amber rings: new proposals awaiting review. Purple rings: printed numbers with no imported callout - never map these to a guessed part. Solid line: geometric center. Dashed line: visually estimated center. These evidence labels are not statistical confidence scores.'),
        ('What RUF Diamond must check', 'Compare each ring with the printed numeral. Then follow the leader to the part and verify the Ref. no., part number and description in the parts list. Check all repeated appearances. A matching number alone is not sufficient. Write corrections as number / X% / Y%; use the companion CSV for an exact coordinate list.'),
        ('Stop points', 'Eight plates have 14 expected references without a readable matching label. Frame 2.1 and Frame 2.2 have identical drawing files but different parts lists. Cabin 6.13 repeats 2 and 3 inconsistently with its list. Do not sign off these conflicts without corrected artwork or an accountable source clarification.'),
        ('Next step after review', 'Record reviewer, date, drawing SHA-256 and accepted/corrected occurrences. Only then apply approved positions to draft catalogue data. Unresolved associations and unplaced references continue to block publication. Rebuild the capability-controlled hotspot editor for ongoing corrections; do not use unbounded computer vision as the authoring workflow.'),
    ]:
        c.setFont('Helvetica-Bold', 13)
        c.setFillColor(INK)
        c.drawString(42, y, title)
        y = paragraph(c, text, 42, y - 20, width - 84, 12) - 23
    footer(1)
    c.showPage()

    for page, figure in enumerate(figures, 2):
        title = figure_name(figure['figureId'], source)
        c.setFillColor(INK)
        c.setFont('Helvetica-Bold', 23)
        c.drawString(42, height - 44, title)
        c.setFont('Helvetica', 10)
        c.setFillColor(MUTED)
        c.drawString(42, height - 65, f"{figure['figureId']} | {figure['width']} x {figure['height']} px | Drawing SHA-256: {figure['sha256'][:16]}...")
        markers = figure['markers']
        missing = ', '.join(map(str, figure['missingNumbers'])) or 'none'
        extra = ', '.join(map(str, figure['extraNumbers'])) or 'none'
        c.setFont('Helvetica-Bold', 11)
        c.setFillColor(ORANGE)
        c.drawString(42, height - 86, f"{len(markers)} annotations | Missing expected labels: {missing} | Source-only labels: {extra} | PENDING HUMAN REVIEW")
        scale = min((width - 100) / figure['width'], 555 / figure['height'])
        iw, ih = figure['width'] * scale, figure['height'] * scale
        ix, iy = (width - iw) / 2, 177 + (555 - ih) / 2
        c.drawImage(ImageReader(str(ROOT / figure['drawingPath'])), ix, iy, iw, ih)
        c.setStrokeColor(colors.HexColor('#cbd5e1'))
        c.rect(ix, iy, iw, ih, fill=0, stroke=1)
        for marker in markers:
            x, y = ix + iw * marker['x'] / 100, iy + ih * (1 - marker['y'] / 100)
            color = PURPLE if marker['number'] in figure['extraNumbers'] else BLUE if marker['evidence'] == 'existing-hand-placed-oracle' else ORANGE
            c.setStrokeColor(color)
            c.setLineWidth(1.5)
            c.setDash(2, 2) if marker['evidence'].endswith('estimated-center') else c.setDash()
            c.circle(x, y, 11, fill=0, stroke=1)
            c.setDash()
            # The proposed number must be visible separately from the printed
            # numeral; a ring alone would conceal a wrongly read digit.
            c.setFillColor(color)
            c.circle(x + 12, y + 12, 7, fill=1, stroke=0)
            c.setFillColor(colors.white)
            c.setFont('Helvetica-Bold', 7)
            c.drawCentredString(x + 12, y + 9.5, str(marker['number']))
        y = paragraph(c, figure['notes'], 42, 151, width - 84, 11, PURPLE if 'CONFLICT' in figure['notes'] else INK)
        paragraph(c, 'Blue = existing reference. Amber = unapproved proposal. Purple = no imported match. Solid = geometric center; dashed = estimated. Source numerals remain visible inside the rings.', 42, min(y - 7, 114), width - 84, 9, MUTED)
        c.setFillColor(INK)
        c.setFont('Helvetica', 10)
        c.drawString(42, 78, 'Reviewer: ____________________   Date: __________   [ ] All associations verified   [ ] Corrections needed   [ ] Source conflict unresolved')
        footer(page)
        c.showPage()
    c.save()
    with csv_path.open('w', newline='') as stream:
        writer = csv.writer(stream)
        writer.writerow(['figure_id', 'number', 'occurrence', 'proposed_x_percent', 'proposed_y_percent', 'evidence', 'confidence', 'has_imported_number', 'drawing_sha256', 'review_status', 'reviewer', 'review_date', 'corrected_x_percent', 'corrected_y_percent', 'reviewer_notes'])
        for figure in figures:
            occurrences = {}
            for marker in figure['markers']:
                number = marker['number']
                occurrences[number] = occurrences.get(number, 0) + 1
                writer.writerow([figure['figureId'], number, occurrences[number], marker['x'], marker['y'], marker['evidence'], marker['confidence'], number in figure['expectedNumbers'], figure['sha256'], figure['reviewStatus'], '', '', '', '', ''])
            for number in figure['missingNumbers']:
                writer.writerow([figure['figureId'], number, '', '', '', 'unresolved-no-readable-label', 'not-placeable', True, figure['sha256'], 'source-confirmation-required', '', '', '', '', figure['notes']])
    print(f'{target}\n{csv_path}\n{len(figures) + 1} PDF pages; {sum(len(f["markers"]) for f in figures)} annotations')


if __name__ == '__main__':
    main()
