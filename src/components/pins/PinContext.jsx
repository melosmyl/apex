import React, { createContext, useContext, useState, useCallback } from "react";
import PinDialog from "@/components/pins/PinDialog";

const PinContext = createContext(null);

// A safe no-op outside PinProvider (e.g. the anonymous free-meeting flow,
// which reuses MeetingResult/AdvisorResponseCard/ExecutiveDiscussion — all
// call usePin() — but sits outside CompanyLayout, where PinProvider
// normally lives) rather than returning null and crashing on destructure.
const NOOP_PIN_CONTEXT = { createPin: () => {} };

export function usePin() {
  return useContext(PinContext) || NOOP_PIN_CONTEXT;
}

export function PinProvider({ companyId, children }) {
  const [open, setOpen] = useState(false);
  const [pinData, setPinData] = useState(null);

  const createPin = useCallback((payload) => {
    setPinData(payload);
    setOpen(true);
  }, []);

  return (
    <PinContext.Provider value={{ createPin }}>
      {children}
      <PinDialog open={open} onOpenChange={setOpen} companyId={companyId} pinData={pinData} onSaved={null} />
    </PinContext.Provider>
  );
}