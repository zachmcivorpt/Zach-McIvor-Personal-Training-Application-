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

        {error && <p className="text-white text-sm bg-white/10 border border-white/15 rounded-xl px-3.5 py-2.5">{error}</p>}

        <PrimaryButton
          type="submit"
          disabled={busy || !name || !email || !username || !password || !confirm || !setupCode}
          className="w-full !rounded-full"
        >
          <Lock size={16} /> CREATE ACCOUNT & SIGN IN
        </PrimaryButton>
      </form>
    </div>
  );
}

export default function LoginScreen() {
  const { login, hasCoach, currentUser } = useApp();
  const navigate = useNavigate();
  const [role, setRole] = useState("client");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [bgLoaded, setBgLoaded] = useState(false);

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

  const showCoachSignup = role === "coach" && !hasCoach;

  return (
    <div className="min-h-screen w-full relative overflow-hidden bg-[#0A0A0B]">
      {/* Background photo — drop a file at public/brand/login-bg.jpg and it
          appears automatically; until then this quietly stays hidden and the
          dark background above shows instead. */}
      <img
        src="/brand/login-bg.jpg"
        alt=""
        onLoad={() => setBgLoaded(true)}
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${bgLoaded ? "opacity-100" : "opacity-0"}`}
        draggable={false}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/55 to-black/90" />

      <div className="relative min-h-screen w-full flex flex-col px-6 py-8">
        <div className="flex justify-center pt-2">
          <Logo variant="mark" tone="white" className="h-9 w-auto" />
        </div>

        <div className="flex-1 min-h-8" />

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

          <div className="flex flex-col items-center mt-10">
            <Tagline tone="white" className="h-6 w-auto opacity-90" />
          </div>
        </div>
      </div>
    </div>
  );
}
