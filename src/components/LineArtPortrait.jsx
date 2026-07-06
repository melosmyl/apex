import React from "react";

// Minimalist black-and-white line-art portraits — distinct "person" per advisor key.
// Solid black hair masses, white faces with black outlines, simple features.
const S = "#1a1a1a";
const W = 2.3;

const Shoulders = () => (
  <path d="M15 100 Q17 78 34 74 L66 74 Q83 78 85 100 Z" fill="#fff" stroke={S} strokeWidth={W} strokeLinejoin="round" />
);
const Neck = () => (
  <path d="M43 58 L43 74 Q50 77 57 74 L57 58" fill="#fff" stroke={S} strokeWidth={W} strokeLinejoin="round" />
);
const Head = () => (
  <ellipse cx="50" cy="41" rx="19" ry="22" fill="#fff" stroke={S} strokeWidth={W} />
);
const Ears = () => (
  <g fill="#fff" stroke={S} strokeWidth={W}>
    <ellipse cx="31" cy="44" rx="2.5" ry="3.5" />
    <ellipse cx="69" cy="44" rx="2.5" ry="3.5" />
  </g>
);
const EyesClosed = () => (
  <g stroke={S} strokeWidth={2} fill="none" strokeLinecap="round">
    <path d="M40 44 Q43 46 46 44" />
    <path d="M46 44.5 L47.2 46.6" />
    <path d="M54 44 Q57 46 60 44" />
    <path d="M54 44.5 L52.8 46.6" />
  </g>
);
const EyesOpen = () => (
  <g fill={S}>
    <circle cx="43" cy="44" r="1.8" />
    <circle cx="57" cy="44" r="1.8" />
  </g>
);
const Brows = () => (
  <g stroke={S} strokeWidth={1.8} fill="none" strokeLinecap="round">
    <path d="M39 40 L46 39" />
    <path d="M54 39 L61 40" />
  </g>
);
const Nose = () => (
  <path d="M50 47 L48.5 52 Q50 53.5 51.5 52" fill="none" stroke={S} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
);
const Smile = () => (
  <path d="M44 55 Q50 59 56 55" fill="none" stroke={S} strokeWidth={2} strokeLinecap="round" />
);
const Neutral = () => (
  <path d="M45 56 L55 56" fill="none" stroke={S} strokeWidth={2} strokeLinecap="round" />
);
const Glasses = () => (
  <g fill="none" stroke={S} strokeWidth={1.7}>
    <rect x="37" y="40" width="11" height="8" rx="3" />
    <rect x="52" y="40" width="11" height="8" rx="3" />
    <path d="M48 44 L52 44" />
  </g>
);
const Beard = () => (
  <path d="M33 50 Q34 66 50 67 Q66 66 67 50 Q60 56 50 56 Q40 56 33 50 Z" fill={S} />
);
const Mustache = () => (
  <path d="M43 53 Q47 50 50 53 Q53 50 57 53 Q54 55 50 55 Q46 55 43 53 Z" fill={S} />
);
const Earrings = () => (
  <g fill={S}>
    <circle cx="30" cy="50" r="1.5" />
    <circle cx="70" cy="50" r="1.5" />
  </g>
);

// Hair styles (solid black masses)
const ShortHair = () => (
  <path d="M31 38 Q30 16 50 15 Q70 16 69 38 Q59 29 50 29 Q41 29 31 38 Z" fill={S} />
);
const SidePartHair = () => (
  <>
    <path d="M31 38 Q30 16 50 15 Q70 16 69 38 Q59 29 50 29 Q41 29 31 38 Z" fill={S} />
    <path d="M53 16 L46 33" stroke="#fff" strokeWidth="1.4" fill="none" opacity="0.45" />
  </>
);
const LongHairBack = () => (
  <path d="M26 46 Q22 76 27 100 L73 100 Q78 76 74 46 Q74 26 60 20 Q50 15 40 20 Q26 26 26 46 Z" fill={S} />
);
const LongHairFront = () => (
  <path d="M32 38 Q33 21 50 19 Q67 21 68 38 Q58 29 50 29 Q42 29 32 38 Z" fill={S} />
);
const BobHair = () => (
  <path d="M28 42 Q26 60 31 68 L36 68 Q33 52 33 42 Q34 22 50 19 Q66 22 67 42 Q67 52 64 68 L69 68 Q74 60 72 42 Q72 20 50 16 Q28 20 28 42 Z" fill={S} />
);
const Ponytail = () => (
  <>
    <path d="M72 44 Q82 54 80 72 Q76 60 71 54 Z" fill={S} />
    <path d="M31 38 Q30 16 50 15 Q70 16 69 38 Q59 29 50 29 Q41 29 31 38 Z" fill={S} />
  </>
);
const BunHair = () => (
  <>
    <circle cx="50" cy="11" r="6" fill={S} />
    <path d="M31 38 Q30 16 50 15 Q70 16 69 38 Q59 29 50 29 Q41 29 31 38 Z" fill={S} />
  </>
);
const CurlyHair = () => (
  <path d="M29 34 Q26 20 36 17 Q40 9 49 13 Q58 9 62 17 Q72 20 71 34 Q67 27 62 29 Q59 22 53 26 Q50 19 46 26 Q40 22 38 29 Q33 27 29 34 Z" fill={S} />
);
const AfroHair = () => (
  <circle cx="50" cy="30" r="25" fill={S} />
);
const MessyHair = () => (
  <path d="M30 37 L34 17 L38 30 L44 14 L48 28 L52 14 L56 30 L62 17 L66 30 L70 37 Q60 28 50 28 Q40 28 30 37 Z" fill={S} />
);

const PORTRAITS = {
  visionary: () => (<><LongHairBack /><Shoulders /><Neck /><Head /><LongHairFront /><EyesClosed /><Nose /><Smile /></>),
  operator: () => (<><Shoulders /><Neck /><Head /><Ears /><ShortHair /><EyesOpen /><Nose /><Neutral /></>),
  creative_director: () => (<><BobHair /><Shoulders /><Neck /><Head /><EyesClosed /><Nose /><Smile /></>),
  marketing_director: () => (<><Shoulders /><Neck /><Head /><Ears /><Ponytail /><EyesOpen /><Nose /><Smile /></>),
  cfo: () => (<><Shoulders /><Neck /><Head /><Ears /><SidePartHair /><Brows /><EyesOpen /><Glasses /><Nose /><Neutral /></>),
  investor: () => (<><LongHairBack /><Shoulders /><Neck /><Head /><LongHairFront /><Earrings /><EyesClosed /><Nose /><Neutral /></>),
  product_strategist: () => (<><Shoulders /><Neck /><Head /><Ears /><ShortHair /><Beard /><EyesOpen /><Nose /></>),
  customer_advocate: () => (<><Shoulders /><Neck /><Head /><Ears /><CurlyHair /><EyesClosed /><Nose /><Smile /></>),
  legal_advisor: () => (<><Shoulders /><Neck /><Head /><Ears /><Beard /><EyesOpen /><Nose /></>),
  scientist: () => (<><Shoulders /><Neck /><Head /><Ears /><BunHair /><Brows /><EyesOpen /><Glasses /><Nose /><Neutral /></>),
  supply_chain: () => (<><Shoulders /><Neck /><Head /><Ears /><ShortHair /><Mustache /><EyesOpen /><Nose /></>),
  people_culture: () => (<><AfroHair /><Shoulders /><Neck /><Head /><EyesClosed /><Nose /><Smile /></>),
  innovation_director: () => (<><Shoulders /><Neck /><Head /><Ears /><MessyHair /><EyesOpen /><Nose /><Smile /></>),
  risk_analyst: () => (<><BobHair /><Shoulders /><Neck /><Head /><EyesClosed /><Glasses /><Nose /><Neutral /></>),
  capital_allocator: () => (<><Shoulders /><Neck /><Head /><Ears /><Brows /><EyesOpen /><Glasses /><Nose /><Neutral /></>)
};

export default function LineArtPortrait({ variant }) {
  const Render = PORTRAITS[variant] || PORTRAITS.operator;
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full block" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <Render />
    </svg>
  );
}