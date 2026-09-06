import React, { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db as firestore } from "../lib/firebase";
import { useApp } from "../lib/AppContext";
import { Logo, Tagline } from "../components/ui";
import { AuthButton as PrimaryButton, AuthInput as TextInput, AuthField as Field } from "./authUi";
import { ChevronRight, Lock } from "lucide-react";

// Default APEX brand background (dark mountain peak) — shown on plain
// /login and on any coach's page who hasn't uploaded their own via
// Settings -> Design Settings.
const DEFAULT_LOGIN_BG = "/brand/login-bg.jpg";

// Open self-serve coach signup — any number of coaches can create their own
// account here, each fully isolated from every other (see coachId scoping
// in AppContext.jsx). The business name becomes this coach's own
// /login/{slug} branded sign-in link, shown back to them in Settings ->
// Design Settings once they're in.
function CoachSignupForm() {
  const { createCoachAccount } = useApp();
  const [businessName, setBusinessName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("Choose a password with at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      await createCoachAccount({ name, email, username, password, businessName });
      // Navigation happens once the profile listener picks up the new
      // account — see the useEffect in LoginScreen below.
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="text-white/50 text-sm text-center mb-6">Set up your own coach account.</p>
      <form onSubmit={submit} className="space-y-4">
        <Field label="BUSINESS NAME" hint="Becomes your own sign-in link, e.g. /login/your-business">
          <TextInput value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="e.g. Apex Fitness" required />
        </Field>
        <Field label="FULL NAME">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required />
        </Field>
        <Field label="EMAIL">
          <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
        </Field>
        <Field label="CHOOSE A USERNAME">
          <TextInput value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. zach" autoCapitalize="none" required />
        </Field>
        <Field label="CHOOSE A PASSWORD">
          <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" required />
        </Field>
        <Field label="CONFIRM PASSWORD">
          <TextInput type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Re-enter password" required />
        </Field>

        {error && <p className="text-white text-sm bg-white/10 border border-white/15 rounded-xl px-3.5 py-2.5">{error}</p>}

        <PrimaryButton
          type="submit"
          disabled={busy || !businessName || !name || !email || !username || !password || !confirm}
          className="w-full !rounded-full"
        >
          <Lock size={16} /> CREATE ACCOUNT & SIGN IN
        </PrimaryButton>
      </form>
    </div>
  );
}

export default function LoginScreen() {
  const { login, currentUser, db } = useApp();
  const navigate = useNavigate();
  const { coachSlug } = useParams();
  const [role, setRole] = useState("client");
  const [coachMode, setCoachMode] = useState("signin"); // "signin" | "signup"
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [bgLoaded, setBgLoaded] = useState(false);
  const [slugCoach, setSlugCoach] = useState(null);

  // A branded /login/{slug} link resolves that specific coach's own
  // branding (logo/background) before anyone's signed in — a plain /login
  // (no slug) always shows the default APEX look. This is a one-off
  // lookup, not a live listener, since it only needs to run once per slug.
  useEffect(() => {
    if (!coachSlug) {
      setSlugCoach(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const slugSnap = await getDoc(doc(firestore, "coachSlugs", coachSlug));
        if (!slugSnap.exists() || cancelled) return;
        const coachSnap = await getDoc(doc(firestore, "coaches", slugSnap.data().coachId));
        if (!cancelled && coachSnap.exists()) setSlugCoach(coachSnap.data());
      } catch (err) {
        console.error("branded login lookup failed:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [coachSlug]);

  const appDesign = slugCoach?.appDesign || db.appDesign;
  const bgUrl = appDesign?.loginBackgroundUrl || DEFAULT_LOGIN_BG;
  const bgType = appDesign?.loginBackgroundUrl ? appDesign.loginBackgroundType : "image";

  // Auth (sign-in, coach signup, or activation) is async, and the profile
  // doc that carries `.role` loads a moment after Firebase confirms the
  // credential — so navigation is driven by currentUser appearing, not by
  // the submit handler finishing.
  useEffect(() => {
    if (currentUser) navigate(currentUser.role === "coach" ? "/coach" : "/app", { replace: true });
  }, [currentUser, navigate]);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const showCoachSignup = role === "coach" && coachMode === "signup";

  return (
    <div className="min-h-screen w-full relative overflow-hidden bg-[#0A0A0B]">
      {/* Background — APEX's own dark mountain image by default, so the
          brand reads clean and sharp everywhere. Coach-customizable via
          Settings -> Design Settings, a photo OR a short looping video. On
          a branded /login/{slug} link this is that coach's own appDesign
          (resolved above); on plain /login it's whichever coach is
          currently signed in, if any — falling back to the APEX default. */}
      {bgType === "video" ? (
        <video
          key={bgUrl}
          src={bgUrl}
          autoPlay
          muted
          loop
          playsInline
          onLoadedData={() => setBgLoaded(true)}
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${bgLoaded ? "opacity-100" : "opacity-0"}`}
          style={{ filter: "brightness(0.95) contrast(1.05) saturate(0.95)" }}
        />
      ) : (
        <img
          key={bgUrl}
          src={bgUrl}
          alt=""
          onLoad={() => setBgLoaded(true)}
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${bgLoaded ? "opacity-100" : "opacity-0"}`}
          style={{ filter: "brightness(0.95) contrast(1.05) saturate(0.95)" }}
          draggable={false}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/35 to-black/75" />

      <div className="relative min-h-screen w-full flex flex-col px-6 py-10">
        {/* Top: brand mark + wordmark */}
        <div className="flex flex-col items-center gap-2 shrink-0">
          <Logo variant="wordmark" tone="white" className="h-14 w-auto" />
          <p className="text-white/60 text-[10px] font-semibold tracking-[0.5em]">COACHING PLATFORM</p>
        </div>

        {/* Middle: login / signup */}
        <div className="flex-1 flex flex-col justify-center py-8">
          <div className="w-full max-w-sm mx-auto">
          <div className="flex bg-white/10 backdrop-blur-sm border border-white/10 rounded-full p-1 mb-6">
            {[
              { id: "client", label: "Client" },
              { id: "coach", label: "Coach" },
            ].map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  setRole(r.id);
                  setError("");
                }}
                className={`flex-1 py-2.5 rounded-full text-sm font-semibold transition-colors ${
                  role === r.id ? "bg-white text-black" : "text-white/60"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          {role === "coach" && (
            <div className="flex justify-center gap-4 mb-5">
              {[
                { id: "signin", label: "Sign In" },
                { id: "signup", label: "Create Account" },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setCoachMode(m.id);
                    setError("");
                  }}
                  className={`text-sm font-semibold pb-1 border-b-2 transition-colors ${
                    coachMode === m.id ? "text-white border-white" : "text-white/40 border-transparent"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}

          {showCoachSignup ? (
            <CoachSignupForm />
          ) : (
            <>
              <form onSubmit={submit} className="space-y-4">
                <Field label="EMAIL">
                  <TextInput
                    type="email"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="you@example.com"
                    autoCapitalize="none"
                    autoComplete="username"
                  />
                </Field>
                <Field label="PASSWORD">
                  <TextInput
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                </Field>

                {error && <p className="text-white text-sm bg-white/10 border border-white/15 rounded-xl px-3.5 py-2.5">{error}</p>}

                <PrimaryButton type="submit" disabled={busy || !username || !password} className="w-full !rounded-full">
                  SIGN IN <ChevronRight size={18} />
                </PrimaryButton>
              </form>

              {role === "client" && (
                <p className="text-center text-white/50 text-sm mt-6">
                  Invited by your coach?{" "}
                  <Link to="/activate" className="text-white font-semibold underline underline-offset-2">
                    Activate your account
                  </Link>
                </p>
              )}
            </>
          )}
        </div>
        </div>

        {/* Bottom: platform tagline */}
        <div className="flex flex-col items-center shrink-0">
          <Tagline tone="white" />
        </div>
      </div>
    </div>
  );
}
