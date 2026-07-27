import React from "react";
import { Button } from "@/components/ui/button";
import {
  Mic, MicOff, Pause, Play, Square, SkipForward, RotateCw,
  Users, MessageSquare, Phone, Hand
} from "lucide-react";

export default function VoiceControls({
  meetingState, isMuted, hasActiveSpeaker,
  onToggleMute, onTogglePause, onInterrupt, onEnd,
  onSkip, onRepeat, onExchange, onShowText, onShowTranscript,
  selectedAdvisors, onDirectAdvisor
}) {
  const isListening = meetingState === "listening";
  const isSpeaking = meetingState === "speaking";
  const isThinking = meetingState === "thinking";
  const isPaused = meetingState === "paused";

  return (
    <div className="border-t border-border/50 bg-card/80 backdrop-blur-sm px-4 py-3">
      <div className="flex items-center justify-center gap-2 flex-wrap">
        {/* Mute */}
        <Button
          variant={isMuted ? "destructive" : "outline"}
          size="sm"
          className="rounded-full"
          onClick={onToggleMute}
          title={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </Button>

        {/* Pause/Resume */}
        <Button
          variant="outline"
          size="sm"
          className="rounded-full"
          onClick={onTogglePause}
          title={isPaused ? "Resume" : "Pause"}
        >
          {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
        </Button>

        {/* Interrupt — only when speaking */}
        {isSpeaking && (
          <Button
            variant="destructive"
            size="sm"
            className="rounded-full animate-pulse"
            onClick={onInterrupt}
            title="Interrupt"
          >
            <Square className="w-3.5 h-3.5 mr-1.5" /> Interrupt
          </Button>
        )}

        {/* Skip response */}
        {isSpeaking && (
          <Button variant="outline" size="sm" className="rounded-full" onClick={onSkip} title="Skip">
            <SkipForward className="w-4 h-4" />
          </Button>
        )}

        {/* Repeat */}
        {isSpeaking || isListening ? (
          <Button variant="outline" size="sm" className="rounded-full" onClick={onRepeat} title="Repeat last">
            <RotateCw className="w-4 h-4" />
          </Button>
        ) : null}

        {/* Ask advisors to discuss */}
        {isListening && selectedAdvisors?.length > 1 && (
          <Button variant="outline" size="sm" className="rounded-full" onClick={onExchange} title="Let advisors discuss">
            <Users className="w-4 h-4 mr-1.5" /> Advisors discuss
          </Button>
        )}

        {/* Switch to text */}
        <Button variant="outline" size="sm" className="rounded-full" onClick={onShowText} title="Type instead">
          <MessageSquare className="w-4 h-4" />
        </Button>

        {/* View transcript */}
        <Button variant="outline" size="sm" className="rounded-full" onClick={onShowTranscript} title="View transcript">
          <Hand className="w-4 h-4" />
        </Button>

        {/* End meeting */}
        <Button variant="destructive" size="sm" className="rounded-full" onClick={onEnd} title="End meeting">
          <Phone className="w-4 h-4 mr-1.5 rotate-[135deg]" /> End
        </Button>
      </div>
    </div>
  );
}