import React from "react";
import { Logo } from "./ui";

// The login area's look (#207, owner 2026-11-08, from the Nike CG ADAPT
// reference): a lit white APEX mark on black with a soft glow, and a
// heading with a larger faded echo of the same words behind it. Styling
// only — shared by StartScreen (first page + chooser), Coaching's
// LoginScreen and Train Solo's SoloLoginScreen.
//
// Never a CSS drop-shadow on the mark: the PNG has near-transparent pixels
// around it that a large drop-shadow turns into a visible box. Glows are
// blurred copies of the mark or a radial gradient instead.

const markShade = {
  WebkitMaskImage: "linear-gradient(180deg, #000 25%, rgba(0,0,0,0.5) 100%)",
  maskImage: "linear-gradient(180deg, #000 25%, rgba(0,0,0,0.5) 100%)",
};

// Solid lit mark with a radial glow behind (chooser + log-in screens).
export function LitLogo({ width = 104, reflection = false }) {
  const glow = Math.round(width * 2.2);
  return (
    <div className="relative flex flex-col items-center" data-testid="lit-logo">
      <div
        aria-hidden="true"
        className="absolute rounded-full pointer-events-none"
        style={{
          width: glow,
          height: glow,
          top: Math.round(width * 0.38) - glow / 2,
          left: "50%",
          transform: "translateX(-50%)",
          background: "radial-gradient(closest-side, rgba(255,255,255,0.16), rgba(255,255,255,0))",
        }}
      />
      <Logo variant="mark" tone="white" className="relative h-auto" style={{ width, ...markShade }} />
      {reflection && (
        <div aria-hidden="true" className="relative pointer-events-none overflow-hidden" style={{ height: Math.round(width * 0.4) }}>
          <Logo
            variant="mark"
            tone="white"
            className="h-auto"
            style={{
              width,
              transform: "scaleY(-1)",
              opacity: 0.12,
              WebkitMaskImage: "linear-gradient(0deg, #000 40%, transparent 100%)",
              maskImage: "linear-gradient(0deg, #000 40%, transparent 100%)",
            }}
          />
        </div>
      )}
    </div>
  );
}

// See-through mark with a white glow (first page): two blurred copies
// under a half-opaque sharp one.
export function GlowLogo({ width = 250 }) {
  const layer = { width, position: "absolute", left: 0, top: 0 };
  return (
    <div className="relative" style={{ width, height: Math.round(width * 0.77) }} data-testid="glow-logo">
      <Logo variant="mark" tone="white" className="h-auto" style={{ ...layer, filter: "blur(18px)", opacity: 0.7 }} />
      <Logo variant="mark" tone="white" className="h-auto" style={{ ...layer, filter: "blur(5px)", opacity: 0.5 }} />
      <Logo variant="mark" tone="white" className="h-auto" style={{ ...layer, opacity: 0.5 }} />
    </div>
  );
}

// Heading with its faded, larger echo behind it (wider than the screen,
// clipped by the page). `as` keeps the real heading element.
export function EchoHeading({ children, echo: echoText, size = 28, as: Tag = "h1", className = "" }) {
  const echo = Math.round(size * 1.25);
  return (
    <div className={`relative text-center ${className}`}>
      <div
        aria-hidden="true"
        className="absolute left-1/2 font-extrabold uppercase whitespace-nowrap pointer-events-none select-none"
        style={{ fontSize: echo, lineHeight: 1.12, top: -Math.round(size * 0.6), transform: "translateX(-50%)", color: "rgba(255,255,255,0.15)" }}
      >
        {echoText || children}
      </div>
      <Tag
        className="relative text-white font-extrabold uppercase"
        style={{ fontSize: size, lineHeight: 1.12, textShadow: "0 0 18px rgba(255,255,255,0.35)" }}
      >
        {children}
      </Tag>
    </div>
  );
}

// The chooser's address, so Back from a log-in screen skips the first page.
export const START_CHOOSER = "/start?step=choose";
