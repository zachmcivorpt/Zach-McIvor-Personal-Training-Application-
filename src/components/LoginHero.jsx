import React, { useId } from "react";
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

// The APEX mark as a vector (#210, owner picked mock-up B): razor-sharp at
// any size, with a tight glow from an SVG blur of its own shape (no CSS
// blur, no halo, no box). Same 384 x 384 framing as the bundled PNG, so it
// sits and sizes exactly where the image did.
const MARK_PATHS = [
  "M204.8 107.9 L98.8 263.5 L102.5 263.1 L173.4 192.4 L205 155.5 L213.5 165.5 L230.8 147.4 Z",
  "M232.6 149.5 L305.2 263.2 L245.8 220.1 L228.8 193.1 L174.8 223 L207.4 180.8 L217.8 175.5 L215.8 169.2 Z",
];

export function ApexMarkSvg({ width, opacity = 1, glow = true }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 384 384" width={width} height={width} aria-hidden="true" style={{ display: "block", overflow: "visible", opacity }} data-testid="apex-mark-svg">
      {glow && (
        <defs>
          <filter id={`g${id}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3.8" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      )}
      <g fill="#fff" filter={glow ? `url(#g${id})` : undefined}>
        {MARK_PATHS.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
    </svg>
  );
}

// Glassy, see-through mark (#225, coach Overview): the same vector filled
// with a white-to-clear gradient, a hairline edge and a faint blue glow.
export function GlassMarkSvg({ width = 24 }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      viewBox="0 0 384 384"
      width={width}
      height={width}
      aria-hidden="true"
      data-testid="glass-mark-svg"
      style={{ display: "block", overflow: "visible", filter: "drop-shadow(0 0 8px rgba(47,143,255,0.35)) drop-shadow(0 0 2px rgba(255,255,255,0.3))" }}
    >
      <defs>
        <linearGradient id={`gm${id}`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#9cc8ff" stopOpacity="0.25" />
        </linearGradient>
      </defs>
      <g fill={`url(#gm${id})`} stroke="rgba(255,255,255,0.55)" strokeWidth="3">
        {MARK_PATHS.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
    </svg>
  );
}

// Bevelled glass mark (#226, coach Overview — owner's pick "H"): a frosted
// pane in the mark's shape (blurs what's behind it), edges lit from the top
// left by an SVG light, a hairline rim, a soft shadow and a faint blue
// backlight. Purely decorative.
const MARK_MASK = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 384 384'>${MARK_PATHS.map((d) => `<path d='${d}' fill='black'/>`).join("")}</svg>`
)}")`;
export function BevelGlassMark({ size = 300 }) {
  const id = useId().replace(/:/g, "");
  return (
    <div style={{ position: "relative", width: size, height: size }} aria-hidden="true" data-testid="bevel-glass-mark">
      <div style={{ position: "absolute", left: "10%", top: "18%", width: size * 0.8, height: size * 0.8, borderRadius: "50%", background: "radial-gradient(circle, rgba(47,143,255,0.30), rgba(47,143,255,0.08) 45%, transparent 70%)", filter: "blur(10px)" }} />
      <div style={{ position: "absolute", inset: 0, filter: "drop-shadow(0 20px 28px rgba(0,0,0,0.6))" }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(160deg, rgba(255,255,255,0.20) 0%, rgba(255,255,255,0.08) 45%, rgba(140,190,255,0.06) 100%)",
            backdropFilter: "blur(18px) saturate(160%)",
            WebkitBackdropFilter: "blur(18px) saturate(160%)",
            WebkitMaskImage: MARK_MASK,
            maskImage: MARK_MASK,
            WebkitMaskSize: "100% 100%",
            maskSize: "100% 100%",
          }}
        />
      </div>
      <svg viewBox="0 0 384 384" width={size} height={size} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <defs>
          <filter id={`bev${id}`} x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="5" result="b" />
            <feSpecularLighting in="b" surfaceScale="6" specularConstant="1.1" specularExponent="22" lightingColor="#ffffff" result="s">
              <fePointLight x="40" y="-120" z="220" />
            </feSpecularLighting>
            <feComposite in="s" in2="SourceAlpha" operator="in" result="lit" />
            <feComponentTransfer in="lit">
              <feFuncA type="linear" slope="0.85" />
            </feComponentTransfer>
          </filter>
          <linearGradient id={`rim${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.6" />
            <stop offset="0.5" stopColor="#bcdcff" stopOpacity="0.2" />
            <stop offset="1" stopColor="#fff" stopOpacity="0.36" />
          </linearGradient>
        </defs>
        <g fill="#fff" filter={`url(#bev${id})`}>
          {MARK_PATHS.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
        <g fill="none" stroke={`url(#rim${id})`} strokeWidth="1.5" strokeLinejoin="round">
          {MARK_PATHS.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
      </svg>
    </div>
  );
}

// Heading type to match the bevelled glass mark: brushed white-to-steel
// with a faint rim light and blue glow (#226).
export const GLASS_HEADING_STYLE = {
  backgroundImage: "linear-gradient(180deg, #FFFFFF 0%, #E6EEF9 45%, #9DB3CF 100%)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
  WebkitTextFillColor: "transparent",
  filter: "drop-shadow(0 1px 0 rgba(255,255,255,0.18)) drop-shadow(0 6px 18px rgba(47,143,255,0.22))",
};

// Solid lit mark (chooser + log-in screens). `crisp` (chooser, #208): full
// strength with its own glow, no fade.
export function LitLogo({ width = 104, reflection = false, crisp = false }) {
  return (
    <div className="relative flex flex-col items-center" data-testid="lit-logo">
      {crisp ? (
        <div className="relative" style={{ width }} data-testid="lit-logo-crisp" role="img" aria-label="APEX">
          <ApexMarkSvg width={width} />
        </div>
      ) : (
        <Logo variant="mark" tone="white" className="relative h-auto" style={{ width, ...markShade }} />
      )}
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
      <div style={layer} role="img" aria-label="APEX">
        <ApexMarkSvg width={width} />
      </div>
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
