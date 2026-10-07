import React from "react";
import { initialsOf } from "@/lib/advisorLibrary";
import { ADVISORS_ARE_AI } from "@/lib/branding";

// One advisor's profile (Workstream K4): large portrait, name, role, voice
// line, what they argue for, their bio, and an "Off the clock" section.
// Used in the app's profile panel and on the public advisor pages.
// `actions` (Invite, Remove…) sit under the name, where a founder decides.
export default function AdvisorProfile({ profile, actions = null, headingLevel = "h2" }) {
  const Heading = headingLevel;
  return (
    <article className="grid gap-6 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
      <div className="min-w-0">
        {profile.portrait ? (
          <img
            src={profile.portrait.card}
            srcSet={`${profile.portrait.card} 400w, ${profile.portrait.full} 1024w`}
            sizes="(min-width: 640px) 220px, 100vw"
            alt={profile.name}
            className="w-full max-w-[320px] sm:max-w-none aspect-[4/5] object-cover rounded-xl bg-secondary"
          />
        ) : (
          <div
            className="w-full max-w-[320px] sm:max-w-none aspect-[4/5] rounded-xl flex items-center justify-center font-mono text-5xl"
            style={{ background: "hsl(220 8% 10%)", color: "hsl(40 20% 97%)" }}
            aria-hidden="true"
          >
            {initialsOf(profile.name)}
          </div>
        )}
      </div>

      <div className="min-w-0 space-y-5">
        <header>
          <Heading className="font-display text-3xl font-light leading-tight text-balance">{profile.name}</Heading>
          {profile.role && <p className="text-muted-foreground mt-1">{profile.role}</p>}
          {actions && <div className="mt-4 flex flex-wrap items-center gap-3">{actions}</div>}
        </header>

        {profile.voiceLine && (
          <blockquote className="font-display text-xl leading-snug border-l-2 border-brand pl-4 text-balance">
            “{profile.voiceLine}”
          </blockquote>
        )}

        {profile.arguesFor && (
          <section>
            <h3 className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1.5">What they argue for</h3>
            <p className="text-[15px] leading-relaxed">{profile.arguesFor}</p>
          </section>
        )}

        {profile.bio && <p className="text-[15px] leading-relaxed text-foreground/85">{profile.bio}</p>}

        {profile.offTheClock.length > 0 && (
          <section>
            <h3 className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">Off the clock</h3>
            <dl className="grid gap-2 text-sm">
              {profile.offTheClock.map(([label, value]) => (
                <div key={label} className="grid grid-cols-[110px_minmax(0,1fr)] gap-3">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {!profile.isPerson && (
          <p className="text-xs text-muted-foreground border-t border-border/60 pt-4 leading-relaxed">{ADVISORS_ARE_AI}</p>
        )}
      </div>
    </article>
  );
}
