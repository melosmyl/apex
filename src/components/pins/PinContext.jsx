import React, { createContext, useContext, useState, useCallback } from "react";
import PinDialog from "@/components/pins/PinDialog";

const PinContext = createContext(null);

export function usePin() {
  return useContext(PinContext);
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