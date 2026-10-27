// Client-side video compression before upload — phone cameras routinely
// shoot form-check clips at 1080p/4K and 15-30+ Mbps, which on a mobile
// upload connection can take minutes even for a short clip. Re-encoding
// down to a modest resolution/bitrate before the Firebase Storage upload
// starts cuts the bytes that actually have to travel over the network,
// which is the real lever on upload time (the network, not our upload
// code, is the bottleneck).
//
// This only ever helps or no-ops: any failure, timeout, or missing browser
// API falls back to resolving the original, untouched file, so a device
// that can't do this (or a video that's already small) uploads exactly as
// it did before this existed.

const SKIP_BELOW_BYTES = 8 * 1024 * 1024; // already quick to upload as it is
const TARGET_MAX_DIM = 960;
const TARGET_BITRATE = 2_000_000; // ~2 Mbps — plenty for reviewing exercise form

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = ["video/mp4;codecs=h264", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported?.(type)) return type;
  }
  return null;
}

// Fast path: hardware re-encoding through WebCodecs (Safari 16.4+, Chrome),
// via mediabunny, which reads the file in pieces — a 2-minute clip takes
// seconds, not the clip's own length like the playback path below. It's
// loaded only when a video is picked. Resolves with the compressed File,
// the original `file` (it ran but timed out or didn't shrink it), or
// `undefined` when this device can't do it, so the playback path is tried.
async function fastCompress(file, onProgress) {
  if (typeof window === "undefined" || typeof window.VideoEncoder === "undefined" || typeof window.VideoDecoder === "undefined") return undefined;
  let input;
  try {
    const mb = await import("mediabunny");
    const mp4 = await mb.canEncodeVideo("avc", { width: TARGET_MAX_DIM, height: 540, bitrate: TARGET_BITRATE });
    const codec = mp4 ? "avc" : (await mb.canEncodeVideo("vp9", { width: TARGET_MAX_DIM, height: 540, bitrate: TARGET_BITRATE })) ? "vp9" : null;
    if (!codec) return undefined;
    input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
    const output = new mb.Output({
      format: mp4 ? new mb.Mp4OutputFormat({ fastStart: "in-memory" }) : new mb.WebMOutputFormat(),
      target: new mb.BufferTarget(),
    });
    const conversion = await mb.Conversion.init({
      input,
      output,
      video: async (track) => {
        const w = await track.getDisplayWidth();
        const h = await track.getDisplayHeight();
        const scale = Math.min(1, TARGET_MAX_DIM / Math.max(w, h));
        return { width: Math.round((w * scale) / 2) * 2, height: Math.round((h * scale) / 2) * 2, fit: "contain", codec, bitrate: TARGET_BITRATE, forceTranscode: true };
      },
    });
    if (!conversion.isValid || conversion.discardedTracks.some((d) => d.track.type === "video")) return undefined;
    conversion.onProgress = (p) => onProgress?.(Math.min(0.3, p * 0.3));
    const duration = await input.computeDuration().catch(() => 120);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      conversion.cancel().catch(() => {});
    }, 30_000 + duration * 1500);
    try {
      await conversion.execute();
    } catch (err) {
      if (timedOut) return file;
      throw err;
    } finally {
      clearTimeout(timer);
    }
    const type = mp4 ? "video/mp4" : "video/webm";
    const name = file.name.replace(/\.[^.]+$/, "") + `_compressed.${mp4 ? "mp4" : "webm"}`;
    const compressed = new File([output.target.buffer], name, { type });
    return compressed.size < file.size * 0.85 ? compressed : file;
  } catch {
    return undefined;
  } finally {
    input?.dispose?.();
  }
}

// Resolves with a compressed File, or the original `file` if compression
// isn't applicable, isn't supported, or fails/times out for any reason.
export async function maybeCompressVideo(file, onProgress) {
  if (!file.type.startsWith("video/") || file.size < SKIP_BELOW_BYTES) return file;
  const fast = await fastCompress(file, onProgress);
  if (fast) return fast;
  const mimeType = pickMimeType();
  if (!mimeType || typeof window === "undefined" || !window.MediaRecorder) return file;

  let objectUrl;
  let audioCtx;
  try {
    const compressed = await new Promise((resolve, reject) => {
      const video = document.createElement("video");
      objectUrl = URL.createObjectURL(file);
      video.src = objectUrl;
      video.muted = false;
      video.volume = 0; // silent locally; audio is still tapped for the recording below
      video.playsInline = true;

      const hardTimeout = setTimeout(() => reject(new Error("timeout")), 120_000);

      video.onerror = () => {
        clearTimeout(hardTimeout);
        reject(new Error("couldn't read video"));
      };

      video.onloadedmetadata = () => {
        const duration = video.duration;
        // A per-clip timeout generous enough for real-time re-encoding plus
        // overhead on a slow device, but bounded so a stuck device falls
        // back to the original upload instead of hanging indefinitely.
        clearTimeout(hardTimeout);
        const perClipTimeout = setTimeout(() => reject(new Error("timeout")), Math.max(20_000, duration * 2500 + 15_000));

        const scale = Math.min(1, TARGET_MAX_DIM / Math.max(video.videoWidth, video.videoHeight));
        const w = Math.round((video.videoWidth * scale) / 2) * 2;
        const h = Math.round((video.videoHeight * scale) / 2) * 2;
        if (!w || !h) {
          clearTimeout(perClipTimeout);
          reject(new Error("no dimensions"));
          return;
        }

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");

        const videoStream = canvas.captureStream(30);
        const combined = new MediaStream(videoStream.getVideoTracks());

        try {
          audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          const source = audioCtx.createMediaElementSource(video);
          const dest = audioCtx.createMediaStreamDestination();
          source.connect(dest);
          dest.stream.getAudioTracks().forEach((t) => combined.addTrack(t));
        } catch {
          // No audio track is fine — silent form-check clips still work.
        }

        const recorder = new MediaRecorder(combined, { mimeType, videoBitsPerSecond: TARGET_BITRATE });
        const chunks = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };
        recorder.onerror = () => {
          clearTimeout(perClipTimeout);
          reject(new Error("recorder failed"));
        };
        recorder.onstop = () => {
          clearTimeout(perClipTimeout);
          const blob = new Blob(chunks, { type: mimeType.split(";")[0] });
          const ext = mimeType.startsWith("video/mp4") ? "mp4" : "webm";
          const name = file.name.replace(/\.[^.]+$/, "") + `_compressed.${ext}`;
          resolve(new File([blob], name, { type: blob.type }));
        };

        let rafId;
        const drawFrame = () => {
          if (video.paused || video.ended) return;
          ctx.drawImage(video, 0, 0, w, h);
          onProgress?.(Math.min(0.3, (video.currentTime / Math.max(duration, 0.01)) * 0.3));
          rafId = requestAnimationFrame(drawFrame);
        };

        video.onended = () => {
          cancelAnimationFrame(rafId);
          setTimeout(() => recorder.state !== "inactive" && recorder.stop(), 150);
        };

        recorder.start();
        video.currentTime = 0;
        video.play().then(drawFrame).catch((err) => {
          clearTimeout(perClipTimeout);
          reject(err);
        });
      };
    });

    // Only worth it if we actually shrank the file meaningfully.
    if (compressed.size < file.size * 0.85) return compressed;
    return file;
  } catch {
    return file;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    audioCtx?.close?.().catch(() => {});
  }
}
