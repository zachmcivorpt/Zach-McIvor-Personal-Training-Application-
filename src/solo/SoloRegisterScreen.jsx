import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useSoloApp } from "../lib/SoloAppContext";
import { Logo } from "../components/ui";
import { AuthButton as PrimaryButton, AuthInput as TextInput, AuthField as Field } from "../auth/authUi";
import { SoloBackgroundFrame } from "./SoloBackground";
import { ChevronLeft, UserPlus } from "lucide-react";
import { LEGAL_DOCS } from "../legal/legalContent";

// Train Solo's own self-registration — unlike Coaching, where a client
// account can only ever be created by the coach issuing an invite (see
// AppContext.jsx's createInvite/activateAccount), this is a genuine,
// un-gated sign-up. registerSoloAccount (SoloAppContext.jsx) writes
// against soloAuth/soloDb exclusively, never touching the Coaching
// `auth`/`db` this file doesn't even import.
// The versions recorded against a Train Solo account at signup are each
// legal document's own existing `effectiveDate` string (src/legal/
// legalContent.js) — not a separately-invented version number — so the
// record always matches whatever LegalPage actually rendered at the time.
const TERMS_VERSION = LEGAL_DOCS["terms-of-service"].effectiveDate;
const PRIVACY_VERSION = LEGAL_DOCS["privacy-policy"].effectiveDate;

export default function SoloRegisterScreen() {
  const { registerSoloAccount, soloCurrentUser, soloAppDesign, soloProfileMissing, fetchOnboardingCompletedFromServer } = useSoloApp();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedPrivacy, setAgreedPrivacy] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // A brand-new registration always has onboarding.completed: false, so
  // there's no pre-existing cache to be stale here — but this screen is
  // also where an already-registered, already-authenticated visitor
  // lands (e.g. a bookmark), so it shares SoloLoginScreen's same
  // server-confirmed check rather than trusting a potentially-cached
  // value for that case too (see that file's comment for why).
  //
  // Depends on soloCurrentUser?.id, not the soloCurrentUser object
  // itself — see SoloLoginScreen.jsx's comment on this exact effect for
  // why depending on the object reference let onSnapshot's own cache-
  // then-server re-emissions (and this check's own getDocFromServer call
  // touching the same watched document) cancel and restart the check
  // indefinitely instead of ever letting it finish.
  useEffect(() => {
    if (!soloCurrentUser?.id) return;
    let cancelled = false;
    fetchOnboardingCompletedFromServer(soloCurrentUser.id)
      .then((completed) => {
        if (!cancelled) navigate(completed ? "/solo/home" : "/solo/onboarding", { replace: true });
      })
      .catch(() => {
        if (!cancelled) navigate(soloCurrentUser.onboarding?.completed ? "/solo/home" : "/solo/onboarding", { replace: true });
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
    if (soloProfileMissing && !busy) navigate("/solo/home", { replace: true });
  }, [soloProfileMissing, busy, navigate]);

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
    if (!agreedTerms || !agreedPrivacy) {
      setError("You need to accept the Terms of Service and Privacy Policy to continue.");
      return;
    }
    setBusy(true);
    try {
      const now = Date.now();
      await registerSoloAccount({
        name,
        email,
        password,
        legalAcceptance: {
          termsVersion: TERMS_VERSION,
          termsAcceptedAt: now,
          privacyVersion: PRIVACY_VERSION,
          privacyAcceptedAt: now,
        },
      });
      // Navigation happens via the soloCurrentUser effect above, once the
      // new soloUsers/{uid} doc's listener picks it up — same pattern as
      // LoginScreen's own currentUser-driven navigation.
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
        <Logo variant="mark" tone="white" slot="login" className="h-12 w-auto" />
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

          {/* Two separate, independently-unticked checkboxes — not one
              combined "I agree" — so a Train Solo account can never be
              created without an explicit, distinguishable acceptance of
              each document. target="_blank" (unlike the Coaching
              coach-signup checkbox this pattern is adapted from) so
              opening either doesn't lose the in-progress registration
              form. */}
          <div className="space-y-2.5">
            <label className="flex items-start gap-2.5 text-white/50 text-xs leading-relaxed">
              <input
                type="checkbox"
                checked={agreedTerms}
                onChange={(e) => setAgreedTerms(e.target.checked)}
                className="mt-0.5 shrink-0 accent-white"
              />
              <span>
                I agree to the{" "}
                <Link to="/legal/terms-of-service" target="_blank" rel="noopener noreferrer" className="text-white underline underline-offset-2">
                  Terms of Service
                </Link>
                .
              </span>
            </label>
            <label className="flex items-start gap-2.5 text-white/50 text-xs leading-relaxed">
              <input
                type="checkbox"
                checked={agreedPrivacy}
                onChange={(e) => setAgreedPrivacy(e.target.checked)}
                className="mt-0.5 shrink-0 accent-white"
              />
              <span>
                I've read and consent to the{" "}
                <Link to="/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-white underline underline-offset-2">
                  Privacy Policy
                </Link>
                , including how my information is collected and used.
              </span>
            </label>
          </div>

          {error && <p className="text-white text-sm bg-white/10 border border-white/15 rounded-xl px-3.5 py-2.5">{error}</p>}

          <PrimaryButton
            type="submit"
            disabled={busy || !name || !email || !password || !confirm || !agreedTerms || !agreedPrivacy}
            className="w-full !rounded-full"
          >
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
    </SoloBackgroundFrame>
  );
}
