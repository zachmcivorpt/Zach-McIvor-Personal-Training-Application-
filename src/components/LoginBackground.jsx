import React, { useEffect, useState } from "react";

// The coach-set login background (settings/appDesign.loginBackgroundUrl),
// shared by the Coaching login and Train Solo's start/login/register/
// consultation screens.
//
// The uploaded file is the raw phone video — 13 MB, served by Firebase
// Storage with no caching, so every login screen re-downloaded all of it
// before anything appeared. Known uploads are mapped to a web-optimized
// copy bundled with the app (≈0.65 MB MP4 + a first-frame poster, cached
// on the device): the poster shows instantly, the video fades in over it.
// Videos uploaded since then are shrunk server-side on upload
// (optimizeLoginBackground), which saves loginBackgroundPosterUrl alongside
// the optimized loginBackgroundUrl, so they get the same instant poster.
const OPTIMIZED = {
  "design/login-bg_1790774514875_IMG_7441.mov": {
    video: "/brand/login-bg-1790774514875.mp4",
    poster: "/brand/login-bg-1790774514875.jpg",
  },
};

function storagePath(url) {
  try {
    const match = /\/o\/([^?]+)/.exec(new URL(url).pathname);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

export function resolveLoginBackground(appDesign) {
  const url = appDesign?.loginBackgroundUrl;
  if (!url) return null;
  const isVideo = appDesign?.loginBackgroundType === "video";
  const optimized = isVideo ? OPTIMIZED[storagePath(url)] : null;
  if (optimized) return { type: "video", src: optimized.video, poster: optimized.poster };
  return { type: isVideo ? "video" : "image", src: url, poster: (isVideo && appDesign?.loginBackgroundPosterUrl) || null };
}

const MEDIA_STYLE = { filter: "brightness(0.95) contrast(1.05) saturate(0.95)" };

// The photo/video screens (Coaching login, the Coaching / Train Solo
// chooser, Train Solo's login/register/questionnaire) keep their background
// pinned to the screen: it sits in a fixed layer, and while one of these
// screens is up the page itself can't rubber-band (iOS dragged the whole
// page, photo included, showing the white page behind it) and its own
// background is the same near-black, so nothing white ever shows.
export function PinnedLoginBackdrop({ appDesign }) {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("apex-photo-page");
    return () => root.classList.remove("apex-photo-page");
  }, []);
  return (
    <div className="fixed inset-0 pointer-events-none" aria-hidden="true">
      {appDesign?.loginBackgroundUrl && (
        <>
          <LoginBackground appDesign={appDesign} />
          <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/20 to-black/70" />
        </>
      )}
    </div>
  );
}

export default function LoginBackground({ appDesign }) {
  const bg = resolveLoginBackground(appDesign);
  const [ready, setReady] = useState(false);
  if (!bg) return null;
  const fade = `absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${ready ? "opacity-100" : "opacity-0"}`;
  return (
    <>
      {bg.poster && (
        <img src={bg.poster} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover" style={MEDIA_STYLE} />
      )}
      {bg.type === "video" ? (
        <video
          key={bg.src}
          src={bg.src}
          poster={bg.poster || undefined}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          onLoadedData={() => setReady(true)}
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
          className={fade}
          style={MEDIA_STYLE}
        />
      ) : (
        <img
          key={bg.src}
          src={bg.src}
          alt=""
          draggable={false}
          onLoad={() => setReady(true)}
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
          className={fade}
          style={MEDIA_STYLE}
        />
      )}
    </>
  );
}
