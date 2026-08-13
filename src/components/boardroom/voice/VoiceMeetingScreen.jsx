import React, { useState, useEffect, useRef } from "react";
import AdvisorAvatar from "@/components/AdvisorAvatar";
import ParticipantCard from "@/components/boardroom/voice/ParticipantCard";
import VoiceControls from "@/components/boardroom/voice/VoiceControls";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Mic, Radio, Brain, Volume2, Send, AlertCircle, Wifi, WifiOff
} from "lucide-react";

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function VoiceMeetingScreen({
  company, topic, advisors, voiceMeeting, onEnd, onShowTranscript
}) {
  const [showTextMode, setShowTextMode] = useState(false);
  const [textMessage, setTextMessage] = useState("");
  const [showAdvisorPicker, setShowAdvisorPicker] = useState(false);
  const transcriptEndRef = useRef(null);
  const startedRef = useRef(false);
  const {
    meetingState, messages, partialTranscript, currentSpeaker,
    elapsedSeconds, error, isMuted, micSupported, ttsSupported,
    startMeeting, interrupt, toggleMute, togglePause,
    directAdvisor, startAdvisorExchange, skipResponse, repeatResponse, sendTextMessage,
  } = voiceMeeting;

  const isListening = meetingState === "listening";
  const isThinking = meetingState === "thinking";
  const isSpeaking = meetingState === "speaking";
  const isPaused = meetingState === "paused";
  const isSummarizing = meetingState === "summarizing";

  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, partialTranscript]);

  // Start meeting automatically after mic support is confirmed
  useEffect(() => {
    if (!startedRef.current && micSupported && meetingState === "idle") {
      startedRef.current = true;
      startMeeting();
    }
  }, [micSupported, meetingState, startMeeting]);

  // Show setup error if mic not supported
  if (!micSupported) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <AlertCircle className="w-10 h-10 text-destructive mx-auto mb-4" />
        <h3 className="font-display text-xl mb-2">Voice not supported</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Your browser doesn't support voice recognition. Try Chrome, Edge, or Safari.
          You can still use the other Boardroom modes.
        </p>
        <Button variant="secondaryOutline" onClick={onEnd}>Back to modes</Button>
      </div>
    );
  }

  if (isSummarizing) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <Brain className="w-10 h-10 text-brand mx-auto mb-4 animate-pulse" />
        <h3 className="font-display text-xl mb-2">Generating meeting summary…</h3>
        <p className="text-sm text-muted-foreground">The board secretary is compiling your transcript and recommendations.</p>
      </div>
    );
  }

  const statusInfo = {
    listening: { label: "Listening", color: "text-brand", icon: Mic },
    thinking: { label: "Thinking", color: "text-blue-500", icon: Brain },
    speaking: { label: `${currentSpeaker?.name || "Advisor"} is speaking`, color: "text-brand", icon: Volume2 },
    paused: { label: "Paused", color: "text-muted-foreground", icon: Radio },
    idle: { label: "Starting", color: "text-muted-foreground", icon: Radio },
  };
  const Status = statusInfo[meetingState] || statusInfo.idle;

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-h-[800px]">
      {/* Header */}
      <div className="flex items-center justify-between px-1 pb-4">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Live Conversation</p>
          <h2 className="font-display text-lg leading-tight max-w-md">{topic}</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-mono text-muted-foreground">{formatTime(elapsedSeconds)}</span>
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-card border border-border/60`}>
            <div className={`w-1.5 h-1.5 rounded-full ${isListening ? "bg-brand animate-pulse" : isSpeaking ? "bg-brand" : "bg-muted-foreground"}`} />
            <span className={`text-[11px] uppercase tracking-wider font-medium ${Status.color}`}>{Status.label}</span>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-xl px-4 py-2 mb-3">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Voice privacy notice */}
      {messages.length === 0 && !error && (
        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-xl px-4 py-2.5 mb-3">
          <Radio className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>Your audio is processed by your browser to create the conversation and transcript. Raw audio is not stored unless you choose to save recordings.</span>
        </div>
      )}

      {/* Main area: speaker + participants */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0">
        {/* Left: active speaker + live transcript */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Active speaker */}
          <div className="flex flex-col items-center justify-center py-6 bg-card/50 rounded-2xl border border-border/60">
            {currentSpeaker ? (
              <>
                <div className="relative">
                  <AdvisorAvatar
                    name={currentSpeaker.name}
                    accent={currentSpeaker.accent || "#7a5c3e"}
                    photo_url={currentSpeaker.avatar}
                    size="xl"
                  />
                  {isSpeaking && (
                    <div className="absolute inset-0 rounded-full border-2 border-brand animate-ping opacity-20" />
                  )}
                </div>
                <p className="font-display text-lg mt-3">{currentSpeaker.name}</p>
                <p className="text-xs text-muted-foreground">{currentSpeaker.role}</p>
                <div className="flex items-center gap-1.5 mt-2">
                  <Volume2 className="w-3.5 h-3.5 text-brand" />
                  <span className="text-[11px] uppercase tracking-wider text-brand font-medium">Speaking</span>
                </div>
              </>
            ) : isListening ? (
              <>
                <div className="w-24 h-24 rounded-full bg-brand-soft border-2 border-brand/30 flex items-center justify-center">
                  <Mic className="w-8 h-8 text-brand" />
                </div>
                <p className="font-display text-lg mt-3">You're speaking</p>
                <p className="text-xs text-muted-foreground">The board is listening</p>
              </>
            ) : isThinking ? (
              <>
                <div className="w-24 h-24 rounded-full bg-blue-50 border-2 border-blue-200 flex items-center justify-center">
                  <Brain className="w-8 h-8 text-blue-500 animate-pulse" />
                </div>
                <p className="font-display text-lg mt-3">Thinking…</p>
                <p className="text-xs text-muted-foreground">The board is considering your question</p>
              </>
            ) : (
              <div className="w-24 h-24 rounded-full bg-secondary flex items-center justify-center">
                <Radio className="w-8 h-8 text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Live transcript */}
          <div className="flex-1 min-h-0 mt-3 bg-card/50 rounded-2xl border border-border/60 overflow-y-auto p-4">
            <div className="space-y-2">
              {messages.length === 0 && !partialTranscript && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {isListening ? "Start speaking — your words will appear here" : "Waiting to start…"}
                </p>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={`text-sm ${msg.speaker_type === "founder" ? "text-foreground" : ""}`}>
                  <span className={`font-medium ${msg.speaker_type === "founder" ? "text-foreground" : "text-brand"}`}>
                    {msg.speaker_type === "founder" ? "You" : msg.speaker_name}:
                  </span>
                  <span className="text-muted-foreground ml-2">{msg.message_text}</span>
                  {msg.was_interrupted && <span className="text-xs text-destructive ml-1">[interrupted]</span>}
                </div>
              ))}
              {partialTranscript && (
                <div className="text-sm">
                  <span className="font-medium text-foreground">You:</span>
                  <span className="text-muted-foreground/70 italic ml-2">{partialTranscript}…</span>
                </div>
              )}
              <div ref={transcriptEndRef} />
            </div>
          </div>

          {/* Text mode input */}
          {showTextMode && (
            <div className="mt-3 flex gap-2">
              <Textarea
                value={textMessage}
                onChange={(e) => setTextMessage(e.target.value)}
                rows={2}
                placeholder="Type your message…"
                className="text-sm resize-none bg-background rounded-xl"
              />
              <Button
                onClick={() => { sendTextMessage(textMessage); setTextMessage(""); }}
                disabled={!textMessage.trim()}
                className="rounded-xl"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Right: participants */}
        <div className="lg:w-64 shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[11px] uppercase tracking-widest text-muted-foreground">Participants</span>
            <span className="text-[11px] text-muted-foreground">({advisors.length + 1})</span>
          </div>
          {/* Founder card */}
          <div className={`flex flex-col items-center p-4 rounded-2xl border transition-all ${
            isListening ? "border-brand bg-brand-soft" : "border-border/60 bg-card/50"
          }`}>
            <div className="relative">
              <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center font-display text-lg text-primary-foreground">
                You
              </div>
              {isListening && (
                <div className="absolute inset-0 rounded-full border-2 border-brand animate-ping opacity-20" />
              )}
            </div>
            <p className="font-display text-sm font-medium mt-3">Founder</p>
            <p className="text-[11px] text-muted-foreground">{company?.name || ""}</p>
            <div className="flex items-center gap-1 mt-2">
              <Mic className={`w-3 h-3 ${isListening ? "text-brand" : "text-muted-foreground"}`} />
              <span className={`text-[10px] uppercase tracking-wider font-medium ${isListening ? "text-brand" : "text-muted-foreground"}`}>
                {isMuted ? "Muted" : isListening ? "Speaking" : "Idle"}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-3 mt-3">
            {advisors.map((advisor) => (
              <ParticipantCard
                key={advisor.id}
                advisor={advisor}
                isActive={currentSpeaker?.id === advisor.id}
                isSpeaking={currentSpeaker?.id === advisor.id && isSpeaking}
                isMuted={false}
                showRequestButton={isListening || isPaused}
                onRequestSpeak={(a) => directAdvisor(a.id)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Advisor picker for "ask advisor to respond to another" */}
      {showAdvisorPicker && (
        <div className="mt-3 flex flex-wrap gap-2 p-3 bg-card rounded-xl border border-border/60">
          <span className="text-xs text-muted-foreground self-center">Ask advisor to respond:</span>
          {advisors.map(a => (
            <button
              key={a.id}
              onClick={() => { directAdvisor(a.id); setShowAdvisorPicker(false); }}
              className="text-xs bg-secondary hover:bg-accent rounded-full px-3 py-1.5 transition-colors"
            >
              {a.name}
            </button>
          ))}
        </div>
      )}

      {/* Controls */}
      <div className="mt-3">
        <VoiceControls
          meetingState={meetingState}
          isMuted={isMuted}
          hasActiveSpeaker={!!currentSpeaker}
          onToggleMute={toggleMute}
          onTogglePause={togglePause}
          onInterrupt={interrupt}
          onEnd={onEnd}
          onSkip={skipResponse}
          onRepeat={repeatResponse}
          onExchange={startAdvisorExchange}
          onShowText={() => setShowTextMode(!showTextMode)}
          onShowTranscript={onShowTranscript}
          selectedAdvisors={advisors}
          onDirectAdvisor={() => setShowAdvisorPicker(!showAdvisorPicker)}
        />
      </div>
    </div>
  );
}