import React, { useState, useRef, useEffect } from "react";
import { Pin } from "lucide-react";

export default function PinnableText({ children, companyId, sourceType, sourceId, sourceTitle, sourceUrl, advisorId, meetingId, decisionId, documentId, taskId, projectId, onPin }) {
  const containerRef = useRef(null);
  const [showBtn, setShowBtn] = useState(false);
  const [btnPos, setBtnPos] = useState({ x: 0, y: 0 });
  const [selectedText, setSelectedText] = useState("");

  useEffect(() => {
    const handleSelection = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || !sel.toString().trim()) {
        setShowBtn(false);
        return;
      }
      const range = sel.getRangeAt(0);
      if (containerRef.current && !containerRef.current.contains(range.commonAncestorContainer)) {
        setShowBtn(false);
        return;
      }
      const text = sel.toString().trim();
      if (text.length < 3) {
        setShowBtn(false);
        return;
      }
      const rect = range.getBoundingClientRect();
      setSelectedText(text);
      setBtnPos({
        x: rect.left + rect.width / 2,
        y: rect.top - 10,
      });
      setShowBtn(true);
    };
    document.addEventListener("selectionchange", handleSelection);
    return () => document.removeEventListener("selectionchange", handleSelection);
  }, []);

  const handlePin = () => {
    setShowBtn(false);
    // Get surrounding context
    const container = containerRef.current;
    let surroundingContext = "";
    if (container) {
      const fullText = container.textContent || "";
      const idx = fullText.indexOf(selectedText);
      if (idx >= 0) {
        const start = Math.max(0, idx - 200);
        const end = Math.min(fullText.length, idx + selectedText.length + 200);
        surroundingContext = fullText.slice(start, end);
      }
    }
    window.getSelection()?.removeAllRanges();
    onPin?.({
      selected_text: selectedText,
      surrounding_context: surroundingContext,
      source_type: sourceType,
      source_id: sourceId,
      source_title: sourceTitle,
      source_url: sourceUrl,
      advisor_id: advisorId,
      meeting_id: meetingId,
      decision_id: decisionId,
      document_id: documentId,
      task_id: taskId,
      project_id: projectId,
      company_id: companyId,
    });
  };

  return (
    <>
      <div ref={containerRef} className="pinnable-text">{children}</div>
      {showBtn && (
        <div
          className="fixed z-50 pointer-events-auto"
          style={{ left: btnPos.x, top: btnPos.y, transform: "translate(-50%, -100%)" }}
        >
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={handlePin}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-full text-xs font-medium shadow-lg hover:bg-primary/90 transition-colors whitespace-nowrap"
          >
            <Pin className="w-3 h-3" /> Pin this
          </button>
        </div>
      )}
    </>
  );
}