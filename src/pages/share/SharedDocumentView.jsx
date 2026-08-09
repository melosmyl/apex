import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { Download, FileText } from "lucide-react";

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/getSharedDocument`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

function NotAvailable() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <p className="text-muted-foreground text-lg">This link is no longer available.</p>
    </div>
  );
}

export default function SharedDocumentView() {
  const { token } = useParams();
  const [state, setState] = useState("loading");
  const [doc, setDoc] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${FUNCTION_URL}?token=${encodeURIComponent(token)}`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } })
      .then((res) => res.ok ? res.json() : Promise.reject())
      .then((data) => { if (!cancelled) { setDoc(data); setState("ok"); } })
      .catch(() => { if (!cancelled) setState("unavailable"); });
    return () => { cancelled = true; };
  }, [token]);

  if (state === "loading") return <div className="min-h-screen" />;
  if (state === "unavailable") return <NotAvailable />;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-5 sm:px-8 py-12">
        <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
          {doc.company_name ? `From ${doc.company_name}` : "Shared document"} · {doc.document_type}
        </p>
        <h1 className="font-display text-2xl sm:text-3xl leading-snug mb-8">{doc.title}</h1>

        {doc.download_url && (
          <a href={doc.download_url} className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80 mb-8 rounded-full border border-border/70 px-4 py-2">
            <Download className="w-4 h-4" /> Download {doc.download_filename || "file"}
          </a>
        )}

        <div className="bg-card border border-border/70 rounded-2xl p-6 sm:p-8">
          {doc.content ? (
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown>{typeof doc.content === "string" ? doc.content : JSON.stringify(doc.content, null, 2)}</ReactMarkdown>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground text-sm"><FileText className="w-4 h-4" /> This document has no inline content — download it above.</div>
          )}
        </div>
      </div>
    </div>
  );
}
