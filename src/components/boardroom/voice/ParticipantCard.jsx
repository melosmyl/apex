import React from "react";
import AdvisorAvatar from "@/components/AdvisorAvatar";
import { Mic, MicOff, Volume2 } from "lucide-react";

export default function ParticipantCard({ advisor, isActive, isSpeaking, isMuted, onRequestSpeak, showRequestButton }) {
  return (
    <div
      className={`relative flex flex-col items-center p-4 rounded-2xl border transition-all duration-300 ${
        isActive
          ? "border-brand bg-brand-soft shadow-warm-glow"
          : "border-border/60 bg-card/50"
      }`}
    >
      <div className="relative">
        <AdvisorAvatar
          name={advisor.name}
          accent={advisor.accent || "#7a5c3e"}
          photo_url={advisor.avatar}
          size="lg"
          className={isSpeaking ? "ring-2 ring-brand ring-offset-2 ring-offset-card" : ""}
        />
        {isSpeaking && (
          <div className="absolute inset-0 rounded-full border-2 border-brand animate-ping opacity-30" />
        )}
        {isMuted && (
          <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-destructive flex items-center justify-center border-2 border-card">
            <MicOff className="w-3 h-3 text-destructive-foreground" />
          </div>
        )}
      </div>
      <div className="text-center mt-3">
        <p className="font-display text-sm font-medium leading-tight">{advisor.name}</p>
        <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{advisor.role}</p>
      </div>
      {isSpeaking && (
        <div className="flex items-center gap-1 mt-2">
          <Volume2 className="w-3 h-3 text-brand" />
          <span className="text-[10px] uppercase tracking-wider text-brand font-medium">Speaking</span>
        </div>
      )}
      {showRequestButton && !isSpeaking && (
        <button
          onClick={() => onRequestSpeak?.(advisor)}
          className="mt-2 text-[10px] text-muted-foreground hover:text-brand flex items-center gap-1 transition-colors"
        >
          <Mic className="w-3 h-3" /> Invite to speak
        </button>
      )}
    </div>
  );
}