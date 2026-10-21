// Shrinks an uploaded login background video into a web-ready copy plus a
// first-frame poster image. Phone videos come straight off the camera
// (e.g. 13 MB for 4.5s: 60fps, full resolution, with an audio track the
// background never plays); this produces ~0.5–1 MB H.264 MP4 at 30fps, no
// audio, at most 1280px tall, with the index at the front (faststart) so
// playback can begin before the whole file arrives.
const { spawn } = require("child_process");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;

const MAX_SECONDS = 20;

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-y", ...args]);
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d));
    proc.on("error", reject);
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`))));
  });
}

// Never upscales: a video already under 1280px tall keeps its own height.
const SCALE = "scale=-2:'min(1280,ih)'";

async function optimizeLoginVideo(inputPath, outVideoPath, outPosterPath) {
  await runFfmpeg([
    "-i", inputPath,
    "-t", String(MAX_SECONDS),
    "-an",
    "-vf", `${SCALE},fps=30,format=yuv420p`,
    "-c:v", "libx264", "-profile:v", "high", "-preset", "slow", "-crf", "26",
    "-movflags", "+faststart",
    outVideoPath,
  ]);
  await runFfmpeg(["-i", inputPath, "-frames:v", "1", "-vf", SCALE, "-q:v", "5", outPosterPath]);
}

// The storage object path inside a Firebase download URL
// (…/o/design%2Flogin-bg_….mov?alt=media&token=…), or null.
function storagePathFromUrl(url) {
  try {
    const match = /\/o\/([^?]+)/.exec(new URL(url).pathname);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

module.exports = { optimizeLoginVideo, storagePathFromUrl, MAX_SECONDS };
