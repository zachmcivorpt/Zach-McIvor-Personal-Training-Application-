import React, { useEffect, useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useSoloApp } from "../lib/SoloAppContext";
import { Logo } from "../components/ui";
import { AuthButton as PrimaryButton, AuthInput as TextInput, AuthField as Field } from "../auth/authUi";
import { SoloBackgroundFrame } from "./SoloBackground";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function SoloLoginScreen() {
  const { soloLogin, soloCurrentUser, soloAppDesign, soloProfileMissing, fetchOnboardingCompletedFromServer } = useSoloApp();
  const navigate = useNavigate();
  const location = useLocation();
  // `?next=catalogue` (the Train Solo welcome email's link) lands on the
  // Catalogue after signing in, where the website shows prices and Buy.
  const homeState = new URLSearchParams(location.search).get("next") === "catalogue" ? { soloTab: "catalogue" } : undefined;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // soloCurrentUser's first value after a login can be a stale, locally-
  // cached document from a previous session on this browser/origin (see
  // fetchOnboardingCompletedFromServer's own comment in SoloAppContext.jsx
  // for why) — reading `completed` straight from it here previously meant
  // an account that completed onboarding after this browser last cached
  // it could get redirected to the questionnaire instead of Home. A
  // direct server read for this one redirect decision avoids that,
  // falling back to the (possibly cached) context value only if that
  // read itself fails, so a genuine offline login still goes somewhere
  // rather than hanging.
  //
  // Depends on soloCurrentUser?.id, not the soloCurrentUser object
  // itself: Firestore's onSnapshot normally fires at least twice for the
  // same logical document (once from local cache, once server-confirmed)
  // and SoloAppContext.jsx builds a brand-new {id, ...data()} object on
  // every emission, so the object reference changes even when nothing
  // meaningful did. Depending on that reference meant every re-emission
  // cancelled the in-flight server check and restarted it from scratch —
  // including emissions provoked by this very check's own
  // getDocFromServer call touching the same watched document — so the
  // check could keep getting cancelled before it ever finished, leaving
  // "SIGNING IN…" stuck indefinitely. The uid is stable across those
  // re-emissions for the same signed-in account, so keying on it lets
  // the check actually complete.
  useEffect(() => {
    if (!soloCurrentUser?.id) return;
    let cancelled = false;
    fetchOnboardingCompletedFromServer(soloCurrentUser.id)
      .then((completed) => {
        if (!cancelled) navigate(completed ? "/solo/home" : "/solo/onboarding", { replace: true, state: completed ? homeState : undefined });
      })
      .catch(() => {
        if (!cancelled) {
          const completed = !!soloCurrentUser.onboarding?.completed;
          navigate(completed ? "/solo/home" : "/solo/onboarding", { replace: true, state: completed ? homeState : undefined });
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soloCurrentUser?.id, navigate, fetchOnboardingCompletedFromServer]);

  // Signed in but no profile (registration's profile save failed): Home's
  // guard shows the finish-setup screen (and, once it's done, routes on to
  // the questionnaire).
  useEffect(() => {
    if (soloProfileMissing) navigate("/solo/home", { replace: true });
  }, [soloProfileMissing, navigate]);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    try {
      await soloLogin(email.trim(), password);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <SoloBackgroundFrame appDesign={soloAppDesign}>
      <Link to="/start" className="flex items-center gap-1 text-white/50 text-sm font-medium">
        <ChevronLeft size={16} /> Back
      </Link>

      <div className="flex justify-center pt-6 pb-8">
        <Logo variant="mark" tone="white" className="h-12 w-auto" />
      </div>

      <div className="w-full max-w-sm mx-auto">
        <h1 className="text-white text-xl font-bold text-center mb-1">Train Solo</h1>
        <p className="text-white/50 text-sm text-center mb-6">Log in to your independent account.</p>

        <form onSubmit={submit} className="space-y-4">
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
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </Field>

          {error && <p className="text-white text-sm bg-white/10 border border-white/15 rounded-xl px-3.5 py-2.5">{error}</p>}

          <PrimaryButton type="submit" disabled={busy} className="w-full !rounded-full">
            {busy ? "SIGNING IN…" : <>SIGN IN <ChevronRight size={18} /></>}
          </PrimaryButton>
        </form>

        <p className="text-center text-white/50 text-sm mt-6">
          Don't have an account?{" "}
          <Link to="/solo/register" className="text-white font-semibold underline underline-offset-2">
            Create one
          </Link>
        </p>
        <p className="text-center text-white/30 text-xs mt-4">
          <Link to="/legal/terms-of-service" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
            Terms of Service
          </Link>
          {"  ·  "}
          <Link to="/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
            Privacy Policy
          </Link>
        </p>
      </div>
    </SoloBackgroundFrame>
  );
}
