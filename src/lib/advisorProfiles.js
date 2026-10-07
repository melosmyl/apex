import { ADVISOR_LIBRARY, getAdvisorByKey } from "@/lib/advisorLibrary";
import { portraitFor } from "@/lib/portraits";
import { offDutyPhotoFor } from "@/lib/offDuty";

// What an advisor's profile shows (Workstream K4): the library character,
// with the board's own copy taking precedence where the founder has one
// (their name, role and bio as the board knows them). People and custom
// advisors have no library entry: just their own name, role and bio.
const BY_NAME = new Map(ADVISOR_LIBRARY.map((a) => [a.name.toLowerCase(), a]));
const BY_SLUG = new Map(ADVISOR_LIBRARY.map((a) => [a.portrait_slug, a]));

export function libraryAdvisorFor({ libraryKey, name } = {}) {
  return (libraryKey && getAdvisorByKey(libraryKey)) || (name && BY_NAME.get(String(name).trim().toLowerCase())) || null;
}

export function libraryAdvisorBySlug(slug) {
  return BY_SLUG.get(slug) || null;
}

export function profileFor({ advisor = null, libraryKey, name, role } = {}) {
  const lib = libraryAdvisorFor({ libraryKey: libraryKey || advisor?.library_key, name: name || advisor?.name });
  const pick = (field) => advisor?.[field] || lib?.[field] || null;
  return {
    key: lib?.key || null,
    slug: lib?.portrait_slug || null,
    name: advisor?.name || name || lib?.name || "",
    role: advisor?.role || role || lib?.role || "",
    bio: advisor?.biography || lib?.biography || "",
    voiceLine: pick("voice_line"),
    arguesFor: pick("argues_for"),
    offTheClock: [
      ["Book", pick("book")],
      ["Hobby", pick("hobby")],
      ["Favourite place", pick("favourite_place")],
      ["Mug", pick("mug")],
    ].filter(([, v]) => v),
    isPerson: advisor?.type === "human",
    portrait: portraitFor({ libraryKey: lib?.key, name: advisor?.name || name }),
    offDuty: offDutyPhotoFor(lib?.portrait_slug),
  };
}
