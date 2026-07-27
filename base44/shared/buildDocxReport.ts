// buildDocxReport.ts — generates a professional, editable Word (.docx) document
// using the `docx` library. Used for text-heavy deliverables (reports, strategies,
// proposals, memos, plans). Imported by the generate-deliverable backend function.

import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, AlignmentType,
  PageBreak, Header, Footer, PageNumber,
  BorderStyle, ShadingType, TabStopType, TabStopPosition,
  convertInchesToTwip, VerticalAlign,
} from 'npm:docx@8.5.0';

const COLORS = {
  ink: '2B2B2B',
  sub: '666666',
  accent: '7A5C3E',
  light: 'E8E2D8',
  rule: 'CCCCCC',
  warn: '9A4A4A',
  tableHead: '2F3437',
  tableAlt: 'F7F5F0',
  white: 'FFFFFF',
  amberBg: 'FEF3C7',
  amberText: '92400E',
};

const HALF = (pt) => Math.round(pt * 2); // half-points for font sizes

// ─── Helper: paragraph with text runs ───────────────────────────
function para(opts: any = {}): Paragraph {
  const {
    text = '', size = 11, bold = false, italics = false,
    color = COLORS.ink, align = AlignmentType.LEFT,
    spacing = { after: 120, line: 276 }, indent = undefined,
    heading = undefined, runs = undefined, children = undefined,
  } = opts;

  const textRuns = runs || [new TextRun({ text, size: HALF(size), bold, italics, color, font: 'Calibri' })];
  return new Paragraph({
    heading,
    alignment: align,
    spacing,
    indent,
    children: children || textRuns,
  });
}

// ─── Helper: section heading with accent rule ───────────────────
function sectionHeading(title: string): (Paragraph | Paragraph)[] {
  return [
    new Paragraph({
      spacing: { before: 360, after: 80 },
      children: [new TextRun({ text: title, size: HALF(15), bold: true, color: COLORS.ink, font: 'Calibri' })],
        heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph({
      spacing: { after: 160 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: COLORS.accent, space: 1 } },
      children: [],
    }),
  ];
}

// ─── Helper: body text paragraph ────────────────────────────────
function bodyText(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 120, line: 300 },
    children: [new TextRun({ text: text || '', size: HALF(11), color: COLORS.ink, font: 'Calibri' })],
  });
}

// ─── Helper: bullet list item ───────────────────────────────────
function bulletItem(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 60, line: 276 },
    bullet: { level: 0 },
    children: [new TextRun({ text: text || '', size: HALF(11), color: COLORS.ink, font: 'Calibri' })],
  });
}

// ─── Helper: build a data table ──────────────────────────────────
function buildTable(headers: string[], rows: string[][]): Table {
  const colCount = headers.length;
  const colWidth = Math.floor(100 / colCount); // percentage

  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((h) =>
      new TableCell({
        width: { size: colWidth, type: WidthType.PERCENTAGE },
        shading: { type: ShadingType.SOLID, color: COLORS.tableHead, fill: COLORS.tableHead },
        verticalAlign: VerticalAlign.CENTER,
        margins: { top: 60, bottom: 60, left: 80, right: 80 },
        children: [
          new Paragraph({
            spacing: { after: 0 },
            children: [new TextRun({ text: String(h ?? ''), size: HALF(10), bold: true, color: COLORS.white, font: 'Calibri' })],
          }),
        ],
      })
    ),
  });

  const dataRows = rows.map((row, ri) =>
    new TableRow({
      children: row.map((cell, ci) =>
        new TableCell({
          width: { size: colWidth, type: WidthType.PERCENTAGE },
          shading: ri % 2 === 1
            ? { type: ShadingType.SOLID, color: COLORS.tableAlt, fill: COLORS.tableAlt }
            : undefined,
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 50, bottom: 50, left: 80, right: 80 },
          children: [
            new Paragraph({
              spacing: { after: 0 },
              children: [new TextRun({
                text: String(cell ?? ''),
                size: HALF(10),
                bold: ci === 0,
                color: COLORS.ink,
                font: 'Calibri',
              })],
            }),
          ],
        })
      ),
    })
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: COLORS.rule },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: COLORS.rule },
      left: { style: BorderStyle.SINGLE, size: 1, color: COLORS.rule },
      right: { style: BorderStyle.SINGLE, size: 1, color: COLORS.rule },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: COLORS.rule },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: COLORS.rule },
    },
    rows: [headerRow, ...dataRows],
  });
}

// ─── Cover page ─────────────────────────────────────────────────
function coverPageChildren(spec: any): (Paragraph | Table)[] {
  const children: (Paragraph | Table)[] = [];

  // Top spacing
  children.push(new Paragraph({ spacing: { before: 2400 }, children: [] }));

  // Company name
  children.push(new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { after: 80 },
    children: [new TextRun({ text: spec.company?.name || 'Company', size: HALF(12), color: COLORS.sub, font: 'Calibri' })],
  }));

  // Title
  children.push(new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { after: 120 },
    children: [new TextRun({ text: spec.modelTitle || 'Report', size: HALF(30), bold: true, color: COLORS.ink, font: 'Calibri' })],
  }));

  // Subtitle
  if (spec.subtitle) {
    children.push(new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 600 },
      children: [new TextRun({ text: spec.subtitle, size: HALF(13), color: COLORS.accent, font: 'Calibri' })],
    }));
  } else {
    children.push(new Paragraph({ spacing: { after: 600 }, children: [] }));
  }

  // Metadata table
  const metaRows = [
    ['Prepared by', spec.preparedBy || 'AI Advisory Board'],
    ['Date', new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })],
    ['Version', `v${spec.version || 1}.0`],
    ['Status', spec.status || 'Draft — Ready for Review'],
  ];
  children.push(buildTable(['Field', 'Detail'], metaRows));

  // Spacing before confidential notice
  children.push(new Paragraph({ spacing: { before: 600 }, children: [] }));

  // Confidential notice
  children.push(new Paragraph({
    spacing: { before: 200, after: 0 },
    shading: { type: ShadingType.SOLID, color: COLORS.light, fill: COLORS.light },
    border: {
      top: { style: BorderStyle.SINGLE, size: 1, color: COLORS.light },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: COLORS.light },
      left: { style: BorderStyle.SINGLE, size: 1, color: COLORS.light },
      right: { style: BorderStyle.SINGLE, size: 1, color: COLORS.light },
    },
    children: [new TextRun({
      text: 'CONFIDENTIAL — This document is prepared for internal strategic use. Assumptions marked "Requires confirmation" must be verified before reliance.',
      size: HALF(9),
      color: COLORS.warn,
      font: 'Calibri',
    })],
  }));

  // Page break after cover
  children.push(new Paragraph({ children: [new PageBreak()] }));

  return children;
}

// ─── Main entry ─────────────────────────────────────────────────
export async function buildDocxReport(spec: any): Promise<Uint8Array> {
  const sections: any[] = [];

  // ─── Cover page (no header/footer) ───
  sections.push({
    properties: {},
    children: coverPageChildren(spec),
  });

  // ─── Content pages with header/footer ───
  const contentChildren: any[] = [];

  // Table of Contents
  contentChildren.push(...sectionHeading('Table of Contents'));
  const toc = spec.toc || ['Executive Summary', 'Key Financial Metrics', 'Key Assumptions', 'Risks & Limitations', 'Sources & Notes'];
  toc.forEach((t: string, i: number) => {
    contentChildren.push(new Paragraph({
      spacing: { after: 80, line: 276 },
      children: [new TextRun({ text: `${i + 1}.  ${t}`, size: HALF(11), color: COLORS.ink, font: 'Calibri' })],
    }));
  });

  // Executive Summary
  contentChildren.push(...sectionHeading('Executive Summary'));
  contentChildren.push(bodyText(
    spec.narrative?.executiveSummary ||
    'This report summarises the key findings and analysis prepared by the advisory board.'
  ));

  // Key Metrics table
  if (spec.keyMetrics?.length) {
    contentChildren.push(...sectionHeading('Key Financial Metrics'));
    contentChildren.push(buildTable(['Metric', 'Value'], spec.keyMetrics));
    contentChildren.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
  }

  // Key Assumptions table
  if (spec.assumptionsTable?.length) {
    contentChildren.push(...sectionHeading('Key Assumptions'));
    contentChildren.push(buildTable(['Assumption', 'Value', 'Confidence'], spec.assumptionsTable));

    const needsConfirm = spec.assumptionsTable.filter((a: string[]) => a[2] === 'Requires confirmation');
    if (needsConfirm.length) {
      contentChildren.push(new Paragraph({ spacing: { before: 120, after: 60 }, children: [] }));
      contentChildren.push(new Paragraph({
        spacing: { after: 60 },
        children: [new TextRun({
          text: 'The following assumptions require founder confirmation before reliance:',
          size: HALF(10), color: COLORS.warn, font: 'Calibri',
        })],
      }));
      needsConfirm.forEach((a: string[]) => {
        contentChildren.push(bulletItem(a[0]));
      });
    }
    contentChildren.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
  }

  // Additional analysis sections
  if (spec.unitEconomics) {
    contentChildren.push(...sectionHeading('Unit Economics'));
    contentChildren.push(bodyText(spec.unitEconomics));
  }
  if (spec.revenueSummary) {
    contentChildren.push(...sectionHeading('Revenue & Profitability'));
    contentChildren.push(bodyText(spec.revenueSummary));
  }
  if (spec.cashFlowSummary) {
    contentChildren.push(...sectionHeading('Cash Flow Summary'));
    contentChildren.push(bodyText(spec.cashFlowSummary));
  }
  if (spec.scenarioSummary) {
    contentChildren.push(...sectionHeading('Scenario & Sensitivity'));
    contentChildren.push(bodyText(spec.scenarioSummary));
  }

  // Generic sections (from enhanced spec)
  if (spec.sections?.length) {
    for (const sec of spec.sections) {
      contentChildren.push(...sectionHeading(sec.heading || 'Section'));
      contentChildren.push(bodyText(sec.content || ''));
      if (sec.subsections?.length) {
        for (const sub of sec.subsections) {
          contentChildren.push(new Paragraph({
            spacing: { before: 200, after: 80 },
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: sub.heading || '', size: HALF(13), bold: true, color: COLORS.ink, font: 'Calibri' })],
          }));
          contentChildren.push(bodyText(sub.content || ''));
        }
      }
    }
  }

  // Recommendations
  if (spec.recommendations?.length) {
    contentChildren.push(...sectionHeading('Recommendations'));
    spec.recommendations.forEach((rec: any) => {
      const text = typeof rec === 'string' ? rec : `${rec.recommendation}${rec.rationale ? ` — ${rec.rationale}` : ''}`;
      contentChildren.push(bulletItem(text));
    });
  }

  // Risks & Limitations
  contentChildren.push(...sectionHeading('Risks & Limitations'));
  if (spec.narrative?.risks?.length) {
    spec.narrative.risks.forEach((r: string) => contentChildren.push(bulletItem(r)));
  } else {
    contentChildren.push(bodyText(
      'Figures marked as AI estimates or requiring confirmation should not be treated as established facts. Ranges should be used where precision is unsupported by source data.'
    ));
  }

  // Sources & Notes
  contentChildren.push(...sectionHeading('Sources & Notes'));
  if (spec.narrative?.sources?.length) {
    spec.narrative.sources.forEach((s: string) => contentChildren.push(bulletItem(s)));
  } else {
    contentChildren.push(bodyText(
      'This report was prepared using company-provided information and AI estimates. No external sources were cited. All assumptions should be verified before external use.'
    ));
  }

  // Limitations
  if (spec.narrative?.limitations?.length) {
    contentChildren.push(...sectionHeading('Limitations'));
    spec.narrative.limitations.forEach((l: string) => contentChildren.push(bulletItem(l)));
  }

  sections.push({
    properties: {},
    headers: {
      default: new Header({
        children: [new Paragraph({
          tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
          border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: COLORS.rule, space: 4 } },
          children: [
            new TextRun({ text: spec.company?.name || 'Company', size: HALF(8), color: COLORS.sub, font: 'Calibri' }),
            new TextRun({ text: '\t', size: HALF(8) }),
            new TextRun({ text: spec.modelTitle || 'Report', size: HALF(8), color: COLORS.sub, font: 'Calibri' }),
          ],
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
          border: { top: { style: BorderStyle.SINGLE, size: 1, color: COLORS.rule, space: 4 } },
          children: [
            new TextRun({ text: 'CONFIDENTIAL', size: HALF(8), color: COLORS.sub, font: 'Calibri' }),
            new TextRun({ text: '\t', size: HALF(8) }),
            new TextRun({ children: [PageNumber.CURRENT], size: HALF(8), color: COLORS.sub, font: 'Calibri' }),
            new TextRun({ text: ' / ', size: HALF(8), color: COLORS.sub, font: 'Calibri' }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], size: HALF(8), color: COLORS.sub, font: 'Calibri' }),
          ],
        })],
      }),
    },
    children: contentChildren,
  });

  const doc = new Document({
    sections,
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: HALF(11) },
        },
      },
    },
  });

  const buffer = await Packer.toBuffer(doc);
  return new Uint8Array(buffer);
}

// ─── Quality checks ────────────────────────────────────────────
export function runDocxQualityChecks(spec: any) {
  const checks: { check: string; passed: boolean; detail?: string }[] = [];

  // Executive summary present
  const hasSummary = !!(spec.narrative?.executiveSummary && spec.narrative.executiveSummary.length > 100);
  checks.push({
    check: 'Executive summary present and substantive (>100 chars)',
    passed: hasSummary,
    detail: hasSummary ? undefined : 'Executive summary is missing or too short',
  });

  // Key metrics or assumptions table present
  const hasTables = !!(spec.keyMetrics?.length || spec.assumptionsTable?.length);
  checks.push({
    check: 'Structured data tables included',
    passed: hasTables,
    detail: hasTables ? undefined : 'No key metrics or assumptions tables found',
  });

  // Sources cited or explicitly stated as none
  const hasSources = !!(spec.narrative?.sources?.length || spec.narrative?.limitations);
  checks.push({
    check: 'Sources and limitations documented',
    passed: hasSources,
    detail: hasSources ? undefined : 'No sources or limitations documented',
  });

  // Risks identified
  const hasRisks = !!(spec.narrative?.risks?.length);
  checks.push({
    check: 'Risks identified',
    passed: hasRisks,
    detail: hasRisks ? undefined : 'No risks identified in the report',
  });

  // Content depth (sections or analysis text)
  const hasDepth = !!(spec.sections?.length || spec.unitEconomics || spec.revenueSummary || spec.recommendations?.length);
  checks.push({
    check: 'Sufficient content depth (multiple sections or analysis)',
    passed: hasDepth,
    detail: hasDepth ? undefined : 'Report lacks detailed analysis sections',
  });

  const allPassed = checks.every((c) => c.passed);
  return { passed: allPassed, checks };
}