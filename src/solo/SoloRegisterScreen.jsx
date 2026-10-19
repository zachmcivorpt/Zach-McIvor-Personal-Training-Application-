import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useSoloApp } from "../lib/SoloAppContext";
import { Logo } from "../components/ui";
import { AuthButton as PrimaryButton, AuthInput as TextInput, AuthField as Field } from "../auth/authUi";
import { ChevronLeft, UserPlus } from "lucide-react";

// Train Solo's own self-registration — unlike Coaching, where a client
// account can only ever be created by the coach issuing an invite (see
// AppContext.jsx's createInvite/activateAccount), this is a genuine,
// un-gated sign-up. registerSoloAccount (SoloAppContext.jsx) writes
// against soloAuth/soloDb exclusively, never touching the Coaching
// `auth`/`db` this file doesn't even import.
export default function SoloRegisterScreen() {
  const { registerSoloAccount, soloCurrentUser } = useSoloApp();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (soloCurrentUser) navigate("/solo/home", { replace: true });
  }, [soloCurrentUser, navigate]);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!name.trim() || !email.trim() || !password) {
      setError("Fill in your name, email and password.");
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
      await registerSoloAccount({ name, email, password });
      // Navigation happens via the soloCurrentUser effect above, once the
      // new soloUsers/{uid} doc's listener picks it up — same pattern as
      // LoginScreen's own currentUser-driven navigation.
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh w-full bg-[#0A0A0B] flex flex-col px-6 py-8">
      <Link to="/start" className="flex items-center gap-1 text-white/50 text-sm font-medium">
        <ChevronLeft size={16} /> Back
      </Link>

      <div className="flex justify-center pt-6 pb-8">
        <Logo variant="mark" tone="white" className="h-12 w-auto" />
      </div>

      <div className="w-full max-w-sm mx-auto">
        <h1 className="text-white text-xl font-bold text-center mb-1">Train Solo</h1>
        <p className="text-white/50 text-sm text-center mb-6">Create your independent account.</p>

        <form onSubmit={submit} className="space-y-4">
          <Field label="FULL NAME">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required />
          </Field>
          <Field label="EMAIL">
            <TextInput
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoCapitalize="none"
              autoComplete="username"
              required
            />
          </Field>
          <Field label="PASSWORD">
            <TextInput
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              autoComplete="new-password"
              required
            />
          </Field>
          <Field label="CONFIRM PASSWORD">
            <TextInput
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-enter password"
              autoComplete="new-password"
              required
            />
          </Field>

          {error && <p className="text-white text-sm bg-white/10 border border-white/15 rounded-xl px-3.5 py-2.5">{error}</p>}

          <PrimaryButton type="submit" disabled={busy} className="w-full !rounded-full">
            {busy ? "CREATING ACCOUNT…" : <><UserPlus size={16} /> CREATE ACCOUNT</>}
          </PrimaryButton>
        </form>

        <p className="text-center text-white/50 text-sm mt-6">
          Already have an account?{" "}
          <Link to="/solo/login" className="text-white font-semibold underline underline-offset-2">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
