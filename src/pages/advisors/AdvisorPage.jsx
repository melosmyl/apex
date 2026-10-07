import React from "react";
import { Link, useParams } from "react-router-dom";
import AdvisorsLayout from "@/pages/advisors/AdvisorsLayout";
import AdvisorProfile from "@/components/advisors/AdvisorProfile";
import { libraryAdvisorBySlug, profileFor } from "@/lib/advisorProfiles";

// Public page for one advisor (K4): /advisors/<slug>.
export default function AdvisorPage() {
  const { slug } = useParams();
  const lib = libraryAdvisorBySlug(slug);
  const back = { to: "/advisors", label: "All advisors" };
  if (!lib) {
    return (
      <AdvisorsLayout title="Advisor not found" back={back}>
        <h1 className="font-display text-3xl font-light mb-3">We couldn't find that advisor</h1>
        <p className="text-muted-foreground">They may have a new name. <Link to="/advisors" className="underline underline-offset-2">See the whole board</Link>.</p>
      </AdvisorsLayout>
    );
  }
  return (
    <AdvisorsLayout title={`${lib.name}, ${lib.role}`} back={back}>
      <AdvisorProfile profile={profileFor({ libraryKey: lib.key })} headingLevel="h1" />
    </AdvisorsLayout>
  );
}
