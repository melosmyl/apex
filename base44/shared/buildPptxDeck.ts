// buildPptxDeck.ts — generates a professional, editable PowerPoint (.pptx) deck
// using the `pptxgenjs` library. Used for pitch decks and presentations.
// Imported by the generate-deliverable backend function.

import pptxgen from 'npm:pptxgenjs@3.12.0';

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
  brand: '7A5C3E',
};

const FONT = 'Calibri';
const WIDE_W = 13.33;
const WIDE_H = 7.5;

// ─── Helper: title slide ────────────────────────────────────────
function addTitleSlide(pptx: any, spec: any) {
  const slide = pptx.addSlide();
  slide.background = { color: COLORS.white };

  // Accent bar at top
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: WIDE_W, h: 0.12, fill: { color: COLORS.accent } });

  // Company name
  slide.addText(spec.company?.name || 'Company', {
    x: 0.8, y: 1.8, w: 11.5, h: 0.5,
    fontSize: 14, color: COLORS.sub, fontFace: FONT, charSpacing: 2,
  });

  // Deck title
  slide.addText(spec.modelTitle || 'Presentation', {
    x: 0.8, y: 2.4, w: 11.5, h: 1.5,
    fontSize: 36, bold: true, color: COLORS.ink, fontFace: FONT,
  });

  // Subtitle
  if (spec.subtitle) {
    slide.addText(spec.subtitle, {
      x: 0.8, y: 3.9, w: 11.5, h: 0.6,
      fontSize: 18, color: COLORS.accent, fontFace: FONT,
    });
  }

  // Metadata
  const meta = [
    `Prepared by: ${spec.preparedBy || 'AI Advisory Board'}`,
    `Date: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`,
    `Version: v${spec.version || 1}.0`,
  ];
  slide.addText(meta.join('\n'), {
    x: 0.8, y: 5.5, w: 11.5, h: 1,
    fontSize: 11, color: COLORS.sub, fontFace: FONT, lineSpacingMultiple: 1.4,
  });

  // Confidential footer
  slide.addText('CONFIDENTIAL — Internal strategic use only', {
    x: 0.8, y: 6.9, w: 11.5, h: 0.4,
    fontSize: 8, color: COLORS.warn, fontFace: FONT,
  });
}

// ─── Helper: section divider slide ──────────────────────────────
function addSectionSlide(pptx: any, title: string) {
  const slide = pptx.addSlide();
  slide.background = { color: COLORS.ink };

  slide.addText(title, {
    x: 0.8, y: 3, w: 11.5, h: 1.5,
    fontSize: 32, bold: true, color: COLORS.white, fontFace: FONT,
  });

  slide.addShape(pptx.ShapeType.rect, { x: 0.8, y: 4.5, w: 2, h: 0.06, fill: { color: COLORS.accent } });
}

// ─── Helper: bullet content slide ───────────────────────────────
function addBulletSlide(pptx: any, title: string, bullets: string[]) {
  const slide = pptx.addSlide();
  slide.background = { color: COLORS.white };

  // Title bar
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: WIDE_W, h: 1.1, fill: { color: COLORS.light } });
  slide.addText(title, {
    x: 0.6, y: 0.2, w: 12, h: 0.7,
    fontSize: 24, bold: true, color: COLORS.ink, fontFace: FONT,
    valign: 'middle',
  });

  // Bullets
  const bulletText = bullets.map((b) => ({ text: b, options: { bullet: { code: '2022' }, indentLevel: 0 } }));
  slide.addText(bulletText, {
    x: 0.6, y: 1.4, w: 12, h: 5.5,
    fontSize: 16, color: COLORS.ink, fontFace: FONT,
    lineSpacingMultiple: 1.4, paraSpaceAfter: 8,
  });
}

// ─── Helper: table slide ────────────────────────────────────────
function addTableSlide(pptx: any, title: string, headers: string[], rows: string[][]) {
  const slide = pptx.addSlide();
  slide.background = { color: COLORS.white };

  // Title bar
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: WIDE_W, h: 1.1, fill: { color: COLORS.light } });
  slide.addText(title, {
    x: 0.6, y: 0.2, w: 12, h: 0.7,
    fontSize: 24, bold: true, color: COLORS.ink, fontFace: FONT,
    valign: 'middle',
  });

  // Table
  const tableRows = [
    headers.map((h) => ({ text: String(h ?? ''), options: { bold: true, color: COLORS.white, fill: { color: COLORS.tableHead }, fontSize: 12, fontFace: FONT } })),
    ...rows.map((row, ri) => row.map((cell) => ({
      text: String(cell ?? ''),
      options: {
        fontSize: 11, fontFace: FONT, color: COLORS.ink,
        fill: { color: ri % 2 === 1 ? COLORS.tableAlt : COLORS.white },
      },
    }))),
  ];

  const colCount = headers.length;
  const colW = (12 / colCount);

  slide.addTable(tableRows, {
    x: 0.6, y: 1.5, w: 12,
    colW: Array(colCount).fill(colW),
    border: { type: 'solid', pt: 1, color: COLORS.rule },
    rowH: 0.4,
    valign: 'middle',
  });
}

// ─── Helper: two-column slide ───────────────────────────────────
function addTwoColumnSlide(pptx: any, title: string, left: any, right: any) {
  const slide = pptx.addSlide();
  slide.background = { color: COLORS.white };

  // Title bar
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: WIDE_W, h: 1.1, fill: { color: COLORS.light } });
  slide.addText(title, {
    x: 0.6, y: 0.2, w: 12, h: 0.7,
    fontSize: 24, bold: true, color: COLORS.ink, fontFace: FONT,
    valign: 'middle',
  });

  // Left column
  slide.addText(left?.heading || '', {
    x: 0.6, y: 1.4, w: 5.8, h: 0.5,
    fontSize: 16, bold: true, color: COLORS.accent, fontFace: FONT,
  });
  const leftBullets = (left?.bullets || []).map((b: string) => ({ text: b, options: { bullet: { code: '2022' } } }));
  slide.addText(leftBullets, {
    x: 0.6, y: 2, w: 5.8, h: 4.5,
    fontSize: 14, color: COLORS.ink, fontFace: FONT,
    lineSpacingMultiple: 1.3, paraSpaceAfter: 6,
  });

  // Divider
  slide.addShape(pptx.ShapeType.line, { x: 6.65, y: 1.5, w: 0, h: 5, line: { color: COLORS.rule, width: 1 } });

  // Right column
  slide.addText(right?.heading || '', {
    x: 6.9, y: 1.4, w: 5.8, h: 0.5,
    fontSize: 16, bold: true, color: COLORS.accent, fontFace: FONT,
  });
  const rightBullets = (right?.bullets || []).map((b: string) => ({ text: b, options: { bullet: { code: '2022' } } }));
  slide.addText(rightBullets, {
    x: 6.9, y: 2, w: 5.8, h: 4.5,
    fontSize: 14, color: COLORS.ink, fontFace: FONT,
    lineSpacingMultiple: 1.3, paraSpaceAfter: 6,
  });
}

// ─── Main entry ─────────────────────────────────────────────────
export async function buildPptxDeck(spec: any): Promise<Uint8Array> {
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = spec.preparedBy || 'AI Advisory Board';
  pptx.company = spec.company?.name || '';
  pptx.subject = spec.modelTitle || 'Presentation';

  // Title slide
  addTitleSlide(pptx, spec);

  // Process slides from spec
  const slides = spec.slides || [];
  for (const slide of slides) {
    switch (slide.layout) {
      case 'title':
        // Already handled by the title slide, skip
        break;
      case 'section':
        addSectionSlide(pptx, slide.title || 'Section');
        break;
      case 'bullets':
        addBulletSlide(pptx, slide.title || '', slide.bullets || []);
        break;
      case 'table':
        addTableSlide(pptx, slide.title || '', slide.headers || [], slide.rows || []);
        break;
      case 'two_column':
        addTwoColumnSlide(pptx, slide.title || '', slide.left, slide.right);
        break;
      default:
        // Default to bullet slide
        addBulletSlide(pptx, slide.title || '', slide.bullets || []);
        break;
    }
  }

  // Risks slide
  if (spec.narrative?.risks?.length) {
    addBulletSlide(pptx, 'Risks & Limitations', spec.narrative.risks);
  }

  // Sources slide
  const sourceLines = spec.narrative?.sources?.length
    ? spec.narrative.sources
    : ['No external sources were cited. This presentation was prepared using company-provided information and AI estimates.'];
  addBulletSlide(pptx, 'Sources & Notes', sourceLines);

  // Closing slide
  const closingSlide = pptx.addSlide();
  closingSlide.background = { color: COLORS.ink };
  closingSlide.addText('Thank you', {
    x: 0.8, y: 3, w: 11.5, h: 1,
    fontSize: 36, bold: true, color: COLORS.white, fontFace: FONT,
    align: 'center',
  });
  closingSlide.addText(`${spec.company?.name || ''} — CONFIDENTIAL`, {
    x: 0.8, y: 4.2, w: 11.5, h: 0.5,
    fontSize: 12, color: COLORS.sub, fontFace: FONT,
    align: 'center',
  });

  const arrayBuffer = await pptx.write({ outputType: 'arraybuffer' });
  return new Uint8Array(arrayBuffer);
}

// ─── Quality checks ─────────────────────────────────────────────
export function runPptxQualityChecks(spec: any) {
  const checks: { check: string; passed: boolean; detail?: string }[] = [];

  // Slide count
  const slideCount = (spec.slides || []).length;
  checks.push({
    check: 'Sufficient slide count (5+ content slides)',
    passed: slideCount >= 5,
    detail: slideCount >= 5 ? undefined : `Only ${slideCount} slides generated`,
  });

  // Title slide present
  const hasTitle = (spec.slides || []).some((s: any) => s.layout === 'title' || s.title);
  checks.push({
    check: 'Title slide present',
    passed: hasTitle,
    detail: hasTitle ? undefined : 'No title slide found',
  });

  // Executive summary slide
  const hasExecSummary = (spec.slides || []).some(
    (s: any) => s.title?.toLowerCase().includes('executive') || s.title?.toLowerCase().includes('summary')
  );
  checks.push({
    check: 'Executive summary slide present',
    passed: hasExecSummary,
    detail: hasExecSummary ? undefined : 'No executive summary slide found',
  });

  // Sources documented
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
    detail: hasRisks ? undefined : 'No risks identified in the deck',
  });

  const allPassed = checks.every((c) => c.passed);
  return { passed: allPassed, checks };
}