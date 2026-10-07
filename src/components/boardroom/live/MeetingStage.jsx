import React, { useId } from "react";
import boardroomImage from "@/assets/boardroom/boardroom-bw.jpg";
import { BOARDROOM_IMAGE_SIZE, CHAIRS, TAG_ANCHOR } from "@/components/boardroom/BoardroomBanner";
import { portraitFor } from "@/lib/portraits";
import { initialsOf } from "@/lib/advisorLibrary";

// The room from the meeting mock: the real boardroom photo, cropped wide,
// with every seated advisor in their chair and a lamp on whoever has the
// floor. Chair positions are the ones traced for this photo in
// BoardroomBanner.jsx; the SVG shares the photo's coordinates and crop, so
// everyone stays on their chair at any width.

const LAMP = "#E89B4A";
const CROSSFADE_MS = 550;
// Portrait size by distance from the camera: the head of the table is
// furthest away.
const RADIUS = { far: 34, "1": 42, "2": 46, "3": 52 };
const radiusFor = (chairId) => RADIUS[chairId.startsWith("far") ? "far" : chairId.split("-")[1]];

const STATE_TEXT = {
  chairing: "Chairing",
  speaking: "Speaking",
  thinking: "Thinking",
  spoke: "Spoke",
  up_next: "Up next",
  writing: "Writing",
  absent: "Couldn't answer",
  waiting: "",
};

export default function MeetingStage({ seats = [], litChairId = null, onOpen }) {
  const { width, height } = BOARDROOM_IMAGE_SIZE;
  // SVG ids are document-wide: prefix them so two stages never collide.
  const uid = useId().replace(/:/g, "");
  return (
    <section
      aria-label="The table"
      className="meeting-stage relative w-full overflow-hidden rounded-md border-2 border-foreground bg-black shadow-[4px_4px_0_hsl(var(--foreground))] aspect-[1530/554] max-w-full"
    >
      <img src={boardroomImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 to-transparent to-45%" />
      <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={`${uid}-beam`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={LAMP} stopOpacity="0" />
            <stop offset="45%" stopColor={LAMP} stopOpacity="0.28" />
            <stop offset="100%" stopColor={LAMP} stopOpacity="0" />
          </linearGradient>
          <radialGradient id={`${uid}-pool`}>
            <stop offset="0%" stopColor={LAMP} stopOpacity="0.6" />
            <stop offset="45%" stopColor={LAMP} stopOpacity="0.22" />
            <stop offset="100%" stopColor={LAMP} stopOpacity="0" />
          </radialGradient>
          <filter id={`${uid}-dim`}><feColorMatrix type="saturate" values="0.4" /></filter>
        </defs>

        {/* One lamp per chair, crossfading, so the light moves rather than jumps. */}
        {CHAIRS.map((c) => {
          const on = c.id === litChairId;
          return (
            <g key={`lamp-${c.id}`} style={{ opacity: on ? 1 : 0, transition: `opacity ${CROSSFADE_MS}ms ease`, mixBlendMode: "screen" }}>
              <polygon points={`${c.cx - 14},0 ${c.cx + 14},0 ${c.cx + 120},${c.cy} ${c.cx - 120},${c.cy}`} fill={`url(#${uid}-beam)`} />
              <ellipse cx={c.cx} cy={c.cy} rx={150} ry={95} fill={`url(#${uid}-pool)`} className="meeting-stage-pool" />
            </g>
          );
        })}

        {seats.map((s) => {
          const c = CHAIRS.find((ch) => ch.id === s.chairId);
          const tag = TAG_ANCHOR[s.chairId];
          if (!c || !tag) return null;
          const r = radiusFor(s.chairId) * (s.state === "speaking" ? 1.15 : 1);
          const cx = tag.x;
          const cy = tag.y - r - 8;
          const portrait = portraitFor({ libraryKey: s.libraryKey, name: s.name });
          const ring = s.state === "speaking" ? LAMP : s.isChair ? "hsl(var(--gold))" : "#FBF8F0";
          const dim = s.state === "thinking" || s.state === "absent" ? 0.75 : s.state === "spoke" || s.state === "up_next" ? 0.85 : 1;
          return (
            <g
              key={s.chairId}
              style={{ transition: `opacity ${CROSSFADE_MS}ms ease`, cursor: onOpen ? "pointer" : undefined }}
              onClick={onOpen ? () => onOpen(s) : undefined}
            >
              <title>{`${s.name}${STATE_TEXT[s.state] ? `, ${STATE_TEXT[s.state].toLowerCase()}` : ""}`}</title>
              <clipPath id={`${uid}-clip-${s.chairId}`}><circle cx={cx} cy={cy} r={r} /></clipPath>
              {s.state === "speaking" && <circle cx={cx} cy={cy} r={r + 10} fill={LAMP} opacity="0.35" />}
              <g opacity={dim} style={{ transition: `opacity ${CROSSFADE_MS}ms ease` }} filter={s.state === "thinking" ? `url(#${uid}-dim)` : undefined}>
                <circle cx={cx} cy={cy} r={r} fill="#2B0F18" />
                {portrait ? (
                  <image href={portrait.avatar2x} x={cx - r} y={cy - r} width={2 * r} height={2 * r} clipPath={`url(#${uid}-clip-${s.chairId})`} preserveAspectRatio="xMidYMid slice" />
                ) : (
                  <text x={cx} y={cy + r * 0.18} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={r * 0.55} fill="#F6F2E8">{initialsOf(s.name)}</text>
                )}
              </g>
              <circle cx={cx} cy={cy} r={r} fill="none" stroke={ring} strokeWidth={s.state === "speaking" ? 6 : 4} />
              <g className="meeting-stage-caption">
                <text x={cx} y={tag.y + 24} textAnchor="middle" fontFamily="var(--font-display)" fontSize="22" fill="#F6F2E8" stroke="rgba(0,0,0,0.75)" strokeWidth="4" paintOrder="stroke">
                  {s.shortName}
                </text>
                {STATE_TEXT[s.state] && (
                  <text x={cx} y={tag.y + 46} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="13" letterSpacing="2" fill={s.state === "speaking" ? "#F3C98B" : "#CBBFAE"} stroke="rgba(0,0,0,0.75)" strokeWidth="3" paintOrder="stroke" style={{ textTransform: "uppercase" }}>
                    {STATE_TEXT[s.state]}
                  </text>
                )}
              </g>
            </g>
          );
        })}
      </svg>
    </section>
  );
}
