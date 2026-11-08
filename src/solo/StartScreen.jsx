import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Logo } from "../components/ui";
import { SoloBackgroundFrame } from "./SoloBackground";
import { useSoloLoginBackground } from "./useSoloLoginBackground";
import { ChevronRight } from "lucide-react";
import { EchoHeading, GlowLogo, LitLogo, START_CHOOSER } from "../components/LoginHero";

// The unauthenticated landing screen — see App.jsx's RootRedirect.
// #207 (owner 2026-11-08): a first page (glowing APEX mark, "Train solo.
// Train smarter." with its faded echo, page dots, ring arrow) comes before
// the Coaching / Train Solo chooser. The arrow opens the chooser at
// /start?step=choose, which is where every log-in screen's Back returns.
// Coaching's path from here is still just a link to /login; this file owns
// no Coaching behavior at all. The coach's login background (Design
// Settings) still shows behind both when one is set.
export default function StartScreen() {
  const appDesign = useSoloLoginBackground();
  const [params] = useSearchParams();
  return params.get("step") === "choose" ? <Chooser appDesign={appDesign} /> : <FirstPage appDesign={appDesign} />;
}

function FirstPage({ appDesign }) {
  return (
    <SoloBackgroundFrame appDesign={appDesign} className="flex flex-col px-6 pt-8 pb-[calc(2rem+env(safe-area-inset-bottom,0px))]">
      <div className="flex justify-end">
        <Logo variant="mark" tone="white" className="h-6 w-auto" />
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-14">
        <GlowLogo width={250} />
        <EchoHeading size={32} echo={<>Train solo. Train<br />smarter.</>}>
          Train solo.
          <br />
          Train smarter.
        </EchoHeading>
        <div className="flex justify-center gap-2" aria-hidden="true">
          <span className="block w-5 h-[9px] rounded-full bg-white/20" />
          <span className="block w-5 h-[9px] rounded-full bg-white/20" />
          <span className="block w-[30px] h-[9px] rounded-full bg-white" style={{ boxShadow: "0 0 12px rgba(255,255,255,0.8)" }} />
        </div>
      </div>
      <div className="flex justify-end">
        <Link
          to={START_CHOOSER}
          aria-label="Get started"
          className="w-14 h-14 rounded-full border-[2.5px] border-white flex items-center justify-center text-white active:scale-95 transition-transform"
          style={{ boxShadow: "0 0 16px rgba(255,255,255,0.45)" }}
        >
          <ChevronRight size={22} strokeWidth={3} />
        </Link>
      </div>
    </SoloBackgroundFrame>
  );
}

function Chooser({ appDesign }) {
  return (
    <SoloBackgroundFrame appDesign={appDesign}>
      <div className="flex-1 flex items-center justify-center pt-10">
        <LitLogo width={200} reflection />
      </div>

      <div className="flex flex-col gap-4 w-full max-w-sm mx-auto pb-4">
        <Link
          to="/login"
          className="block bg-white text-black font-bold py-4 rounded-2xl text-center active:scale-[0.98] transition-transform"
          style={{ boxShadow: "0 0 22px rgba(255,255,255,0.35)" }}
        >
          <span className="flex items-center justify-center gap-2">
            Coaching <ChevronRight size={18} />
          </span>
          <span className="block text-black/50 text-xs font-medium mt-1">Train with your coach</span>
        </Link>

        <Link
          to="/solo/register"
          className="block bg-white/10 border border-white/15 text-white font-bold py-4 rounded-2xl text-center active:scale-[0.98] transition-transform"
        >
          <span className="flex items-center justify-center gap-2">
            Train Solo <ChevronRight size={18} />
          </span>
          <span className="block text-white/50 text-xs font-medium mt-1">Train independently, on your own program</span>
        </Link>
      </div>
    </SoloBackgroundFrame>
  );
}
