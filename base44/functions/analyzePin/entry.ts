import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const CATEGORIES = [
  "Strategy", "Vision and Mission", "Product", "Customer", "Market Research",
  "Competitors", "Brand", "Creative", "Marketing", "Sales", "Finance",
  "Fundraising", "Operations", "Supply Chain", "Manufacturing",
  "Legal and Compliance", "People and Hiring", "Technology", "Risk",
  "Ideas and Opportunities", "Decisions", "Lessons Learned", "Actions", "Other"
];

const PIN_TYPES = [
  "Insight", "Idea", "Recommendation", "Risk", "Warning", "Assumption",
  "Evidence", "Decision", "Question", "Action", "Quote", "Lesson"
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { company_id, selected_text, surrounding_context, source_type, source_title } = body;

    if (!company_id || !selected_text) {
      return Response.json({ error: 'company_id and selected_text are required' }, { status: 400 });
    }

    // Fetch existing pins for related-pin detection and theme consolidation
    const existingPins = await base44.entities.Pin.filter(
      { company_id, status: 'active' },
      '-created_date',
      100
    );

    const existingForLLM = existingPins.map(p => ({
      id: p.id,
      title: p.pin_title || '',
      summary: p.summary || '',
      themes: p.themes || [],
      category: p.category || '',
    }));

    const analysisPrompt = `You are an executive intelligence assistant. Analyze the following pinned excerpt from a business context and intelligently classify it.

SELECTED TEXT:
"""
${selected_text}
"""

SURROUNDING CONTEXT:
"""
${surrounding_context || '(none provided)'
    }
"""

SOURCE: ${source_type || 'unknown'} — ${source_title || 'untitled'}

Classify this pin. Return ONLY valid JSON matching the schema.

Rules:
- pin_title: A concise, descriptive title (max 12 words). Capture the essence, not a copy of the text.
- summary: One sentence summarising what this pin represents and why it matters.
- category: Choose exactly ONE from: ${CATEGORIES.join(', ')}
- subcategory: An optional logical subcategory (e.g. "Pricing", "Launch Strategy", "Social Media", "Intellectual Property"). Empty string if not applicable.
- themes: 1-3 short theme labels (Title Case, e.g. "Customer Trust", "Premium Positioning", "Portugal Manufacturing"). These group related pins across meetings. Normalise similar themes to a single canonical label.
- tags: 3-6 lowercase tags for searchability.
- pin_type: Choose exactly ONE from: ${PIN_TYPES.join(', ')}
- importance: "normal", "important", or "critical" — based on strategic significance.
- category_confidence: 0.0 to 1.0 — how confident you are in the category assignment.

EXISTING PINS IN THIS COMPANY (for theme normalisation and related-pin detection):
${JSON.stringify(existingForLLM.slice(0, 50))}

For themes: if the selected text relates to a theme that already exists under a different wording, use the EXISTING theme's wording exactly.
For related_pin_ids: return the IDs of existing pins that are meaningfully related to this one (same theme, same topic, or direct contradiction). Max 5. Empty array if none.`;

    const llmRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: analysisPrompt,
      response_json_schema: {
        type: "object",
        properties: {
          pin_title: { type: "string" },
          summary: { type: "string" },
          category: { type: "string" },
          subcategory: { type: "string" },
          themes: { type: "array", items: { type: "string" } },
          tags: { type: "array", items: { type: "string" } },
          pin_type: { type: "string" },
          importance: { type: "string" },
          category_confidence: { type: "number" },
          related_pin_ids: { type: "array", items: { type: "string" } }
        },
        required: ["pin_title", "summary", "category", "pin_type", "importance", "category_confidence", "themes", "tags", "related_pin_ids"]
      },
    });

    const analysis = llmRes || {};

    // Normalise category to allowed list
    let category = analysis.category || 'Other';
    if (!CATEGORIES.includes(category)) {
      const match = CATEGORIES.find(c => c.toLowerCase() === category.toLowerCase());
      category = match || 'Other';
    }

    // Normalise pin_type
    let pin_type = analysis.pin_type || 'Insight';
    if (!PIN_TYPES.includes(pin_type)) {
      const match = PIN_TYPES.find(t => t.toLowerCase() === pin_type.toLowerCase());
      pin_type = match || 'Insight';
    }

    // Normalise importance
    const importance = ['normal', 'important', 'critical'].includes(analysis.importance) ? analysis.importance : 'normal';

    return Response.json({
      pin_title: analysis.pin_title || selected_text.slice(0, 80),
      summary: analysis.summary || '',
      category,
      subcategory: analysis.subcategory || '',
      themes: Array.isArray(analysis.themes) ? analysis.themes.slice(0, 5) : [],
      tags: Array.isArray(analysis.tags) ? analysis.tags.slice(0, 8) : [],
      pin_type,
      importance,
      category_confidence: typeof analysis.category_confidence === 'number' ? analysis.category_confidence : 0.5,
      related_pin_ids: Array.isArray(analysis.related_pin_ids) ? analysis.related_pin_ids.slice(0, 5) : [],
    });
  } catch (error) {
    console.error('analyzePin error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});