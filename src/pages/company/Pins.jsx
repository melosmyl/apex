import React, { useEffect, useState, useMemo } from "react";
import { useParams, useOutletContext, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Pin, Search, LayoutGrid, List, ChevronDown, ChevronRight, AlertTriangle, Sparkles, Loader2, Pin as PinIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import PinCard from "@/components/pins/PinCard";
import PinDialog from "@/components/pins/PinDialog";
import { PIN_CATEGORIES, IMPORTANCE_LEVELS, SOURCE_TYPE_LABELS, convertPinToTask, deletePin } from "@/lib/pins";

const CATEGORY_SECTIONS = ["Strategy", "Product", "Marketing", "Creative", "Finance", "Operations", "Legal and Compliance", "Risk", "Ideas and Opportunities", "Decisions"];

export default function Pins() {
  const { companyId } = useParams();
  const { company } = useOutletContext();
  const navigate = useNavigate();
  const [pins, setPins] = useState(null);
  const [advisors, setAdvisors] = useState([]);
  const [search, setSearch] = useState("");
  const [view, setView] = useState("grid");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterTheme, setFilterTheme] = useState("all");
  const [filterImportance, setFilterImportance] = useState("all");
  const [filterSource, setFilterSource] = useState("all");
  const [filterStatus, setFilterStatus] = useState("active");
  const [expandedSections, setExpandedSections] = useState(() => new Set(CATEGORY_SECTIONS));
  const [expandedThemes, setExpandedThemes] = useState(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pinData, setPinData] = useState(null);
  const [editingPin, setEditingPin] = useState(null);
  const [aiSummarizing, setAiSummarizing] = useState(false);
  const [aiSummary, setAiSummary] = useState(null);

  const load = () => {
    base44.entities.Pin.filter({ company_id: companyId }, "-created_date", 500).then(setPins);
  };
  useEffect(() => {
    load();
    base44.entities.Advisor.filter({ company_id: companyId }, "-created_date", 100).then(setAdvisors);
  }, [companyId]);

  const advisorMap = useMemo(() => {
    const m = {};
    advisors.forEach((a) => (m[a.id] = a));
    return m;
  }, [advisors]);

  // Collect all themes
  const allThemes = useMemo(() => {
    const m = {};
    (pins || []).forEach((p) => {
      (p.themes || []).forEach((t) => {
        m[t] = (m[t] || 0) + 1;
      });
    });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([theme, count]) => ({ theme, count }));
  }, [pins]);

  // Filtered pins
  const filtered = useMemo(() => {
    if (!pins) return [];
    const q = search.toLowerCase().trim();
    return pins.filter((p) => {
      if (filterStatus !== "all" && p.status !== filterStatus) return false;
      if (filterCategory !== "all" && p.category !== filterCategory) return false;
      if (filterTheme !== "all" && !(p.themes || []).includes(filterTheme)) return false;
      if (filterImportance !== "all" && p.importance !== filterImportance) return false;
      if (filterSource !== "all" && p.source_type !== filterSource) return false;
      if (q) {
        const haystack = [p.pin_title, p.summary, p.selected_text, p.category, p.subcategory, (p.themes || []).join(" "), (p.tags || []).join(" "), p.source_title].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [pins, search, filterCategory, filterTheme, filterImportance, filterSource, filterStatus]);

  const pinnedToday = useMemo(() => {
    const today = new Date().toDateString();
    return (pins || []).filter((p) => p.created_date && new Date(p.created_date).toDateString() === today);
  }, [pins]);

  const criticalPins = useMemo(() => filtered.filter((p) => p.importance === "critical"), [filtered]);
  const unreviewedPins = useMemo(() => filtered.filter((p) => !p.last_opened_at), [filtered]);

  const byCategory = useMemo(() => {
    const m = {};
    filtered.forEach((p) => {
      const c = p.category || "Other";
      if (!m[c]) m[c] = [];
      m[c].push(p);
    });
    return m;
  }, [filtered]);

  const byTheme = useMemo(() => {
    const m = {};
    filtered.forEach((p) => {
      (p.themes || []).forEach((t) => {
        if (!m[t]) m[t] = [];
        if (!m[t].find((x) => x.id === p.id)) m[t].push(p);
      });
    });
    return m;
  }, [filtered]);

  const toggleSection = (key) => {
    setExpandedSections((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  };

  const toggleTheme = (key) => {
    setExpandedThemes((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  };

  const handleViewContext = (pin) => {
    base44.entities.Pin.update(pin.id, { last_opened_at: new Date().toISOString() }).catch(() => {});
    if (pin.source_url) {
      navigate(pin.source_url);
      return;
    }
    if (pin.source_type === "board_resolution" || pin.source_type === "executive_discussion" || pin.source_type === "advisor_perspective" || pin.source_type === "challenge_round" || pin.source_type === "meeting_summary") {
      if (pin.meeting_id) navigate(`/company/${companyId}/boardroom?meeting=${pin.meeting_id}`);
    } else if (pin.source_type === "document" || pin.source_type === "research_report") {
      if (pin.document_id) navigate(`/company/${companyId}/documents`);
    } else if (pin.source_type === "decision_memo") {
      if (pin.decision_id) navigate(`/company/${companyId}/decisions`);
    } else if (pin.source_type === "task") {
      navigate(`/company/${companyId}/tasks`);
    } else if (pin.source_type === "project_discussion") {
      navigate(`/company/${companyId}/projects`);
    }
  };

  const handleConvertToTask = async (pin) => {
    await convertPinToTask(pin, companyId);
    // Link the pin to the task
    await base44.entities.Pin.update(pin.id, { task_id: pin.task_id });
    load();
  };

  const handleArchive = async (pin) => {
    await base44.entities.Pin.update(pin.id, { status: "archived" });
    load();
  };

  const handleDelete = async (pin) => {
    await deletePin(pin.id);
    load();
  };

  const handleEdit = (pin) => {
    setEditingPin(pin);
    setPinData(null);
    setDialogOpen(true);
  };

  const handleMoveCategory = (pin) => {
    setEditingPin(pin);
    setPinData(null);
    setDialogOpen(true);
  };

  const generateAISummary = async () => {
    setAiSummarizing(true);
    setAiSummary(null);
    try {
      const pinData = filtered.slice(0, 50).map((p) => ({
        title: p.pin_title,
        summary: p.summary,
        category: p.category,
        themes: p.themes,
        type: p.pin_type,
        importance: p.importance,
      }));
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: `You are an executive intelligence assistant. Below are pins saved by a founder. Synthesize the key intelligence across these pins.

PINS:
${JSON.stringify(pinData, null, 2)}

Provide a structured executive summary covering:
1. Strongest recurring insights (with pin titles referenced)
2. Most common risks or warnings
3. Key themes that emerge
4. Any contradictions between pins
5. Recommended actions

Cite pin titles when referencing specific points. Do not invent conclusions not supported by the pins.`,
        response_json_schema: {
          type: "object",
          properties: {
            recurring_insights: { type: "array", items: { type: "string" } },
            top_risks: { type: "array", items: { type: "string" } },
            key_themes: { type: "array", items: { type: "string" } },
            contradictions: { type: "array", items: { type: "string" } },
            recommended_actions: { type: "array", items: { type: "string" } },
          },
          required: ["recurring_insights", "top_risks", "key_themes", "contradictions", "recommended_actions"],
        },
      });
      setAiSummary(res);
    } catch (e) {
      setAiSummary({ error: "Could not generate summary at this time." });
    } finally {
      setAiSummarizing(false);
    }
  };

  const hasActiveFilters = filterCategory !== "all" || filterTheme !== "all" || filterImportance !== "all" || filterSource !== "all" || search;

  return (
    <div>
      <PageHeader eyebrow="Company intelligence" title="Pins" description="The most valuable insights, warnings and ideas from your board, documents and conversations — kept with their context.">
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-secondary/60 rounded-lg p-0.5">
            <button onClick={() => setView("grid")} className={`p-1.5 rounded ${view === "grid" ? "bg-card shadow-sm" : "text-muted-foreground"}`}><LayoutGrid className="w-4 h-4" /></button>
            <button onClick={() => setView("list")} className={`p-1.5 rounded ${view === "list" ? "bg-card shadow-sm" : "text-muted-foreground"}`}><List className="w-4 h-4" /></button>
          </div>
          <Button variant="outline" onClick={generateAISummary} disabled={aiSummarizing || !filtered.length} className="rounded-full">
            {aiSummarizing ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
            AI Summary
          </Button>
        </div>
      </PageHeader>

      {/* Search & Filters */}
      <div className="flex flex-col gap-3 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search pins by text, meaning, theme, tag…" className="pl-9 rounded-full" />
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="h-8 rounded-full border border-input bg-background px-3 text-xs">
            <option value="all">All categories</option>
            {PIN_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filterTheme} onChange={(e) => setFilterTheme(e.target.value)} className="h-8 rounded-full border border-input bg-background px-3 text-xs">
            <option value="all">All themes</option>
            {allThemes.map((t) => <option key={t.theme} value={t.theme}>{t.theme} ({t.count})</option>)}
          </select>
          <select value={filterImportance} onChange={(e) => setFilterImportance(e.target.value)} className="h-8 rounded-full border border-input bg-background px-3 text-xs">
            <option value="all">All importance</option>
            {IMPORTANCE_LEVELS.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
          </select>
          <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)} className="h-8 rounded-full border border-input bg-background px-3 text-xs">
            <option value="all">All sources</option>
            {Object.entries(SOURCE_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="h-8 rounded-full border border-input bg-background px-3 text-xs">
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="all">All</option>
          </select>
        </div>
      </div>

      {/* AI Summary */}
      {aiSummary && !aiSummary.error && (
        <div className="mb-6 bg-card border border-border/70 rounded-2xl p-5 rise-in">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-primary" />
            <h3 className="font-display text-lg">Intelligence Summary</h3>
            <button onClick={() => setAiSummary(null)} className="ml-auto text-xs text-muted-foreground hover:text-foreground">Dismiss</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            {aiSummary.recurring_insights?.length > 0 && <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">Recurring Insights</p><ul className="space-y-1">{aiSummary.recurring_insights.map((s, i) => <li key={i} className="text-muted-foreground">• {s}</li>)}</ul></div>}
            {aiSummary.top_risks?.length > 0 && <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">Top Risks</p><ul className="space-y-1">{aiSummary.top_risks.map((s, i) => <li key={i} className="text-muted-foreground">• {s}</li>)}</ul></div>}
            {aiSummary.key_themes?.length > 0 && <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">Key Themes</p><ul className="space-y-1">{aiSummary.key_themes.map((s, i) => <li key={i} className="text-muted-foreground">• {s}</li>)}</ul></div>}
            {aiSummary.contradictions?.length > 0 && <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">Contradictions</p><ul className="space-y-1">{aiSummary.contradictions.map((s, i) => <li key={i} className="text-amber-700">• {s}</li>)}</ul></div>}
            {aiSummary.recommended_actions?.length > 0 && <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">Recommended Actions</p><ul className="space-y-1">{aiSummary.recommended_actions.map((s, i) => <li key={i} className="text-muted-foreground">• {s}</li>)}</ul></div>}
          </div>
        </div>
      )}
      {aiSummary?.error && <div className="mb-6 text-sm text-destructive">{aiSummary.error}</div>}

      {/* Loading */}
      {pins === null && <div className="h-40 rounded-2xl bg-secondary/60 animate-pulse" />}

      {/* Empty */}
      {pins !== null && pins.length === 0 && (
        <EmptyState
          icon={PinIcon}
          title="No pins yet"
          description="Select any text in your boardroom, documents or research and choose 'Pin this' to start building your company intelligence library."
        />
      )}

      {/* No filter results */}
      {pins !== null && pins.length > 0 && filtered.length === 0 && (
        <EmptyState icon={Search} title="No matching pins" description="Try adjusting your search or filters." />
      )}

      {/* Quick stats row */}
      {pins !== null && pins.length > 0 && !hasActiveFilters && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <div className="bg-card border border-border/70 rounded-2xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Pinned today</p>
            <p className="font-display text-2xl">{pinnedToday.length}</p>
          </div>
          <div className="bg-card border border-border/70 rounded-2xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Critical</p>
            <p className="font-display text-2xl text-red-600">{criticalPins.length}</p>
          </div>
          <div className="bg-card border border-border/70 rounded-2xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Unreviewed</p>
            <p className="font-display text-2xl">{unreviewedPins.length}</p>
          </div>
          <div className="bg-card border border-border/70 rounded-2xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Active themes</p>
            <p className="font-display text-2xl">{allThemes.length}</p>
          </div>
        </div>
      )}

      {/* Critical section */}
      {criticalPins.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <h2 className="font-display text-lg">Critical Pins</h2>
          </div>
          <div className={`grid gap-4 ${view === "grid" ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" : "grid-cols-1"}`}>
            {criticalPins.map((pin) => (
              <PinCard key={pin.id} pin={pin} advisor={pin.advisor_id ? advisorMap[pin.advisor_id] : null} onEdit={handleEdit} onViewContext={handleViewContext} onConvertToTask={handleConvertToTask} onArchive={handleArchive} onDelete={handleDelete} onMoveCategory={handleMoveCategory} />
            ))}
          </div>
        </div>
      )}

      {/* Theme grouping */}
      {!hasActiveFilters && allThemes.length > 0 && (
        <div className="mb-8">
          <h2 className="font-display text-lg mb-3">Themes</h2>
          <div className="space-y-2">
            {allThemes.slice(0, 8).map(({ theme, count }) => (
              <div key={theme} className="bg-card border border-border/70 rounded-xl overflow-hidden">
                <button onClick={() => toggleTheme(theme)} className="flex items-center justify-between w-full px-4 py-2.5 hover:bg-secondary/40 transition-colors">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {expandedThemes.has(theme) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    {theme}
                  </span>
                  <span className="text-xs text-muted-foreground">{count} pin{count > 1 ? "s" : ""}</span>
                </button>
                {expandedThemes.has(theme) && byTheme[theme] && (
                  <div className="px-4 pb-4 grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                    {byTheme[theme].map((pin) => (
                      <PinCard key={pin.id} pin={pin} advisor={pin.advisor_id ? advisorMap[pin.advisor_id] : null} onEdit={handleEdit} onViewContext={handleViewContext} onConvertToTask={handleConvertToTask} onArchive={handleArchive} onDelete={handleDelete} onMoveCategory={handleMoveCategory} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Category sections */}
      {filtered.length > 0 && (
        <div className="space-y-2">
          {CATEGORY_SECTIONS.filter((c) => byCategory[c]?.length > 0).map((cat) => (
            <div key={cat} className="bg-card border border-border/70 rounded-xl overflow-hidden">
              <button onClick={() => toggleSection(cat)} className="flex items-center justify-between w-full px-4 py-3 hover:bg-secondary/40 transition-colors">
                <span className="flex items-center gap-2 font-display text-base">
                  {expandedSections.has(cat) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  {cat}
                </span>
                <span className="text-xs text-muted-foreground">{byCategory[cat]?.length || 0}</span>
              </button>
              {expandedSections.has(cat) && byCategory[cat] && (
                <div className="px-4 pb-4 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {byCategory[cat].map((pin) => (
                    <PinCard key={pin.id} pin={pin} advisor={pin.advisor_id ? advisorMap[pin.advisor_id] : null} onEdit={handleEdit} onViewContext={handleViewContext} onConvertToTask={handleConvertToTask} onArchive={handleArchive} onDelete={handleDelete} onMoveCategory={handleMoveCategory} />
                  ))}
                </div>
              )}
            </div>
          ))}
          {/* Other / uncategorised */}
          {(() => {
            const others = filtered.filter((p) => !CATEGORY_SECTIONS.includes(p.category) && p.category !== "Other");
            const otherCat = byCategory["Other"];
            const combined = [...others, ...(otherCat || [])];
            if (combined.length === 0) return null;
            return (
              <div className="bg-card border border-border/70 rounded-xl overflow-hidden">
                <button onClick={() => toggleSection("Other")} className="flex items-center justify-between w-full px-4 py-3 hover:bg-secondary/40 transition-colors">
                  <span className="flex items-center gap-2 font-display text-base">
                    {expandedSections.has("Other") ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    Other
                  </span>
                  <span className="text-xs text-muted-foreground">{combined.length}</span>
                </button>
                {expandedSections.has("Other") && (
                  <div className="px-4 pb-4 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                    {combined.map((pin) => (
                      <PinCard key={pin.id} pin={pin} advisor={pin.advisor_id ? advisorMap[pin.advisor_id] : null} onEdit={handleEdit} onViewContext={handleViewContext} onConvertToTask={handleConvertToTask} onArchive={handleArchive} onDelete={handleDelete} onMoveCategory={handleMoveCategory} />
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      <PinDialog open={dialogOpen} onOpenChange={setDialogOpen} companyId={companyId} pinData={pinData} existingPin={editingPin} onSaved={load} />
    </div>
  );
}