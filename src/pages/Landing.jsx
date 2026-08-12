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

// Dark sections are a fixed page-level treatment, independent of the app's
// own light/dark theme (which this page otherwise never toggles) — applied
// via inline style rather than the `.dark` token scope so --brand stays the
// same deep indigo everywhere on the page, per the revision brief's "indigo
// with cream text" CTA rule holding on both cream and dark sections alike.
const DARK_SECTION = { background: "hsl(220 8% 7%)", color: "hsl(40 10% 92%)" };

// Fine film grain over the whole page — texture without content, so the
// cream sections stop reading as a flat solid field. An inline SVG noise
// filter rather than a photograph: zero network requests, a few hundred
// bytes total, and it reads identically over both cream and dark sections
// since it's a blend mode, not a background image tied to one palette.
const GRAIN_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`;
const GRAIN_STYLE = {
  backgroundImage: `url("data:image/svg+xml,${GRAIN_SVG.replace(/#/g, "%23")}")`,
  backgroundRepeat: "repeat",
  backgroundSize: "180px 180px",
  opacity: 0.05,
  mixBlendMode: "overlay",
};

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
  return <p className="font-mono text-[11px] sm:text-xs tracking-[0.25em] uppercase opacity-55">{children}</p>;
}

function Section({ children, className = "", dark = false }) {
  return (
    <section className={`px-5 sm:px-8 ${className}`} style={dark ? DARK_SECTION : undefined}>
      {children}
    </section>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* 1. Hero — cream */}
      <Section className="pt-16 sm:pt-24 pb-16 sm:pb-24">
        <div className="max-w-5xl mx-auto text-center rise-in">
          <Kicker>{PRODUCT_NAME}</Kicker>
          <h1 className="font-display text-[2.75rem] leading-[1.05] sm:text-7xl sm:leading-[0.98] lg:text-8xl lg:leading-[0.95] mt-5 mb-6 text-balance">
            Nobody told you either.
          </h1>
          <p className="text-lg sm:text-xl lg:text-2xl leading-relaxed text-foreground/75 mb-10 text-balance max-w-2xl mx-auto">
            A board of advisors who argue about your business.{" "}
            <br className="hidden sm:block" />
            Not one confident answer. Five people who disagree.
          </p>
          <Button asChild variant="brand" size="lg" className="rounded-full px-8 h-12 text-base font-mono tracking-wide uppercase">
            <Link to="/board">Sit in on one <ArrowRight className="w-4 h-4 ml-1.5" /></Link>
          </Button>
        </div>
      </Section>

      {/* 2. The room — full-bleed photograph, the page's only photographic dark moment */}
      <div className="w-full">
        <img
          src={roomImage}
          alt=""
          role="presentation"
          loading="lazy"
          className="w-full h-[46vh] sm:h-[62vh] object-cover"
        />
      </div>

      {/* 3. The differentiator — dark */}
      <Section dark className="py-20 sm:py-28">
        <div className="max-w-xl mx-auto text-center">
          <h2 className="font-display text-4xl sm:text-5xl leading-tight mb-6 text-balance">
            AI that disagrees with you.
          </h2>
          <p className="text-lg sm:text-xl leading-relaxed opacity-85 text-balance">
            Everything else tells you your idea is great.{" "}
            <br className="hidden sm:block" />
            Your board tells you when it isn't.
          </p>
        </div>
      </Section>

      {/* 4. A real transcript — cream, the only evidence on the page */}
      <Section className="py-16 sm:py-20">
        <div className="max-w-2xl mx-auto">
          <LandingTranscript token={FEATURED_MEETING_TOKEN} />
        </div>
      </Section>

      {/* 5. Who this is for / not for — dark */}
      <Section dark className="py-16 sm:py-24">
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
                  <li key={i} className="flex gap-3 text-[15px] sm:text-base leading-relaxed opacity-75">
                    <span className="shrink-0">—</span>{line}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </Section>

      {/* 6. Founder note — cream */}
      <Section className="py-16 sm:py-20">
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
                <p className="font-display text-xl sm:text-2xl italic leading-snug mt-4 mb-4 text-balance">
                  {FOUNDER_NOTE}
                </p>
                <p className="text-sm text-foreground/75 leading-relaxed">— Melody, founder</p>
              </>
            ) : (
              <p className="text-sm text-foreground/75 italic leading-relaxed mt-4 border border-dashed border-border rounded-lg px-4 py-3">
                Founder note pending — drop real copy into FOUNDER_NOTE in Landing.jsx.
              </p>
            )}
          </div>
        </div>
      </Section>

      {/* 7. Close — dark, ends the page on the same beat it opened a moment on */}
      <Section dark className="py-20 sm:py-28">
        <div className="max-w-xl mx-auto text-center">
          <h2 className="font-display text-4xl sm:text-5xl leading-tight mb-6 text-balance">
            Take a seat.
          </h2>
          <p className="text-lg sm:text-xl leading-relaxed opacity-85 mb-10 text-balance">
            Real boards cost £50,000 a year.{" "}
            <br className="hidden sm:block" />
            Yours starts free, tonight.
          </p>
          <Button asChild variant="brand" size="lg" className="rounded-full px-8 h-12 text-base font-mono tracking-wide uppercase">
            <Link to="/board">Take a seat <ArrowRight className="w-4 h-4 ml-1.5" /></Link>
          </Button>
        </div>

        <footer className="flex items-center justify-center gap-4 mt-16 pt-8 border-t border-white/10">
          <Link to="/privacy" className="text-xs opacity-60 hover:opacity-100 transition-opacity">Privacy</Link>
          <Link to="/terms" className="text-xs opacity-60 hover:opacity-100 transition-opacity">Terms</Link>
        </footer>
      </Section>

      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-40" style={GRAIN_STYLE} />
    </div>
  );
}
