// Coach video feedback (#219): turns the edit timeline into ONE finished
// MP4, entirely on the coach's device. Nothing here uploads anything.
//
// Fast path (Safari 26+/Chrome): WebCodecs via mediabunny (already used for
// chat video compression, loaded only when needed). Every frame is drawn
// onto one fixed-size canvas ("contain", black bars if a later take was
// filmed in the other orientation) so the aspect ratio never jumps, then
// hardware-encoded as H.264 + AAC with the index at the front (plays
// before it has fully downloaded). Cuts are clean: audio gets a 12 ms
// ramp either side of every cut (no clicks), and the whole film fades in
// from and out to black over 0.35 s.
//
// Fallback (no WebCodecs encoder): the timeline is played once on a hidden
// video element into a canvas + Web Audio stream recorded with
// MediaRecorder. Same result, but it takes as long as the video itself.
//
// A single untouched MP4 take skips both and is used as recorded.
import { segmentLength, totalDuration } from "./timeline";
import { ensureFastStart } from "../videoCompress";

export const MAX_OUTPUT_DIM = 1920;
const FADE_SEC = 0.35;
const CUT_RAMP_SEC = 0.012;
const KEYFRAME_SEC = 2;

// Talking-head footage (#221): H.264 from the hardware encoder stays sharp
// at 1080p on ~2.5 Mbps, so a 5-minute film is ~100 MB instead of ~160 MB —
// the upload is the slow part, so this is the main lever on publish time.
// Longer films step down so the upload stays reasonable.
export function videoBitrateFor(durationSec, width, height) {
  const pixels = Math.max(1, width * height);
  const base = durationSec <= 6 * 60 ? 2_500_000 : durationSec <= 10 * 60 ? 2_000_000 : 1_500_000;
  return Math.round(base * Math.min(1, pixels / (1920 * 1080)) + 250_000);
}

// A single untouched MP4 take: re-encode it smaller when that saves real
// upload time (the camera records at ~5 Mbps), but use it as recorded when
// this device can't re-encode quickly (no WebCodecs), rather than the
// real-time fallback.
export function wholeTakePlan({ size, duration, width, height }) {
  const recorded = (size * 8) / Math.max(1, duration);
  const target = videoBitrateFor(duration, width || 1920, height || 1080) + 128_000;
  if (recorded <= target * 1.3) return "original";
  return "reencode";
}

export function outputSize(width, height, maxDim = MAX_OUTPUT_DIM) {
  const w = Math.max(2, width || 1280);
  const h = Math.max(2, height || 720);
  const scale = Math.min(1, maxDim / Math.max(w, h));
  return { width: Math.round((w * scale) / 2) * 2, height: Math.round((h * scale) / 2) * 2 };
}

// Gain for one audio frame at film time t: fades at the film's start/end
// and a tiny ramp at each cut so joins never click.
export function gainAt(t, filmDuration, segStart, segEnd) {
  let g = 1;
  if (t < FADE_SEC) g = Math.min(g, Math.max(0, t / FADE_SEC));
  if (t > filmDuration - FADE_SEC) g = Math.min(g, Math.max(0, (filmDuration - t) / FADE_SEC));
  if (t - segStart < CUT_RAMP_SEC) g = Math.min(g, Math.max(0, (t - segStart) / CUT_RAMP_SEC));
  if (segEnd - t < CUT_RAMP_SEC) g = Math.min(g, Math.max(0, (segEnd - t) / CUT_RAMP_SEC));
  return g;
}

// Which frames of one decoded audio piece (starting at `timestamp`, `frames`
// long) fall inside a clip's [segIn, segOut) window, and where the kept part
// starts relative to the clip.
export function audioWindow(timestamp, frames, rate, segIn, segOut) {
  const skip = Math.max(0, Math.round((segIn - timestamp) * rate));
  const keepEnd = Math.min(frames, Math.round((segOut - timestamp) * rate));
  const count = Math.max(0, keepEnd - skip);
  return { skip, count, start: Math.max(0, timestamp + skip / rate - segIn) };
}

export function frameAlpha(t, filmDuration) {
  return Math.max(0, Math.min(1, t / FADE_SEC, (filmDuration - t) / FADE_SEC));
}

function makeCanvas(width, height) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
}

async function canvasToJpeg(canvas) {
  try {
    if (canvas.convertToBlob) return await canvas.convertToBlob({ type: "image/jpeg", quality: 0.86 });
    return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.86));
  } catch {
    return null;
  }
}

// Length and picture size of one recording (exact, from the file itself).
export async function probeVideo(blob) {
  const mb = await import("mediabunny");
  const input = new mb.Input({ source: new mb.BlobSource(blob), formats: mb.ALL_FORMATS });
  try {
    const duration = await input.computeDuration();
    const vt = await input.getPrimaryVideoTrack();
    return {
      duration: Number.isFinite(duration) ? Math.round(duration * 1000) / 1000 : 0,
      width: vt ? await vt.getDisplayWidth() : 0,
      height: vt ? await vt.getDisplayHeight() : 0,
    };
  } finally {
    input.dispose?.();
  }
}

function isWholeTake(seg, source) {
  return seg.in <= 0.05 && seg.out >= (source?.duration || 0) - 0.05;
}

// segments: the timeline. sources: { [id]: { duration, width, height, mime } }.
// getSourceBlob(id) -> Promise<Blob>. Resolves with
// { blob, poster, duration, width, height, method }.
export async function renderTimeline({ segments, sources, getSourceBlob, onProgress, signal }) {
  if (!segments?.length) throw new Error("There's nothing on the timeline to publish.");
  const filmDuration = totalDuration(segments);
  const first = sources[segments[0].sourceId] || {};

  const wholeMp4 = segments.length === 1 && isWholeTake(segments[0], first) && /mp4/.test(first.mime || "");
  const asRecorded = async () => {
    const blob = await getSourceBlob(segments[0].sourceId);
    onProgress?.(0.5);
    const file = await remuxFastStart(new File([blob], "feedback.mp4", { type: "video/mp4" }));
    const poster = await posterFromBlob(file, Math.min(1, first.duration / 2));
    onProgress?.(1);
    return { blob: file, poster, duration: filmDuration, width: first.width, height: first.height, method: "original" };
  };
  if (wholeMp4) {
    const blob = await getSourceBlob(segments[0].sourceId);
    if (blob && wholeTakePlan({ size: blob.size, duration: first.duration, width: first.width, height: first.height }) === "original") return asRecorded();
  }

  const fast = await renderWithWebCodecs({ segments, sources, getSourceBlob, onProgress, signal, filmDuration }).catch((err) => {
    if (err?.name === "AbortError") throw err;
    console.warn("WebCodecs render unavailable, using playback render:", err);
    return null;
  });
  if (fast) return fast;
  // Can't re-encode quickly here: one untouched take goes as recorded (a
  // bigger upload, but no real-time render); anything edited needs the
  // playback render.
  if (wholeMp4) return asRecorded();
  return renderByPlayback({ segments, sources, getSourceBlob, onProgress, signal, filmDuration });
}

function abortIfNeeded(signal) {
  if (signal?.aborted) {
    const err = new Error("Render cancelled");
    err.name = "AbortError";
    throw err;
  }
}

async function renderWithWebCodecs({ segments, getSourceBlob, onProgress, signal, filmDuration }) {
  if (typeof window === "undefined" || typeof window.VideoEncoder === "undefined" || typeof window.AudioEncoder === "undefined") return null;
  const mb = await import("mediabunny");

  // Open every recording once.
  const inputs = new Map();
  const openInput = async (sourceId) => {
    if (!inputs.has(sourceId)) {
      const blob = await getSourceBlob(sourceId);
      if (!blob) throw new Error("A recording is missing from this device.");
      const input = new mb.Input({ source: new mb.BlobSource(blob), formats: mb.ALL_FORMATS });
      inputs.set(sourceId, { input, video: await input.getPrimaryVideoTrack(), audio: await input.getPrimaryAudioTrack() });
    }
    return inputs.get(sourceId);
  };

  try {
    const firstOpen = await openInput(segments[0].sourceId);
    if (!firstOpen.video) throw new Error("no video track");
    const size = outputSize(await firstOpen.video.getDisplayWidth(), await firstOpen.video.getDisplayHeight());
    const bitrate = videoBitrateFor(filmDuration, size.width, size.height);
    if (!(await mb.canEncodeVideo("avc", { width: size.width, height: size.height, bitrate }))) return null;

    let audioMeta = null;
    for (const seg of segments) {
      const { audio } = await openInput(seg.sourceId);
      if (audio) {
        audioMeta = { sampleRate: await audio.getSampleRate(), numberOfChannels: await audio.getNumberOfChannels() };
        break;
      }
    }
    if (audioMeta && !(await mb.canEncodeAudio("aac", { ...audioMeta, bitrate: 128_000 }))) return null;
    for (const seg of segments) {
      const { video, audio } = await openInput(seg.sourceId);
      if (!(await video?.canDecode())) return null;
      if (audio && !(await audio.canDecode())) return null;
    }

    const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target: new mb.BufferTarget() });
    const videoSource = new mb.VideoSampleSource({ codec: "avc", bitrate, keyFrameInterval: KEYFRAME_SEC, latencyMode: "quality" });
    output.addVideoTrack(videoSource, { frameRate: 30 });
    let audioSource = null;
    if (audioMeta) {
      audioSource = new mb.AudioSampleSource({ codec: "aac", bitrate: 128_000 });
      output.addAudioTrack(audioSource);
    }
    await output.start();

    const canvas = makeCanvas(size.width, size.height);
    const ctx = canvas.getContext("2d");
    const posterAt = Math.min(1.2, filmDuration / 2);
    let poster = null;
    let lastVideoT = 0;
    let lastAudioT = 0;
    const report = () => onProgress?.(Math.min(0.99, (Math.min(lastVideoT, audioSource ? lastAudioT : lastVideoT) || 0) / filmDuration));

    let filmStart = 0;
    for (const seg of segments) {
      abortIfNeeded(signal);
      const { video, audio } = await openInput(seg.sourceId);
      const segStart = filmStart;
      const segEnd = filmStart + segmentLength(seg);

      const videoJob = (async () => {
        const sink = new mb.VideoSampleSink(video);
        for await (const sample of sink.samples(seg.in, seg.out)) {
          abortIfNeeded(signal);
          const t = segStart + Math.max(0, sample.timestamp - seg.in);
          if (t >= segEnd) {
            sample.close();
            break;
          }
          ctx.globalAlpha = 1;
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, size.width, size.height);
          ctx.globalAlpha = frameAlpha(t, filmDuration);
          sample.drawWithFit(ctx, { fit: "contain" });
          ctx.globalAlpha = 1;
          if (!poster && t >= posterAt) poster = await canvasToJpeg(canvas);
          const out = new mb.VideoSample(canvas, { timestamp: t, duration: Math.min(sample.duration || 1 / 30, segEnd - t) });
          sample.close();
          await videoSource.add(out);
          out.close();
          lastVideoT = t;
          report();
        }
      })();

      const audioJob = (async () => {
        if (!audioSource || !audio) return;
        const sink = new mb.AudioSampleSink(audio);
        for await (const a of sink.samples(seg.in, seg.out)) {
          abortIfNeeded(signal);
          const rate = a.sampleRate;
          const channels = a.numberOfChannels;
          if (rate !== audioMeta.sampleRate || channels !== audioMeta.numberOfChannels) {
            a.close();
            throw new Error("Recordings use different audio formats.");
          }
          // Cut the piece to the segment's window, sample-accurately.
          const { skip, count, start } = audioWindow(a.timestamp, a.numberOfFrames, rate, seg.in, seg.out);
          if (count <= 0) {
            a.close();
            continue;
          }
          const data = new Float32Array(count * channels);
          for (let ch = 0; ch < channels; ch++) {
            a.copyTo(data.subarray(ch * count, (ch + 1) * count), { planeIndex: ch, format: "f32-planar", frameOffset: skip, frameCount: count });
          }
          const t0 = segStart + start;
          a.close();
          for (let i = 0; i < count; i++) {
            const g = gainAt(t0 + i / rate, filmDuration, segStart, segEnd);
            if (g < 1) for (let ch = 0; ch < channels; ch++) data[ch * count + i] *= g;
          }
          const out = new mb.AudioSample({ data, format: "f32-planar", numberOfChannels: channels, sampleRate: rate, timestamp: t0 });
          await audioSource.add(out);
          out.close();
          lastAudioT = t0;
          report();
        }
      })();

      await Promise.all([videoJob, audioJob]);
      filmStart = segEnd;
    }

    videoSource.close();
    audioSource?.close();
    await output.finalize();
    const blob = new File([output.target.buffer], "feedback.mp4", { type: "video/mp4" });
    onProgress?.(1);
    return { blob, poster, duration: filmDuration, width: size.width, height: size.height, method: "webcodecs" };
  } finally {
    for (const { input } of inputs.values()) input.dispose?.();
  }
}

function pickRecorderMime() {
  for (const t of ["video/mp4;codecs=avc1,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]) {
    if (window.MediaRecorder?.isTypeSupported?.(t)) return t;
  }
  return "";
}

function once(target, event) {
  return new Promise((resolve, reject) => {
    const ok = () => {
      target.removeEventListener("error", bad);
      resolve();
    };
    const bad = () => {
      target.removeEventListener(event, ok);
      reject(new Error("A recording couldn't be played on this device."));
    };
    target.addEventListener(event, ok, { once: true });
    target.addEventListener("error", bad, { once: true });
  });
}

// Real-time fallback: plays each segment into a canvas + audio graph that a
// MediaRecorder captures, pausing the recorder while it seeks between cuts.
async function renderByPlayback({ segments, sources, getSourceBlob, onProgress, signal, filmDuration }) {
  if (typeof window === "undefined" || typeof window.MediaRecorder === "undefined") {
    throw new Error("This device can't put the video together. Try Chrome or Safari on a newer device.");
  }
  const first = sources[segments[0].sourceId] || {};
  const size = outputSize(first.width, first.height, 1280);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const audioCtx = new AudioCtx();
  const dest = audioCtx.createMediaStreamDestination();
  const gain = audioCtx.createGain();
  gain.connect(dest);
  const video = document.createElement("video");
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.muted = false;
  video.preload = "auto";
  const node = audioCtx.createMediaElementSource(video);
  node.connect(gain);

  const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const mimeType = pickRecorderMime();
  const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: videoBitrateFor(filmDuration, size.width, size.height) });
  const parts = [];
  recorder.ondataavailable = (e) => e.data?.size && parts.push(e.data);

  const urls = [];
  let poster = null;
  let filmStart = 0;
  let raf = 0;
  try {
    await audioCtx.resume();
    for (let i = 0; i < segments.length; i++) {
      abortIfNeeded(signal);
      const seg = segments[i];
      const blob = await getSourceBlob(seg.sourceId);
      const url = URL.createObjectURL(blob);
      urls.push(url);
      video.src = url;
      await once(video, "loadedmetadata");
      video.currentTime = seg.in;
      await once(video, "seeked");
      const segStart = filmStart;
      const segEnd = filmStart + segmentLength(seg);
      const draw = () => {
        const t = segStart + Math.max(0, video.currentTime - seg.in);
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, size.width, size.height);
        const vw = video.videoWidth || size.width;
        const vh = video.videoHeight || size.height;
        const s = Math.min(size.width / vw, size.height / vh);
        ctx.globalAlpha = frameAlpha(t, filmDuration);
        ctx.drawImage(video, (size.width - vw * s) / 2, (size.height - vh * s) / 2, vw * s, vh * s);
        ctx.globalAlpha = 1;
        gain.gain.value = gainAt(t, filmDuration, segStart, segEnd);
        onProgress?.(Math.min(0.99, t / filmDuration));
        if (!poster && t >= Math.min(1.2, filmDuration / 2)) canvasToJpeg(canvas).then((b) => (poster = poster || b));
        raf = requestAnimationFrame(draw);
      };
      draw();
      if (recorder.state === "inactive") recorder.start(1000);
      else recorder.resume();
      await video.play();
      await new Promise((resolve) => {
        const check = () => {
          if (signal?.aborted || video.ended || video.currentTime >= seg.out) {
            video.removeEventListener("timeupdate", check);
            video.removeEventListener("ended", check);
            resolve();
          }
        };
        video.addEventListener("timeupdate", check);
        video.addEventListener("ended", check);
      });
      video.pause();
      recorder.pause();
      cancelAnimationFrame(raf);
      filmStart = segEnd;
    }
    abortIfNeeded(signal);
    const stopped = new Promise((resolve) => (recorder.onstop = resolve));
    recorder.stop();
    await stopped;
    const type = (recorder.mimeType || mimeType || "video/mp4").split(";")[0];
    let blob = new File(parts, type.includes("mp4") ? "feedback.mp4" : "feedback.webm", { type });
    if (type.includes("mp4")) blob = await ensureFastStart(blob);
    onProgress?.(1);
    return { blob, poster, duration: filmDuration, width: size.width, height: size.height, method: "playback" };
  } finally {
    cancelAnimationFrame(raf);
    try {
      if (recorder.state !== "inactive") recorder.stop();
    } catch {}
    stream.getTracks().forEach((t) => t.stop());
    video.removeAttribute("src");
    urls.forEach((u) => URL.revokeObjectURL(u));
    audioCtx.close().catch(() => {});
  }
}

// A camera recording is a fragmented MP4 (written a second at a time).
// Re-packaged without re-encoding into a plain MP4 with its index at the
// front, which every player starts and seeks quickly. Any failure keeps
// the recording as it is.
export async function remuxFastStart(file) {
  let input;
  try {
    const mb = await import("mediabunny");
    input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
    const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target: new mb.BufferTarget() });
    const conversion = await mb.Conversion.init({ input, output });
    if (!conversion.isValid || conversion.discardedTracks.length) return ensureFastStart(file);
    await conversion.execute();
    return new File([output.target.buffer], file.name || "feedback.mp4", { type: "video/mp4" });
  } catch {
    return ensureFastStart(file);
  } finally {
    input?.dispose?.();
  }
}

// A still from the video for the client's thumbnail.
export async function posterFromBlob(blob, atSec = 1) {
  if (typeof document === "undefined") return null;
  const url = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  try {
    video.src = url;
    await once(video, "loadedmetadata");
    video.currentTime = Math.min(atSec, (video.duration || atSec) / 2 || 0);
    await once(video, "seeked");
    const { width, height } = outputSize(video.videoWidth, video.videoHeight, 1280);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(video, 0, 0, width, height);
    return await canvasToJpeg(canvas);
  } catch {
    return null;
  } finally {
    video.removeAttribute("src");
    URL.revokeObjectURL(url);
  }
}
