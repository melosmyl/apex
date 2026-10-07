import React, { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { ADVISOR_LIBRARY, getAdvisorByKey } from "@/lib/advisorLibrary";
import { portraitFor } from "@/lib/portraits";
import { OFF_DUTY } from "@/lib/offDuty";
import { ADVISORS_ARE_AI, PRODUCT_NAME } from "@/lib/branding";
import "@/styles/landing.css";

// The page logged-out visitors see at "/", built from jatr-landing-mock.html
// as it opens: palette C, Comic, frames off. Names, roles, voice lines, mugs
// and portraits all come from the advisor library, so a rename or a new
// portrait shows up here without touching this file.

// Who sits in the board strip, and who gets a card further down.
const STRIP_KEYS = ["chair", "legal_advisor", "scientist", "supply_chain", "people_culture", "innovation_director"];
const CARD_KEYS = ["investor", "legal_advisor", "scientist", "supply_chain", "people_culture", "innovation_director"];

const pick = (keys) => keys.map(getAdvisorByKey).filter(Boolean);

// A mug is stored as it's described ("“Hold”", or with an aside after it);
// the ticker and the cards want just the words printed on it.
function mugWords(mug = "") {
  const quoted = mug.match(/“([^”]+)”/);
  return (quoted ? quoted[1] : mug).trim();
}

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
function inWords(n) {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : "");
  return String(n);
}
const capitalised = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const firstName = (name) => name.replace(/^Dr\.\s+/, "").split(" ")[0];

function Portrait({ advisor, size = "card", className }) {
  const p = portraitFor({ libraryKey: advisor.key });
  if (!p) return null;
  return <img src={p[size]} alt="" loading="lazy" className={className} />;
}

// Cards rise in as they scroll into view. They're only hidden once this has
// armed the list (the "rise" class), so without IntersectionObserver, with
// reduced motion, or if this never runs, they're simply there.
function useRiseIn(ref) {
  useEffect(() => {
    const list = ref.current;
    const cards = [...(list?.querySelectorAll(".card") || [])];
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!list || reduce || !("IntersectionObserver" in window)) return undefined;
    list.classList.add("rise");
    const timers = [];
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          timers.push(setTimeout(() => e.target.classList.add("in"), (cards.indexOf(e.target) % 6) * 90));
          io.unobserve(e.target);
        });
      },
      { threshold: 0.2 }
    );
    cards.forEach((c) => io.observe(c));
    return () => {
      io.disconnect();
      timers.forEach(clearTimeout);
    };
  }, [ref]);
}

export default function Landing() {
  const listRef = useRef(null);
  useRiseIn(listRef);

  const strip = pick(STRIP_KEYS);
  const cards = pick(CARD_KEYS);
  const mugs = [...new Set(ADVISOR_LIBRARY.map((a) => mugWords(a.mug)).filter(Boolean))];
  const count = inWords(ADVISOR_LIBRARY.length);
  const offDuty = OFF_DUTY.map((o) => ({ ...o, advisor: ADVISOR_LIBRARY.find((a) => a.portrait_slug === o.slug) })).filter((o) => o.advisor);

  return (
    <div className="room landing">
      <div className="room-grain" aria-hidden="true" />
      <main>
        <div className="wrap">
          <header className="top">
            <Link className="brand" to="/">{PRODUCT_NAME}</Link>
            <nav aria-label="Main">
              <Link className="wide-only" to="/advisors">The advisors</Link>
              <a className="wide-only" href="#how">How it works</a>
              <Link to="/login">Log in</Link>
              <Link className="room-btn-line" to="/board">Sit in on a meeting</Link>
            </nav>
          </header>

          <section className="hero">
            <span className="room-mono">An AI board of advisors</span>
            <h1>Don't decide <em>alone.</em></h1>
            <div className="hero-row">
              <p className="lede">
                A board of advisors who argue about your business. Not one confident answer: five people who disagree, and a Chair who writes down what you should do next.
              </p>
              <Link className="room-btn" to="/board">Sit in on a meeting <span aria-hidden="true">→</span></Link>
            </div>
          </section>
        </div>

        <section className="strip" aria-label="The board">
          <div className="row">
            {strip.map((a) => (
              <figure key={a.key} tabIndex={0} aria-label={`${a.name}, ${a.role}`}>
                <Portrait advisor={a} />
                <figcaption>
                  <b>{a.name}</b>
                  <span>{a.role}</span>
                  {a.voice_line && <q className="room-bubble">{a.voice_line}</q>}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
        <div className="wrap">
          <div className="strip-foot">
            <span className="room-mono">The room, in session</span>
            <span className="room-mono hover-hint">Hover an advisor</span>
          </div>
        </div>

        <div className="ticker" aria-hidden="true">
          <div className="track">
            {[...mugs, ...mugs].map((m, i) => <span key={i}>{m}</span>)}
          </div>
        </div>

        <div className="wrap">
          <section className="speak" id="advisors">
            <div className="section-head">
              <div>
                <span className="room-mono">Who's in the room</span>
                <h2>{capitalised(count)} advisors. None of them agree.</h2>
              </div>
              <p className="sub">
                Each argues from their own corner. The Chair keeps the view you'd rather not hear in the minutes, so the decision is yours with your eyes open.
              </p>
            </div>
            <div className="list" ref={listRef}>
              {cards.map((a) => (
                <article className="card" key={a.key}>
                  <Portrait advisor={a} />
                  <div className="who">
                    <Link to={`/advisors/${a.portrait_slug}`}>{a.name}</Link>
                    <span>{a.role}</span>
                  </div>
                  {a.voice_line ? <q className="room-bubble room-bubble--tail-left">{a.voice_line}</q> : <span />}
                  <div className="mug">Mug<b>{mugWords(a.mug)}</b></div>
                </article>
              ))}
            </div>
            <div className="more">
              <Link className="text-link" to="/advisors">Meet all {count} <span aria-hidden="true">→</span></Link>
            </div>
          </section>

          <section className="how" id="how">
            <span className="room-mono">How it works</span>
            <h2>A boardroom for founders who've never had one.</h2>
            <div className="steps">
              <div className="step room-card">
                <div className="n">1</div>
                <h3>Choose your advisors</h3>
                <p>Pick the voices you need: a finance head, a marketer, a sceptic. They remember your business from one meeting to the next.</p>
              </div>
              <div className="step room-card">
                <div className="n">2</div>
                <h3>Ask your question</h3>
                <p>Plain words are fine. The room debates it from every side and tells you where they agree and where they don't.</p>
              </div>
              <div className="step room-card">
                <div className="n">3</div>
                <h3>Get it done</h3>
                {/* The owner's wording ("agents pick up the tasks and finish
                    them…") goes back in when agents ship. */}
                <p>After the meeting, the decision becomes a short list of tasks with owners, and your advisors follow up until they're done.</p>
              </div>
            </div>
          </section>

          {offDuty.length > 0 && (
            <section className="off" id="off">
              <div className="section-head">
                <div>
                  <span className="room-mono">Off the clock</span>
                  <h2>They do have lives. Apparently.</h2>
                </div>
                <p className="sub">
                  Every advisor has a book, a hobby and a place they'd rather be. They'll mention it once a meeting, at most, and only when it helps.
                </p>
              </div>
              <div className="gallery">
                {offDuty.map((o) => (
                  <Link className="shot" key={o.slug} to={`/advisors/${o.slug}`}>
                    <img src={`/advisors/off/${o.slug}.jpg`} alt="" loading="lazy" />
                    <span className="cap"><b>{firstName(o.advisor.name)}</b> {o.caption}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section className="closer">
            <h2>Bring them the decision that's keeping you up.</h2>
            <Link className="room-btn" to="/board">Sit in on a meeting <span aria-hidden="true">→</span></Link>
          </section>

          <footer>
            <nav aria-label="Footer">
              <Link to="/advisors">The advisors</Link>
              <Link to="/pricing">Pricing</Link>
              <Link to="/privacy">Privacy</Link>
              <Link to="/terms">Terms</Link>
            </nav>
            <p className="ai-note">{ADVISORS_ARE_AI}</p>
          </footer>
        </div>
      </main>
    </div>
  );
}
