// Off-duty photos: advisors away from the table. Shown in the landing page's
// "Off the clock" gallery and in the same section of their profiles, never
// as avatars. Files live in public/advisors/off/<slug>.jpg (420px wide, from
// the landing mock until the originals are imported). Captions are the
// owner's copy from the mock.
export const OFF_DUTY = [
  { slug: "eleanor-whitfield", caption: "Terms attached. Also, champagne." },
  { slug: "lena-fisher", caption: "Forages for mushrooms. No casualties so far." },
  { slug: "helena-vogt", caption: "Forecasts mountain weather. Alarmingly well." },
  { slug: "arthur-penrose", caption: "Walks the same three miles, in all weather." },
  { slug: "kai-nakamura", caption: "Builds kites that are faster than they should be." },
  { slug: "theo-lindqvist", caption: "Swims in cold sea water. Doesn't talk about it." },
  { slug: "rafael-duarte", caption: "Sails. Knows exactly what cargo he's passing." },
  { slug: "naomi-clarke", caption: "Choir on Wednesdays. Alto, reliably." },
];

const BY_SLUG = new Map(OFF_DUTY.map((o) => [o.slug, o]));

export function offDutyPhotoFor(slug) {
  const entry = slug && BY_SLUG.get(slug);
  return entry ? { src: `/advisors/off/${slug}.jpg`, caption: entry.caption } : null;
}
