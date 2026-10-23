// Fake Anthropic + OpenAI for the local stack: real wire formats, $0.
// Builds a valid answer from the schema it was sent (native format) or the
// schema pasted into the prompt. POST /__script queues misbehaviours per
// provider; GET /__log returns what each request actually sent.
// deno-lint-ignore-file no-explicit-any
const PORT = 54399;
const script: Record<string, string[]> = { anthropic: [], openai: [] };
// Advisors (by name) who mention their book whenever it's offered to them.
let mentionBy: string[] = [];
// Extra time (ms) before a given speaker answers, to mimic a slow advisor:
// { "Grace Bennett": 12000 }. Matched on the persona's "You are <name>".
let delayBy: Record<string, number> = {};
// Speakers (by name) whose every call fails on both providers, as if out of
// credit everywhere: { "failFor": ["Priya Shah"] }.
let failFor: string[] = [];
// Embeddings fail, as if OpenAI were down: { "failEmbeddings": true }.
let failEmbeddings = false;
const log: any[] = [];
// Answers to give for a field, in order, one per request that asks for it:
// { "priority_actions": [[...], [...]] } returns the first list to the first
// answer with that field and the second to the next.
let fields: Record<string, any[]> = {};
// Marker strings to look for in each prompt: GET /__log says which ones a
// request contained (to check what a model was, or wasn't, told).
let marks: string[] = [];
// Research turns (requests with web search): which pages the search finds,
// the answer's text and which pages it cites, and how many times to pause
// the turn first. { results: [{url,title}], text, cite: [url], pause: 1 }
let research: any = {};
const marked = (text: string) => marks.filter((m) => text.includes(m));

function sample(s: any, key = '', book = ''): any {
  if (!s || typeof s !== 'object') return null;
  if (key && fields[key]?.length) return fields[key].shift();
  if (Array.isArray(s.enum)) return key === 'profile_field' ? 'business_model' : s.enum.find((e: any) => e !== null);
  const type = Array.isArray(s.type) ? s.type.find((t: string) => t !== 'null') : s.type;
  if (type === 'object' || s.properties) {
    const o: any = {};
    for (const [k, v] of Object.entries(s.properties || {})) o[k] = sample(v, k, book);
    return o;
  }
  if (type === 'array') return [sample(s.items, key, book)];
  if (type === 'number' || type === 'integer') return 72;
  if (type === 'boolean') return key === 'answerable';
  if (key === 'assigned_to') return 'Founder';
  if (key === 'reply_to_advisor' || key === 'agrees_with' || key === 'new_position' || key === 'minority_opinion') return '';
  return `fake ${key || 'text'}${book && (key === 'position' || key === 'message') ? ` — as ${book} taught me` : ''}`;
}

function pastedSchema(text: string) {
  const i = text.indexOf('JSON structure:\n');
  if (i < 0) return null;
  try { return JSON.parse(text.slice(i + 'JSON structure:\n'.length)); } catch { return null; }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Who is speaking, whether their personal details were offered, and the book
// to mention if they're scripted to.
function speaker(system: string) {
  const who = system.match(/You are ([^,.]+)[,.]/)?.[1] || '';
  const offered = system.includes('Off the clock');
  const book = offered && mentionBy.includes(who) ? (system.match(/\nBook: ([^,.\n]+)/)?.[1] || '') : '';
  // Mug lettering uses curly quotes, which no prompt text should contain.
  return { who, offered, book, mugQuote: system.includes('“') };
}

const sse = (e: any) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`;

// A research turn with web search (and code execution when asked for):
// the server-tool blocks Claude's API returns, with real citations.
function researchStream(body: any, mode: string): Response {
  const enc = new TextEncoder();
  const hasCode = (body.tools || []).some((t: any) => String(t.type).startsWith('code_execution'));
  const results = mode === 'nosources' ? [] : (research.results || [
    { url: 'https://example.org/suppliers', title: 'UK coat suppliers list' },
    { url: 'https://example.net/reviews', title: 'Supplier reviews' },
  ]);
  const cite = mode === 'nosources' ? [] : (research.cite || results.map((r: any) => r.url));
  const pausing = (research.pause || 0) > 0;
  if (pausing) research.pause -= 1;
  const cached = !!body.cache_control;
  const usage = { input_tokens: 4000, output_tokens: 800, server_tool_use: { web_search_requests: 1, web_fetch_requests: results.length ? 1 : 0 },
    cache_creation_input_tokens: cached ? 1000 : 0, cache_read_input_tokens: cached ? 20000 : 0 };
  const stream = new ReadableStream({
    async start(ctl) {
      const put = (e: any) => ctl.enqueue(enc.encode(sse(e)));
      let i = 0;
      put({ type: 'message_start', message: { id: 'msg_fake_research', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: usage.input_tokens, output_tokens: 1, cache_creation_input_tokens: usage.cache_creation_input_tokens, cache_read_input_tokens: usage.cache_read_input_tokens } } });
      put({ type: 'content_block_start', index: i, content_block: { type: 'server_tool_use', id: `srvtoolu_${i}`, name: 'web_search', input: {} } });
      put({ type: 'content_block_delta', index: i, delta: { type: 'input_json_delta', partial_json: JSON.stringify({ query: 'fake query' }) } });
      put({ type: 'content_block_stop', index: i }); i++;
      put({ type: 'content_block_start', index: i, content_block: { type: 'web_search_tool_result', tool_use_id: 'srvtoolu_0', content: results.map((r: any) => ({ type: 'web_search_result', url: r.url, title: r.title, encrypted_content: 'enc', page_age: 'October 2026' })) } });
      put({ type: 'content_block_stop', index: i }); i++;
      if (pausing) {
        put({ type: 'message_delta', delta: { stop_reason: 'pause_turn', stop_sequence: null }, usage: { output_tokens: 200, server_tool_use: usage.server_tool_use } });
        put({ type: 'message_stop' }); ctl.close(); return;
      }
      if (hasCode) {
        put({ type: 'content_block_start', index: i, content_block: { type: 'server_tool_use', id: `srvtoolu_${i}`, name: 'bash_code_execution', input: {} } });
        put({ type: 'content_block_delta', index: i, delta: { type: 'input_json_delta', partial_json: JSON.stringify({ command: 'python -c "print(45-12)"' }) } });
        put({ type: 'content_block_stop', index: i }); i++;
        put({ type: 'content_block_start', index: i, content_block: { type: 'bash_code_execution_tool_result', tool_use_id: `srvtoolu_${i - 1}`, content: { type: 'bash_code_execution_result', stdout: '33', stderr: '', return_code: 0, content: [] } } });
        put({ type: 'content_block_stop', index: i }); i++;
      }
      put({ type: 'content_block_start', index: i, content_block: { type: 'text', text: '', citations: [] } });
      put({ type: 'content_block_delta', index: i, delta: { type: 'text_delta', text: research.text || 'Two UK suppliers sell secondhand coats in bulk.' } });
      for (const url of cite) {
        const r = results.find((x: any) => x.url === url) || { url, title: url };
        put({ type: 'content_block_delta', index: i, delta: { type: 'citations_delta', citation: { type: 'web_search_result_location', url: r.url, title: r.title, cited_text: 'fake cited text', encrypted_index: 'enc' } } });
      }
      put({ type: 'content_block_stop', index: i });
      put({ type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: usage.output_tokens, server_tool_use: usage.server_tool_use } });
      put({ type: 'message_stop' });
      ctl.close();
    },
  });
  return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'request-id': 'req_fake' } });
}

async function anthropic(body: any): Promise<Response> {
  const mode = script.anthropic.shift() || 'ok';
  if ((body.tools || []).some((t: any) => String(t.type).startsWith('web_search'))) {
    log.push({ provider: 'anthropic', kind: 'research', mode, model: body.model, marked: marked(String(body.system) + JSON.stringify(body.messages)),
      tools: body.tools.map((t: any) => ({ type: t.type, max_uses: t.max_uses ?? null, blocked: (t.blocked_domains || []).length, callers: t.allowed_callers ?? null })),
      turns: (body.messages || []).length, thinking: body.thinking, effort: body.output_config?.effort, format: !!body.output_config?.format,
      cache: { auto: !!body.cache_control, system: Array.isArray(body.system) && !!body.system[body.system.length - 1]?.cache_control } });
    if (mode === 'overload529') return Response.json({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }, { status: 529 });
    return researchStream(body, mode);
  }
  const schema = body.output_config?.format?.schema ?? pastedSchema(String(body.system));
  const sp = speaker(String(body.system));
  log.push({ marked: marked(String(body.system) + JSON.stringify(body.messages)), provider: 'anthropic', who: sp.who, offered: sp.offered, mentioned: !!sp.book, mugQuote: sp.mugQuote, mode, model: body.model, max_tokens: body.max_tokens, thinking: body.thinking, effort: body.output_config?.effort,
    native: !!body.output_config?.format, pasted: String(body.system).includes('JSON structure'), temperature: body.temperature, stream: body.stream });
  if (mode === 'overload529') return Response.json({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }, { status: 529, headers: { 'retry-after': '1' } });
  if (mode === 'reject400') return Response.json({ type: 'error', error: { type: 'invalid_request_error', message: 'output_config.format.schema: unsupported' } }, { status: 400 });
  if (failFor.includes(sp.who)) return Response.json({ type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API (scripted for this speaker).' } }, { status: 400 });
  if (mode === 'credit400') return Response.json({ type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.' } }, { status: 400 });
  if (delayBy[sp.who]) await sleep(delayBy[sp.who]);
  const answer = JSON.stringify(sample(schema, '', sp.book));
  const input = Math.ceil((String(body.system).length + JSON.stringify(body.messages).length) / 4);
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctl) {
      const put = (e: any) => ctl.enqueue(enc.encode(sse(e)));
      put({ type: 'message_start', message: { id: 'msg_fake', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: input, output_tokens: 1 } } });
      put({ type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } });
      await sleep(300); put({ type: 'ping' }); await sleep(300);
      put({ type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig' } });
      put({ type: 'content_block_stop', index: 0 });
      put({ type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } });
      if (mode === 'midstream') {
        put({ type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: answer.slice(0, 20) } });
        ctl.enqueue(enc.encode(`event: error\ndata: ${JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } })}\n\n`));
        ctl.close(); return;
      }
      const text = mode === 'truncate' ? answer.slice(0, 40) : mode === 'refusal' ? '' : answer;
      for (let i = 0; i < text.length; i += 200) { put({ type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: text.slice(i, i + 200) } }); await sleep(20); }
      put({ type: 'content_block_stop', index: 1 });
      const stop_reason = mode === 'truncate' ? 'max_tokens' : mode === 'refusal' ? 'refusal' : 'end_turn';
      const stop_details = mode === 'refusal' ? { type: 'refusal', category: 'general_harms', explanation: 'fake' } : null;
      put({ type: 'message_delta', delta: { stop_reason, stop_sequence: null, stop_details }, usage: { output_tokens: Math.ceil(text.length / 4) + 120, output_tokens_details: { thinking_tokens: 120 } } });
      put({ type: 'message_stop' });
      ctl.close();
    },
  });
  return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'request-id': 'req_fake' } });
}

async function openai(body: any): Promise<Response> {
  const mode = script.openai.shift() || 'ok';
  const rf = body.response_format;
  const schema = rf?.type === 'json_schema' ? rf.json_schema.schema : pastedSchema(String(body.messages?.[0]?.content));
  const sp = speaker(String(body.messages?.[0]?.content));
  log.push({ marked: marked(JSON.stringify(body.messages)), provider: 'openai', who: sp.who, offered: sp.offered, mentioned: !!sp.book, mugQuote: sp.mugQuote, mode, model: body.model, max_tokens: body.max_tokens, format: rf?.type, strict: rf?.json_schema?.strict, temperature: body.temperature });
  if (mode === 'overload529') return Response.json({ error: { message: 'busy', type: 'server_error' } }, { status: 503 });
  if (failFor.includes(sp.who)) return Response.json({ error: { message: 'You exceeded your current quota (scripted for this speaker).', type: 'insufficient_quota' } }, { status: 429 });
  if (delayBy[sp.who]) await sleep(delayBy[sp.who]);
  const content = mode === 'refusal' ? null : JSON.stringify(sample(schema, '', sp.book));
  return Response.json({
    choices: [{ message: { content, refusal: mode === 'refusal' ? 'fake refusal' : null }, finish_reason: 'stop' }],
    usage: { prompt_tokens: Math.ceil(JSON.stringify(body.messages).length / 4), completion_tokens: Math.ceil((content || '').length / 4) },
  });
}

// Embeddings: each word lands in one of 1536 slots, so texts that share
// words come out similar, as real embeddings would.
function embedOne(input: string) {
  const v = new Array(1536).fill(0);
  for (const w of input.toLowerCase().match(/[a-z0-9£]+/g) || []) {
    let h = 0;
    for (const ch of w) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    v[h % 1536] += 1;
  }
  if (v.every((x) => x === 0)) v[0] = 1; // text with no words still gets a usable vector
  const norm = Math.hypot(...v);
  return v.map((x) => x / norm);
}
// One text, or a batch (Knowledge passages), in the order given.
function embeddings(body: any): Response {
  if (failEmbeddings) return Response.json({ error: { message: 'The server had an error (scripted).', type: 'server_error' } }, { status: 500 });
  const inputs: string[] = Array.isArray(body.input) ? body.input.map(String) : [String(body.input ?? '')];
  for (const input of inputs) log.push({ kind: 'embedding', provider: 'openai', model: body.model, marked: marked(input), chars: input.length });
  return Response.json({ object: 'list', model: body.model, data: inputs.map((input, index) => ({ object: 'embedding', index, embedding: embedOne(input) })), usage: { prompt_tokens: 8 * inputs.length, total_tokens: 8 * inputs.length } });
}

Deno.serve({ port: PORT, hostname: '0.0.0.0' }, async (req) => {
  const url = new URL(req.url);
  if (url.pathname === '/__script') { const s = await req.json(); script.anthropic = s.anthropic || []; script.openai = s.openai || []; mentionBy = s.mentionBy || []; delayBy = s.delayBy || {}; failFor = s.failFor || []; failEmbeddings = !!s.failEmbeddings; fields = s.fields || {}; marks = s.marks || []; research = s.research || {}; log.length = 0; return Response.json({ ok: true }); }
  if (url.pathname === '/__log') return Response.json(log);
  const body = await req.json();
  if (url.pathname.endsWith('/v1/messages')) return anthropic(body);
  if (url.pathname.endsWith('/chat/completions')) return openai(body);
  if (url.pathname.endsWith('/embeddings')) return embeddings(body);
  // Alert emails (providerHealth), recorded instead of sent.
  if (url.pathname.endsWith('/emails')) { log.push({ kind: 'email', to: body.to, subject: body.subject, text: body.text }); return Response.json({ id: crypto.randomUUID() }); }
  return new Response('not found', { status: 404 });
});
