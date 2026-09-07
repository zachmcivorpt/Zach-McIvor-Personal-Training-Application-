import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useApp } from "../lib/AppContext";
import { Logo, Tagline } from "../components/ui";
import { AuthButton as PrimaryButton, AuthInput as TextInput, AuthField as Field } from "./authUi";
import { ChevronRight, Lock } from "lucide-react";
import { COACH_SETUP_CODE } from "../lib/config";

function CoachSignupForm() {
  const { createCoachAccount } = useApp();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [setupCode, setSetupCode] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (setupCode.trim() !== COACH_SETUP_CODE) {
      setError("That setup code isn't right.");
      return;
    }
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
      await createCoachAccount({ name, email, username, password, setupCode });
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
      <p className="text-white/50 text-sm text-center mb-6">
        First time here — set up your coach account. Your password is stored only in this browser, never in the app's code.
      </p>
      <form onSubmit={submit} className="space-y-4">
        <Field label="SETUP CODE" hint="Given to you separately — not shared with clients">
          <TextInput
            value={setupCode}
            onChange={(e) => setSetupCode(e.target.value)}
            placeholder="Enter your setup code"
            autoCapitalize="characters"
            required
          />
        </Field>
        <Field label="FULL NAME">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Zach McIvor" required />
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

        <label className="flex items-start gap-2.5 text-white/50 text-xs leading-relaxed">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 shrink-0 accent-white" />
          <span>
            I agree to the{" "}
            <Link to="/legal/terms-of-service" target="_blank" className="text-white underline underline-offset-2">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link to="/legal/coach-responsibility-agreement" target="_blank" className="text-white underline underline-offset-2">
              Coach Responsibility Agreement
            </Link>
            .
          </span>
        </label>

        {error && <p className="text-white text-sm bg-white/10 border border-white/15 rounded-xl px-3.5 py-2.5">{error}</p>}

        <PrimaryButton
          type="submit"
          disabled={busy || !name || !email || !username || !password || !confirm || !setupCode || !agreed}
          className="w-full !rounded-full"
        >
          <Lock size={16} /> CREATE ACCOUNT & SIGN IN
        </PrimaryButton>
      </form>
    </div>
  );
}

export default function LoginScreen() {
  const { login, hasCoach, currentUser, db } = useApp();
  const navigate = useNavigate();
  const [role, setRole] = useState("client");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [bgLoaded, setBgLoaded] = useState(false);
  // Set the instant a sign-in genuinely succeeds — Firebase accepted the
  // credential and handed back a real account. Distinct from `session`
  // (which the app can also reach via other means) so the "couldn't find
  // your profile" fallback below only ever fires right after a fresh,
  // deliberate sign-in on this screen, not on some unrelated stale render.
  const [signedInUid, setSignedInUid] = useState(null);

  // Auth (sign-in, coach signup, or activation) is async, and the profile
  // doc that carries `.role` loads a moment after Firebase confirms the
  // credential — so navigation is driven by currentUser appearing, not by
  // the submit handler finishing.
  useEffect(() => {
    if (currentUser) navigate(currentUser.role === "coach" ? "/coach" : "/app", { replace: true });
  }, [currentUser, navigate]);

  // A sign-in can succeed at the Firebase Auth level (right credential,
  // real account) while that account's own users/{uid} profile doc no
  // longer exists — e.g. it was deleted. Nothing throws in that case, so
  // the old code just sat here forever with zero feedback: it looked
  // exactly like the button did nothing. Once we've seen an actual
  // successful sign-in, if no matching profile shows up within a few
  // seconds, say so plainly and hand over the one thing that lets a coach
  // actually fix it — this account's own real id.
  const [profileMissing, setProfileMissing] = useState(false);
  useEffect(() => {
    if (!signedInUid || currentUser) {
      setProfileMissing(false);
      return;
    }
    const t = setTimeout(() => setProfileMissing(true), 4000);
    return () => clearTimeout(t);
  }, [signedInUid, currentUser]);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setProfileMissing(false);
    // The button used to stay disabled until React's own state saw
    // non-empty fields — but iOS autofill/password managers can fill the
    // inputs visually without ever firing a real onChange, leaving state
    // empty while the fields look filled in. That made the button
    // silently refuse to do anything, with zero feedback. Re-reading the
    // DOM values directly here is the fallback for exactly that case.
    const emailValue = username || e.currentTarget.email?.value || "";
    const passwordValue = password || e.currentTarget.password?.value || "";
    if (!emailValue.trim() || !passwordValue) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    try {
      const user = await login(emailValue, passwordValue);
      setSignedInUid(user.uid);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const showCoachSignup = role === "coach" && !hasCoach;

  return (
    <div className="min-h-screen w-full relative overflow-hidden bg-[#0A0A0B]">
      {/* Background — plain black by default, so the logo reads clean and
          sharp. Coach-customizable via Settings -> Design Settings
          (db.appDesign.loginBackgroundUrl), a photo OR a short looping
          video; nothing renders here at all until a coach sets one. */}
      {db.appDesign?.loginBackgroundUrl && db.appDesign?.loginBackgroundType === "video" ? (
        <video
          key={db.appDesign.loginBackgroundUrl}
          src={db.appDesign.loginBackgroundUrl}
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
      ) : db.appDesign?.loginBackgroundUrl ? (
        <img
          key={db.appDesign.loginBackgroundUrl}
          src={db.appDesign.loginBackgroundUrl}
          alt=""
          onLoad={() => setBgLoaded(true)}
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${bgLoaded ? "opacity-100" : "opacity-0"}`}
          style={{ filter: "brightness(0.95) contrast(1.05) saturate(0.95)" }}
          draggable={false}
        />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/20 to-black/70" />

      <div className="relative min-h-screen w-full flex flex-col px-6 py-8">
        <div className="flex justify-center pt-2">
          <Logo variant="mark" tone="white" className="h-14 w-auto" />
        </div>

        <div className="flex-1 flex flex-col justify-center">
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

          {showCoachSignup ? (
            <CoachSignupForm />
          ) : (
            <>
              <form onSubmit={submit} className="space-y-4">
                <Field label="EMAIL">
                  <TextInput
                    type="email"
                    name="email"
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
                    name="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                </Field>

                {error && <p className="text-white text-sm bg-white/10 border border-white/15 rounded-xl px-3.5 py-2.5">{error}</p>}

                {profileMissing && (
                  <div className="text-white text-sm bg-white/10 border border-white/15 rounded-xl px-3.5 py-3 space-y-2">
                    <p>
                      Your password is right — you're signed in — but your coach can't find your profile on their end
                      yet. Send them this so they can fix it:
                    </p>
                    <p className="font-mono text-xs bg-black/30 rounded-lg px-2.5 py-2 break-all select-all">{signedInUid}</p>
                    <p className="text-white/60 text-xs">(Tap the code above to select it, then copy and send it to them.)</p>
                  </div>
                )}

                <PrimaryButton type="submit" disabled={busy} className="w-full !rounded-full">
                  {busy ? "SIGNING IN…" : <>SIGN IN <ChevronRight size={18} /></>}
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

        <div className="flex flex-col items-center">
          <Tagline tone="white" />
        </div>
      </div>
    </div>
  );
}
