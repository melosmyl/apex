import React, { useEffect, useState } from "react";
import { Check, MapPin, ExternalLink, Globe2, MessageCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAssistant } from "@/lib/AssistantContext";

// The Progression Tree — replaces MilestoneTracker (self-reported) and
// BuildStateWidget (computed, but only 5 fixed facts) with one system:
// every node is either derived from real activity or, where that's not
// possible, answered conversationally through the Assistant (Phase E).
// Nodes are never gated — the whole sequence is visible regardless of
// completion, since the point is showing the founder the map, not
// withholding it as a reward.
export default function ProgressionTree({ companyId, country }) {
  const [tree, setTree] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [completedNodeIds, setCompletedNodeIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [countryRequested, setCountryRequested] = useState(false);
  const [requestingCountry, setRequestingCountry] = useState(false);
  const { askAboutNode, nodeAnswerCount } = useAssistant();

  useEffect(() => {
    let cancelled = false;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    (async () => {
      // Tree generation is fire-and-forget from onboarding — a founder can
      // land on the dashboard before it's finished, especially when branch
      // generation is running (several LLM calls). Retry a few times before
      // giving up, rather than a one-shot fetch that shows nothing until
      // the next reload.
      let currentTree = null;
      for (let attempt = 0; attempt < 8 && !cancelled; attempt++) {
        const trees = await base44.entities.ProgressionTree.filter({ company_id: companyId });
        currentTree = trees[0];
        if (currentTree) break;
        await sleep(3000);
      }
      if (cancelled) return;
      if (!currentTree) {
        setLoading(false);
        return;
      }

      // Best-effort: refresh db_fact completions against real activity
      // before rendering. If this fails, still show whatever's on record.
      await base44.functions.invoke("evaluateProgressionTree", { company_id: companyId }).catch(() => {});

      const [treeNodes, completions] = await Promise.all([
        base44.entities.ProgressionNode.filter({ tree_id: currentTree.id }, "order_index"),
        base44.entities.ProgressionNodeCompletion.filter({ company_id: companyId }),
      ]);

      if (cancelled) return;
      setTree(currentTree);
      setNodes(treeNodes);
      setCompletedNodeIds(new Set(completions.map((c) => c.node_id)));
      setCountryRequested(!!currentTree.jurisdiction_request_clicked_at);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [companyId, nodeAnswerCount]);

  const requestCountry = async () => {
    setRequestingCountry(true);
    try {
      await base44.functions.invoke("recordProgressionCountryRequest", { company_id: companyId });
      setCountryRequested(true);
    } catch {
      // Best-effort demand signal — a failed request just means try again later.
    } finally {
      setRequestingCountry(false);
    }
  };

  if (loading || !tree || nodes.length === 0) return null;

  const firstIncompleteIndex = nodes.findIndex((n) => !completedNodeIds.has(n.id));

  return (
    <div className="bg-card border border-border/70 rounded-2xl p-6 rise-in">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-display text-lg">Your path</h3>
        <span className="text-xs text-muted-foreground">
          {completedNodeIds.size}/{nodes.length}
        </span>
      </div>
      <p className="text-sm text-muted-foreground mb-5">What unlocks next, not a checklist to fill in.</p>

      {!tree.jurisdiction_supported && (
        <div className="flex items-start gap-3 bg-secondary/50 border border-border/70 rounded-xl px-4 py-3 mb-5">
          <Globe2 className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" strokeWidth={1.75} />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground/90">
              Your tree covers the steps every business shares. Country-specific steps for {country || "your country"} are coming —{" "}
              {countryRequested ? (
                <span className="text-muted-foreground">thanks, we've noted your interest.</span>
              ) : (
                <button
                  onClick={requestCountry}
                  disabled={requestingCountry}
                  className="text-brand hover:underline disabled:opacity-60"
                >
                  tell me if you'd like yours prioritised.
                </button>
              )}
            </p>
          </div>
        </div>
      )}

      <div className="space-y-1">
        {nodes.map((node, i) => {
          const isDone = completedNodeIds.has(node.id);
          const isHere = i === firstIncompleteIndex;
          return (
            <div key={node.id} className="flex items-start gap-3 px-2.5 py-2.5">
              <span className={`mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${isDone ? "border-brand bg-brand" : "border-border"}`}>
                {isDone && <Check className="w-3 h-3 text-brand-foreground" strokeWidth={3} />}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-sm font-medium ${isDone ? "text-foreground" : "text-foreground/90"}`}>{node.label}</span>
                  {isHere && (
                    <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide text-brand">
                      <MapPin className="w-3 h-3" strokeWidth={2} /> You are here
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">{node.unlock_description}</p>
                {node.official_source_url && (
                  <a
                    href={node.official_source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-brand hover:underline mt-1"
                  >
                    via {node.official_source_name || "official source"} <ExternalLink className="w-3 h-3" strokeWidth={2} />
                  </a>
                )}
                {!isDone && node.derivation_type === "assistant_asked" && (
                  <button
                    onClick={() => askAboutNode({ id: node.id, label: node.label })}
                    className="inline-flex items-center gap-1 text-xs text-brand hover:underline mt-1"
                  >
                    <MessageCircle className="w-3 h-3" strokeWidth={2} /> I've done this
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
