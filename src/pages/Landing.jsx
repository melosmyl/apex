import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PRODUCT_NAME } from "@/lib/branding";
import LandingTranscript from "@/components/landing/LandingTranscript";
import roomImage from "@/assets/landing/room.jpg";
import founderDeskImage from "@/assets/landing/founder-desk.jpg";

// Swap in the real board meeting's share token here — see /share/meeting/:token.
// Until it's set, section 4 shows an honest "in session" placeholder rather
// than a mockup or illustrative copy.
const FEATURED_MEETING_TOKEN = "";

// The founder note is written by the founder, not drafted here — this is a
// visible placeholder, not a stand-in quote, until real copy is dropped in.
const FOUNDER_NOTE = "";

const FOR_YOU = [
  "You're leaving a long career to build something of your own",
  "You want a second opinion that isn't just agreement",
  "You'd rather hear the hard truth now than find out later",
  "You're working this out part-time, around everything else",
];

const NOT_FOR_YOU = [
  "You want a co-founder who'll always agree with you",
  "You're already deep in fundraising and need investor-speak",
  "You want one definitive answer with no debate attached",
  "You're after a project manager, not a sounding board",
];

function Kicker({ children }) {
  return <p className="font-mono text-[11px] sm:text-xs tracking-[0.25em] uppercase text-muted-foreground">{children}</p>;
}

function Section({ children, className = "" }) {
  return <section className={`px-5 sm:px-8 py-20 sm:py-28 ${className}`}>{children}</section>;
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* 1. Hero */}
      <Section className="pt-16 sm:pt-24 pb-16 sm:pb-24">
        <div className="max-w-xl mx-auto text-center rise-in">
          <Kicker>{PRODUCT_NAME}</Kicker>
          <h1 className="font-landing text-[2.75rem] leading-[1.05] sm:text-6xl sm:leading-[1.05] mt-5 mb-6 text-balance">
            Nobody told you either.
          </h1>
          <p className="text-lg sm:text-xl leading-relaxed text-muted-foreground mb-10 text-balance">
            A board of advisors who argue about your business.{" "}
            <br className="hidden sm:block" />
            Not one confident answer. Five people who disagree.
          </p>
          <Button asChild variant="brand" size="lg" className="rounded-full px-8 h-12 text-base font-mono tracking-wide uppercase">
            <Link to="/board">Sit in on one <ArrowRight className="w-4 h-4 ml-1.5" /></Link>
          </Button>
        </div>
      </Section>

      {/* 2. The room — atmosphere, not argument */}
      <div className="w-full">
        <img
          src={roomImage}
          alt=""
          role="presentation"
          loading="lazy"
          className="w-full h-[46vh] sm:h-[62vh] object-cover"
        />
      </div>

      {/* 3. The differentiator */}
      <Section>
        <div className="max-w-xl mx-auto text-center">
          <h2 className="font-landing text-4xl sm:text-5xl leading-tight mb-6 text-balance">
            AI that disagrees with you.
          </h2>
          <p className="text-lg sm:text-xl leading-relaxed text-muted-foreground text-balance">
            Everything else tells you your idea is great.{" "}
            <br className="hidden sm:block" />
            Your board tells you when it isn't.
          </p>
        </div>
      </Section>

      {/* 4. A real transcript — the only evidence on the page */}
      <Section className="bg-card/30">
        <div className="max-w-2xl mx-auto">
          <LandingTranscript token={FEATURED_MEETING_TOKEN} />
        </div>
      </Section>

      {/* 5. Who this is for / not for */}
      <Section>
        <div className="max-w-3xl mx-auto">
          <div className="grid sm:grid-cols-2 gap-8 sm:gap-6">
            <div>
              <Kicker>This is for you if</Kicker>
              <ul className="mt-5 space-y-4">
                {FOR_YOU.map((line, i) => (
                  <li key={i} className="flex gap-3 text-[15px] sm:text-base leading-relaxed">
                    <span className="text-brand shrink-0">—</span>{line}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <Kicker>Not for you if</Kicker>
              <ul className="mt-5 space-y-4">
                {NOT_FOR_YOU.map((line, i) => (
                  <li key={i} className="flex gap-3 text-[15px] sm:text-base leading-relaxed text-muted-foreground">
                    <span className="shrink-0">—</span>{line}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </Section>

      {/* 6. Founder note */}
      <Section className="bg-card/30">
        <div className="max-w-2xl mx-auto grid sm:grid-cols-[minmax(0,220px)_1fr] gap-8 sm:gap-10 items-center">
          <img
            src={founderDeskImage}
            alt=""
            role="presentation"
            loading="lazy"
            className="w-full max-w-[220px] mx-auto sm:max-w-none aspect-[3/4] object-cover rounded-2xl shadow-card"
          />
          <div>
            <Kicker>Why I built this</Kicker>
            {FOUNDER_NOTE ? (
              <>
                <p className="font-landing text-xl sm:text-2xl italic leading-snug mt-4 mb-4 text-balance">
                  {FOUNDER_NOTE}
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed">— Melody, founder</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground italic leading-relaxed mt-4 border border-dashed border-border rounded-lg px-4 py-3">
                Founder note pending — drop real copy into FOUNDER_NOTE in Landing.jsx.
              </p>
            )}
          </div>
        </div>
      </Section>

      {/* 7. Close */}
      <Section className="pb-24 sm:pb-32">
        <div className="max-w-xl mx-auto text-center">
          <h2 className="font-landing text-4xl sm:text-5xl leading-tight mb-6 text-balance">
            Take a seat.
          </h2>
          <p className="text-lg sm:text-xl leading-relaxed text-muted-foreground mb-10 text-balance">
            Real boards cost £50,000 a year.{" "}
            <br className="hidden sm:block" />
            Yours starts free, tonight.
          </p>
          <Button asChild variant="brand" size="lg" className="rounded-full px-8 h-12 text-base font-mono tracking-wide uppercase">
            <Link to="/board">Take a seat <ArrowRight className="w-4 h-4 ml-1.5" /></Link>
          </Button>
        </div>
      </Section>

      <footer className="flex items-center justify-center gap-4 pb-10">
        <Link to="/privacy" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Privacy</Link>
        <Link to="/terms" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Terms</Link>
      </footer>
    </div>
  );
}
