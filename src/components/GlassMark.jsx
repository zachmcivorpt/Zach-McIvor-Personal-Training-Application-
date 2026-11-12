// The coach Overview's bevelled glass APEX mark and its matching heading
// type (#226). Kept out of LoginHero.jsx: the login area's mark must never
// carry a CSS blur (#209), and this one is built on one.
import { useId } from "react";
import { MARK_PATHS } from "./LoginHero";

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

