// The coach-uploaded logo (Settings -> Design Settings) used to take a
// couple of seconds to appear on every launch: the app first had to load
// settings/appDesign to learn the logo's URL (showing the default mark
// meanwhile), then download a 1024px PNG that Firebase Storage serves with
// no caching. Now:
//  - the last-known logo URLs are remembered on the device, so the right
//    logo renders on the very first frame;
//  - known uploads map to a small copy bundled with the app (cached and
//    available offline), same idea as LoginBackground's OPTIMIZED map;
//  - new uploads are saved smaller and with a long cache lifetime (see
//    storage.js / CoachMore's LogoCropModal).
const BUNDLED = {
  "design/appLogoUrlOnDark_1792373913084_7A4D6D51-051F-4656-84C7-217E22048388.png": "/brand/app-logo-dark-1792373913084.png",
  "design/appLogoUrlOnLight_1792373876950_IMG_2121.png": "/brand/app-logo-light-1792373876950.png",
};

const MEMORY_KEY = "apexAppLogos";

function readMemory() {
  try {
    const v = JSON.parse(localStorage.getItem(MEMORY_KEY) || "null");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

// A device that has never loaded settings starts from the logos bundled
// above (the current uploads) rather than the default mark, so even a
// first launch shows the right logo instantly.
const SEED = {
  dark: "https://firebasestorage.googleapis.com/v0/b/zach-mcivor-pt-app.firebasestorage.app/o/design%2FappLogoUrlOnDark_1792373913084_7A4D6D51-051F-4656-84C7-217E22048388.png?alt=media&token=1179a71b-d285-45a5-bed8-298d3f7d37c6",
  light: "https://firebasestorage.googleapis.com/v0/b/zach-mcivor-pt-app.firebasestorage.app/o/design%2FappLogoUrlOnLight_1792373876950_IMG_2121.png?alt=media&token=be8d3173-42fa-4836-b46b-38b59e0c1a34",
};

const stored = readMemory();
let remembered = "dark" in stored || "light" in stored ? stored : SEED;

// settings/appDesign hasn't arrived yet while neither logo field exists on
// it (the pre-load default object has neither; a loaded doc has the field,
// null once a logo is removed).
export function appLogoUrls(design) {
  const loaded = design && (design.appLogoUrlOnDark !== undefined || design.appLogoUrlOnLight !== undefined);
  return loaded ? { dark: design.appLogoUrlOnDark || null, light: design.appLogoUrlOnLight || null, loaded } : { ...remembered, loaded: false };
}

export function rememberAppLogos(dark, light) {
  if (remembered.dark === dark && remembered.light === light) return;
  remembered = { dark, light };
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(remembered));
  } catch {}
}

function storagePath(url) {
  try {
    const match = /\/o\/([^?]+)/.exec(new URL(url).pathname);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

export function resolveAppLogoUrl(url) {
  if (!url) return null;
  return BUNDLED[storagePath(url)] || url;
}
