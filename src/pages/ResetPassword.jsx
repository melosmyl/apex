import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44, supabase } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";

export default function ResetPassword() {
  // The reset email's link goes through Supabase, which sends the browser
  // back here with a recovery session in the URL #hash (implicit flow), not
  // a ?token= — and the client signs the user in from it before
  // getSession() resolves. An expired or reused link arrives with #error=…
  // instead, and the client then keeps whatever session the browser already
  // had, so the error has to be checked first: otherwise a stale link would
  // show the form and change the password of whoever is signed in.
  const [linkState, setLinkState] = useState("checking"); // checking | valid | invalid
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search);
    if (params.get("error") || params.get("error_code")) {
      setLinkState("invalid");
      return;
    }
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setLinkState(data.session ? "valid" : "invalid");
    });
    return () => { cancelled = true; };
  }, []);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      await base44.auth.resetPassword({ newPassword });
      // Drop the recovery session so the login page means what it says and
      // a second click on the same email link finds nobody signed in.
      await base44.auth.logout("/login");
    } catch (err) {
      setError(err.message || "Failed to reset password");
    } finally {
      setLoading(false);
    }
  };

  if (linkState === "checking") return null;

  if (linkState === "invalid") {
    return (
      <AuthLayout
        title="Invalid reset link"
        subtitle="This password reset link is missing or invalid"
        footer={
          <Link to="/forgot-password" className="text-primary font-medium hover:underline">
            Request a new link
          </Link>
        }
      >
        <p className="text-sm text-foreground text-center">
          The link you used is incomplete, expired, or has already been used. Please request a new password reset email.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="New password"
      subtitle="Enter your new password below"
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">New Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              autoFocus
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <Button type="submit" variant="primary" className="w-full h-12" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Resetting...
            </>
          ) : (
            "Reset password"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
