import { createClient } from 'jsr:@supabase/supabase-js@2';
import { embedText } from '../_shared/embeddings.ts';
import { distinctRoundOne } from '../_shared/roundOne.ts';
import { loadOpenCommitments, OVERDUE_AFTER_DAYS } from '../_shared/commitments.ts';
import { requireOwnedCompany, requireMaxLength, checkUserLimit, accessErrorResponse, TEXT_LIMITS } from '../_shared/access.ts';
import { CALL_DEADLINE_MS, CALLER_SAVE_MARGIN_MS } from '../_shared/callPolicy.ts';
import { PROFILE_GAPS, PROFILE_FIELD_KEYS, INDEPENDENT_SCHEMA, CHAIR_OPENING_SCHEMA } from '../_shared/answerSchemas.ts';
import { findChair, withoutChair, chairCallFields } from '../_shared/chair.ts';
import { companyProfile } from '../_shared/companyProfile.ts';
import { STEP_STALE_MS, handOver, isServiceCall, later, meetingOwner } from '../_shared/meetingDriver.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// The answer card offers to save an answer only into a profile field that
// is still empty: one the founder already filled in is never overwritten.
function keepOpenProfileField(item, company) {
  if (!item || typeof item !== 'object') return item;
  const { profile_field, ...rest } = item;
  return PROFILE_FIELD_KEYS.includes(profile_field) && !company[profile_field] ? { ...rest, profile_field } : rest;
}

// The founder's Progression Tree, summarised for the board — completed
// items plus the next few not-yet ones, by order_index. Reuses the same
// "mention if relevant, don't force it in" instruction pattern as the
// commitments block above, since most questions won't touch it.
async function loadProgressionSummary(db, companyId) {
  const { data: tree } = await db.from('progression_trees').select('id').eq('company_id', companyId).maybeSingle();
  if (!tree) return null;
  const { data: nodes } = await db.from('progression_nodes').select('id, label').eq('tree_id', tree.id).order('order_index');
  if (!nodes?.length) return null;
  const { data: completions } = await db.from('progression_node_completions').select('node_id').eq('company_id', companyId);
  const doneIds = new Set((completions || []).map(c => c.node_id));
  return {
    completed: nodes.filter(n => doneIds.has(n.id)).map(n => n.label),
    next: nodes.filter(n => !doneIds.has(n.id)).slice(0, 3).map(n => n.label),
  };
}

// Round 1 (anti-convergence): each advisor answers from their own speciality,
// and sees only the open commitments that are theirs. Everyone getting the
// same overdue list made every answer open with the same checklist.
function lensFor(advisor) {
  const role = String(advisor.role || 'advisor').slice(0, 100);
  return `\nYOUR LENS: you are this board's ${role}. Answer from your own speciality first: what does this question look like from where you sit that the others won't see? The rest of the board covers their own areas, so don't open with the checklist every advisor would give (validate demand, check compliance, secure suppliers) unless it is truly your speciality. If you agree with an obvious point, say so in a line and spend the rest of your answer on your own angle.\n`;
}

function commitmentsFor(advisor, commitments) {
  const mine = (commitments || []).filter(c => c.advisor_id === advisor.id
    || (!c.advisor_id && String(c.assigned_to || '').trim().toLowerCase() === String(advisor.name || '').trim().toLowerCase()));
  const others = (commitments || []).length - mine.length;
  let text = '';
  if (mine.length) {
    text += `\nCommitments from earlier meetings that are yours to deliver, still open:\n`;
    mine.forEach(c => {
      const overdue = c.days_open >= OVERDUE_AFTER_DAYS ? ' [OVERDUE]' : '';
      text += `- "${c.title}", agreed ${c.days_open} day${c.days_open === 1 ? '' : 's'} ago after the meeting on "${c.meeting_question}"${overdue}\n`;
    });
    text += `Mention one only where it bears on this question.\n`;
  }
  if (others > 0) text += `\n(The founder has ${others} other open commitment${others === 1 ? '' : 's'} from earlier meetings; the Chair keeps track of them. Leave them to their owners unless one decides your answer.)\n`;
  return text;
}

function buildContext(company, documents, decisions, meetings, projects, commitments, progression, maxSize) {
  // Everything the founder has filled in, as facts they stated (not just
  // the gaps below), the same block every later stage of the meeting gets.
  let ctx = companyProfile(company) || `Company: ${company.name || 'N/A'}\n`;
  // The onboarding plan's priorities are its suggestions, not the founder's
  // words (its generated welcome line, the "tagline", is left out).
  if (company.priorities?.length) ctx += `\nSuggested priorities from the onboarding plan (not the founder's own words): ${company.priorities.join(', ')}\n`;
  if (company.metrics?.length) ctx += `Key Metrics: ${company.metrics.map(m => `${m.label}: ${m.value} (${m.trend})`).join(', ')}\n`;
  const gaps = PROFILE_GAPS.filter(g => !String(company[g.key] ?? '').trim());
  if (gaps.length) {
    ctx += `\nNot yet on file about this company (onboarding is short by design — the board fills these in over time):\n`;
    gaps.forEach(g => { ctx += `- ${g.label} [profile_field: "${g.key}"]\n`; });
    ctx += `If knowing one of these would materially change your answer, ask the founder directly in your response and report it in missing_information with the exact profile_field key. Don't force one in if it isn't actually relevant to this question — most won't be.\n`;
  }
  if (progression?.completed?.length || progression?.next?.length) {
    ctx += `\nProgress on the founder's path (their Progression Tree):\n`;
    if (progression.completed.length) ctx += `Already unlocked: ${progression.completed.join(', ')}\n`;
    if (progression.next.length) ctx += `Next up: ${progression.next.join(', ')}\n`;
    ctx += `Reference it explicitly if directly relevant to this question — e.g. this question depends on something not yet unlocked, or the answer should build on something they just achieved. Don't force it in if it isn't relevant — most questions won't touch it.\n`;
  }
  if (decisions?.length) {
    ctx += `\nPast decisions related to this question (most relevant first):\n`;
    decisions.slice(0, 5).forEach(d => {
      const when = d.created_at ? new Date(d.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'date unknown';
      ctx += `- [${when}] ${d.question}: ${d.final_recommendation || d.summary || 'N/A'}\n`;
    });
    ctx += `MEMORY PRINCIPLE — this is mandatory, not optional:\n`;
    ctx += `- You MUST state explicitly whether your recommendation is consistent with these past decisions or departs from them.\n`;
    ctx += `- If it departs, say so directly, name the decision, and explain what has changed to justify reversing it. A board that quietly contradicts its own past decisions is worse than useless.\n`;
    ctx += `- If it is consistent, say which decision it builds on.\n`;
    ctx += `- If none of them genuinely bear on this question, say that explicitly rather than staying silent.\n`;
  }
  if (meetings?.length) {
    ctx += `\nPrevious Board Meetings:\n`;
    meetings.slice(0, 3).forEach(m => { ctx += `- Q: ${m.question} -> ${m.recommendation || m.executive_summary || 'N/A'}\n`; });
  }
  if (projects?.length) {
    ctx += `\nActive Projects:\n`;
    projects.slice(0, 5).forEach(p => { ctx += `- ${p.name} (${p.status}): ${p.description || ''}\n`; });
  }
  if (commitments?.length) {
    ctx += `\nOutstanding commitments the founder made after previous board meetings:\n`;
    commitments.forEach(c => {
      const overdue = c.days_open >= OVERDUE_AFTER_DAYS ? ' [OVERDUE]' : '';
      ctx += `- "${c.title}" — agreed ${c.days_open} day${c.days_open === 1 ? '' : 's'} ago after the meeting on "${c.meeting_question}", still not done${overdue}\n`;
    });
    ctx += `Raise these only where they bear on the question — an overdue commitment may be worth asking about directly, a recent one usually is not.\n`;
  }
  // Facts the founder stated in earlier meetings (P1) have their own block,
  // so they never crowd the founder's other Knowledge out of the ten below.
  const toldBoard = (documents || []).filter(d => d.category === 'What you told the board');
  if (toldBoard.length) {
    ctx += `\nFacts the founder told the board in earlier meetings (their words; the founder may have edited them since):\n`;
    toldBoard.slice(0, 5).forEach(d => { ctx += `${(d.content || '').slice(0, 600)}\n`; });
  }
  const otherDocs = (documents || []).filter(d => d.category !== 'What you told the board');
  if (otherDocs.length) {
    ctx += `\nRelevant Documents:\n`;
    otherDocs.slice(0, 10).forEach(d => { ctx += `- ${d.title} (${d.category}): ${(d.content || '').slice(0, 400)}\n`; });
  }
  if (ctx.length > maxSize) ctx = ctx.slice(0, maxSize) + '... [truncated]';
  return ctx;
}

// Board memory: find past decisions related to the question being asked, rather
// than merely the most recent ones. Falls back to recency when the question
// cannot be embedded or nothing clears the similarity floor, so a board meeting
// never fails because memory is unavailable.
async function recallRelatedDecisions(db, companyId, ownerId, question) {
  let recencyFallback = [];
  try {
    const { data } = await db.from('decisions').select('*')
      .eq('company_id', companyId).eq('created_by_id', ownerId).order('created_at', { ascending: false }).limit(10);
    recencyFallback = data || [];
  } catch { /* fall through with an empty list */ }

  try {
    const embedding = await embedText(question);
    const { data: matches, error } = await db.rpc('match_decisions', {
      p_company_id: companyId,
      p_query_embedding: JSON.stringify(embedding),
      p_match_count: 5,
    });
    if (error) throw new Error(error.message);
    // match_decisions searches by company only; keep the owner's own rows.
    const ownIds = new Set();
    if (matches?.length) {
      const { data: owned } = await db.from('decisions').select('id')
        .in('id', matches.map((m) => m.id)).eq('created_by_id', ownerId);
      for (const o of owned || []) ownIds.add(o.id);
      const mine = matches.filter((m) => ownIds.has(m.id));
      if (mine.length) return { decisions: mine, retrieval: 'relevance' };
    }
  } catch (e) {
    console.error('Relevance recall failed, falling back to recency:', e.message);
  }
  return { decisions: recencyFallback, retrieval: 'recency' };
}

// Tasks the founder actually finished since the last meeting — the raw
// material for the Chair's opening. Distinct from open commitments (which are
// what's still outstanding); this is what moved.
async function loadRecentlyCompletedTasks(db, companyId, ownerId, sinceIso) {
  if (!sinceIso) return [];
  const { data } = await db.from('tasks')
    .select('title, source_meeting_id, updated_at')
    .eq('company_id', companyId).eq('created_by_id', ownerId).eq('status', 'done')
    .gt('updated_at', sinceIso)
    .order('updated_at', { ascending: false }).limit(20);
  return data || [];
}

// Deterministic, non-LLM fallback — used only if the model's own phrasing
// fails to verify below. Always names the work, whether or not the model's
// wording checks out; this is the retention mechanic, so it must never
// silently disappear the way an unverified overdue-chase used to.
function templatedCompletedRecap(completedTasks) {
  const titles = completedTasks.map((t) => `"${t.title}"`).join(', ');
  return `Since we last met, the board saw progress on: ${titles}.`;
}

// The Chair opens every meeting. On a first meeting there's nothing to
// recap, so she welcomes the founder, names the question and the board, and
// says how the meeting runs, without answering it. Otherwise she opens with
// what has changed since the last meeting: work finished, and how the
// founder responded to the last resolution. This used
// to also chase overdue commitments directly — that's moved to the
// Assistant (Phase E, prepareAccountabilityChases), which can raise it
// proactively between meetings rather than only when a new one starts, and
// avoids two voices nagging about the same thing. This opening now stays
// pure recap and acknowledgment — the continuity differentiator made
// visible ("the board remembers"), never a chase.
// She doesn't know the time of day, and the board speaks next, not the founder.
const OPENING_WORDING = `Don't greet with a time of day ("good morning", "good evening"). When you hand over, hand over to the board, not to the founder.`;

function firstMeetingWelcomePrompt(company, newQuestion, debaterNames) {
  let prompt = `You are opening the very first board meeting for ${company.name || 'this company'}, before the board addresses the founder's question.\n\n`;
  prompt += `The founder's question: "${newQuestion}"\n`;
  prompt += `The advisors at the table: ${debaterNames.join(', ')}.\n\n`;
  prompt += `In 2-3 sentences, in your own voice as Chair: welcome the founder, name the question in a few words, introduce the advisors by name, and say how the meeting runs — each advisor first answers independently, then they discuss and challenge each other over a few rounds, and you close with the board's resolution.\n`;
  prompt += `IMPORTANT: do NOT answer, judge or comment on the question itself. That is the board's job, not yours here. No filler.\n`;
  prompt += OPENING_WORDING;
  return prompt;
}

async function buildChairOpening({ supabaseUrl, serviceKey, db, chair, company, companyId, userId, anonymous, meetingId, newQuestion, previousMeeting, debaterNames, deadlineAt }) {
  const completedTasks = previousMeeting ? await loadRecentlyCompletedTasks(db, companyId, userId, previousMeeting.created_at) : [];

  let prompt;
  if (!previousMeeting) {
    prompt = firstMeetingWelcomePrompt(company, newQuestion, debaterNames);
  } else {
    prompt = `You are opening this board meeting for ${company.name}, before the founder's actual question is addressed.\n\n`;
    prompt += `IMPORTANT: today's question is "${newQuestion}" — do NOT discuss, answer, or reference it. That is the rest of the board's job, not yours here. Your only job is a brief status check on what has happened since the last meeting.\n\n`;
    prompt += `Last meeting's question was: "${previousMeeting.question}" (already resolved — do not re-litigate it, only reference what came after it).\n`;
    const lastDirection = previousMeeting.board_resolution?.recommended_direction || previousMeeting.recommendation;
    if (lastDirection) prompt += `What the board resolved then: "${String(lastDirection).slice(0, 1500)}". If you mention it, describe it accurately; never restate it as something else.\n`;
    if (previousMeeting.founder_decision && previousMeeting.founder_decision !== 'undecided') {
      prompt += `The founder's response to that resolution: ${previousMeeting.founder_decision}${previousMeeting.founder_decision_notes ? ` — "${previousMeeting.founder_decision_notes}"` : ''}\n`;
    }
    if (completedTasks.length) {
      prompt += `\nCompleted since then:\n`;
      completedTasks.forEach(t => { prompt += `- ${t.title}\n`; });
      prompt += `\nThis is mandatory, not optional: your opening_statement text must literally contain each completed item's exact title in quotes — this is the board demonstrating it remembers and noticed, not a vague "good progress." A generic "you've been busy" is NOT acceptable — name every item above.\n`;
    } else {
      prompt += `\nNothing has been marked done since then — a short, honest "quiet since we last met" is fine. Do not invent progress that didn't happen.\n`;
    }
    prompt += `\nKeep the whole thing to 2-4 sentences, your own voice as Chair, no filler, and no mention of today's actual question. Never chase, never ask about outstanding or overdue items — that is handled elsewhere now; this is acknowledgment only.`;
    prompt += `\n${OPENING_WORDING}`;
  }

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/routeAdvisorRequest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({
        ...chairCallFields(chair), company_id: companyId, meeting_id: meetingId, user_id: userId, anonymous,
        // Her book, hobby or place may come up here; never in the resolution.
        personal_details: true,
        // The Chair opens knowing what the founder has told us, like the board.
        company_context: companyProfile(company) || null, meeting_context: null,
        user_question: prompt, previous_responses: [], output_schema: CHAIR_OPENING_SCHEMA,
        temperature: 0.4, request_type: 'chair_opening', deadline_at: deadlineAt,
      }),
    });
    const data = await res.json();
    const stated = res.ok ? (data.response?.opening_statement || null) : null;

    // If the model claims it named the completed items but didn't actually
    // include their titles verbatim, don't ship a statement that only
    // pretends to be specific — fall back to a deterministic recap built
    // directly from the known titles rather than losing the acknowledgment
    // entirely (unlike the old overdue-chase, which could safely discard to
    // null since chasing was optional — recap is the retention mechanic).
    if (completedTasks.length) {
      const namedAll = !!stated && completedTasks.every(t => stated.includes(t.title));
      if (!namedAll) {
        console.error('Chair opening fell back to templated recap: model did not name every completed item verbatim.');
        return templatedCompletedRecap(completedTasks);
      }
    }
    return stated;
  } catch (e) {
    console.error('Chair opening failed, falling back to templated recap if there is work to name:', e.message);
    return completedTasks.length ? templatedCompletedRecap(completedTasks) : null;
  }
}

async function callAdvisor(supabaseUrl, serviceKey, payload) {
  const res = await fetch(`${supabaseUrl}/functions/v1/routeAdvisorRequest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `routeAdvisorRequest failed (${res.status})`);
  return data;
}

// The free meeting, enforced here rather than trusted to the browser: an
// anonymous caller needs an attempt freeMeetingGate issued to this session,
// gets one finished meeting, is held to the per-network daily limit, and is
// refused once today's free-meeting spend reaches the ceiling. The checks and
// the claim happen in one locked database step (claim_free_meeting), so
// parallel requests can't all slip through. A retry supersedes the session's
// unfinished meetings. Returns an error message, or null to go ahead.
const FREE_MEETINGS_PER_IP_PER_DAY = 3;
const CLAIM_REFUSALS = {
  expired: 'This free meeting has expired. Please start again from the free meeting page.',
  already_used: "You've already used your free board meeting.",
  ip_limit: "Free board meetings from this network have reached today's limit. Create an account to start your own board now.",
  ceiling: "We've reached today's limit for free board meetings. Come back tomorrow, or create an account to start your own board now.",
  busy: 'Your board is still working on your meeting. Please wait for it to finish.',
};

async function claimFreeMeeting(db, userId, attemptId) {
  if (!attemptId) return 'The free meeting needs to be started from the free meeting page.';
  const { data: limitsRows } = await db.from('system_limits').select('free_meeting_daily_cost_ceiling_usd').order('created_at', { ascending: false }).limit(1);
  const ceiling = Number(limitsRows?.[0]?.free_meeting_daily_cost_ceiling_usd ?? 12.70);
  const { data: outcome, error } = await db.rpc('claim_free_meeting', {
    p_attempt_id: attemptId, p_user_id: userId, p_ceiling: ceiling, p_ip_limit: FREE_MEETINGS_PER_IP_PER_DAY,
  });
  if (error) throw error;
  return outcome === 'ok' ? null : (CLAIM_REFUSALS[outcome] || CLAIM_REFUSALS.expired);
}

// Everything the board draws on for Round 1, for the meeting's owner.
async function gather(db, userId, companyId, question): Promise<any> {
  const [{ data: documents }, { data: meetings }, { data: projects }, { data: advisors }, recalled, commitments, progression] = await Promise.all([
    // Archived and replaced documents stay out of the meeting. Facts told to
    // the board in earlier meetings (P1) are fetched apart, so they never
    // crowd out the founder's other documents.
    db.from('documents').select('*').eq('company_id', companyId).eq('created_by_id', userId)
      .or('status.is.null,status.not.in.(archived,superseded)').or('category.is.null,category.neq.What you told the board')
      .order('created_at', { ascending: false }).limit(20),
    db.from('board_meetings').select('*').eq('company_id', companyId).eq('created_by_id', userId).eq('status', 'complete').order('created_at', { ascending: false }).limit(5),
    db.from('projects').select('*').eq('company_id', companyId).eq('created_by_id', userId).order('created_at', { ascending: false }).limit(10),
    db.from('advisors').select('*').eq('company_id', companyId).eq('created_by_id', userId).limit(100),
    recallRelatedDecisions(db, companyId, userId, question),
    loadOpenCommitments(db, companyId, userId),
    loadProgressionSummary(db, companyId),
  ]);
  const { data: toldBoard } = await db.from('documents').select('*').eq('company_id', companyId).eq('created_by_id', userId)
    .eq('category', 'What you told the board').or('status.is.null,status.not.in.(archived,superseded)')
    .order('created_at', { ascending: false }).limit(5);
  return { documents: [...(toldBoard || []), ...(documents || [])], meetings, projects, advisors, recalled, commitments, progression };
}

// What the board is drawing on, recorded so the founder can see it later.
function buildMemoryContext(recalled, decisions, commitments) {
  return {
    retrieval: recalled.retrieval,
    recalled_decisions: (decisions || []).slice(0, 5).map(d => ({
      id: d.id,
      question: d.question,
      decided_at: d.created_at,
      similarity: d.similarity ?? null,
    })),
    open_commitments: (commitments || []).map(c => ({
      title: c.title,
      days_open: c.days_open,
      overdue: c.days_open >= OVERDUE_AFTER_DAYS,
      meeting_question: c.meeting_question,
    })),
  };
}

// Round 1: every advisor answers on their own, in parallel, and the Chair
// opens. Ends with the meeting at independent_complete.
async function runRoundOne({ db, supabaseUrl, serviceKey, meeting, company, user, selectedAdvisors, chair, contextPackage, roundOneContext, commitments, previousMeeting, startedAt }: any) {
  const company_id = meeting.company_id;
  const question = meeting.question;
  // Model calls end in time for this function to save their answers.
  const deadlineAt = startedAt + CALL_DEADLINE_MS - CALLER_SAVE_MARGIN_MS;

  // Each Round 1 answer, and the Chair's opening, is saved the moment it's
  // ready, so the founder's screen can show them as they arrive rather
  // than waiting for the slowest advisor. Saves run one after another (no
  // write overtakes another) and only while the meeting is still forming.
  // While the meeting forms they're kept in arrival order.
  const formatIndependent = (r: { advisor: any; data?: any; error?: string }) => {
    const d = r.data;
    if (r.error || !d?.response) {
      return {
        advisor_id: r.advisor.id, advisor_name: r.advisor.name, role: r.advisor.role,
        provider_used: d?.provider_used || null, model_used: d?.model_used || null, used_fallback: d?.used_fallback || false,
        position: 'This advisor was temporarily unavailable.', recommendation: 'No recommendation available.',
        key_arguments: [], assumptions: [], risks: [], missing_information: [], suggested_actions: [], confidence_score: 0,
        unavailable: true,
      };
    }
    const resp = d.response;
    return {
      advisor_id: r.advisor.id, advisor_name: r.advisor.name, role: r.advisor.role,
      provider_used: d.provider_used, model_used: d.model_used, used_fallback: d.used_fallback,
      position: resp.position || '', recommendation: resp.recommendation || '',
      key_arguments: resp.key_arguments || [], assumptions: resp.assumptions || [],
      risks: resp.risks || [], missing_information: (resp.missing_information || []).map((m: any) => keepOpenProfileField(m, company)),
      suggested_actions: resp.suggested_actions || [], confidence_score: resp.confidence_score || 0,
      // What this answer cost, shown with it (P1).
      cost_usd: Number(d.cost_usd) || 0,
    };
  };
  // Writes only while this run still holds Round 1: a server-run meeting's
  // stalled run that wakes up after the sweep restarted it writes nothing.
  const ours = (q) => {
    q = q.eq('id', meeting.id).eq('status', 'preparing');
    return meeting.driver === 'server' ? q.eq('step_attempts', meeting.step_attempts) : q;
  };
  const arrived: any[] = [];
  let saving: Promise<unknown> = Promise.resolve();
  const saveProgress = (fields: Record<string, unknown>) => {
    saving = saving
      .then(async () => {
        const { error } = await ours(db.from('board_meetings').update(fields));
        if (error) console.error('Round 1 progress save failed:', error.message);
      })
      .catch((e) => console.error('Round 1 progress save failed:', e?.message));
  };

  const [, chairOpening] = await Promise.all([
    Promise.all(selectedAdvisors.map(advisor =>
      callAdvisor(supabaseUrl, serviceKey, {
        advisor_id: advisor.id, company_id, meeting_id: meeting.id, user_id: user.id, anonymous: !!user.is_anonymous,
        // Their own lens, and their own commitments on top of what everyone
        // gets; the full list stays in the package later rounds and the Chair use.
        system_instructions: `${advisor.system_instructions || advisor.biography || `You are ${advisor.name}, a ${advisor.role}.`}\n${lensFor(advisor)}`,
        company_context: roundOneContext ? `${roundOneContext}${commitmentsFor(advisor, commitments)}` : contextPackage,
        user_question: question, previous_responses: [], output_schema: INDEPENDENT_SCHEMA,
        temperature: advisor.temperature, request_type: 'independent', deadline_at: deadlineAt,
        personal_details: true, // nothing said yet in this meeting
      }).then(data => ({ advisor, data })).catch(err => ({ advisor, error: err.message }))
        .then((r: { advisor: any; data?: any; error?: string }) => {
          arrived.push(formatIndependent(r));
          saveProgress({ independent_responses: [...arrived] });
        })
    )),
    buildChairOpening({
      supabaseUrl, serviceKey, db, chair, company, companyId: company_id, userId: user.id, anonymous: !!user.is_anonymous,
      meetingId: meeting.id, newQuestion: question, previousMeeting, debaterNames: selectedAdvisors.map(a => a.name), deadlineAt,
    }).then((opening) => {
      if (opening) saveProgress({ chair_opening: opening });
      return opening;
    }).catch((e) => {
      // The opening is never worth losing the meeting over.
      console.error('Chair opening failed:', e.message);
      return null;
    }),
  ]);
  await saving;
  // Saved for good in the board's own order, so later rounds don't always
  // list the slowest advisors last. The live view follows turns by who
  // gave them, not by position, so it isn't affected.
  const rank = new Map<string, number>(selectedAdvisors.map((a: any, i: number) => [a.id, i]));
  let independentResponses = [...arrived].sort((a, b) => (rank.get(a.advisor_id) ?? 0) - (rank.get(b.advisor_id) ?? 0));

  // Two advisors who came back with near-identical answers: the later one is
  // asked once more, for their own view (at most two re-asks, only with time
  // left). A board that says one sentence four times isn't a board.
  independentResponses = await distinctRoundOne({
    responses: independentResponses, selectedAdvisors, deadlineAt,
    ask: (advisor, note) => callAdvisor(supabaseUrl, serviceKey, {
      advisor_id: advisor.id, company_id, meeting_id: meeting.id, user_id: user.id, anonymous: !!user.is_anonymous,
      system_instructions: `${advisor.system_instructions || advisor.biography || `You are ${advisor.name}, a ${advisor.role}.`}\n${lensFor(advisor)}`,
      company_context: roundOneContext ? `${roundOneContext}${commitmentsFor(advisor, commitments)}` : contextPackage,
      meeting_context: note, user_question: question, previous_responses: [], output_schema: INDEPENDENT_SCHEMA,
      temperature: advisor.temperature, request_type: 'independent_redo', deadline_at: deadlineAt, personal_details: true,
    }).then(data => formatIndependent({ advisor, data })).catch(() => null),
  });

  // A free-meeting retry may have superseded it meanwhile.
  await ours(db.from('board_meetings').update({
    status: 'independent_complete', independent_responses: independentResponses,
    chair_opening: chairOpening,
    // A server-run meeting's step is over: the next one starts fresh.
    ...(meeting.driver === 'server' ? { step_claimed_at: null, step_attempts: 0, sweep_count: 0, step_finished_at: new Date().toISOString() } : {}),
  }));
  return { independentResponses, chairOpening };
}

// The sweep found a server-run meeting's Round 1 stalled (the worker died):
// run it again from the stored meeting, if it's still the one to run.
async function retryRoundOne(db, supabaseUrl, serviceKey, meetingId) {
  const { data: m } = await db.from('board_meetings').select('*').eq('id', meetingId).maybeSingle();
  if (!m || m.driver !== 'server' || m.status !== 'preparing' || !m.step_claimed_at) return { started: false };
  // Only a meeting startBoardMeeting set up has its advisors chosen.
  if (!m.participant_advisor_ids?.length) throw Object.assign(new Error('This meeting has no advisors.'), { status: 400 });
  const staleBefore = new Date(Date.now() - STEP_STALE_MS).toISOString();
  const { data: claimed } = await db.from('board_meetings')
    .update({ step_claimed_at: new Date().toISOString(), step_attempts: (m.step_attempts || 0) + 1, independent_responses: [], chair_opening: null })
    .eq('id', m.id).eq('status', 'preparing').eq('step_attempts', m.step_attempts).lt('step_claimed_at', staleBefore)
    .select().maybeSingle();
  if (!claimed) return { started: false };

  const user = await meetingOwner(db, m.created_by_id);
  const { data: company } = await db.from('companies').select('*').eq('id', m.company_id).maybeSingle();
  const { documents, meetings, projects, advisors, recalled, commitments, progression } = await gather(db, user.id, m.company_id, m.question);
  const { data: limitsList } = await db.from('system_limits').select('*').order('created_at', { ascending: false }).limit(1);
  const chair = findChair(advisors);
  const chosen = new Set(m.participant_advisor_ids || []);
  const selectedAdvisors: any[] = withoutChair((advisors || []).filter(a => chosen.has(a.id) && a.type !== 'human'), chair);
  const contextPackage = buildContext(company, documents, recalled.decisions, meetings, projects, commitments, progression, limitsList?.[0]?.max_context_size || 8000);
  const roundOneContext = buildContext(company, documents, recalled.decisions, meetings, projects, [], progression, limitsList?.[0]?.max_context_size || 8000);
  await db.from('board_meetings').update({ context_package: contextPackage }).eq('id', m.id);
  later(runRoundOne({
    db, supabaseUrl, serviceKey, meeting: claimed, company, user, selectedAdvisors, chair, contextPackage, roundOneContext, commitments,
    previousMeeting: meetings?.[0] || null, startedAt: Date.now(),
  }).then(() => handOver(m.id)), 'Round 1 retry');
  return { started: true };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const startedAt = Date.now();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const db = createClient(supabaseUrl, serviceKey);
    const body = await req.json();

    // The server restarting a server-run meeting's Round 1 that stalled.
    if (isServiceCall(req)) {
      if (body?.action !== 'round1' || !body.meeting_id) return Response.json({ error: 'Unknown action' }, { status: 400, headers: corsHeaders });
      try {
        return Response.json(await retryRoundOne(db, supabaseUrl, serviceKey, body.meeting_id), { headers: corsHeaders });
      } catch (e) {
        if (e.status === 400) return Response.json({ error: e.message }, { status: 400, headers: corsHeaders });
        throw e;
      }
    }

    const authClient = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_ANON_KEY'),
      { global: { headers: { Authorization: req.headers.get('Authorization') } } }
    );
    const { data: { user }, error: authErr } = await authClient.auth.getUser();
    if (authErr || !user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const { company_id, question, advisor_ids, attempt_id, meeting_id: requestedId, server_driven, await_humans } = body;
    // The browser may choose the new meeting's id, so its live view can follow
    // exactly this meeting while Round 1 forms. Only a well-formed UUID is
    // accepted; a clash with an existing row simply fails the insert.
    if (requestedId !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(requestedId)))
      return Response.json({ error: 'Invalid meeting id' }, { status: 400, headers: corsHeaders });
    if (!company_id || !question?.trim() || !advisor_ids?.length)
      return Response.json({ error: 'company_id, question and advisor_ids are required' }, { status: 400, headers: corsHeaders });

    const { data: limitsList } = await db.from('system_limits').select('*').order('created_at', { ascending: false }).limit(1);
    const limits = limitsList?.[0] || { max_advisors_per_meeting: 5, min_advisors_per_meeting: 3, max_context_size: 8000 };
    // Both limits count debaters: the Chair opens and resolves, and is extra.
    const minAdv = limits.min_advisors_per_meeting || 3;
    const maxAdv = limits.max_advisors_per_meeting || 5;
    // Too few ids can never make enough debaters: refused before anything
    // is counted or looked up. The exact check, without the Chair, follows.
    if (advisor_ids.length < minAdv)
      return Response.json({ error: `Select at least ${minAdv} advisors to debate` }, { status: 400, headers: corsHeaders });

    requireMaxLength(question, TEXT_LIMITS.question, 'The question');
    const company = await requireOwnedCompany(db, company_id, user.id, '*');
    if (user.is_anonymous && !attempt_id)
      return Response.json({ error: 'The free meeting needs to be started from the free meeting page.' }, { status: 403, headers: corsHeaders });
    if (!user.is_anonymous) await checkUserLimit(db, user.id, 'board_meeting');

    const { documents, meetings, projects, advisors, recalled, commitments, progression } = await gather(db, user.id, company_id, question);
    const decisions = recalled.decisions;

    // The Chair never debates, even if the browser sends her id; a board
    // without one gets the built-in Chair for the opening and resolution.
    const chair = findChair(advisors);
    const selectedAdvisors: any[] = withoutChair((advisors || []).filter(a => advisor_ids.includes(a.id) && a.type !== 'human'), chair);
    if (selectedAdvisors.length < minAdv)
      return Response.json({ error: `Select at least ${minAdv} advisors to debate` }, { status: 400, headers: corsHeaders });
    if (selectedAdvisors.length > maxAdv)
      return Response.json({ error: `Select at most ${maxAdv} advisors to debate` }, { status: 400, headers: corsHeaders });

    // Claimed last, once the request is otherwise valid, so a bad request
    // never uses up or supersedes anything.
    if (user.is_anonymous) {
      const denied = await claimFreeMeeting(db, user.id, attempt_id);
      if (denied) return Response.json({ error: denied }, { status: 403, headers: corsHeaders });
    }

    const contextPackage = buildContext(company, documents, decisions, meetings, projects, commitments, progression, limits.max_context_size || 8000);
    // Round 1's shared part: everything but the commitments, which each
    // advisor gets only for their own.
    const roundOneContext = buildContext(company, documents, decisions, meetings, projects, [], progression, limits.max_context_size || 8000);
    const memoryContext = buildMemoryContext(recalled, decisions, commitments);

    // A meeting the server runs (P0) moves on by itself; one started by an
    // older page is run by that page, step by step, as before.
    const serverRun = server_driven === true;
    const { data: meeting, error: createErr } = await db.from('board_meetings').insert({
      ...(requestedId ? { id: requestedId } : {}),
      company_id, created_by_id: user.id, question, participants: selectedAdvisors.map(a => a.name),
      participant_advisor_ids: selectedAdvisors.map(a => a.id),
      status: 'preparing', independent_responses: [], challenge_responses: [],
      memory_context: memoryContext,
      ...(serverRun ? {
        driver: 'server', step_claimed_at: new Date().toISOString(), step_attempts: 1, awaiting_human_input: await_humans === true,
        // Every later round and the Chair work from this same memory (P1).
        context_package: contextPackage,
      } : {}),
    }).select().single();
    if (createErr) throw createErr;

    // The last meeting that actually reached a resolution: an abandoned,
    // failed or superseded one never happened as far as the Chair knows.
    const previousMeeting = meetings?.[0] || null;
    const roundOne = { db, supabaseUrl, serviceKey, meeting, company, user, selectedAdvisors, chair, contextPackage, roundOneContext, commitments, previousMeeting };

    if (serverRun) {
      // Round 1 runs after this answers, so a closed tab doesn't stop it;
      // the page follows the meeting row.
      later(runRoundOne({ ...roundOne, startedAt }).then(() => handOver(meeting.id)), 'Round 1');
      return Response.json({
        meeting_id: meeting.id, status: 'preparing',
        advisor_names: selectedAdvisors.map(a => a.name), memory_context: memoryContext,
      }, { headers: corsHeaders });
    }

    const { independentResponses, chairOpening } = await runRoundOne({ ...roundOne, startedAt });
    return Response.json({
      meeting_id: meeting.id, status: 'independent_complete',
      independent_responses: independentResponses,
      advisor_names: selectedAdvisors.map(a => a.name),
      memory_context: memoryContext,
      chair_opening: chairOpening,
    }, { headers: corsHeaders });
  } catch (error) {
    const denied = accessErrorResponse(error, corsHeaders);
    if (denied) return denied;
    console.error('startBoardMeeting error:', error);
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }
});
