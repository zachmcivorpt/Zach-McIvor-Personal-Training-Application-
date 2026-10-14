import React from "react";

// Browsers phrase a failed dynamic import() (React.lazy() in App.jsx:
// CoachShell/ClientApp) differently, but this is the one failure mode
// where reloading is actually likely to fix it rather than just reproduce
// it: the client's already-running bundle is older than the current
// deployment, and it just tried to fetch a hashed chunk file (e.g.
// /assets/index-DhhbY1Lj.js) that this deployment no longer has.
const STALE_CHUNK_PATTERN = /dynamically imported module|importing a module script failed|error loading dynamically imported module/i;
function isStaleChunkError(error) {
  return STALE_CHUNK_PATTERN.test(String(error?.message || error));
}

// One-shot guard against a reload loop: sessionStorage so it's scoped to
// this tab and this navigation, and so a *different, later* crash (a real
// bug, not a stale chunk) after a successful reload still gets exactly one
// more automatic attempt rather than being silently blocked forever by an
// earlier unrelated recovery.
const RELOAD_FLAG = "apexStaleChunkReloadAttempted";

// Without this, any uncaught render error anywhere in the tree unmounts the
// whole app and leaves a blank white page with no way back in short of
// manually retyping the URL — which is exactly what "the page went blank"
// bug reports were. This catches it, shows a real recovery screen instead,
// and logs the actual error so it can be tracked down from the console.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null, showDetails: false, recovering: false };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Uncaught render error:", error, info?.componentStack);
    this.setState({ info });

    if (!isStaleChunkError(error)) return;

    let alreadyAttempted = false;
    try {
      alreadyAttempted = sessionStorage.getItem(RELOAD_FLAG) === "1";
    } catch {}
    if (alreadyAttempted) {
      console.error("Stale-chunk import failed again after a reload attempt — showing recovery screen instead of looping.");
      return;
    }

    console.error("Stale chunk detected (deployment moved on while this tab was open) — attempting one recovery reload.");
    try {
      sessionStorage.setItem(RELOAD_FLAG, "1");
    } catch {}
    this.setState({ recovering: true });

    // Best-effort: give the service worker a chance to pick up the new
    // version before we reload, so the reload actually fetches the current
    // deployment's index.html instead of re-serving a still-stale precached
    // copy. If this fails or there's no registration, reload anyway —
    // skipped SW update is strictly worse than not reloading at all, never
    // worse than the crash the user is already looking at.
    const reload = () => window.location.reload();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .getRegistration()
        .then((reg) => reg?.update())
        .catch(() => {})
        .finally(reload);
    } else {
      reload();
    }
  }

  render() {
    if (this.state.error) {
      // A stale-chunk reload is already in flight (componentDidCatch
      // kicked it off synchronously) — show a blank-but-branded holding
      // screen instead of flashing the full "Something went wrong" error UI
      // for what should only be a brief moment before the reload lands.
      if (this.state.recovering) {
        return <div className="w-full h-full min-h-screen bg-white" />;
      }
      return (
        <div className="w-full h-full min-h-screen bg-white flex items-center justify-center px-6 font-sans">
          <div className="max-w-sm w-full text-center">
            <p className="text-black font-bold text-lg mb-2">Something went wrong</p>
            <p className="text-black/50 text-sm mb-6">
              This screen hit an unexpected error. Your data is safe — reloading should fix it.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="bg-black text-white text-sm font-bold px-5 py-3 rounded-xl w-full mb-3"
            >
              Reload
            </button>
            {/* Hidden by default so a client who hits this never sees a
                wall of stack trace — the coach can tap it to grab the exact
                error text to send back for a real fix, instead of this
                screen just being a dead end. */}
            <button
              onClick={() => this.setState((s) => ({ showDetails: !s.showDetails }))}
              className="text-black/30 hover:text-black/50 text-xs font-medium"
            >
              {this.state.showDetails ? "Hide" : "Show"} error details
            </button>
            {this.state.showDetails && (
              <pre className="mt-3 text-left bg-black/[0.04] rounded-xl p-3 text-[10px] text-black/70 whitespace-pre-wrap break-words max-h-60 overflow-y-auto">
                {String(this.state.error?.stack || this.state.error?.message || this.state.error)}
                {this.state.info?.componentStack ? `\n\nComponent stack:${this.state.info.componentStack}` : ""}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
