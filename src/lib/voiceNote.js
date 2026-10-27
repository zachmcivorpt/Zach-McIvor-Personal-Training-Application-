// Recording a voice note for chat. Uses the browser's microphone
// (getUserMedia + MediaRecorder); in the iPhone app that needs the
// NSMicrophoneUsageDescription string and WKWebView's capture permission
// (ViewController.swift). Safari records audio/mp4, Chrome audio/webm.
import { useEffect, useRef, useState } from "react";

export const MAX_VOICE_NOTE_SECONDS = 120;

export function voiceNotesSupported() {
  return typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof window.MediaRecorder !== "undefined";
}

export function pickAudioMimeType(isSupported = (t) => window.MediaRecorder?.isTypeSupported?.(t)) {
  // AAC first (iPhone records it, and every device plays it back).
  for (const type of ["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm;codecs=opus", "audio/webm"]) {
    if (isSupported(type)) return type;
  }
  return "";
}

export function formatVoiceDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// state: "idle" | "starting" | "recording". stop() resolves with
// { blob, durationSec } (or null if nothing was captured); cancel() throws
// the recording away.
export function useVoiceRecorder() {
  const [state, setState] = useState("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const startedAtRef = useRef(0);
  const tickRef = useRef(null);
  const stopResolveRef = useRef(null);
  const autoStopRef = useRef(null);

  function cleanup() {
    clearInterval(tickRef.current);
    clearTimeout(autoStopRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }
  useEffect(() => cleanup, []);

  async function start() {
    if (state !== "idle") return;
    setError("");
    if (!voiceNotesSupported()) {
      setError("Voice notes aren't supported on this device.");
      return;
    }
    setState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickAudioMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => e.data?.size && chunksRef.current.push(e.data);
      recorder.onstop = () => {
        // Rounded down: the recording starts a beat after the button press,
        // so rounding up labelled a 2.5s clip "0:03".
        const durationSec = Math.floor((Date.now() - startedAtRef.current) / 1000);
        const type = recorder.mimeType || mimeType || "audio/mp4";
        const blob = chunksRef.current.length ? new Blob(chunksRef.current, { type }) : null;
        cleanup();
        setState("idle");
        setSeconds(0);
        stopResolveRef.current?.(blob && blob.size > 0 ? { blob, durationSec } : null);
        stopResolveRef.current = null;
      };
      recorderRef.current = recorder;
      recorder.start();
      startedAtRef.current = Date.now();
      setSeconds(0);
      setState("recording");
      tickRef.current = setInterval(() => setSeconds(Math.round((Date.now() - startedAtRef.current) / 1000)), 250);
      autoStopRef.current = setTimeout(() => recorderRef.current?.state === "recording" && recorderRef.current.stop(), MAX_VOICE_NOTE_SECONDS * 1000);
    } catch (err) {
      cleanup();
      setState("idle");
      setError(err?.name === "NotAllowedError" ? "Allow microphone access for APEX in your phone's Settings to send voice notes." : "Couldn't start recording — please try again.");
    }
  }

  function stop() {
    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state !== "recording") return resolve(null);
      stopResolveRef.current = resolve;
      recorder.stop();
    });
  }

  function cancel() {
    const recorder = recorderRef.current;
    stopResolveRef.current = null;
    if (recorder && recorder.state === "recording") {
      recorder.onstop = () => {
        cleanup();
        setState("idle");
        setSeconds(0);
      };
      recorder.stop();
    } else {
      cleanup();
      setState("idle");
    }
  }

  return { state, seconds, error, clearError: () => setError(""), start, stop, cancel };
}
