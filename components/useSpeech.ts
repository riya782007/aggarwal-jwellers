"use client";
import { useEffect, useRef, useState } from "react";

/** Browser speech-to-text (Web Speech API) for Hindi + English — no external service.
 *  Chrome/Edge/Android support it natively; the hook reports `supported=false` elsewhere
 *  so callers can simply hide the mic. */
export function useSpeech(onFinal: (text: string) => void, lang: "hi-IN" | "en-IN" = "hi-IN") {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [supported, setSupported] = useState(false);
  const recRef = useRef<any>(null);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    setSupported(true);
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (e: any) => {
      let finalText = "", interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t; else interimText += t;
      }
      setInterim(interimText);
      if (finalText.trim()) onFinalRef.current(finalText.trim());
    };
    rec.onend = () => { setListening(false); setInterim(""); };
    rec.onerror = () => { setListening(false); setInterim(""); };
    recRef.current = rec;
    return () => { try { rec.abort(); } catch {} };
  }, []);

  function start(overrideLang?: "hi-IN" | "en-IN") {
    const rec = recRef.current;
    if (!rec || listening) return;
    rec.lang = overrideLang ?? lang;
    try { rec.start(); setListening(true); } catch { /* already started */ }
  }
  function stop() { try { recRef.current?.stop(); } catch {} }

  return { supported, listening, interim, start, stop };
}
