import React from "react";
import { Link } from "react-router-dom";
import { Logo } from "../components/ui";
import { ChevronRight } from "lucide-react";

// The new unauthenticated landing screen — see App.jsx's RootRedirect,
// whose only change for this feature is sending a signed-out visitor here
// instead of straight to /login. Coaching's own path from here is just a
// link to the existing, completely unmodified /login screen; this file
// owns no Coaching behavior at all.
export default function StartScreen() {
  return (
    <div className="min-h-dvh w-full bg-[#0A0A0B] flex flex-col px-6 py-8">
      <div className="flex justify-center pt-6">
        <Logo variant="mark" tone="white" className="h-14 w-auto" />
      </div>

      <div className="flex-1 flex flex-col justify-center gap-4 w-full max-w-sm mx-auto">
        <Link
          to="/login"
          className="block bg-white text-black font-bold py-4 rounded-2xl text-center active:scale-[0.98] transition-transform"
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
    </div>
  );
}
