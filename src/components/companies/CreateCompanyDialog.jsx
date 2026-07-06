import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const INDUSTRIES = ["Consumer Goods", "Technology", "Fashion & Apparel", "Food & Beverage", "Health & Wellness", "Financial Services", "Media", "Manufacturing", "Services", "Other"];

export default function CreateCompanyDialog({ open, onOpenChange, onCreated }) {
  const [form, setForm] = useState({ name: "", industry: INDUSTRIES[0], description: "", tagline: "" });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const company = await base44.entities.Company.create({
      ...form,
      priorities: [],
      metrics: [],
      advisor_ids: [],
    });
    setSaving(false);
    onOpenChange(false);
    setForm({ name: "", industry: INDUSTRIES[0], description: "", tagline: "" });
    onCreated?.(company);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-light">Establish a new company</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label className="mb-1.5 block">Company name</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Lumen & Co." autoFocus />
          </div>
          <div>
            <Label className="mb-1.5 block">Industry</Label>
            <select value={form.industry} onChange={(e) => set("industry", e.target.value)} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
              {INDUSTRIES.map((i) => <option key={i}>{i}</option>)}
            </select>
          </div>
          <div>
            <Label className="mb-1.5 block">One-line description</Label>
            <Input value={form.tagline} onChange={(e) => set("tagline", e.target.value)} placeholder="What the company does, in a sentence" />
          </div>
          <div>
            <Label className="mb-1.5 block">Context for your advisors</Label>
            <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Stage, goals, current challenges — anything your executive team should know." rows={4} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={submit} disabled={saving || !form.name.trim()}>{saving ? "Creating…" : "Create company"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}