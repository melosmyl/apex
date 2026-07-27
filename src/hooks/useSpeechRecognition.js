import { useState, useEffect, useRef, useCallback } from "react";

/**
 * Web Speech API hook for voice input (speech-to-text).
 * Returns isListening, supported, start, stop, toggle.
 * Pass onTranscript to receive the accumulated transcript in real-time.
 */
export function useSpeechRecognition({ onTranscript } = {}) {
  const [isListening, setIsListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const recognitionRef = useRef(null);
  const onTranscriptRef = useRef(onTranscript);

  useEffect(() => { onTranscriptRef.current = onTranscript; }, [onTranscript]);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setSupported(false); return; }
    setSupported(true);

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-GB";

    recognition.onresult = (event) => {
      let final = "";
      for (let i = 0; i < event.results.length; i++) {
        final += event.results[i][0].transcript;
      }
      if (onTranscriptRef.current) onTranscriptRef.current(final);
    };

    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);

    recognitionRef.current = recognition;
    return () => { try { recognition.stop(); } catch {} };
  }, []);

  const start = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.start(); setIsListening(true); } catch {}
    }
  }, []);

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      setIsListening(false);
    }
  }, []);

  const toggle = useCallback(() => {
    if (isListening) stop(); else start();
  }, [isListening, start, stop]);

  return { isListening, supported, start, stop, toggle };
}