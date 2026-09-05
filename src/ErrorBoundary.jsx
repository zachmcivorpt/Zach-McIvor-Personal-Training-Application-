import React from "react";

// Without this, any uncaught render error anywhere in the tree unmounts the
// whole app and leaves a blank white page with no way back in short of
// manually retyping the URL — which is exactly what "the page went blank"
// bug reports were. This catches it, shows a real recovery screen instead,
// and logs the actual error so it can be tracked down from the console.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null, showDetails: false };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Uncaught render error:", error, info?.componentStack);
    this.setState({ info });
  }

  render() {
    if (this.state.error) {
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
