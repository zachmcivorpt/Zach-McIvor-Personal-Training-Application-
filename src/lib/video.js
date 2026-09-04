// Exercise demo videos can be a directly-hosted file (mp4, or a browser
// blob: URL from an in-browser upload) or a link to YouTube/Vimeo — those
// two don't serve raw video the way a plain <video src> tag expects, so
// they need an <iframe> embed instead. This figures out which one a given
// URL is and returns everything a player/thumbnail needs to render it.
export function parseVideoUrl(url) {
  if (!url) return null;
  if (url.startsWith("blob:")) return { kind: "file", src: url };

  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");

    if (host === "youtube.com") {
      let id = u.searchParams.get("v");
      if (!id) {
        const m = u.pathname.match(/^\/(?:shorts|embed)\/([\w-]+)/);
        if (m) id = m[1];
      }
      if (id) return youtubeResult(id);
    }
    if (host === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      if (id) return youtubeResult(id);
    }
    if (host === "vimeo.com") {
      const m = u.pathname.match(/^\/(\d+)/);
      if (m) return { kind: "vimeo", id: m[1], embedSrc: `https://player.vimeo.com/video/${m[1]}`, thumbnail: null };
    }
    if (host === "player.vimeo.com") {
      const m = u.pathname.match(/\/video\/(\d+)/);
      if (m) return { kind: "vimeo", id: m[1], embedSrc: url, thumbnail: null };
    }
  } catch {
    // Not a valid absolute URL (e.g. a bare filename) — treat as a file src.
  }
  return { kind: "file", src: url };
}

function youtubeResult(id) {
  return {
    kind: "youtube",
    id,
    embedSrc: `https://www.youtube-nocookie.com/embed/${id}`,
    thumbnail: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
  };
}
