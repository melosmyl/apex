// Fake Anthropic + OpenAI for the local stack: real wire formats, $0.
// Builds a valid answer from the schema it was sent (native format) or the
// schema pasted into the prompt. POST /__script queues misbehaviours per
// provider; GET /__log returns what each request actually sent.
// deno-lint-ignore-file no-explicit-any
const PORT = 54399;
const script: Record<string, string[]> = { anthropic: [], openai: [] };
// Advisors (by name) who mention their book whenever it's offered to them.
let mentionBy: string[] = [];
const log: any[] = [];

function sample(s: any, key = '', book = ''): any {
  if (!s || typeof s !== 'object') return null;
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

async function anthropic(body: any): Promise<Response> {
  const mode = script.anthropic.shift() || 'ok';
  const schema = body.output_config?.format?.schema ?? pastedSchema(String(body.system));
  const sp = speaker(String(body.system));
  log.push({ provider: 'anthropic', who: sp.who, offered: sp.offered, mentioned: !!sp.book, mugQuote: sp.mugQuote, mode, model: body.model, max_tokens: body.max_tokens, thinking: body.thinking, effort: body.output_config?.effort,
    native: !!body.output_config?.format, pasted: String(body.system).includes('JSON structure'), temperature: body.temperature, stream: body.stream });
  if (mode === 'overload529') return Response.json({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }, { status: 529, headers: { 'retry-after': '1' } });
  if (mode === 'reject400') return Response.json({ type: 'error', error: { type: 'invalid_request_error', message: 'output_config.format.schema: unsupported' } }, { status: 400 });
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

function openai(body: any): Response {
  const mode = script.openai.shift() || 'ok';
  const rf = body.response_format;
  const schema = rf?.type === 'json_schema' ? rf.json_schema.schema : pastedSchema(String(body.messages?.[0]?.content));
  const sp = speaker(String(body.messages?.[0]?.content));
  log.push({ provider: 'openai', who: sp.who, offered: sp.offered, mentioned: !!sp.book, mugQuote: sp.mugQuote, mode, model: body.model, max_tokens: body.max_tokens, format: rf?.type, strict: rf?.json_schema?.strict, temperature: body.temperature });
  if (mode === 'overload529') return Response.json({ error: { message: 'busy', type: 'server_error' } }, { status: 503 });
  const content = mode === 'refusal' ? null : JSON.stringify(sample(schema, '', sp.book));
  return Response.json({
    choices: [{ message: { content, refusal: mode === 'refusal' ? 'fake refusal' : null }, finish_reason: 'stop' }],
    usage: { prompt_tokens: Math.ceil(JSON.stringify(body.messages).length / 4), completion_tokens: Math.ceil((content || '').length / 4) },
  });
}

Deno.serve({ port: PORT, hostname: '0.0.0.0' }, async (req) => {
  const url = new URL(req.url);
  if (url.pathname === '/__script') { const s = await req.json(); script.anthropic = s.anthropic || []; script.openai = s.openai || []; mentionBy = s.mentionBy || []; log.length = 0; return Response.json({ ok: true }); }
  if (url.pathname === '/__log') return Response.json(log);
  const body = await req.json();
  if (url.pathname.endsWith('/v1/messages')) return anthropic(body);
  if (url.pathname.endsWith('/chat/completions')) return openai(body);
  return new Response('not found', { status: 404 });
});
