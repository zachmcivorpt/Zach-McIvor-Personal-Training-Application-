import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useApp } from "../lib/AppContext";
import { Logo } from "../components/ui";
import { AuthButton as PrimaryButton, AuthInput as TextInput, AuthField as Field } from "./authUi";
import { ChevronLeft, ShieldCheck } from "lucide-react";

export default function ActivateScreen() {
  const { activateAccount, currentUser } = useApp();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Same as LoginScreen: the profile doc (and therefore currentUser) loads a
  // moment after Firebase confirms the credential, so navigation waits for it
  // rather than firing right after activateAccount() resolves.
  useEffect(() => {
    if (currentUser) navigate("/app", { replace: true });
  }, [currentUser, navigate]);

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
      await activateAccount({ username, code, newPassword: password });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#0A0A0B] px-6">
      <div className="w-full max-w-sm">
        <Link to="/login" className="flex items-center gap-1 text-white/40 text-sm mb-8">
          <ChevronLeft size={16} /> Back to sign in
        </Link>

        <div className="flex flex-col items-center mb-8">
          <Logo variant="mark" tone="white" className="h-14 w-auto mb-4" />
          <h1 className="text-white text-xl font-bold">Activate your account</h1>
          <p className="text-white/40 text-sm text-center mt-1.5">
            Enter your email and the invite code your coach gave you, then choose your own password.
          </p>
        </div>

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
          <Field label="INVITE CODE">
            <TextInput
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. 7F3K9Q"
              autoCapitalize="characters"
              className="tracking-[0.3em] font-semibold"
            />
          </Field>
          <Field label="NEW PASSWORD">
            <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" />
          </Field>
          <Field label="CONFIRM PASSWORD">
            <TextInput type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Re-enter password" />
          </Field>

          {error && <p className="text-white text-sm bg-white/10 border border-white/15 rounded-xl px-3.5 py-2.5">{error}</p>}

          <PrimaryButton type="submit" disabled={busy || !username || !code || !password || !confirm} className="w-full">
            <ShieldCheck size={18} /> ACTIVATE & SIGN IN
          </PrimaryButton>
        </form>
      </div>
    </div>
  );
}
