// Coach video feedback (#219): front camera + microphone recording.
//
// The camera stream and MediaRecorder live in this hook, which the
// recording workspace mounts once at its root. Switching the client
// information panels only re-renders siblings, so the recording never stops
// or restarts because the coach looked at a different panel.
//
// Every second or two of a take is written to the device (localStore.appendChunk)
// as it is recorded; nothing is uploaded. A take that was interrupted (the
// page reloaded, iOS dropped it) is recovered from those pieces next time.
import { useCallback, useEffect, useRef, useState } from "react";
import { appendChunk, finalizeChunks, isQuotaError } from "./localStore";
import { newLocalId } from "./timeline";
import { inIosApp } from "../../solo/appShell";

export const MAX_TAKE_SECONDS = 20 * 60;

// Safari/iPhone (WebKit): MP4/H.264 + AAC, which it records natively, writes
// out every second and every iPhone plays; a single untouched take then
// needs no conversion. Chrome's MP4 recorder holds everything until Stop
// (it ignores the one-second slices), which would leave nothing on the
// device if the page died mid-take, so other browsers record WebM, which
// is written out every second.
export function isWebKitBrowser(ua = typeof navigator !== "undefined" ? navigator.userAgent : "") {
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  return /AppleWebKit/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR|Android/.test(ua);
}

const MP4_TYPES = ["video/mp4;codecs=avc1,mp4a.40.2", "video/mp4;codecs=avc1", "video/mp4"];
const WEBM_TYPES = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];

export function pickVideoMimeType(isSupported = (t) => window.MediaRecorder?.isTypeSupported?.(t), preferMp4 = isWebKitBrowser()) {
  for (const type of preferMp4 ? [...MP4_TYPES, ...WEBM_TYPES] : [...WEBM_TYPES, ...MP4_TYPES]) {
    try {
      if (isSupported(type)) return type;
    } catch {
      // keep looking
    }
  }
  return "";
}

// iPhone app builds before 1.0.3 had no microphone permission text, and iOS
// closes an app that records without one (same check as voice notes).
export function cameraRecordingSupported() {
  if (typeof window === "undefined") return false;
  const nativeOk = !!window.webkit?.messageHandlers?.apexRest || !inIosApp();
  return nativeOk && !!navigator.mediaDevices?.getUserMedia && typeof window.MediaRecorder !== "undefined";
}

export function cameraErrorMessage(err) {
  const name = err?.name || "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera or microphone access is off for APEX. Allow both, then try again.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No front camera or microphone was found on this device.";
  if (name === "NotReadableError") return "The camera is being used by another app. Close it and try again.";
  return err?.message || "The camera couldn't start. Please try again.";
}

const CAMERA_CONSTRAINTS = {
  video: {
    facingMode: "user",
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 30, max: 30 },
  },
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: { ideal: 1 },
  },
};

// state: "off" | "starting" | "ready" | "recording" | "paused" | "saving" | "error"
export function useCameraRecorder({ projectKey, onTakeStarted } = {}) {
  const [state, setState] = useState("off");
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [stream, setStream] = useState(null);

  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const takeRef = useRef(null); // { sourceId, mime, seq, chain, startedAt, accumulated, stopResolve }
  const tickRef = useRef(null);
  const projectKeyRef = useRef(projectKey);
  projectKeyRef.current = projectKey;
  const stopRef = useRef(null);

  const takeSeconds = () => {
    const t = takeRef.current;
    if (!t) return 0;
    return t.accumulated + (t.runningSince ? (performance.now() - t.runningSince) / 1000 : 0);
  };

  const startCamera = useCallback(async () => {
    if (streamRef.current) return streamRef.current;
    setError("");
    setState("starting");
    try {
      const s = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
      streamRef.current = s;
      setStream(s);
      setState("ready");
      return s;
    } catch (err) {
      setError(cameraErrorMessage(err));
      setState("error");
      return null;
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
    setState((s) => (s === "recording" || s === "paused" || s === "saving" ? s : "off"));
  }, []);

  const startRecording = useCallback(async () => {
    const s = streamRef.current || (await startCamera());
    if (!s || recorderRef.current) return false;
    const mimeType = pickVideoMimeType();
    let recorder;
    try {
      recorder = new MediaRecorder(s, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 6_000_000,
        audioBitsPerSecond: 128_000,
      });
    } catch {
      try {
        recorder = new MediaRecorder(s);
      } catch (err) {
        setError(err?.message || "Recording isn't supported on this device.");
        setState("error");
        return false;
      }
    }
    const sourceId = newLocalId("rec");
    const mime = (recorder.mimeType || mimeType || "video/mp4").split(";")[0];
    const take = { sourceId, mime, seq: 0, chain: Promise.resolve(), accumulated: 0, runningSince: performance.now(), startedAt: performance.now(), lastDataAt: 0, failed: null };
    takeRef.current = take;
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (!e.data || e.data.size === 0) return;
      take.lastDataAt = performance.now();
      const seq = take.seq++;
      const key = projectKeyRef.current;
      take.chain = take.chain.then(() =>
        appendChunk(key, sourceId, seq, e.data).catch((err) => {
          take.failed = err;
          // A full disk: stop now and keep what's already saved.
          if (recorder.state !== "inactive") {
            try {
              recorder.stop();
            } catch {}
          }
        })
      );
    };
    recorder.onerror = () => {
      try {
        if (recorder.state !== "inactive") recorder.stop();
      } catch {}
    };
    recorder.onstop = async () => {
      clearInterval(tickRef.current);
      const duration = Math.max(0, takeSeconds());
      take.accumulated = duration;
      take.runningSince = null;
      recorderRef.current = null;
      setState("saving");
      await take.chain;
      const key = projectKeyRef.current;
      let blob = null;
      try {
        blob = await finalizeChunks(key, sourceId, mime);
      } catch (err) {
        take.failed = take.failed || err;
      }
      const track = streamRef.current?.getVideoTracks?.()[0];
      const settings = track?.getSettings?.() || {};
      const result = blob
        ? { sourceId, blob, mime: blob.type || mime, duration: Math.round(duration * 1000) / 1000, width: settings.width || 0, height: settings.height || 0 }
        : null;
      if (take.failed) {
        setError(
          isQuotaError(take.failed)
            ? "This device is out of space, so recording stopped. What was recorded is kept."
            : "Part of the recording couldn't be saved on this device."
        );
      }
      takeRef.current = null;
      setElapsed(0);
      setState(streamRef.current ? "ready" : "off");
      take.stopResolve?.(result);
    };

    try {
      recorder.start(1000);
    } catch (err) {
      recorderRef.current = null;
      takeRef.current = null;
      setError(err?.message || "Recording couldn't start.");
      setState("error");
      return false;
    }
    onTakeStarted?.({ sourceId, mime });
    setElapsed(0);
    setState("recording");
    clearInterval(tickRef.current);
    let lastFlush = performance.now();
    tickRef.current = setInterval(() => {
      const secs = takeSeconds();
      setElapsed(secs);
      if (secs >= MAX_TAKE_SECONDS) stopRef.current?.();
      // Belt and braces for recorders that don't write out on their own:
      // ask for what's recorded so far every couple of seconds.
      if (recorder.state === "recording" && performance.now() - lastFlush > 2000 && performance.now() - (take.lastDataAt || take.startedAt) > 2000) {
        lastFlush = performance.now();
        try {
          recorder.requestData?.();
        } catch {}
      }
    }, 250);
    return true;
  }, [startCamera, onTakeStarted]);

  const pause = useCallback(() => {
    const r = recorderRef.current;
    const t = takeRef.current;
    if (!r || r.state !== "recording" || !t) return;
    try {
      r.pause();
      // Saves what's recorded so far straight away.
      r.requestData?.();
    } catch {
      return;
    }
    t.accumulated += (performance.now() - t.runningSince) / 1000;
    t.runningSince = null;
    setElapsed(t.accumulated);
    setState("paused");
  }, []);

  const resume = useCallback(() => {
    const r = recorderRef.current;
    const t = takeRef.current;
    if (!r || r.state !== "paused" || !t) return;
    try {
      r.resume();
    } catch {
      return;
    }
    t.runningSince = performance.now();
    setState("recording");
  }, []);

  // Resolves with { sourceId, blob, mime, duration, width, height } or null.
  const stop = useCallback(() => {
    const r = recorderRef.current;
    const t = takeRef.current;
    if (!r || !t) return Promise.resolve(null);
    return new Promise((resolve) => {
      t.stopResolve = resolve;
      try {
        if (r.state === "paused") {
          t.runningSince = null;
        }
        r.stop();
      } catch {
        resolve(null);
      }
    });
  }, []);
  stopRef.current = stop;

  // Leaving the workspace: stop the camera. A take still running keeps its
  // saved pieces and is recovered the next time this draft opens.
  useEffect(
    () => () => {
      clearInterval(tickRef.current);
      try {
        if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
      } catch {}
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    },
    []
  );

  return { state, error, setError, elapsed, stream, startCamera, stopCamera, startRecording, pause, resume, stop };
}
