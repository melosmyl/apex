import React, { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { supabase } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

// Surfaces provider_health_alerts (provider failures from the providerHealth
// function every 5 min, 20261015160000_provider_alerts.sql; spend alerts from
// check_free_meeting_spend) on the Admin page only:
// these are operational signals for the owner. Founder pages never show
// them, even to an admin; a founder whose meeting fails gets a plain message
// inside the meeting instead. Born from a real
// incident: Anthropic ran out of credits for hours and nothing surfaced it,
// because every advisor call has a configured fallback — the product kept
// working, just silently on the wrong model. Dismissing here only clears it
// locally for this session; the underlying row reopens on the next scan if
// the condition is still true.
export default function ProviderHealthBanner() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [dismissedIds, setDismissedIds] = useState(() => new Set());
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase.from("provider_health_alerts").select("*").eq("acknowledged", false).order("last_seen", { ascending: false });
      if (!cancelled) setAlerts(data || []);
    };
    load();
    const interval = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [isAdmin]);

  const acknowledge = async (alert) => {
    setDismissedIds((prev) => new Set(prev).add(alert.id));
    await supabase.from("provider_health_alerts").update({ acknowledged: true, acknowledged_at: new Date().toISOString() }).eq("id", alert.id);
  };

  const visible = alerts.filter((a) => !dismissedIds.has(a.id));
  if (!visible.length) return null;
  // Happening now (seen in the last hour) in red; older ones folded away, so
  // a live failure never hides among months of old alerts.
  const live = visible.filter((a) => Date.now() - new Date(a.last_seen).getTime() < 60 * 60_000);
  const old = visible.filter((a) => !live.includes(a));
  const when = (t) => new Date(t).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div>
      {live.map((a) => (
        <div key={a.id} role="alert" className="flex items-start gap-3 border-b border-red-300 bg-red-100 px-4 py-3 text-sm text-red-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
          <span className="min-w-0 flex-1">
            <b className="font-semibold">Happening now.</b> {a.message}
            <span className="mt-0.5 block text-xs text-red-800">Since {when(a.first_seen)} · last seen {when(a.last_seen)}{a.emailed_at ? ` · emailed ${when(a.emailed_at)}` : ""}</span>
          </span>
          <button onClick={() => acknowledge(a)} className="shrink-0 rounded-md p-1 transition-colors hover:bg-red-200" title="Acknowledge">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      {old.length > 0 && (
        <details className="border-b border-border bg-secondary px-4 py-2 text-sm text-muted-foreground">
          <summary className="cursor-pointer">Earlier alerts ({old.length}), not seen in the last hour</summary>
          <ul className="mt-2 space-y-1.5">
            {old.map((a) => (
              <li key={a.id} className="flex items-start gap-2">
                <span className="min-w-0 flex-1">{a.message} <span className="text-xs">(last seen {when(a.last_seen)})</span></span>
                <button onClick={() => acknowledge(a)} className="shrink-0 rounded-md p-1 hover:bg-accent" title="Acknowledge"><X className="h-3 w-3" /></button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
