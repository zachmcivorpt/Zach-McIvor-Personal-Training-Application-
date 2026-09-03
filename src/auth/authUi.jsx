import React from "react";

// Dark-mode-only field/input/button variants for the Login and Activate
// screens — these two screens stay permanently dark, so they can't share
// the light-mode-styled Field/TextInput/PrimaryButton from components/ui.jsx.
export function AuthField({ label, children, hint }) {
  return (
    <label className="block">
      <span className="block text-white/40 text-xs tracking-wide mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-white/30 text-xs mt-1">{hint}</span>}
    </label>
  );
}

export function AuthInput(props) {
  return (
    <input
      {...props}
      className={`w-full bg-white border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-black outline-none placeholder:text-black/30 focus:border-white/40 transition-colors ${props.className || ""}`}
    />
  );
}

export function AuthButton({ children, className = "", ...props }) {
  return (
    <button
      {...props}
      className={`bg-white text-black font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-30 disabled:active:scale-100 ${className}`}
    >
      {children}
    </button>
  );
}
