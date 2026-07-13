import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import PageHeader from "@/components/PageHeader";
import AdvisorAvatar from "@/components/AdvisorAvatar";
import { Shield, Save, Activity, Settings, FlaskConical, Loader2, AlertCircle } from "lucide-react";

const PROVIDERS = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "mistral", label: "Mistral" },
];

export default function Admin() {
  const [advisors, setAdvisors] = useState(null);
  const [logs, setLogs] = useState(null);
  const [limits, setLimits] = useState(null);
  const [editing, setEditing] = useState({});
  const [saving, setSaving] = useState(null);
  const [testQ, setTestQ] = useState("");
  const [testId, setTestId] = useState(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState(null);

  const load = async () => {
    setError(null);
    try {
      const me = await base44.auth.me();
      if (me.role !== "admin") { setError("Admin access required."); return; }
      const [advRes, logRes, limRes] = await Promise.all([
        base44.functions.invoke("adminApi", { action: "list_advisors" }),
        base44.functions.invoke("adminApi", { action: "list_usage" }),
        base44.functions.invoke("adminApi", { action: "get_limits" }),
      ]);
      setAdvisors(advRes.data.advisors || []);
      setLogs(logRes.data.logs || []);
      setLimits(limRes.data.limits);
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    }
  };

  useEffect(() => { load(); }, []);

  const saveAdvisor = async (id) => {
    setSaving(id);
    try {
      await base44.functions.invoke("adminApi", { action: "update_advisor", advisor_id: id, ...editing[id] });
      await load();
    } catch (e) {
      setError(e?.response?.data?.error || e.message);
    } finally { setSaving(null); }
  };

  const updateField = (id, field, value) => {
    setEditing(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const runTest = async () => {
    if (!testId || !testQ.trim()) return;
    setTesting(true); setTestResult(null);
    try {
      const res = await base44.functions.invoke("testAdvisor", { advisor_id: testId, question: testQ });
      setTestResult(res.data);
    } catch (e) {
      setTestResult({ error: e?.response?.data?.error || e.message });
    } finally { setTesting(false); }
  };

  const saveLimits = async () => {
    setSaving("limits");
    try {
      await base44.functions.invoke("adminApi", { action: "update_limits", limits_id: limits?.id, ...limits });
      delete limits.id; delete limits.created_date; delete limits.updated_date;
      await load();
    } catch (e) { setError(e?.response?.data?.error || e.message); }
    finally { setSaving(null); }
  };

  if (error) return (
    <div className="max-w-4xl mx-auto px-5 py-16">
      <PageHeader eyebrow="System" title="Admin" />
      <div className="flex flex-col items-center text-center py-20">
        <AlertCircle className="w-10 h-10 text-destructive mb-4" />
        <p className="text-muted-foreground">{error}</p>
      </div>
    </div>
  );

  if (advisors === null) return (
    <div className="max-w-4xl mx-auto px-5 py-16">
      <div className="h-40 rounded-2xl bg-secondary/60 animate-pulse" />
    </div>
  );

  const totalCost = (logs || []).reduce((s, l) => s + (l.estimated_cost || 0), 0);
  const successCount = (logs || []).filter(l => l.status === "success").length;
  const errorCount = (logs || []).filter(l => l.status === "error").length;

  return (
    <div className="max-w-5xl mx-auto px-5 py-12">
      <PageHeader eyebrow="System Administration" title="AI Intelligence Console"
        description="Manage advisor model assignments, monitor usage, and configure system limits." />

      {/* Usage Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
        {[
          { label: "Total Requests", value: logs?.length || 0, icon: Activity },
          { label: "Success Rate", value: logs?.length ? `${Math.round(successCount / logs.length * 100)}%` : "—", icon: Activity },
          { label: "Errors", value: errorCount, icon: AlertCircle },
          { label: "Est. Cost", value: `£${totalCost.toFixed(4)}`, icon: Activity },
        ].map((s, i) => (
          <div key={i} className="bg-card border border-border/70 rounded-2xl p-4">
            <s.icon className="w-4 h-4 text-muted-foreground mb-2" />
            <div className="font-display text-2xl">{s.value}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Advisor Model Configuration */}
      <div className="mb-10">
        <div className="flex items-center gap-2 mb-4"><Shield className="w-5 h-5 text-primary" /><h3 className="font-display text-xl">Advisor Model Assignments</h3></div>
        <div className="space-y-3">
          {advisors.map(a => (
            <div key={a.id} className="bg-card border border-border/70 rounded-2xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <AdvisorAvatar name={a.name} accent={a.accent} size="sm" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{a.name}</span>
                    {a.is_premium && <Badge variant="secondary" className="text-[10px]">Premium</Badge>}
                    {!a.is_active && <Badge variant="outline" className="text-[10px] text-destructive">Inactive</Badge>}
                  </div>
                  <span className="text-xs text-muted-foreground">{a.role}</span>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
                <div>
                  <Label className="text-[10px] uppercase tracking-wider mb-1 block">Provider</Label>
                  <Select value={editing[a.id]?.default_provider ?? a.default_provider ?? "openai"} onValueChange={v => updateField(a.id, "default_provider", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{PROVIDERS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wider mb-1 block">Model</Label>
                  <Input className="h-8 text-xs" value={editing[a.id]?.default_model ?? a.default_model ?? ""} onChange={e => updateField(a.id, "default_model", e.target.value)} />
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wider mb-1 block">Fallback Provider</Label>
                  <Select value={editing[a.id]?.fallback_provider ?? a.fallback_provider ?? ""} onValueChange={v => updateField(a.id, "fallback_provider", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{PROVIDERS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wider mb-1 block">Fallback Model</Label>
                  <Input className="h-8 text-xs" value={editing[a.id]?.fallback_model ?? a.fallback_model ?? ""} onChange={e => updateField(a.id, "fallback_model", e.target.value)} />
                </div>
              </div>
              <div className="mt-2">
                <Label className="text-[10px] uppercase tracking-wider mb-1 block">System Instructions</Label>
                <Textarea className="text-xs" rows={2} value={editing[a.id]?.system_instructions ?? a.system_instructions ?? ""} onChange={e => updateField(a.id, "system_instructions", e.target.value)} />
              </div>
              <div className="flex justify-end mt-2">
                <Button size="sm" variant="outline" onClick={() => saveAdvisor(a.id)} disabled={saving === a.id}>
                  {saving === a.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Test Advisor */}
      <div className="mb-10">
        <div className="flex items-center gap-2 mb-4"><FlaskConical className="w-5 h-5 text-primary" /><h3 className="font-display text-xl">Test an Advisor</h3></div>
        <div className="bg-card border border-border/70 rounded-2xl p-4 space-y-3">
          <Select value={testId} onValueChange={setTestId}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Select an advisor…" /></SelectTrigger>
            <SelectContent>{advisors.map(a => <SelectItem key={a.id} value={a.id}>{a.name} ({a.role})</SelectItem>)}</SelectContent>
          </Select>
          <Input value={testQ} onChange={e => setTestQ(e.target.value)} placeholder="Ask a sample question…" />
          <Button onClick={runTest} disabled={!testId || !testQ.trim() || testing}>
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />} Run test
          </Button>
          {testResult && (
            <div className="bg-secondary/40 rounded-xl p-4 text-sm">
              {testResult.error ? (
                <p className="text-destructive">{testResult.error}</p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground mb-2">Provider: {testResult.provider_used} · Model: {testResult.model_used} · {testResult.latency_ms}ms</p>
                  <p className="font-medium mb-1">{testResult.response?.position}</p>
                  <p>{testResult.response?.recommendation}</p>
                  <p className="text-xs text-muted-foreground mt-2">Confidence: {testResult.response?.confidence_score}%</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* System Limits */}
      {limits && (
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4"><Settings className="w-5 h-5 text-primary" /><h3 className="font-display text-xl">System Limits</h3></div>
          <div className="bg-card border border-border/70 rounded-2xl p-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { key: "max_meetings_per_month", label: "Max meetings / month" },
              { key: "max_advisors_per_meeting", label: "Max advisors / meeting" },
              { key: "min_advisors_per_meeting", label: "Min advisors / meeting" },
              { key: "max_context_size", label: "Max context size (chars)" },
              { key: "max_output_length", label: "Max output length (tokens)" },
              { key: "request_timeout_ms", label: "Request timeout (ms)" },
              { key: "retry_count", label: "Retry count" },
            ].map(f => (
              <div key={f.key}>
                <Label className="text-[10px] uppercase tracking-wider mb-1 block">{f.label}</Label>
                <Input type="number" className="h-8 text-sm" value={limits[f.key] ?? ""} onChange={e => setLimits(prev => ({ ...prev, [f.key]: parseInt(e.target.value) || 0 }))} />
              </div>
            ))}
            <div className="sm:col-span-2 lg:col-span-3 flex justify-end">
              <Button onClick={saveLimits} disabled={saving === "limits"} className="rounded-full">
                {saving === "limits" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save limits
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Recent Usage Logs */}
      {logs?.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4"><Activity className="w-5 h-5 text-primary" /><h3 className="font-display text-xl">Recent Activity</h3></div>
          <div className="bg-card border border-border/70 rounded-2xl divide-y divide-border/50">
            {logs.slice(0, 20).map(l => (
              <div key={l.id} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                <Badge variant={l.status === "success" ? "secondary" : l.status === "error" ? "destructive" : "outline"} className="text-[10px]">{l.status}</Badge>
                <span className="font-medium">{l.provider}/{l.model}</span>
                <span className="text-muted-foreground">{l.request_type}</span>
                <span className="text-muted-foreground ml-auto">{l.latency_ms}ms · £{l.estimated_cost?.toFixed(4)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}