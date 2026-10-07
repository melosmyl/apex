import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/api/base44Client";
import AuthLayout from "@/components/AuthLayout";

// Where every sign-in email's link lands (/auth/confirm?token_hash=…&type=…):
// the link stays on justasktheroom.com instead of going through Supabase's
// own address, which mail providers read as a sender linking somewhere
// unrelated. The token is verified here, then the founder goes on: a
// password reset to its form, everything else into the app.
const DESTINATION = {
  email: "/", // sign-up confirmation and sign-in links
  invite: "/",
  email_change: "/", // a new address, or a free-meeting visitor keeping their board
  recovery: "/reset-password",
};

// Only a path on this site; never a link elsewhere.
function safeNext(next) {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : null;
}

export default function AuthConfirm() {
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);
  const started = useRef(false); // a token works once: never verify it twice

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get("token_hash");
    const type = params.get("type");
    if (!tokenHash || !DESTINATION[type]) { setFailed(true); return; }
    supabase.auth.verifyOtp({ token_hash: tokenHash, type }).then(({ error }) => {
      if (error) { setFailed(true); return; }
      navigate(safeNext(params.get("next")) || DESTINATION[type], { replace: true });
    });
  }, [navigate]);

  if (failed) {
    return (
      <AuthLayout title="This link has expired" subtitle="Links in our emails work once and expire after an hour.">
        <div className="space-y-3 text-sm">
          <p>
            Need a new one? <Link to="/forgot-password" className="underline underline-offset-2">Reset your password</Link>,{" "}
            <Link to="/login" className="underline underline-offset-2">sign in</Link>, or{" "}
            <Link to="/register" className="underline underline-offset-2">create an account</Link>.
          </p>
          <p className="text-muted-foreground">Still stuck? Write to hello@justasktheroom.com.</p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="One moment" subtitle="Confirming your link…">
      <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
    </AuthLayout>
  );
}
