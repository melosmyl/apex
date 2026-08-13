import React, { useState } from "react";
import BoardroomBanner, { CHAIR_SEAT_ORDER } from "@/components/boardroom/BoardroomBanner";

// Scratch route for verifying the re-traced chair coordinates against the
// real rendered SVG (gradient/blend-mode behavior a static overlay can't
// simulate) — not linked from nav, deleted once approved.

const NAMES = [
  "Tomas Berg", "Priya Nair", "Elena Voss", "Marcus Webb", "Sofia Lindqvist",
  "James Okafor", "Priya Shah", "Daniel Cho", "Amara Diallo",
];

const chairLabels = {};
CHAIR_SEAT_ORDER.forEach((id, i) => {
  chairLabels[id] = { name: NAMES[i], role: "Advisor" };
});

export default function BoardroomDemoTest() {
  const [activeChairId, setActiveChairId] = useState(CHAIR_SEAT_ORDER[0]);

  return (
    <div className="min-h-screen bg-background p-8 space-y-6">
      <h1 className="font-display text-2xl">Boardroom chair tracing — review</h1>
      <div className="flex flex-wrap gap-2">
        {CHAIR_SEAT_ORDER.map((id) => (
          <button
            key={id}
            onClick={() => setActiveChairId(id)}
            className={`px-3 py-1.5 rounded-lg text-sm border ${activeChairId === id ? "bg-brand text-brand-foreground border-brand" : "border-border"}`}
          >
            {id} — {chairLabels[id].name}
          </button>
        ))}
      </div>
      <div className="rounded-2xl overflow-hidden border border-border/60">
        <BoardroomBanner activeChairId={activeChairId} chairLabels={chairLabels} />
      </div>
    </div>
  );
}
