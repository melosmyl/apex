// buildPdfReport.ts — generates a professional institutional-quality PDF report
// using jsPDF (confirmed working in the Deno runtime). Used for financial
// analysis summaries, strategy reports, board resolutions, and any written
// deliverable. Imported by the generate-deliverable backend function.

import { jsPDF } from 'npm:jspdf@4.0.0';

const COLORS = {
  ink: [43, 43, 43],
  sub: [102, 102, 102],
  accent: [122, 92, 62],
  light: [232, 226, 216],
  rule: [204, 204, 204],
  warn: [154, 74, 74],
  tableHead: [47, 52, 55],
  tableAlt: [247, 245, 240],
  white: [255, 255, 255],
};

const PAGE = { w: 595, h: 842, margin: 50, contentW: 495 };
const FONT = 'helvetica';

function newDoc() {
  return new jsPDF({ unit: 'pt', format: 'a4', putOnlyUsedFonts: true });
}

function setFont(doc, style, size, color) {
  doc.setFont(FONT, style || 'normal');
  doc.setFontSize(size || 10);
  if (color) doc.setTextColor(color[0], color[1], color[2]);
}

function ensureSpace(doc, needed, addHeaderFooter) {
  if (doc.y + needed > PAGE.h - 60) {
    addPage(doc, addHeaderFooter);
  }
}

function addPage(doc, hf) {
  doc.addPage();
  doc.y = PAGE.margin + 10;
  if (hf) hf(doc);
}

function headerFooter(doc, spec, pageIndex, totalPages) {
  // Header
  setFont(doc, 'normal', 8, COLORS.sub);
  doc.text(spec.company?.name || 'Company', PAGE.margin, 30);
  doc.text(spec.modelTitle || 'Report', PAGE.w - PAGE.margin, 30, { align: 'right' });
  doc.setDrawColor(...COLORS.rule);
  doc.setLineWidth(0.5);
  doc.line(PAGE.margin, 38, PAGE.w - PAGE.margin, 38);

  // Footer
  doc.line(PAGE.margin, PAGE.h - 40, PAGE.w - PAGE.margin, PAGE.h - 40);
  setFont(doc, 'normal', 8, COLORS.sub);
  doc.text('CONFIDENTIAL', PAGE.margin, PAGE.h - 28);
  doc.text(`${pageIndex} / ${totalPages}`, PAGE.w - PAGE.margin, PAGE.h - 28, { align: 'right' });
}

function coverPage(doc, spec) {
  setFont(doc, 'normal', 11, COLORS.sub);
  doc.text(spec.company?.name || 'Company', PAGE.margin, 260);

  setFont(doc, 'bold', 30, COLORS.ink);
  doc.text(doc.splitTextToSize(spec.modelTitle || 'Financial Analysis Report', PAGE.contentW), PAGE.margin, 300);

  if (spec.subtitle) {
    setFont(doc, 'normal', 13, COLORS.accent);
    doc.text(spec.subtitle, PAGE.margin, 360);
  }

  const meta = [
    ['Prepared by', spec.preparedBy || 'AI Advisory Board'],
    ['Date', new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })],
    ['Version', `v${spec.version || 1}.0`],
    ['Status', spec.status || 'Draft — Ready for Review'],
  ];
  let y = 430;
  meta.forEach(([k, v]) => {
    setFont(doc, 'normal', 8, COLORS.sub);
    doc.text(k.toUpperCase(), PAGE.margin, y);
    setFont(doc, 'normal', 11, COLORS.ink);
    doc.text(v, PAGE.margin, y + 14);
    y += 34;
  });

  doc.setFillColor(...COLORS.light);
  doc.rect(PAGE.margin, 600, PAGE.contentW, 44, 'F');
  setFont(doc, 'normal', 8, COLORS.warn);
  const notice = 'CONFIDENTIAL — This document is prepared for internal strategic use. Assumptions marked "Requires confirmation" must be verified before reliance.';
  doc.text(doc.splitTextToSize(notice, PAGE.contentW - 20), PAGE.margin + 10, 614);
}

function sectionHeading(doc, title, hf) {
  ensureSpace(doc, 40, hf);
  doc.y += 16;
  setFont(doc, 'bold', 15, COLORS.ink);
  doc.text(title, PAGE.margin, doc.y);
  doc.y += 6;
  doc.setDrawColor(...COLORS.accent);
  doc.setLineWidth(1);
  doc.line(PAGE.margin, doc.y, PAGE.w - PAGE.margin, doc.y);
  doc.y += 14;
}

function bodyText(doc, text, hf) {
  if (!text) return;
  setFont(doc, 'normal', 10, COLORS.ink);
  const lines = doc.splitTextToSize(text, PAGE.contentW);
  lines.forEach((line) => {
    ensureSpace(doc, 14, hf);
    doc.text(line, PAGE.margin, doc.y);
    doc.y += 13;
  });
  doc.y += 4;
}

function bulletList(doc, items, hf) {
  if (!items?.length) return;
  setFont(doc, 'normal', 10, COLORS.ink);
  items.forEach((item) => {
    const lines = doc.splitTextToSize(`•  ${item}`, PAGE.contentW - 12);
    lines.forEach((line) => {
      ensureSpace(doc, 14, hf);
      doc.text(line, PAGE.margin + 4, doc.y);
      doc.y += 13;
    });
  });
  doc.y += 4;
}

function dataTable(doc, headers, rows, hf) {
  if (!headers?.length) return;
  const colCount = headers.length;
  const colWidth = PAGE.contentW / colCount;
  ensureSpace(doc, 20 + rows.length * 16, hf);

  // Header
  doc.setFillColor(...COLORS.tableHead);
  doc.rect(PAGE.margin, doc.y, PAGE.contentW, 18, 'F');
  headers.forEach((h, i) => {
    setFont(doc, 'bold', 9, COLORS.white);
    doc.text(String(h ?? ''), PAGE.margin + i * colWidth + 4, doc.y + 12, { maxWidth: colWidth - 8 });
  });
  doc.y += 18;

  // Rows
  rows.forEach((row, ri) => {
    const rowH = 16;
    ensureSpace(doc, rowH, hf);
    if (ri % 2 === 1) {
      doc.setFillColor(...COLORS.tableAlt);
      doc.rect(PAGE.margin, doc.y, PAGE.contentW, rowH, 'F');
    }
    row.forEach((cell, i) => {
      setFont(doc, i === 0 ? 'bold' : 'normal', 9, COLORS.ink);
      doc.text(String(cell ?? ''), PAGE.margin + i * colWidth + 4, doc.y + 11, { maxWidth: colWidth - 8 });
    });
    doc.y += rowH;
  });
  doc.y += 8;
}

// ─── Main entry ─────────────────────────────────────────────────
export async function buildPdfReport(spec) {
  const doc = newDoc();
  doc.y = PAGE.margin;

  // Cover (no header/footer)
  coverPage(doc, spec);
  doc.addPage();
  doc.y = PAGE.margin + 10;

  let pageIndex = 2;

  const hf = (d) => { /* header/footer added at end via totalPages */ };

  // Table of Contents
  sectionHeading(doc, 'Table of Contents', hf);
  const toc = spec.toc || ['Executive Summary', 'Key Financial Metrics', 'Key Assumptions', 'Risks & Limitations', 'Sources & Notes'];
  setFont(doc, 'normal', 10, COLORS.ink);
  toc.forEach((t, i) => {
    ensureSpace(doc, 14, hf);
    doc.text(`${i + 1}.  ${t}`, PAGE.margin + 4, doc.y);
    doc.y += 14;
  });

  // Executive Summary
  sectionHeading(doc, 'Executive Summary', hf);
  bodyText(doc, spec.narrative?.executiveSummary || 'This report summarises the key findings and financial analysis prepared by the advisory board.', hf);

  // Key Metrics table
  if (spec.keyMetrics?.length) {
    sectionHeading(doc, 'Key Financial Metrics', hf);
    dataTable(doc, ['Metric', 'Value'], spec.keyMetrics, hf);
  }

  // Assumptions
  if (spec.assumptionsTable?.length) {
    sectionHeading(doc, 'Key Assumptions', hf);
    dataTable(doc, ['Assumption', 'Value', 'Confidence'], spec.assumptionsTable, hf);
    const needsConfirm = spec.assumptionsTable.filter((a) => a[2] === 'Requires confirmation');
    if (needsConfirm.length) {
      doc.y += 4;
      setFont(doc, 'normal', 9, COLORS.warn);
      doc.text('The following assumptions require founder confirmation before reliance:', PAGE.margin, doc.y);
      doc.y += 12;
      bulletList(doc, needsConfirm.map((a) => a[0]), hf);
    }
  }

  // Additional sections
  if (spec.unitEconomics) { sectionHeading(doc, 'Unit Economics', hf); bodyText(doc, spec.unitEconomics, hf); }
  if (spec.revenueSummary) { sectionHeading(doc, 'Revenue & Profitability', hf); bodyText(doc, spec.revenueSummary, hf); }
  if (spec.cashFlowSummary) { sectionHeading(doc, 'Cash Flow Summary', hf); bodyText(doc, spec.cashFlowSummary, hf); }
  if (spec.scenarioSummary) { sectionHeading(doc, 'Scenario & Sensitivity', hf); bodyText(doc, spec.scenarioSummary, hf); }

  // Additional analysis sections
  if (spec.sections?.length) {
    for (const sec of spec.sections) {
      sectionHeading(doc, sec.heading || 'Section', hf);
      bodyText(doc, sec.content || '', hf);
      if (sec.subsections?.length) {
        for (const sub of sec.subsections) {
          ensureSpace(doc, 20, hf);
          setFont(doc, 'bold', 12, COLORS.ink);
          doc.text(sub.heading || '', PAGE.margin, doc.y);
          doc.y += 14;
          bodyText(doc, sub.content || '', hf);
        }
      }
    }
  }

  // Recommendations
  if (spec.recommendations?.length) {
    sectionHeading(doc, 'Recommendations', hf);
    spec.recommendations.forEach((rec) => {
      const text = typeof rec === 'string' ? rec : `${rec.recommendation}${rec.rationale ? ` — ${rec.rationale}` : ''}`;
      bulletList(doc, [text], hf);
    });
  }

  // Risks
  sectionHeading(doc, 'Risks & Limitations', hf);
  if (spec.narrative?.risks?.length) {
    bulletList(doc, spec.narrative.risks, hf);
  } else {
    bodyText(doc, 'Figures marked as AI estimates or requiring confirmation should not be treated as established facts. Ranges should be used where precision is unsupported by source data.', hf);
  }

  // Sources
  sectionHeading(doc, 'Sources & Notes', hf);
  if (spec.narrative?.sources?.length) {
    bulletList(doc, spec.narrative.sources, hf);
  } else {
    bodyText(doc, 'This report was prepared using company-provided information and AI estimates. No external sources were cited. All assumptions should be verified before external use.', hf);
  }

  // Add header/footer to all pages
  const totalPages = doc.getNumberOfPages();
  for (let p = 2; p <= totalPages; p++) {
    doc.setPage(p);
    headerFooter(doc, spec, p, totalPages);
  }
  // Cover page footer only
  doc.setPage(1);
  doc.setDrawColor(...COLORS.rule);
  doc.setLineWidth(0.5);
  doc.line(PAGE.margin, PAGE.h - 40, PAGE.w - PAGE.margin, PAGE.h - 40);
  setFont(doc, 'normal', 8, COLORS.sub);
  doc.text('CONFIDENTIAL', PAGE.margin, PAGE.h - 28);

  const arrayBuffer = doc.output('arraybuffer');
  return new Uint8Array(arrayBuffer);
}