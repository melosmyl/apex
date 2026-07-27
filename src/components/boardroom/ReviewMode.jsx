import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AdvisorAvatar from "@/components/AdvisorAvatar";
import { ArrowRight, RotateCcw, ClipboardCheck, FileText, ThumbsUp, ThumbsDown, AlertTriangle, HelpCircle, Lightbulb } from "lucide-react";
import { runReview, saveReviewMeeting } from "@/lib/meetingModes";
import { base44 } from "@/api/base44Client";

export default function ReviewMode({ company, companyId, advisors }) {
  const [documents, setDocuments] = useState([]);
  const [selectedDocId, setSelectedDocId] = useState(null);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteContent, setPasteContent] = useState("");
  const [selectedAdvisors, setSelectedAdvisors] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    base44.entities.Document.filter({ company_id: companyId }, "-created_date", 50).then(setDocuments).catch(() => {});
  }, [companyId]);

  const selectedDoc = documents.find((d) => d.id === selectedDocId);
  const docTitle = pasteMode ? pasteTitle : selectedDoc?.title;
  const docContent = pasteMode ? pasteContent : selectedDoc?.content;

  const toggleAdvisor = (a) => {
    setSelectedAdvisors((prev) => {
      if (prev.some((x) => x.id === a.id)) return prev.filter((x) => x.id !== a.id);
      if (prev.length >= 3) return prev;
      return [...prev, a];
    });
  };

  const run = async () => {
    if (!docContent?.trim() || selectedAdvisors.length === 0) return;
    setLoading(true);
    setError(null);
    setReviews([]);
    try {
      const results = [];
      for (const advisor of selectedAdvisors) {
        const res = await runReview({ company, documentTitle: docTitle || "Untitled", documentContent: docContent, advisor });
        results.push({ advisor, result: res });
        setReviews([...results]);
      }
      await saveReviewMeeting({ companyId, documentTitle: docTitle || "Untitled", advisor: selectedAdvisors[0], result: results[0].result });
    } catch (e) {
      setError(e.message || "Something went wrong during the review.");
    }
    setLoading(false);
  };

  if (reviews.length > 0) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="font-display text-xl">Review: {docTitle}</h2>
            <p className="text-xs text-muted-foreground mt-1">{selectedAdvisors.length} advisor{selectedAdvisors.length > 1 ? "s" : ""} reviewed this</p>
          </div>
          <Button variant="outline" className="rounded-full" onClick={() => { setReviews([]); }}>
            <RotateCcw className="w-4 h-4 mr-1.5" /> New review
          </Button>
        </div>

        <div className="space-y-6">
          {reviews.map(({ advisor, result }, i) => (
            <div key={i} className="bg-card border border-border/70 rounded-2xl p-6 rise-in">
              <div className="flex items-center gap-3 mb-5">
                <AdvisorAvatar name={advisor.name} accent={advisor.accent} photo_url={advisor.avatar} size="md" />
                <div>
                  <div className="font-medium">{advisor.name}</div>
                  <div className="text-xs text-muted-foreground">{advisor.role}</div>
                </div>
              </div>

              <div className="mb-5">
                <p className="text-[0.95rem] leading-relaxed text-foreground/90">{result.critique}</p>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <ReviewSection icon={ThumbsUp} title="Strengths" items={result.strengths} tone="positive" />
                <ReviewSection icon={ThumbsDown} title="Weaknesses" items={result.weaknesses} tone="negative" />
                <ReviewSection icon={AlertTriangle} title="Risks" items={result.risks} tone="warning" />
                <ReviewSection icon={HelpCircle} title="Missing information" items={result.missing_information} tone="neutral" />
              </div>

              <div className="mt-4 bg-secondary/40 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Lightbulb className="w-4 h-4 text-brand" strokeWidth={1.5} />
                  <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground font-medium">Recommended changes</span>
                </div>
                <ul className="space-y-1.5">
                  {result.recommended_changes?.map((c, j) => (
                    <li key={j} className="text-sm text-foreground/90 flex items-start gap-2">
                      <span className="text-muted-foreground mt-0.5">·</span>{c}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-display mb-1">Review</h2>
      <p className="text-muted-foreground mb-6">Get a document, strategy, or plan reviewed by your advisors. They'll critique it and suggest improvements.</p>

      <div className="mb-6">
        <div className="flex gap-2 mb-3">
          <button onClick={() => setPasteMode(false)} className={`text-sm px-4 py-2 rounded-lg transition-colors ${!pasteMode ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>Select from Documents</button>
          <button onClick={() => setPasteMode(true)} className={`text-sm px-4 py-2 rounded-lg transition-colors ${pasteMode ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>Paste content</button>
        </div>

        {!pasteMode ? (
          documents.length === 0 ? (
            <p className="text-sm text-muted-foreground py-3">No documents yet. Paste content instead, or create a document first.</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {documents.map((d) => (
                <button key={d.id} onClick={() => setSelectedDocId(d.id)} className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border transition-all ${selectedDocId === d.id ? "border-brand bg-brand-soft" : "border-border/70 bg-card hover:border-border"}`}>
                  <FileText className="w-4 h-4 text-muted-foreground shrink-0" strokeWidth={1.5} />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{d.title}</div>
                    <div className="text-xs text-muted-foreground">{d.document_type}</div>
                  </div>
                </button>
              ))}
            </div>
          )
        ) : (
          <div className="space-y-3">
            <Input value={pasteTitle} onChange={(e) => setPasteTitle(e.target.value)} placeholder="Document title" className="h-10" />
            <Textarea value={pasteContent} onChange={(e) => setPasteContent(e.target.value)} rows={6} placeholder="Paste the content you want reviewed…" className="resize-none" />
          </div>
        )}
      </div>

      <div className="mb-6">
        <Label className="mb-2.5 block text-sm">Reviewers ({selectedAdvisors.length}/3)</Label>
        <div className="flex flex-wrap gap-2">
          {advisors.map((a) => (
            <button key={a.id} onClick={() => toggleAdvisor(a)} className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${selectedAdvisors.some((x) => x.id === a.id) ? "border-brand bg-brand-soft" : "border-border/70 bg-card hover:border-border"}`}>
              <AdvisorAvatar name={a.name} accent={a.accent} photo_url={a.avatar} size="sm" />
              <span className="text-sm">{a.name}</span>
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-destructive mb-4">{error}</p>}

      <Button onClick={run} disabled={(!docContent?.trim() && !pasteContent?.trim()) || selectedAdvisors.length === 0 || loading} variant="brand" className="rounded-full px-8">
        {loading ? "Reviewing…" : "Start review"} {!loading && <ArrowRight className="w-4 h-4 ml-1.5" />}
      </Button>
    </div>
  );
}

function ReviewSection({ icon: Icon, title, items, tone }) {
  const toneClass = tone === "positive" ? "text-emerald-700" : tone === "negative" ? "text-destructive" : tone === "warning" ? "text-amber-700" : "text-muted-foreground";
  return (
    <div>
      <div className={`flex items-center gap-1.5 mb-2 ${toneClass}`}>
        <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
        <span className="text-xs uppercase tracking-[0.14em] font-medium">{title}</span>
      </div>
      <ul className="space-y-1.5">
        {items?.map((item, i) => (
          <li key={i} className="text-sm text-foreground/85 flex items-start gap-2">
            <span className="text-muted-foreground mt-0.5">·</span>{item}
          </li>
        ))}
      </ul>
    </div>
  );
}