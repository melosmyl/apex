import React, { useEffect, useState } from "react";
import { supabase } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";
import { Download, Trash2 } from "lucide-react";

// Your data (owner, 22 October 2026, D3): a copy of everything, and deleting
// the whole account at once after typing a phrase. The server (myData) does
// the work and only ever touches the signed-in founder's own data.

const DELETE_PHRASE = "delete my account";
// Daily backups keep a copy this long after deletion (Supabase Pro plan;
// supabase/functions/_shared/myData.ts BACKUP_DAYS says the same).
const BACKUP_DAYS = 7;

async function callMyData(body) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/myData`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new Error(payload?.error || "Something went wrong. Try again in a moment.");
  }
  return res;
}

export default function YourData() {
  const [anonymous, setAnonymous] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAnonymous(!data?.user || !!data.user.is_anonymous)).catch(() => setAnonymous(true));
  }, []);
  if (anonymous) return null;

  const download = async () => {
    setExporting(true);
    try {
      const res = await callMyData({ action: "export" });
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "")?.[1] || "just-ask-the-room.zip";
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), { href: url, download: name });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      toast({ title: "Your copy wasn't made", description: e.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const ready = typed.trim().toLowerCase() === DELETE_PHRASE;
  const remove = async () => {
    if (!ready || deleting) return;
    setDeleting(true);
    try {
      await callMyData({ action: "delete_account", confirm: typed });
      // Signed out when they close this: signing out at once takes the app
      // to the login page before they've read that it's done.
      setDeleted(true);
    } catch (e) {
      toast({ title: "Your account wasn't deleted", description: e.message, variant: "destructive" });
      setDeleting(false);
    }
  };

  const leave = async () => {
    await supabase.auth.signOut().catch(() => {});
    window.location.href = "/";
  };

  return (
    <section aria-labelledby="your-data" className="bg-card border border-border/70 rounded-2xl p-6">
      <h3 id="your-data" className="font-display text-lg mb-1">Your data</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Everything you've put into Just Ask The Room, and everything your board has written for you, is yours.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={download} disabled={exporting}>
          <Download className="w-4 h-4 mr-1.5" /> {exporting ? "Preparing your copy…" : "Download all my data"}
        </Button>
        <Button variant="destructive" onClick={() => { setTyped(""); setOpen(true); }}>
          <Trash2 className="w-4 h-4 mr-1.5" /> Delete my account
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mt-3">The download is one zip file: a data file with every record, plus your stored documents.</p>

      <Dialog open={open} onOpenChange={(o) => { if (deleted) leave(); else if (!deleting) setOpen(o); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="font-display text-2xl font-light">{deleted ? "Account deleted" : "Delete your account"}</DialogTitle></DialogHeader>
          {deleted ? (
            <div className="space-y-3 text-sm">
              <p>Your account is deleted. Our backups keep a copy for up to {BACKUP_DAYS} days, then it's gone.</p>
              <div className="flex justify-end pt-1"><Button onClick={leave}>Close</Button></div>
            </div>
          ) : (
          <div className="space-y-3 text-sm">
            <p>This deletes your account straight away: every company, meeting, decision, task, note, pin and document, and your sign-in. It can't be undone.</p>
            <p>Our daily backups keep a copy for up to {BACKUP_DAYS} days, then it's gone. We keep the cost of each AI call for our own accounts, with nothing that links it to you.</p>
            <p>If you want a copy first, download your data before you delete.</p>
            <label htmlFor="delete-confirm" className="block font-medium pt-1">Type <span className="font-mono">{DELETE_PHRASE}</span> to confirm</label>
            <Input id="delete-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" disabled={deleting} />
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={deleting}>Cancel</Button>
              <Button variant="destructive" onClick={remove} disabled={!ready || deleting}>{deleting ? "Deleting…" : "Delete my account"}</Button>
            </div>
          </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
