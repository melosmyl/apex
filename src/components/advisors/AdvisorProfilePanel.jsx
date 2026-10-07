import React, { createContext, useCallback, useContext, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import AdvisorProfile from "@/components/advisors/AdvisorProfile";
import { profileFor } from "@/lib/advisorProfiles";

// The in-app profile panel (Workstream K4): opens over whatever page the
// founder is on, so a meeting is never interrupted. Any component can open
// it with useAdvisorProfile().open({ advisor | name, libraryKey, role }).
// Outside the provider (public pages) open() is null and callers render
// plain names.
const ProfileContext = createContext(null);

export function AdvisorProfileProvider({ children }) {
  const [request, setRequest] = useState(null);
  const open = useCallback((req) => setRequest(req), []);
  return (
    <ProfileContext.Provider value={open}>
      {children}
      <AdvisorProfileDialog
        open={!!request}
        onOpenChange={(o) => !o && setRequest(null)}
        profile={request ? profileFor(request) : null}
        actions={request?.actions || null}
      />
    </ProfileContext.Provider>
  );
}

export function useAdvisorProfile() {
  return { open: useContext(ProfileContext) };
}

export function AdvisorProfileDialog({ open, onOpenChange, profile, actions = null }) {
  if (!profile) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogTitle className="sr-only">{profile.name}</DialogTitle>
        <AdvisorProfile profile={profile} actions={actions} />
      </DialogContent>
    </Dialog>
  );
}

// Wraps an advisor's avatar and name so clicking either opens their profile.
// Renders the children unchanged where no panel exists (public pages).
export function ProfileTrigger({ name, libraryKey, advisor, role, className = "", children }) {
  const { open } = useAdvisorProfile();
  if (!open || !(name || advisor)) return children;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); open({ advisor, name, libraryKey, role }); }}
      className={`text-left rounded-md hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand ${className}`}
      aria-label={`Open ${name || advisor?.name}'s profile`}
    >
      {children}
    </button>
  );
}
