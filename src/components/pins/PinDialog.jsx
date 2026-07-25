import React, { useState, useEffect } from "react";
import { Pin, Loader2, Sparkles, Link2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PIN_CATEGORIES, PIN_TYPES, IMPORTANCE_LEVELS, analyzePin, createPin, updatePin, SOURCE_TYPE_LABELS } from "@/lib/pins";

export default function PinDialog({ open, onOpenChange, companyId, pinData, existingPin, onSaved }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(null);
  const [relatedPins, setRelatedPins] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    if (existingPin) {
      setForm({
        pin_title: existingPin.pin_title || "",
        summary: existingPin.summary || "",
        category: existingPin.category || "Other",
        subcategory: existingPin.subcategory || "",
        themes: existingPin.themes || [],
        tags: existingPin.tags || [],
        pin_type: existingPin.pin_type || "Insight",
        importance: existingPin.importance || "normal",
      });
      setRelatedPins([]);
    } else if (pinData) {
      setForm({
        pin_title: "",
        summary: "",
        category: "Other",
        subcategory: "",
        themes: [],
        tags: [],
        pin_type: "Insight",
        importance: "normal",
      });
      setRelatedPins([]);
      runAnalysis();
    }
  }, [open, existingPin, pinData]);

  const runAnalysis = async () => {
    if (!pinData?.selected_text) return;
    setAnalyzing(true);
    setError("");
    try {
      const result = await analyzePin({
        companyId,
        selectedText: pinData.selected_text,
        surroundingContext: pinData.surrounding_context,
        sourceType: pinData.source_type,
        sourceTitle: pinData.source_title,
      });
      setForm((f) => ({
        ...f,
        pin_title: result.pin_title || f.pin_title,
        summary: result.summary || f.summary,
        category: result.category || f.category,
        subcategory: result.subcategory || f.subcategory,
        themes: result.themes || f.themes,
        tags: result.tags || f.tags,
        pin_type: result.pin_type || f.pin_type,
        importance: result.importance || f.importance,
      }));
      setRelatedPins(result.related_pin_ids || []);
    } catch (e) {
      setError("Could not auto-analyse — you can fill in details manually.");
    } finally {
      setAnalyzing(false);
    }
  };

  const save = async () => {
    if (!form.pin_title.trim()) return;
    setSaving(true);
    setError("");
    try {
      if (existingPin) {
        await updatePin(existingPin.id, form);
      } else {
        await createPin({
          ...pinData,
          ...form,
          status: "active",
          created_by: "Founder",
          related_pin_ids: relatedPins,
        });
      }
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      setError(e.message || "Failed to save pin.");
    } finally {
      setSaving(false);
    }
  };

  if (!form) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-light flex items-center gap-2">
            <Pin className="w-5 h-5" /> {existingPin ? "Edit Pin" : "New Pin"}
          </DialogTitle>
        </DialogHeader>

        {/* Source */}
        {pinData && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/50 rounded-lg px-3 py-2">
            <Link2 className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{SOURCE_TYPE_LABELS[pinData.source_type] || pinData.source_type}{pinData.source_title ? ` · ${pinData.source_title}` : ""}</span>
          </div>
        )}

        {/* Selected text preview */}
        {pinData?.selected_text && (
          <div className="border-l-2 border-primary/40 pl-3 py-1 text-sm text-muted-foreground italic line-clamp-4">
            "{pinData.selected_text}"
          </div>
        )}

        {/* Related pins notice */}
        {relatedPins.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            This relates to {relatedPins.length} existing pin{relatedPins.length > 1 ? "s" : ""} in your library.
          </div>
        )}

        {analyzing && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-secondary/50 rounded-lg px-3 py-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <Sparkles className="w-3.5 h-3.5" />
            Analysing and classifying…
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="space-y-3.5 pt-1">
          <div>
            <Label className="mb-1.5 block text-xs">Title</Label>
            <Input value={form.pin_title} onChange={(e) => setForm((f) => ({ ...f, pin_title: e.target.value }))} disabled={analyzing} />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs">Summary</Label>
            <Textarea value={form.summary} onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))} rows={2} disabled={analyzing} className="text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block text-xs">Category</Label>
              <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} disabled={analyzing} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                {PIN_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">Subcategory</Label>
              <Input value={form.subcategory} onChange={(e) => setForm((f) => ({ ...f, subcategory: e.target.value }))} disabled={analyzing} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block text-xs">Pin Type</Label>
              <select value={form.pin_type} onChange={(e) => setForm((f) => ({ ...f, pin_type: e.target.value }))} disabled={analyzing} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                {PIN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <Label className="mb-1.5 block text-xs">Importance</Label>
              <select value={form.importance} onChange={(e) => setForm((f) => ({ ...f, importance: e.target.value }))} disabled={analyzing} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                {IMPORTANCE_LEVELS.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <Label className="mb-1.5 block text-xs">Themes (comma-separated)</Label>
            <Input value={form.themes.join(", ")} onChange={(e) => setForm((f) => ({ ...f, themes: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) }))} disabled={analyzing} placeholder="e.g. Customer Trust, Premium Positioning" />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs">Tags (comma-separated)</Label>
            <Input value={form.tags.join(", ")} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) }))} disabled={analyzing} />
          </div>
        </div>

        <div className="flex justify-between gap-2 pt-2">
          {!existingPin && (
            <Button variant="ghost" size="sm" onClick={runAnalysis} disabled={analyzing} className="text-xs">
              <Sparkles className="w-3.5 h-3.5 mr-1" /> Re-analyse
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !form.pin_title.trim()}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Pin className="w-4 h-4 mr-1" />}
              {existingPin ? "Save" : "Pin"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}