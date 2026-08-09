import React, { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { supabase } from "@/api/base44Client";

// Surfaces provider_health_alerts (populated every 15 min by a Postgres cron
// job, see 20260809180000_provider_health_alerts.sql) app-wide, on every
// authenticated page. Born from a real incident: Anthropic ran out of
// credits for hours and nothing surfaced it, because every advisor call has
// a configured fallback — the product kept working, just silently on the
// wrong model. Dismissing here only clears it locally for this session; the
// underlying row reopens on the next scan if the condition is still true.
export default function ProviderHealthBanner() {
  const [alerts, setAlerts] = useState([]);
  const [dismissedIds, setDismissedIds] = useState(() => new Set());

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase.from("provider_health_alerts").select("*").eq("acknowledged", false).order("last_seen", { ascending: false });
      if (!cancelled) setAlerts(data || []);
    };
    load();
    const interval = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const acknowledge = async (alert) => {
    setDismissedIds((prev) => new Set(prev).add(alert.id));
    await supabase.from("provider_health_alerts").update({ acknowledged: true, acknowledged_at: new Date().toISOString() }).eq("id", alert.id);
  };

  const visible = alerts.filter((a) => !dismissedIds.has(a.id));
  if (!visible.length) return null;

  return (
    <div className="sticky top-0 z-50">
      {visible.map((a) => (
        <div key={a.id} className="bg-amber-100 border-b border-amber-300 px-4 py-2 flex items-center gap-3 text-sm text-amber-900">
          <AlertTriangle className="w-4 h-4 shrink-0" strokeWidth={1.5} />
          <span className="flex-1 min-w-0">{a.message}</span>
          <button onClick={() => acknowledge(a)} className="shrink-0 p-1 hover:bg-amber-200 rounded-md transition-colors" title="Acknowledge">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
