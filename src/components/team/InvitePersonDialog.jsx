import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Mail } from "lucide-react";

export default function InvitePersonDialog({ open, onOpenChange, onInvite }) {
  const [form, setForm] = useState({ name: "", role: "", email: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const valid = form.name.trim() && form.role.trim() && /\S+@\S+\.\S+/.test(form.email);

  const submit = async (e) => {
    e.preventDefault();
    if (!valid) return;
    setLoading(true);
    setError("");
    try {
      await onInvite(form);
      setForm({ name: "", role: "", email: "" });
      onOpenChange(false);
    } catch (err) {
      setError(err.message || "Could not send invitation. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-light">Invite a team member</DialogTitle>
          <p className="text-sm text-muted-foreground">Invite a real person to collaborate on your executive team. They'll receive an email to join.</p>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 pt-2">
          <div><Label className="mb-1.5 block">Full name</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Jane Smith" autoFocus /></div>
          <div><Label className="mb-1.5 block">Role</Label><Input value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} placeholder="Co-founder, CFO, Head of Growth…" /></div>
          <div><Label className="mb-1.5 block">Email</Label><Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="jane@company.com" /></div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={loading || !valid}>
              {loading ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Sending…</> : <><Mail className="w-4 h-4 mr-1.5" /> Send invite</>}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}