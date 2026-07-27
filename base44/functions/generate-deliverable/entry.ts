// generate-deliverable — produces genuine native files (Excel, PDF) for advisor
// deliverables, uploads them, runs quality checks, and stores them on the
// Document entity with version control. Replaces the old markdown-only flow.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { buildFinancialModelWorkbook, runExcelQualityChecks } from '../../shared/buildExcelModel.ts';
import { buildPdfReport } from '../../shared/buildPdfReport.ts';
import { buildDocxReport, runDocxQualityChecks } from '../../shared/buildDocxReport.ts';
import { buildPptxDeck, runPptxQualityChecks } from '../../shared/buildPptxDeck.ts';

const FINANCIAL_TYPES = ['Financial Model', 'Budget', 'Forecast', 'Spreadsheet'];
const PRESENTATION_TYPES = ['Pitch Deck', 'Presentation'];

function buildCompanyContext(company, decisions, projects, knowledgeDocs) {
  let ctx = `Company: ${company.name || 'N/A'}\nIndustry: ${company.industry || 'N/A'}\n`;
  ctx += `Description: ${company.description || company.tagline || 'N/A'}\n`;
  if (company.stage) ctx += `Stage: ${company.stage}\n`;
  if (company.target_customer) ctx += `Target customer: ${company.target_customer}\n`;
  if (company.business_model) ctx += `Business model: ${company.business_model}\n`;
  if (company.current_challenges) ctx += `Current challenges: ${company.current_challenges}\n`;
  if (company.immediate_goal) ctx += `Immediate goal: ${company.immediate_goal}\n`;
  if (company.priorities?.length) ctx += `Strategic priorities: ${company.priorities.join(', ')}\n`;
  if (decisions?.length) {
    ctx += `\nRecent decisions:\n`;
    decisions.slice(0, 5).forEach((d) => { ctx += `- ${d.question}: ${d.final_recommendation || d.summary || 'N/A'}\n`; });
  }
  if (projects?.length) {
    ctx += `\nActive projects:\n`;
    projects.slice(0, 5).forEach((p) => { ctx += `- ${p.name} (${p.status}): ${p.description || ''}\n`; });
  }
  if (knowledgeDocs?.length) {
    ctx += `\nCompany knowledge:\n`;
    knowledgeDocs.slice(0, 5).forEach((d) => { ctx += `- ${d.title}: ${(d.content || '').slice(0, 200)}\n`; });
  }
  return ctx;
}

function cleanFileName(str) {
  return (str || 'Document').replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_').replace(/_+/g, '_').slice(0, 60);
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { task_id, company_id, advisor_id, document_type, topic, revision_of, custom_instructions } = await req.json();

    // For revisions, inherit document_type from the original if not provided
    let resolvedDocType = document_type;
    if (!resolvedDocType && revision_of) {
      const orig = await base44.entities.Document.get(revision_of);
      resolvedDocType = orig?.document_type;
    }
    if (!company_id || !resolvedDocType)
      return Response.json({ error: 'company_id and document_type are required' }, { status: 400 });

    // Load context
    const [company, task, advisor, decisions, projects, knowledgeDocs] = await Promise.all([
      base44.entities.Company.get(company_id),
      task_id ? base44.entities.Task.get(task_id) : Promise.resolve(null),
      advisor_id ? base44.entities.Advisor.get(advisor_id) : Promise.resolve(null),
      base44.entities.Decision.filter({ company_id }, '-created_date', 5),
      base44.entities.Project.filter({ company_id }, '-created_date', 5),
      base44.entities.Document.filter({ company_id, kind: 'knowledge' }, '-created_date', 5),
    ]);

    const companyContext = buildCompanyContext(company, decisions, projects, knowledgeDocs);
    const isFinancial = FINANCIAL_TYPES.includes(resolvedDocType);
    const isPresentation = PRESENTATION_TYPES.includes(resolvedDocType);
    const taskTitle = task?.title || topic || resolvedDocType;

    // ─── Step 1: Generate structured document specification via LLM ───
    const spec = isFinancial
      ? await generateFinancialSpec(base44, company, advisor, task, taskTitle, companyContext, custom_instructions)
      : isPresentation
        ? await generatePresentationSpec(base44, company, advisor, task, taskTitle, companyContext, custom_instructions)
        : await generateReportSpec(base44, company, advisor, task, taskTitle, resolvedDocType, companyContext, custom_instructions);

    const version = revision_of ? await determineVersion(base44, company_id, revision_of) : 1;
    const baseName = `${cleanFileName(company.name)}_${cleanFileName(taskTitle)}_v${version}.0`;

    // ─── Step 2: Generate native files ───
    let nativeFileUrl = null;
    let pdfFileUrl = null;
    let nativeFormat = null;
    let fileSize = 0;
    let qaResult = { passed: false, checks: [] };

    if (isFinancial) {
      const modelSpec = {
        ...spec,
        company,
        modelTitle: taskTitle,
        preparedBy: advisor?.name ? `${advisor.name} (${advisor.role})` : 'AI Advisory Board',
        version,
        status: 'Ready for Review',
        currency: 'GBP (£)',
        months: 24,
      };
      const excelBytes = await buildFinancialModelWorkbook(modelSpec);
      const excelFile = new File([excelBytes], `${baseName}.xlsx`, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const excelUpload = await base44.asServiceRole.integrations.Core.UploadFile({ file: excelFile });
      nativeFileUrl = excelUpload.file_url;
      nativeFormat = 'xlsx';
      fileSize = excelBytes.length;

      qaResult = runExcelQualityChecks(modelSpec);

      // PDF summary
      const pdfSpec = buildPdfSpecFromModel(modelSpec);
      const pdfBytes = await buildPdfReport(pdfSpec);
      const pdfFile = new File([pdfBytes], `${baseName}_Summary.pdf`, { type: 'application/pdf' });
      const pdfUpload = await base44.asServiceRole.integrations.Core.UploadFile({ file: pdfFile });
      pdfFileUrl = pdfUpload.file_url;
    } else {
      const reportSpec = {
        ...spec,
        company,
        modelTitle: taskTitle,
        preparedBy: advisor?.name ? `${advisor.name} (${advisor.role})` : 'AI Advisory Board',
        version,
        status: 'Ready for Review',
      };

      if (isPresentation) {
        // Presentation types: editable PPTX + PDF companion
        const pptxBytes = await buildPptxDeck(reportSpec);
        const pptxFile = new File([pptxBytes], `${baseName}.pptx`, { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
        const pptxUpload = await base44.asServiceRole.integrations.Core.UploadFile({ file: pptxFile });
        nativeFileUrl = pptxUpload.file_url;
        nativeFormat = 'pptx';
        fileSize = pptxBytes.length;
        qaResult = runPptxQualityChecks(spec);

        // PDF companion
        const pdfBytes = await buildPdfReport(reportSpec);
        const pdfFile = new File([pdfBytes], `${baseName}.pdf`, { type: 'application/pdf' });
        const pdfUpload = await base44.asServiceRole.integrations.Core.UploadFile({ file: pdfFile });
        pdfFileUrl = pdfUpload.file_url;
      } else {
        // Text-heavy types: editable DOCX + PDF companion
        const docxBytes = await buildDocxReport(reportSpec);
        const docxFile = new File([docxBytes], `${baseName}.docx`, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
        const docxUpload = await base44.asServiceRole.integrations.Core.UploadFile({ file: docxFile });
        nativeFileUrl = docxUpload.file_url;
        nativeFormat = 'docx';
        fileSize = docxBytes.length;
        qaResult = runDocxQualityChecks(spec);

        // PDF companion
        const pdfBytes = await buildPdfReport(reportSpec);
        const pdfFile = new File([pdfBytes], `${baseName}.pdf`, { type: 'application/pdf' });
        const pdfUpload = await base44.asServiceRole.integrations.Core.UploadFile({ file: pdfFile });
        pdfFileUrl = pdfUpload.file_url;
      }
    }

    // ─── Step 3: Determine assumptions status ───
    const assumptionsStatus = isFinancial
      ? determineAssumptionsStatus(spec.assumptions)
      : (spec.assumptionsTable?.some((a) => a[2] === 'Requires confirmation') ? 'needs_confirmation' : 'complete');
    const sourceDataStatus = spec.narrative?.sources?.length ? 'verified' : 'estimated';

    // ─── Step 4: Create Document entity ───
    const docTitle = `${taskTitle} — v${version}.0`;
    const documentRecord = {
      company_id,
      project_id: task?.project_id || undefined,
      task_id: task_id || undefined,
      created_by_advisor_id: advisor_id || undefined,
      title: docTitle,
      description: spec.narrative?.executiveSummary?.slice(0, 300) || '',
      document_type: resolvedDocType,
      document_category: isFinancial ? 'Financials' : 'Other',
      folder_path: getFolderForType(resolvedDocType),
      tags: topic ? [topic] : [],
      status: qaResult.passed ? 'ready_for_review' : 'failed',
      content_format: nativeFormat === 'xlsx' ? 'XLSX' : nativeFormat === 'docx' ? 'DOCX' : nativeFormat === 'pptx' ? 'PPTX' : 'PDF',
      content: spec.narrative?.executiveSummary || '',
      structured_content: spec,
      native_file_url: nativeFileUrl,
      pdf_file_url: pdfFileUrl,
      file_url: nativeFileUrl,
      file_name: `${baseName}.${nativeFormat}`,
      native_file_format: nativeFormat,
      quality_check_status: qaResult.passed ? 'passed' : 'failed',
      quality_check_results: qaResult,
      assumptions_status: assumptionsStatus,
      source_data_status: sourceDataStatus,
      file_size: fileSize,
      source_references: spec.narrative?.sources || [],
      version_number: version,
      parent_document_id: revision_of || undefined,
      is_latest_version: true,
      approval_status: 'pending',
      kind: 'document',
    };

    // Mark previous version as superseded
    if (revision_of) {
      await base44.entities.Document.update(revision_of, { is_latest_version: false, status: 'superseded' });
    }

    const doc = await base44.entities.Document.create(documentRecord);

    // ─── Step 5: Update task ───
    if (task_id) {
      await base44.entities.Task.update(task_id, {
        status: qaResult.passed ? 'review' : 'todo',
        deliverable: qaResult.passed ? `${docTitle} — ${nativeFormat.toUpperCase()} ready for review` : 'Generation failed — see document',
        document_id: doc.id,
        delegated_back: !qaResult.passed,
        blocker: qaResult.passed ? undefined : 'File generation failed. Missing assumptions or data required.',
      });
    }

    // ─── Step 6: Log generation ───
    try {
      await base44.entities.DeliverableGenerationLog.create({
        user_id: user.id,
        company_id,
        task_id: task_id || undefined,
        advisor_id: advisor_id || undefined,
        document_id: doc.id,
        document_type: resolvedDocType,
        provider: 'openai',
        model: 'gpt-4o',
        input_size: 0,
        output_size: fileSize,
        status: qaResult.passed ? 'success' : 'error',
        export_format: nativeFormat,
        error_message: qaResult.passed ? undefined : 'Quality check failed',
      });
    } catch (logErr) { console.error('Generation log failed:', logErr.message); }

    return Response.json({
      document_id: doc.id,
      status: documentRecord.status,
      native_file_url: nativeFileUrl,
      pdf_file_url: pdfFileUrl,
      native_file_format: nativeFormat,
      quality_check: qaResult,
      version,
      assumptions_status: assumptionsStatus,
      file_name: documentRecord.file_name,
    });
  } catch (error) {
    console.error('generate-deliverable error:', error);
    return Response.json({ error: error.message || 'Document generation failed.' }, { status: 500 });
  }
}

// ─── LLM spec generation ───────────────────────────────────────
async function generateFinancialSpec(base44, company, advisor, task, taskTitle, companyContext, customInstructions) {
  const prompt = `You are ${advisor?.name || 'a financial advisor'}, ${advisor?.role || 'Chief Financial Officer'} on the executive board of ${company.name}.

=== COMPANY CONTEXT ===
${companyContext}

=== TASK ===
${taskTitle}
${task?.description || ''}

${customInstructions ? `Additional instructions: ${customInstructions}\n` : ''}

You must produce a financial model specification. The model will be built as a genuine Excel workbook with live formulas, so you must provide all assumption values and narrative content as structured JSON.

CRITICAL RULES:
- Mark every assumption's confidence as one of: "User provided", "Source verified", "Industry benchmark", "AI estimate", "Requires confirmation".
- Never present invented assumptions as established facts. If you do not have a real value, use a reasonable estimate and mark confidence as "AI estimate" or "Requires confirmation".
- Where figures are uncertain, use ranges in the notes.
- Do NOT claim a specific breakeven month unless the assumptions support it.

Return JSON.`;

  const schema = {
    type: 'object',
    properties: {
      assumptions: {
        type: 'object',
        description: 'Financial model assumptions. Each key maps to {value, source, confidence, notes}.',
        properties: {
          retailPriceDTC: { type: 'object', properties: { value: { type: 'number' }, source: { type: 'string' }, confidence: { type: 'string' }, notes: { type: 'string' } } },
          wholesalePrice: { type: 'object', properties: { value: { type: 'number' }, source: { type: 'string' }, confidence: { type: 'string' }, notes: { type: 'string' } } },
          wholesaleDiscountPct: { type: 'object', properties: { value: { type: 'number' }, source: { type: 'string' }, confidence: { type: 'string' }, notes: { type: 'string' } } },
          manufacturingCost: { type: 'object', properties: { value: { type: 'number' }, source: { type: 'string' }, confidence: { type: 'string' }, notes: { type: 'string' } } },
          packagingCost: { type: 'object', properties: { value: { type: 'number' }, source: { type: 'string' }, confidence: { type: 'string' }, notes: { type: 'string' } } },
          freightPerUnit: { type: 'object', properties: { value: { type: 'number' }, source: { type: 'string' }, confidence: { type: 'string' }, notes: { type: 'string' } } },
          dutiesPct: { type: 'object', properties: { value: { type: 'number' }, source: { type: 'string' }, confidence: { type: 'string' }, notes: { type: 'string' } } },
          warehousingPerUnit: { type: 'object', properties: { value: { type: 'number' }, source: { type: 'string' }, confidence: { type: 'string' }, notes: { type: 'string' } } },
          pickPackPerUnit: { type: 'object', properties: { value: { type: 'number' }, source: { type: 'string' }, confidence: { type: 'string' }, notes: { type: 'string' } } },
          paymentProcessingPct: { type: 'object', properties: { value: { type: 'number' }, source: { type: 'string' }, confidence: { type: 'string' }, notes: { type: 'string' } } },
          returnsRatePct: { type: 'object', properties: { value: { type: 'number' }, source: { type: 'string' }, confidence: { type: 'string' }, notes: { type: 'string' } } },
          breakagePct: { type: 'object', properties: { value: { type: 'number' }, source: { type: 'string' }, confidence: { type: 'string' }, notes: { type: 'string' } } },
          cac: { type: 'object', properties: { value: { type: 'number' }, source: { type: 'string' }, confidence: { type: 'string' }, notes: { type: 'string' } } },
          monthlyMarketing: { type: 'object', properties: { value: { type: 'number' }, source: { type: 'string' }, confidence: { type: 'string' }, notes: { type: 'string' } } },
          monthlyStaff: { type: 'object', properties: { value: { type: 'number' }, source: { type: 'string' }, confidence: { type: 'string' }, notes: { type: 'string' } } },
          monthlyOverheads: { type: 'object', properties: { value: { type: 'number' }, source: { type: 'string' }, confidence: { type: 'string' }, notes: { type: 'string' } } },
          startingCash: { type: 'object', properties: { value: { type: 'number' }, source: { type: 'string' }, confidence: { type: 'string' }, notes: { type: 'string' } } },
          vatPct: { type: 'object', properties: { value: { type: 'number' }, source: { type: 'string' }, confidence: { type: 'string' }, notes: { type: 'string' } } },
          dtcStartingUnits: { type: 'object', properties: { value: { type: 'number' }, source: { type: 'string' }, confidence: { type: 'string' }, notes: { type: 'string' } } },
          dtcMonthlyGrowthPct: { type: 'object', properties: { value: { type: 'number' }, source: { type: 'string' }, confidence: { type: 'string' }, notes: { type: 'string' } } },
          wholesaleStartingUnits: { type: 'object', properties: { value: { type: 'number' }, source: { type: 'string' }, confidence: { type: 'string' }, notes: { type: 'string' } } },
          wholesaleMonthlyGrowthPct: { type: 'object', properties: { value: { type: 'number' }, source: { type: 'string' }, confidence: { type: 'string' }, notes: { type: 'string' } } },
        },
      },
      narrative: {
        type: 'object',
        properties: {
          executiveSummary: { type: 'string', description: '2-3 paragraph executive summary of the model and key findings' },
          risks: { type: 'array', items: { type: 'string' } },
          sources: { type: 'array', items: { type: 'string' }, description: 'Only real sources used. State if none.' },
          limitations: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    required: ['assumptions', 'narrative'],
  };

  const res = await base44.asServiceRole.integrations.Core.InvokeLLM({ prompt, response_json_schema: schema, model: 'gpt_5_mini' });
  return res;
}

async function generateReportSpec(base44, company, advisor, task, taskTitle, documentType, companyContext, customInstructions) {
  const prompt = `You are ${advisor?.name || 'an advisor'}, ${advisor?.role || 'Advisor'} on the executive board of ${company.name}.

=== COMPANY CONTEXT ===
${companyContext}

=== TASK ===
${taskTitle}
${task?.description || ''}

${customInstructions ? `Additional instructions: ${customInstructions}\n` : ''}

Produce a professional ${documentType} with comprehensive, institutional-quality analysis. This document will be generated as an editable Word document (.docx) with a companion PDF.

Include:
- A substantive executive summary (300+ words)
- Key metrics table and assumptions table (as arrays of arrays)
- 3-5 detailed analysis sections, each with a heading and 200+ words of substantive content
- Actionable recommendations with rationale and priority
- Real risks and limitations
- Cite only real sources; if none, state so explicitly

Return JSON.`;

  const schema = {
    type: 'object',
    properties: {
      narrative: {
        type: 'object',
        properties: {
          executiveSummary: { type: 'string' },
          risks: { type: 'array', items: { type: 'string' } },
          sources: { type: 'array', items: { type: 'string' } },
          limitations: { type: 'array', items: { type: 'string' } },
        },
      },
      keyMetrics: { type: 'array', items: { type: 'array', items: { type: 'string' } }, description: 'Table of [metric, value] pairs' },
      assumptionsTable: { type: 'array', items: { type: 'array', items: { type: 'string' } }, description: 'Table of [assumption, value, confidence]' },
      unitEconomics: { type: 'string' },
      revenueSummary: { type: 'string' },
      cashFlowSummary: { type: 'string' },
      scenarioSummary: { type: 'string' },
      toc: { type: 'array', items: { type: 'string' } },
      sections: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            heading: { type: 'string' },
            content: { type: 'string' },
            subsections: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  heading: { type: 'string' },
                  content: { type: 'string' },
                },
              },
            },
          },
        },
        description: '3-5 detailed analysis sections, each with 200+ words of substantive content',
      },
      recommendations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            recommendation: { type: 'string' },
            rationale: { type: 'string' },
            priority: { type: 'string', enum: ['high', 'medium', 'low'] },
          },
        },
        description: 'Actionable recommendations with rationale and priority',
      },
    },
    required: ['narrative'],
  };

  const res = await base44.asServiceRole.integrations.Core.InvokeLLM({ prompt, response_json_schema: schema, model: 'gpt_5_mini' });
  return res;
}

async function generatePresentationSpec(base44, company, advisor, task, taskTitle, companyContext, customInstructions) {
  const prompt = `You are ${advisor?.name || 'an advisor'}, ${advisor?.role || 'Advisor'} on the executive board of ${company.name}.

=== COMPANY CONTEXT ===
${companyContext}

=== TASK ===
${taskTitle}
${task?.description || ''}

${customInstructions ? `Additional instructions: ${customInstructions}\n` : ''}

Produce a professional pitch deck / presentation as a slide-by-slide specification. This will be generated as an editable PowerPoint (.pptx) with a companion PDF.

Design 8-12 slides:
- 1 title slide (layout: "title" — include title and subtitle)
- 1 agenda slide (layout: "bullets" — 4-5 agenda items)
- 1-2 executive summary slides (layout: "bullets" — 3-5 concise points each)
- 1-2 key metrics or data slides (layout: "table" with headers and 3-6 rows)
- 2-3 analysis slides (layout: "bullets" or "two_column" for comparisons)
- 1 recommendations slide (layout: "bullets")
- 1 risks slide (layout: "bullets" or "two_column" for risks vs mitigations)

Rules:
- Each bullet slide should have 3-5 concise, impactful bullet points (max 15 words each)
- Table slides should have clear headers and 3-6 data rows
- Two-column slides should have left/right headings with 2-4 bullets each
- Keep text concise — this is a presentation, not a document

Also provide a narrative with executiveSummary, risks, and sources for the companion PDF.

Return JSON.`;

  const schema = {
    type: 'object',
    properties: {
      slides: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            layout: { type: 'string', enum: ['title', 'section', 'bullets', 'table', 'two_column'] },
            title: { type: 'string' },
            subtitle: { type: 'string' },
            bullets: { type: 'array', items: { type: 'string' } },
            headers: { type: 'array', items: { type: 'string' } },
            rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
            left: { type: 'object', properties: { heading: { type: 'string' }, bullets: { type: 'array', items: { type: 'string' } } } },
            right: { type: 'object', properties: { heading: { type: 'string' }, bullets: { type: 'array', items: { type: 'string' } } } },
          },
          required: ['layout', 'title'],
        },
      },
      narrative: {
        type: 'object',
        properties: {
          executiveSummary: { type: 'string' },
          risks: { type: 'array', items: { type: 'string' } },
          sources: { type: 'array', items: { type: 'string' } },
          limitations: { type: 'array', items: { type: 'string' } },
        },
      },
      toc: { type: 'array', items: { type: 'string' } },
    },
    required: ['slides', 'narrative'],
  };

  const res = await base44.asServiceRole.integrations.Core.InvokeLLM({ prompt, response_json_schema: schema, model: 'gpt_5_mini' });
  return res;
}

function buildPdfSpecFromModel(modelSpec) {
  const assumptions = modelSpec.assumptions || {};
  const assumptionsTable = Object.entries(assumptions).map(([key, val]) => {
    const labels = {
      retailPriceDTC: 'Retail Price (DTC)', wholesalePrice: 'Wholesale Price', wholesaleDiscountPct: 'Wholesale Discount %',
      manufacturingCost: 'Manufacturing Cost', packagingCost: 'Packaging', freightPerUnit: 'Freight', dutiesPct: 'Duties %',
      warehousingPerUnit: 'Warehousing', pickPackPerUnit: 'Pick & Pack', paymentProcessingPct: 'Payment Processing %',
      returnsRatePct: 'Returns Rate %', breakagePct: 'Breakage %', cac: 'CAC', monthlyMarketing: 'Monthly Marketing',
      monthlyStaff: 'Monthly Staff', monthlyOverheads: 'Monthly Overheads', startingCash: 'Starting Cash', vatPct: 'VAT %',
      dtcStartingUnits: 'DTC Starting Units', dtcMonthlyGrowthPct: 'DTC Growth %', wholesaleStartingUnits: 'Wholesale Starting Units', wholesaleMonthlyGrowthPct: 'Wholesale Growth %',
    };
    const isPct = key.toLowerCase().includes('pct') || key.toLowerCase().includes('growth') || key.toLowerCase().includes('discount') || key.toLowerCase().includes('rate');
    const formatted = isPct ? `${((val?.value || 0) * 100).toFixed(1)}%` : `£${(val?.value || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return [labels[key] || key, formatted, val?.confidence || 'Requires confirmation'];
  });

  return {
    company: modelSpec.company,
    modelTitle: `${modelSpec.modelTitle} — Summary Report`,
    subtitle: 'Financial Model Summary',
    preparedBy: modelSpec.preparedBy,
    version: modelSpec.version,
    status: modelSpec.status,
    narrative: modelSpec.narrative,
    assumptionsTable,
    keyMetrics: [
      ['Starting Cash', `£${((assumptions.startingCash?.value) || 0).toLocaleString('en-GB')}`],
      ['Monthly Fixed Costs', `£${((assumptions.monthlyMarketing?.value || 0) + (assumptions.monthlyStaff?.value || 0) + (assumptions.monthlyOverheads?.value || 0)).toLocaleString('en-GB')}`],
      ['DTC Retail Price', `£${(assumptions.retailPriceDTC?.value || 0).toFixed(2)}`],
      ['Wholesale Price', `£${(assumptions.wholesalePrice?.value || 0).toFixed(2)}`],
      ['DTC Starting Units', `${(assumptions.dtcStartingUnits?.value || 0).toLocaleString('en-GB')}/month`],
      ['Model Period', '24 months'],
    ],
    toc: ['Executive Summary', 'Key Financial Metrics', 'Key Assumptions', 'Risks & Limitations', 'Sources & Notes'],
  };
}

function determineAssumptionsStatus(assumptions) {
  if (!assumptions) return 'missing';
  const values = Object.values(assumptions);
  const needsConfirm = values.filter((v) => !v || v.confidence === 'Requires confirmation' || v.value == null);
  if (needsConfirm.length === 0) return 'complete';
  if (needsConfirm.length === values.length) return 'missing';
  return 'needs_confirmation';
}

async function determineVersion(base44, companyId, revisionOf) {
  try {
    const parent = await base44.entities.Document.get(revisionOf);
    const rootId = parent.parent_document_id || revisionOf;
    const children = await base44.entities.Document.filter({ company_id: companyId, parent_document_id: rootId }, '-version_number', 50);
    const maxVersion = Math.max(parent.version_number || 1, ...children.map((c) => c.version_number || 1));
    return maxVersion + 1;
  } catch {
    return 1;
  }
}

function getFolderForType(docType) {
  const map = {
    'Financial Model': '03 Finance / Financial Models',
    Budget: '03 Finance / Budgets',
    Forecast: '03 Finance / Forecasts',
    Spreadsheet: '03 Finance / Spreadsheets',
    Report: '01 Strategy / Reports',
    Strategy: '01 Strategy',
    'Business Plan': '01 Strategy / Business Plans',
    'Market Research': '02 Research / Market Research',
    'Competitor Analysis': '02 Research / Competitor Analysis',
    'Board Resolution': '12 Meetings and Decisions / Board Resolutions',
    'Decision Memo': '12 Meetings and Decisions / Decision Memos',
    'Pitch Deck': '04 Fundraising / Pitch Decks',
    'Presentation': '04 Fundraising / Presentations',
    'Proposal': '01 Strategy / Proposals',
    'Risk Assessment': '06 Risk / Assessments',
    'Marketing Plan': '05 Marketing / Plans',
    'Meeting Summary': '12 Meetings and Decisions / Summaries',
  };
  return map[docType] || '01 Strategy / General';
}