import React from "react";
import boardroomImage from "@/assets/boardroom/boardroom-bw.jpg";

// Pixel coordinates traced against the source image's native size
// (1672x941) — every path below is only valid for this exact photograph.
// The SVG overlay uses a matching viewBox so positions scale with the
// image at any render width instead of drifting off their chairs.
export const BOARDROOM_IMAGE_SIZE = { width: 1672, height: 941 };

// Nine usable seats: the three chairs at the head of the table (facing
// camera) plus the three nearest-to-centre on each side. The front-left
// and front-right chairs are cropped by the frame and are deliberately
// excluded — a half-chair lighting up reads as a bug, not a feature.
// Shape is a rounded rect over each chair's backrest, since in a very dark
// photograph the backrest is the only silhouette with enough legible mass
// to read as "lit" — tracing armrests/legs added noise, not clarity.
// Order here doubles as fill priority for advisor→seat assignment (see
// CHAIR_SEAT_ORDER below): centre/head seats fill before the outer ones.
export const CHAIRS = [
  { id: "far-2", cx: 828, cy: 495, w: 78, h: 64, rx: 14 },
  { id: "far-1", cx: 702, cy: 490, w: 88, h: 64, rx: 14 },
  { id: "far-3", cx: 955, cy: 490, w: 92, h: 64, rx: 14 },
  { id: "left-1", cx: 600, cy: 548, w: 104, h: 104, rx: 16 },
  { id: "right-1", cx: 1130, cy: 538, w: 104, h: 104, rx: 16 },
  { id: "left-2", cx: 495, cy: 538, w: 118, h: 114, rx: 18 },
  { id: "right-2", cx: 1235, cy: 528, w: 118, h: 114, rx: 18 },
  { id: "left-3", cx: 395, cy: 528, w: 128, h: 124, rx: 18 },
  { id: "right-3", cx: 1340, cy: 523, w: 128, h: 124, rx: 18 },
];

// Advisor→seat assignment fills in this order — centre-out, alternating
// sides — so 3 advisors land at the head of the table and 6 fan evenly
// down both sides, whatever the actual advisor count.
export const CHAIR_SEAT_ORDER = CHAIRS.map((c) => c.id);

// Name-tag anchor per chair — just outside the backrest, on the side that
// has clear dark wall/floor behind it rather than overlapping the table.
const TAG_ANCHOR = {
  "far-1": { x: 702, y: 452, align: "middle" },
  "far-2": { x: 828, y: 457, align: "middle" },
  "far-3": { x: 955, y: 452, align: "middle" },
  "left-1": { x: 600, y: 486, align: "middle" },
  "left-2": { x: 495, y: 471, align: "middle" },
  "left-3": { x: 395, y: 456, align: "middle" },
  "right-1": { x: 1130, y: 476, align: "middle" },
  "right-2": { x: 1235, y: 461, align: "middle" },
  "right-3": { x: 1340, y: 451, align: "middle" },
};

const CROSSFADE_MS = 550;

/**
 * activeChairId: id from CHAIRS currently holding the floor, or null.
 * chairLabels: { [chairId]: { name, role } } for every seated advisor —
 *   fixed for the whole meeting (seats don't change speaker), not just the
 *   currently active one. Passing the full map rather than a single label
 *   is what makes the crossfade a pure opacity transition: every chair's
 *   tag is a permanently-mounted element with fixed text, so a handover
 *   never has to swap text content mid-fade.
 *
 * Every chair (and every assigned chair's tag) stays mounted for the whole
 * life of the component — opacity is the only thing that ever changes.
 * That's deliberate: conditionally unmounting an element the instant its
 * target opacity reaches 0 (the previous version's bug) cuts the CSS
 * transition off mid-flight instead of letting it finish, which reads as
 * a jump/snap rather than a fade. Keeping every element mounted lets the
 * browser animate opacity all the way from 1 to 0 with nothing to
 * interrupt it, so the outgoing chair and incoming chair are both visible
 * and both genuinely animating for the full crossfade.
 */
export default function BoardroomBanner({
  activeChairId = null,
  chairLabels = {},
  // "screen" is the chosen default after comparing against lighten,
  // soft-light, multiply, overlay, and color-dodge on the real photo:
  // multiply/overlay disappear into the near-black image, color-dodge
  // blows out to a hot red-white blob and loses the orange hue, lighten
  // bands at the gradient's mid-stops. screen and soft-light both read as
  // genuine illumination; screen was picked for the cleaner, less muted
  // glow.
  blendMode = "screen",
  className = "",
}) {
  const { width, height } = BOARDROOM_IMAGE_SIZE;

  return (
    <div className={`relative w-full overflow-hidden bg-black ${className}`}>
      <img
        src={boardroomImage}
        alt=""
        role="presentation"
        className="w-full h-full object-cover"
      />
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          {CHAIRS.map((c) => (
            <radialGradient key={c.id} id={`chair-glow-${c.id}`} cx="50%" cy="45%" r="65%">
              <stop offset="0%" stopColor="hsl(var(--brand))" stopOpacity="1" />
              <stop offset="55%" stopColor="hsl(var(--brand))" stopOpacity="0.75" />
              <stop offset="100%" stopColor="hsl(var(--brand))" stopOpacity="0" />
            </radialGradient>
          ))}
        </defs>
        {CHAIRS.map((c) => {
          const opacity = c.id === activeChairId ? 1 : 0;
          return (
            <rect
              key={c.id}
              x={c.cx - c.w * 0.7}
              y={c.cy - c.h * 0.7}
              width={c.w * 1.4}
              height={c.h * 1.4}
              fill={`url(#chair-glow-${c.id})`}
              // Below sm: the room stays a static, unlit photograph — narrow
              // viewports can't reliably show a lit chair at legible size,
              // so the name tag alone carries who's speaking (agreed call,
              // see AdvisorSelectionRow's sibling banner usage in BoardDebate).
              className="max-sm:!opacity-0"
              style={{
                mixBlendMode: blendMode,
                opacity,
                transition: `opacity ${CROSSFADE_MS}ms ease`,
              }}
            />
          );
        })}

        {CHAIRS.filter((c) => chairLabels[c.id]).map((c) => {
          const label = chairLabels[c.id];
          const opacity = c.id === activeChairId ? 0.92 : 0;
          return (
            <text
              key={c.id}
              x={TAG_ANCHOR[c.id].x}
              y={TAG_ANCHOR[c.id].y}
              textAnchor={TAG_ANCHOR[c.id].align}
              fontFamily="var(--font-mono)"
              fontSize="15"
              letterSpacing="1.5"
              fill="hsl(40 20% 92%)"
              style={{
                textTransform: "uppercase",
                opacity,
                transition: `opacity ${CROSSFADE_MS}ms ease`,
              }}
            >
              {label.name}
              {label.role ? (
                <tspan fill="hsl(40 20% 92%)" opacity="0.6" fontSize="11">
                  {"  ·  " + label.role}
                </tspan>
              ) : null}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
