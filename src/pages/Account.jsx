import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, LogOut } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";

const NAME_MAX = 80;

// Your account: the name other people in your companies see, your email,
// and signing out. (Workstream S, S0.)
export default function Account() {
  const { user, logout, refreshUser } = useAuth();
  const [name, setName] = useState(user?.displayName ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setName(user?.displayName ?? ""); }, [user?.displayName]);

  if (user?.isAnonymous) {
    return (
      <div className="min-h-screen">
        <div className="max-w-2xl mx-auto px-5 sm:px-8 py-12 lg:py-16 space-y-6">
          <PageHeader eyebrow="Account" title="No account yet" description="You're using the free board meeting without an account. The free meeting ends with “Keep this board”, which asks for your email and keeps everything." />
          <div className="flex flex-wrap gap-2">
            <Link to="/board"><Button variant="secondaryOutline">Go to the free meeting</Button></Link>
          </div>
        </div>
      </div>
    );
  }

  const clean = name.trim().replace(/\s+/g, " ");
  const unchanged = clean === (user?.displayName ?? "");

  const save = async (e) => {
    e.preventDefault();
    setError("");
    if (!clean) { setError("Your name can't be empty."); return; }
    setSaving(true);
    try {
      await base44.auth.setDisplayName(clean);
      await refreshUser();
      toast({ title: "Name saved" });
    } catch {
      setError("That didn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-2xl mx-auto px-5 sm:px-8 py-12 lg:py-16">
        <Link to="/companies" className="flex items-center gap-1 text-muted-foreground hover:text-foreground text-sm mb-6 transition-colors w-fit">
          <ChevronLeft className="w-4 h-4" /> My companies
        </Link>
        <PageHeader eyebrow="Account" title="Your account" />

        <form onSubmit={save} className="bg-card rounded-2xl border-2 border-foreground shadow-[3px_3px_0_hsl(var(--foreground))] p-6 space-y-5 mb-8">
          <div>
            <Label htmlFor="account-name" className="mb-1.5 block">Your name</Label>
            <p id="account-name-hint" className="text-sm text-muted-foreground mb-2">What other people in your companies see next to what you add, and on invites you send.</p>
            <Input id="account-name" value={name} maxLength={NAME_MAX} autoComplete="name" aria-describedby="account-name-hint"
              placeholder="For example: Sam Hartley" onChange={(e) => setName(e.target.value)} />
            {error && <p role="alert" className="text-sm text-destructive mt-2">{error}</p>}
          </div>
          <div>
            <div className="text-sm font-medium mb-1">Email</div>
            <div className="text-muted-foreground break-all">{user?.email}</div>
          </div>
          <Button type="submit" variant="primary" disabled={saving || unchanged || !clean}>{saving ? "Saving…" : "Save"}</Button>
        </form>

        <Button variant="secondaryOutline" onClick={() => logout(true)}><LogOut className="w-4 h-4 mr-1.5" /> Sign out</Button>
      </div>
    </div>
  );
}
