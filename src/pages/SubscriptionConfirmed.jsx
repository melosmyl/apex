import React from "react";
import { useSearchParams, Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SubscriptionConfirmed() {
  const [params] = useSearchParams();
  const companyId = params.get("company");
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="max-w-md text-center rise-in">
        <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-5">
          <CheckCircle2 className="w-8 h-8 text-emerald-600" strokeWidth={1.5} />
        </div>
        <h1 className="font-display text-3xl font-light mb-3">Payment received</h1>
        <p className="text-muted-foreground mb-8">
          Your new advisor is being activated. Return to your executive team — they'll be ready shortly.
        </p>
        {companyId ? (
          <Button asChild variant="primary" className="px-6"><Link to={`/company/${companyId}/team`}>Back to your team</Link></Button>
        ) : (
          <Button asChild variant="primary" className="px-6"><Link to="/">Go home</Link></Button>
        )}
      </div>
    </div>
  );
}