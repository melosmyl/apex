import { useState, useEffect, useRef, useCallback } from "react";
import { startVoiceSession, runTurn, endMeeting, assignVoicesToAdvisors, getAvailableVoices, findVoice } from "@/lib/liveBoardroom";

const SILENCE_MS = 1800;

export function useVoiceMeeting({ companyId, advisors, topic, settings, onMeetingEnd }) {
  const [meetingState, setMeetingState] = useState("idle");
  const [messages, setMessages] = useState([]);
  const [partialTranscript, setPartialTranscript] = useState("");
  const [currentSpeaker, setCurrentSpeaker] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [voices, setVoices] = useState([]);
  const [micSupported, setMicSupported] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(false);
  const [sessionId, setSessionId] = useState(null);

  const recognitionRef = useRef(null);
  const finalTranscriptRef = useRef("");
  const silenceTimerRef = useRef(null);
  const stateRef = useRef("idle");
  const mutedRef = useRef(false);
  const messagesRef = useRef([]);
  const sessionRef = useRef(null);
  const advisorsRef = useRef(advisors);
  const settingsRef = useRef(settings);
  const currentUtteranceRef = useRef(null);
  const spokenCharIndexRef = useRef(0);
  const currentResponseRef = useRef(null);
  const exchangeTurnRef = useRef(0);
  const timerRef = useRef(null);
  const onMeetingEndRef = useRef(onMeetingEnd);

  useEffect(() => { stateRef.current = meetingState; }, [meetingState]);
  useEffect(() => { mutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { advisorsRef.current = advisors; }, [advisors]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { onMeetingEndRef.current = onMeetingEnd; }, [onMeetingEnd]);

  // Load voices
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    setMicSupported(!!SR);
    setTtsSupported(!!window.speechSynthesis);

    if (window.speechSynthesis) {
      const loadVoices = () => {
        const v = getAvailableVoices();
        if (v.length) setVoices(v);
      };
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
      return () => { window.speechSynthesis.onvoiceschanged = null; };
    }
  }, []);

  // Elapsed timer
  useEffect(() => {
    if (meetingState === "idle" || meetingState === "ended") return;
    timerRef.current = setInterval(() => {
      setElapsedSeconds(s => s + 1);
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [meetingState]);

  const addMessage = useCallback((msg) => {
    setMessages(prev => {
      const next = [...prev, msg];
      messagesRef.current = next;
      return next;
    });
  }, []);

  const startListening = useCallback(() => {
    if (!recognitionRef.current || mutedRef.current) return;
    setPartialTranscript("");
    finalTranscriptRef.current = "";
    setMeetingState("listening");
    stateRef.current = "listening";
    try { recognitionRef.current.start(); } catch {}
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const stopSpeaking = useCallback(() => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    currentUtteranceRef.current = null;
  }, []);

  const sendToBackend = useCallback(async (founderMessage, opts = {}) => {
    if (!founderMessage.trim() || !sessionRef.current) return;
    stopListening();
    setPartialTranscript("");
    setMeetingState("thinking");
    stateRef.current = "thinking";
    setError(null);

    const currentAdvisors = advisorsRef.current;
    const advisorIds = currentAdvisors.map(a => a.id);
    const history = messagesRef.current.map(m => ({
      speaker_type: m.speaker_type,
      speaker_name: m.speaker_name,
      message_text: m.message_text,
      response_type: m.response_type,
      was_interrupted: m.was_interrupted,
    }));

    try {
      const result = await runTurn({
        sessionId: sessionRef.current,
        companyId,
        founderMessage,
        advisorIds,
        topic,
        history,
        settings: settingsRef.current,
        directorTargetId: opts.directorTargetId,
        advisorExchangeMode: opts.advisorExchangeMode,
        exchangeTurn: opts.exchangeTurn,
      });

      const advisor = currentAdvisors.find(a => a.id === result.next_speaker_id);

      const advisorMsg = {
        speaker_type: "ai_advisor",
        speaker_id: result.next_speaker_id,
        speaker_name: result.next_speaker_name,
        message_text: result.response_text,
        response_type: result.response_type,
        was_spoken: true,
        was_interrupted: false,
        sequence_number: result.sequence_number,
      };
      addMessage(advisorMsg);
      currentResponseRef.current = advisorMsg;

      if (result.meeting_state === "exchange_complete") {
        exchangeTurnRef.current = 0;
      }

      // Speak the response
      if (ttsSupported && advisor) {
        setMeetingState("speaking");
        stateRef.current = "speaking";
        setCurrentSpeaker(advisor);

        const voice = findVoice(advisor.voice_name, voices);
        const utterance = new SpeechSynthesisUtterance(result.response_text);
        if (voice) utterance.voice = voice;
        utterance.pitch = advisor.voice_pitch || 1;
        utterance.rate = advisor.voice_rate || 0.97;
        spokenCharIndexRef.current = 0;

        utterance.onboundary = (event) => {
          spokenCharIndexRef.current = event.charIndex;
        };

        utterance.onend = () => {
          currentUtteranceRef.current = null;
          if (stateRef.current === "speaking") {
            // Check if another advisor should respond
            if (result.another_advisor_should_respond && result.suggested_follow_up_speaker_id && !opts.advisorExchangeMode) {
              const followUpAdvisor = advisorsRef.current.find(a => a.id === result.suggested_follow_up_speaker_id);
              if (followUpAdvisor) {
                sendToBackend(`I'd like ${followUpAdvisor.name} to weigh in on this.`, { directorTargetId: result.suggested_follow_up_speaker_id });
              } else {
                startListening();
              }
            } else if (opts.advisorExchangeMode && exchangeTurnRef.current < 3) {
              exchangeTurnRef.current++;
              sendToBackend("Continue the discussion among yourselves.", {
                advisorExchangeMode: true,
                exchangeTurn: exchangeTurnRef.current,
              });
            } else {
              exchangeTurnRef.current = 0;
              startListening();
            }
          }
        };

        utterance.onerror = () => {
          currentUtteranceRef.current = null;
          if (stateRef.current === "speaking") startListening();
        };

        currentUtteranceRef.current = utterance;
        window.speechSynthesis.speak(utterance);
      } else {
        startListening();
      }
    } catch (e) {
      setError(e.message || "The board couldn't respond.");
      setMeetingState("listening");
      stateRef.current = "listening";
      startListening();
    }
  }, [companyId, topic, voices, ttsSupported, addMessage, startListening, stopListening]);

  // Initialize speech recognition
  const initRecognition = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-GB";

    recognition.onresult = (event) => {
      let interim = "";
      let final = "";
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      finalTranscriptRef.current = final;
      const display = final + interim;
      setPartialTranscript(display);

      // Reset silence timer
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        const text = (finalTranscriptRef.current + interim).trim();
        if (text && stateRef.current === "listening") {
          sendToBackend(text);
        }
      }, SILENCE_MS);
    };

    recognition.onend = () => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      // Restart if still listening and not muted
      if (stateRef.current === "listening" && !mutedRef.current) {
        try { recognition.start(); } catch {}
      }
    };

    recognition.onerror = (event) => {
      if (event.error === "no-speech") return;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("Microphone access was denied. Please allow microphone access to use the voice boardroom.");
        setMeetingState("idle");
        stateRef.current = "idle";
      }
    };

    recognitionRef.current = recognition;
  }, [sendToBackend]);

  const startMeeting = useCallback(async () => {
    setError(null);
    setMessages([]);
    messagesRef.current = [];
    setElapsedSeconds(0);
    exchangeTurnRef.current = 0;

    // Assign voices
    const advisorsWithVoices = assignVoicesToAdvisors(advisors, voices);
    advisorsRef.current = advisorsWithVoices;

    // Create session
    try {
      const { session } = await startVoiceSession({
        companyId,
        topic,
        advisorIds: advisors.map(a => a.id),
        advisorNames: advisors.map(a => a.name),
        settings,
      });
      sessionRef.current = session.id;
      setSessionId(session.id);
    } catch (e) {
      setError(e.message || "Could not start the meeting.");
      return;
    }

    initRecognition();
    startListening();
  }, [companyId, topic, advisors, voices, settings, initRecognition, startListening]);

  const endMeetingHandler = useCallback(async () => {
    stopListening();
    stopSpeaking();
    setMeetingState("ended");
    stateRef.current = "ended";

    if (sessionRef.current) {
      setMeetingState("summarizing");
      stateRef.current = "summarizing";
      try {
        const result = await endMeeting({ sessionId: sessionRef.current, companyId });
        if (onMeetingEndRef.current) onMeetingEndRef.current(result);
      } catch (e) {
        setError(e.message || "Could not generate the meeting summary.");
        if (onMeetingEndRef.current) onMeetingEndRef.current({ error: e.message });
      }
    }
  }, [companyId, stopListening, stopSpeaking]);

  const interrupt = useCallback(() => {
    stopSpeaking();
    // Mark current response as interrupted
    if (currentResponseRef.current) {
      const spokenText = currentResponseRef.current.message_text.slice(0, spokenCharIndexRef.current);
      setMessages(prev => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.speaker_type === "ai_advisor") {
          next[next.length - 1] = { ...last, was_interrupted: true, spoken_portion: spokenText };
        }
        messagesRef.current = next;
        return next;
      });
    }
    setCurrentSpeaker(null);
    startListening();
  }, [stopSpeaking, startListening]);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const next = !prev;
      mutedRef.current = next;
      if (next) {
        stopListening();
        setPartialTranscript("");
      } else {
        if (stateRef.current === "listening") startListening();
      }
      return next;
    });
  }, [stopListening, startListening]);

  const togglePause = useCallback(() => {
    if (stateRef.current === "paused") {
      startListening();
    } else {
      stopListening();
      stopSpeaking();
      setMeetingState("paused");
      stateRef.current = "paused";
    }
  }, [startListening, stopListening, stopSpeaking]);

  const directAdvisor = useCallback((advisorId) => {
    const advisor = advisorsRef.current.find(a => a.id === advisorId);
    if (!advisor) return;
    stopSpeaking();
    stopListening();
    sendToBackend(`I'd like to hear from ${advisor.name}.`, { directorTargetId: advisorId });
  }, [stopSpeaking, stopListening, sendToBackend]);

  const startAdvisorExchange = useCallback(() => {
    stopSpeaking();
    stopListening();
    exchangeTurnRef.current = 1;
    sendToBackend("I'd like the advisors to discuss this among themselves.", {
      advisorExchangeMode: true,
      exchangeTurn: 1,
    });
  }, [stopSpeaking, stopListening, sendToBackend]);

  const skipResponse = useCallback(() => {
    stopSpeaking();
    setCurrentSpeaker(null);
    startListening();
  }, [stopSpeaking, startListening]);

  const repeatResponse = useCallback(() => {
    const lastAdvisorMsg = [...messagesRef.current].reverse().find(m => m.speaker_type === "ai_advisor");
    if (!lastAdvisorMsg) return;
    const advisor = advisorsRef.current.find(a => a.id === lastAdvisorMsg.speaker_id);
    if (!advisor || !ttsSupported) return;
    stopListening();
    setMeetingState("speaking");
    stateRef.current = "speaking";
    setCurrentSpeaker(advisor);
    const voice = findVoice(advisor.voice_name, voices);
    const utterance = new SpeechSynthesisUtterance(lastAdvisorMsg.message_text);
    if (voice) utterance.voice = voice;
    utterance.pitch = advisor.voice_pitch || 1;
    utterance.rate = advisor.voice_rate || 0.97;
    utterance.onend = () => { if (stateRef.current === "speaking") startListening(); };
    utterance.onerror = () => { if (stateRef.current === "speaking") startListening(); };
    currentUtteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [voices, ttsSupported, startListening, stopListening]);

  const sendTextMessage = useCallback((text) => {
    if (!text.trim()) return;
    stopSpeaking();
    stopListening();
    sendToBackend(text);
  }, [stopSpeaking, stopListening, sendToBackend]);

  // Cleanup
  useEffect(() => {
    return () => {
      stopListening();
      stopSpeaking();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [stopListening, stopSpeaking]);

  return {
    meetingState,
    messages,
    partialTranscript,
    currentSpeaker,
    elapsedSeconds,
    error,
    isMuted,
    voices,
    micSupported,
    ttsSupported,
    sessionId,
    startMeeting,
    endMeeting: endMeetingHandler,
    interrupt,
    toggleMute,
    togglePause,
    directAdvisor,
    startAdvisorExchange,
    skipResponse,
    repeatResponse,
    sendTextMessage,
  };
}