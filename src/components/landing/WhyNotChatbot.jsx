import React from "react";
import { getAdvisorByKey } from "@/lib/advisorLibrary";
import { portraitFor } from "@/lib/portraits";
import { CHATBOT, CLOSING_LINES, QUESTION, READY, ROOM } from "@/lib/whyNotChatbot";

// "Why not just ask a chatbot?" (Workstream L), from the owner's mock
// (claude.ai/artifact/Km18Wekgcs8azjTaA4htG8) in the white tokens: the same
// real petit m question, answered by a plain chatbot on the left and by the
// Room on the right. When the page is narrow (900px or less) the columns stack, chatbot first.

function Face({ advisorKey }) {
  const p = advisorKey && portraitFor({ libraryKey: advisorKey });
  return p ? <img className="face" src={p.card} alt="" loading="lazy" /> : <span className="face" aria-hidden="true" />;
}

function Position({ position }) {
  const a = position.key && getAdvisorByKey(position.key);
  return (
    <li className="position">
      <Face advisorKey={position.key} />
      <div>
        {a ? (
          <span className="who"><b>{a.name}</b> <span>{a.role}</span></span>
        ) : (
          <span className="who"><b>An advisor</b></span>
        )}
        {position.text ? <q>{position.text}</q> : <q className="pending">Waiting for this advisor’s own words from the meeting.</q>}
      </div>
    </li>
  );
}

export default function WhyNotChatbot() {
  // Nothing invented reaches production: until every line has its source,
  // only development builds show the section.
  if (!READY && import.meta.env.PROD) return null;

  const chair = getAdvisorByKey(ROOM.chair.key);
  const taskOwner = getAdvisorByKey(ROOM.task.key);

  return (
    <section className="versus" id="why-not-a-chatbot" aria-labelledby="versus-title">
      <span className="room-mono">Why not just ask a chatbot?</span>
      <h2 id="versus-title">Same question. <em>Different answer.</em></h2>
      <p className="sub">
        Ask a chatbot and you get one long answer. Ask the Room and you get an argument, a decision, and the work half done. Here’s the same question, side by side.
      </p>

      <figure className="asked">
        <blockquote className="room-bubble">{QUESTION.text}</blockquote>
        <figcaption className="room-mono">{QUESTION.who}</figcaption>
      </figure>

      <div className="cols">
        <article className="col bot" aria-label="A chatbot's answer">
          <header className="head"><b>A chatbot</b><span className="room-mono">1 answer · 0 disagreements</span></header>
          <div className="essay">
            <div className="rec">
              <span className="room-mono">{CHATBOT.recommendation.label}</span>
              <b>{CHATBOT.recommendation.value}</b>
              <span>{CHATBOT.recommendation.caption}</span>
            </div>
            {CHATBOT.parts.map((part, i) => {
              const wide = part.wide ? " wide-only" : "";
              if (part.cut) {
                return (
                  <p key={i} className={`cut${wide}`}>
                    <span aria-hidden="true">…</span>
                    <span className="sr-only">Part of the reply is left out here.</span>
                  </p>
                );
              }
              if (part.heading) return <h3 key={i} className={wide.trim() || undefined}>{part.heading}</h3>;
              return <p key={i} className={wide.trim() || undefined}>{part.text}</p>;
            })}
          </div>
          <footer className="essay-foot"><span>{CHATBOT.length}</span><span>{CHATBOT.endsBy}</span></footer>
        </article>

        <article className="col room" aria-label="The Room's answer">
          <header className="head"><b>The Room</b><span className="room-mono">{ROOM.spoke} of {ROOM.seated} spoke · {ROOM.disagreements} disagreements</span></header>

          <div className="block">
            <span className="room-mono">Where they stood</span>
            <ul className="positions">
              {ROOM.positions.map((p, i) => <Position key={i} position={p} />)}
            </ul>
          </div>

          <div className="block verdict">
            <span className="room-mono">The Chair’s recommendation</span>
            <p>{ROOM.chair.verdict}</p>
            <div className="confidence">
              <span className="meter" aria-hidden="true"><span style={{ width: `${ROOM.chair.confidence}%` }} /></span>
              <span><b>{ROOM.chair.confidence}%</b> confidence{chair ? ` · ${chair.name}, ${chair.role}` : ""}</span>
            </div>
            {ROOM.chair.reason && <p className="why">{ROOM.chair.reason}</p>}
          </div>

          <div className="block task">
            <span className="room-mono">One of the {ROOM.tasks} tasks it created</span>
            <div className="task-row">
              <Face advisorKey={ROOM.task.key} />
              <div>
                <p>{ROOM.task.title}</p>
                <span className="meta">{taskOwner ? `${taskOwner.name} · ` : ""}{ROOM.task.type}</span>
              </div>
            </div>
            <span className="room-pill do">Do this for me</span>
          </div>
        </article>
      </div>

      <ul className="three">
        {CLOSING_LINES.map((line) => <li key={line}>{line}</li>)}
      </ul>
    </section>
  );
}
