// "Do this for me": Research and Calculate (Workstream M, Stage 3). The
// owning advisor works on Claude Opus 5.5 with Claude's own web search and
// page reading (and, for Calculate, code execution, so the arithmetic is
// computed rather than estimated). This module runs that pass and collects
// what it found and every source it actually saw; taskRun then has the
// findings put into shape and keeps only those backed by those sources.
// deno-lint-ignore-file no-explicit-any
import Anthropic from 'npm:@anthropic-ai/sdk@0.129.0';
import { claudeSettings, ratesFor } from './callPolicy.ts';

export const RESEARCH_MODEL = { provider: 'anthropic', model: 'claude-opus-5-5' };

// Owner's caps (Workstream M): searches and pages read per task.
export const CAPS: Record<string, { searches: number; pages: number }> = {
  research: { searches: 5, pages: 8 },
  calculate: { searches: 3, pages: 6 },
};

// Web search is billed per search on top of tokens; page reading and code
// execution alongside it cost only the tokens.
export const SEARCH_COST_USD = 0.01;

// Prompt caching: each step of the search loop re-reads what came before,
// so the turn is cached. Writes cost 1.25x the input price. Reads cost 0.05x
// on Opus 5.5 ($0.20 per million) but 0.1x on most other models, so check
// this if RESEARCH_MODEL changes. A continued or retried turn gets smaller
// search limits, which may mean that request starts its cache afresh.
export const CACHE_WRITE_FACTOR = 1.25;
export const CACHE_READ_FACTOR = RESEARCH_MODEL.model === 'claude-opus-5-5' ? 0.05 : 0.1;

// Sites whose terms forbid automated reading. They're never searched or
// read; the founder gets a short guide to checking them by hand instead.
// Each one's terms were checked before it was added.
export const SKIP_SITES: { name: string; domains: string[]; guide: string }[] = [
  {
    name: 'Vinted',
    domains: ['vinted.co.uk', 'vinted.com', 'vinted.fr', 'vinted.de', 'vinted.es', 'vinted.it', 'vinted.nl', 'vinted.be', 'vinted.pl', 'vinted.ie',
      'vinted.lt', 'vinted.cz', 'vinted.at', 'vinted.se', 'vinted.pt', 'vinted.sk', 'vinted.hu', 'vinted.ro', 'vinted.lu', 'vinted.fi', 'vinted.dk', 'vinted.hr', 'vinted.gr'],
    guide: "Vinted's terms don't allow automated reading, so check it by hand: search the item in the Vinted app, filter by condition and size, tap \"Sold\" to see what actually sold and for how much, and note five to ten recent sold prices.",
  },
];

export const BLOCKED_DOMAINS = SKIP_SITES.flatMap((s) => s.domains);

// The skip-list sites a task mentions, so the founder can be pointed at the
// manual guide.
export function skippedSitesIn(...texts: unknown[]) {
  const all = texts.filter((t) => typeof t === 'string').join(' ').toLowerCase();
  return SKIP_SITES.filter((s) => all.includes(s.name.toLowerCase()) || s.domains.some((d) => all.includes(d)));
}

// The web tools for one request. Called directly (not through dynamic
// filtering) so citations come back in the standard form and the calls are
// eligible for zero data retention. `left` is what remains of the task's
// caps, so a continued turn never gets a fresh allowance; it always keeps
// at least one of each, so a paused turn can still finish and write its
// answer (at most one over per continuation, three at most).
export function researchTools(type: string, left = CAPS[type] || CAPS.research) {
  const shared = { blocked_domains: BLOCKED_DOMAINS, allowed_callers: ['direct'] };
  const tools: any[] = [
    { type: 'web_search_20260209', name: 'web_search', max_uses: Math.max(1, left.searches), user_location: { type: 'approximate', country: 'GB' }, ...shared },
    { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: Math.max(1, left.pages), max_content_tokens: 8000, citations: { enabled: true }, ...shared },
  ];
  // Calculate does its arithmetic as real code.
  if (type === 'calculate') tools.push({ type: 'code_execution_20260120', name: 'code_execution' });
  return tools;
}

export type Source = { url: string; title: string; quote?: string; page_age?: string; cited?: boolean };

const cleanUrl = (u: unknown) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u.trim().slice(0, 500) : '');
const cleanTitle = (t: unknown) => (typeof t === 'string' ? t.trim().slice(0, 200) : '');

// The page a citation points at: a search citation names its URL; a
// citation into a page read in full (char_location and kin) names the
// document by title, or failing that by its position among the pages read.
function citedUrl(c: any, fetched: { url: string; title: string }[]): string {
  if (c?.type === 'web_search_result_location') return cleanUrl(c.url);
  const title = cleanTitle(c?.document_title);
  const i = Number(c?.document_index);
  const sameTitle = title ? fetched.filter((f) => f.title === title) : [];
  // One page with that title: it. Several (all called "Home"): the position.
  if (sameTitle.length === 1) return sameTitle[0].url;
  if (Number.isInteger(i) && fetched[i] && (!sameTitle.length || fetched[i].title === title)) return fetched[i].url;
  return sameTitle[0]?.url || '';
}

// Every page the tools actually returned, in the order first seen, each
// marked cited when the answer quotes it. Only cited pages can be a
// finding's source; nothing the model merely wrote counts.
export function collectSources(blocks: any[]): Source[] {
  const byUrl = new Map<string, Source>();
  const fetched: { url: string; title: string }[] = [];
  const add = (url: unknown, title: unknown, extra: Partial<Source> = {}) => {
    const u = cleanUrl(url);
    if (!u) return;
    const existing = byUrl.get(u);
    if (existing) { Object.assign(existing, Object.fromEntries(Object.entries(extra).filter(([k]) => !(k in existing) || (k === 'cited' && extra.cited)))); return; }
    byUrl.set(u, { url: u, title: cleanTitle(title) || u, ...extra });
  };
  for (const b of blocks || []) {
    if (b?.type === 'web_search_tool_result' && Array.isArray(b.content)) {
      for (const r of b.content) if (r?.type === 'web_search_result') add(r.url, r.title, r.page_age ? { page_age: String(r.page_age) } : {});
    }
    if (b?.type === 'web_fetch_tool_result' && b.content?.type === 'web_fetch_result') {
      const url = cleanUrl(b.content.url);
      if (url) { fetched.push({ url, title: cleanTitle(b.content.content?.title) }); add(url, b.content.content?.title); }
    }
  }
  for (const b of blocks || []) {
    if (b?.type !== 'text' || !Array.isArray(b.citations)) continue;
    for (const c of b.citations) {
      const url = citedUrl(c, fetched);
      if (!url) continue;
      add(url, c.title || c.document_title, { cited: true, ...(c.cited_text ? { quote: String(c.cited_text).slice(0, 200) } : {}) });
      const src = byUrl.get(url);
      if (src) src.cited = true;
    }
  }
  return [...byUrl.values()];
}

// The pages the answer actually cites: the only ones a finding may name,
// numbered for the structuring pass.
export const citedSources = (sources: Source[]) => sources.filter((src) => src.cited);

// The answer as text, with a [n] after each cited passage pointing at its
// cited source's number, so the structuring pass can tie findings to
// sources.
export function reportText(blocks: any[], sources: Source[]): string {
  const cited = citedSources(sources);
  const index = new Map(cited.map((src, i) => [src.url, i + 1]));
  const fetched = (blocks || []).filter((b) => b?.type === 'web_fetch_tool_result' && b.content?.type === 'web_fetch_result')
    .map((b) => ({ url: cleanUrl(b.content.url), title: cleanTitle(b.content.content?.title) })).filter((f) => f.url);
  let out = '';
  for (const b of blocks || []) {
    if (b?.type !== 'text' || typeof b.text !== 'string') continue;
    out += b.text;
    const refs = [...new Set((b.citations || []).map((c: any) => index.get(citedUrl(c, fetched))).filter(Boolean))];
    if (refs.length) out += ` ${refs.map((n) => `[${n}]`).join('')}`;
  }
  return out.trim();
}

// Whether code really ran (Calculate's arithmetic), from the result blocks,
// not from what the model says.
export function codeRan(blocks: any[]): boolean {
  return (blocks || []).some((b) => (b?.type === 'bash_code_execution_tool_result' || b?.type === 'code_execution_tool_result')
    && b.content?.return_code === 0);
}

export type ResearchPass = {
  blocks: any[]; sources: Source[]; report: string; codeUsed: boolean;
  inputTokens: number; outputTokens: number; searches: number; pagesRead: number; costUsd: number;
  cacheWriteTokens: number; cacheReadTokens: number;
  stopReason: string | null; continuations: number; error: string | null; incomplete: boolean; ms: number;
};

// One research turn, continued through pause_turn (at most three times),
// ending by the deadline. The task's caps hold across the whole turn and
// any earlier pass (`used`): a continuation never gets a fresh allowance,
// and once a cap is spent the turn isn't continued. Never throws: a
// failure comes back in `error`, with whatever was spent counted.
export async function runResearchPass(args: {
  system: string; user: string; type: string; endBy: number; maxTokens?: number; used?: { searches: number; pages: number };
}): Promise<ResearchPass> {
  const started = Date.now();
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  const out: ResearchPass = {
    blocks: [], sources: [], report: '', codeUsed: false, inputTokens: 0, outputTokens: 0, searches: 0, pagesRead: 0,
    costUsd: 0, cacheWriteTokens: 0, cacheReadTokens: 0, stopReason: null, continuations: 0, error: null, incomplete: false, ms: 0,
  };
  const addUsage = (u: any) => {
    out.inputTokens += u?.input_tokens || 0;
    out.cacheWriteTokens += u?.cache_creation_input_tokens || 0;
    out.cacheReadTokens += u?.cache_read_input_tokens || 0;
  };
  const cap = CAPS[args.type] || CAPS.research;
  const left = () => ({
    searches: cap.searches - (args.used?.searches || 0) - out.searches,
    pages: cap.pages - (args.used?.pages || 0) - out.pagesRead,
  });
  if (!apiKey) { out.error = 'ANTHROPIC_API_KEY not configured'; return out; }
  const client = new Anthropic({ apiKey, authToken: null, maxRetries: 1, timeout: 10 * 60_000 });
  const settings = claudeSettings(RESEARCH_MODEL.model, 'adaptive', 'high');
  const messages: any[] = [{ role: 'user', content: args.user }];
  let container: string | null = null;
  let stream: any = null;
  try {
    for (let turn = 0; turn < 4; turn++) {
      const remaining = args.endBy - Date.now();
      if (remaining < 5_000) { out.error = 'Ran out of time while researching.'; break; }
      const caps = left();
      stream = client.messages.stream({
        model: RESEARCH_MODEL.model, max_tokens: args.maxTokens ?? 16_000, messages,
        // Cached: the advisor's instructions (a fixed point), and the turn
        // as it grows (automatic), which the search loop reads at each step.
        system: [{ type: 'text', text: args.system, cache_control: { type: 'ephemeral' } }],
        cache_control: { type: 'ephemeral' },
        tools: researchTools(args.type, caps) as any,
        ...(container ? { container } : {}),
        ...(settings.thinking ? { thinking: settings.thinking } : {}),
        ...(settings.effort ? { output_config: { effort: settings.effort } } : {}),
      } as any);
      const timer = setTimeout(() => stream.abort(), remaining);
      let msg: any;
      try { msg = await stream.finalMessage(); } finally { clearTimeout(timer); }
      stream = null;
      addUsage(msg.usage);
      out.outputTokens += msg.usage?.output_tokens || 0;
      out.searches += msg.usage?.server_tool_use?.web_search_requests || 0;
      out.pagesRead += msg.usage?.server_tool_use?.web_fetch_requests || 0;
      out.blocks.push(...(msg.content || []));
      out.stopReason = msg.stop_reason ?? null;
      container = msg.container?.id || container;
      if (msg.stop_reason !== 'pause_turn') break;
      // Continue the paused turn: send it back unchanged, no extra message.
      out.continuations++;
      messages.push({ role: 'assistant', content: msg.content });
    }
    if (out.stopReason === 'pause_turn' && !out.error) out.error = 'The research took too many steps to finish.';
    if (out.stopReason === 'refusal') out.error = 'The advisor declined this task.';
  } catch (e) {
    // A call cut off mid-way was still billed for what it generated.
    const partial = stream?.currentMessage;
    if (partial?.usage) {
      addUsage(partial.usage);
      // The SDK only updates output tokens at the end of a call: estimate
      // what was written before the cut from the text itself.
      const written = (partial.content || []).reduce((n: number, b: any) => n + (typeof b?.text === 'string' ? b.text.length : 0) + (typeof b?.thinking === 'string' ? b.thinking.length : 0), 0);
      out.outputTokens += Math.max(partial.usage.output_tokens || 0, Math.ceil(written / 4));
      out.searches += partial.usage.server_tool_use?.web_search_requests || 0;
      out.pagesRead += partial.usage.server_tool_use?.web_fetch_requests || 0;
      out.blocks.push(...(partial.content || []).filter((b: any) => b?.type !== 'text' || b.text));
    }
    out.error = (e as Error)?.name === 'APIUserAbortError' || /abort/i.test(String((e as Error)?.message)) ? 'Ran out of time while researching.' : `Research failed: ${String((e as Error)?.message || e).slice(0, 200)}`;
  }
  const r = ratesFor(RESEARCH_MODEL.provider, RESEARCH_MODEL.model);
  out.costUsd = Math.round((out.inputTokens * r.input + out.cacheWriteTokens * r.input * CACHE_WRITE_FACTOR
    + out.cacheReadTokens * r.input * CACHE_READ_FACTOR + out.outputTokens * r.output + out.searches * SEARCH_COST_USD) * 1e6) / 1e6;
  out.sources = collectSources(out.blocks);
  out.report = reportText(out.blocks, out.sources);
  out.codeUsed = codeRan(out.blocks);
  // Something to show, but the turn didn't finish: say so on the result.
  out.incomplete = !!out.error && !!out.report;
  out.ms = Date.now() - started;
  return out;
}
