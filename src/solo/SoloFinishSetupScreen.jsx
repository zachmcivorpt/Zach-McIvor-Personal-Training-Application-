import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useSoloApp } from "../lib/SoloAppContext";
import { Logo } from "../components/ui";
import { AuthButton as PrimaryButton, AuthInput as TextInput, AuthField as Field } from "../auth/authUi";
import { SoloBackgroundFrame } from "./SoloBackground";
import { LEGAL_DOCS } from "../legal/legalContent";

const TERMS_VERSION = LEGAL_DOCS["terms-of-service"].effectiveDate;
const PRIVACY_VERSION = LEGAL_DOCS["privacy-policy"].effectiveDate;

// Shown (by SoloRoutes' RequireSoloAuth) to a signed-in Train Solo account
// whose profile doc doesn't exist — registration created the login but the
// profile save failed. Asks again for the same name + Terms/Privacy
// acceptance registration does, then creates the profile; the profile
// listener picks it up and the guarded screen (the questionnaire) renders
// in place of this one.
export default function SoloFinishSetupScreen() {
  const { soloAuthUser, completeSoloProfile, soloLogout, soloAppDesign } = useSoloApp();
  const [name, setName] = useState(soloAuthUser?.displayName || "");
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedPrivacy, setAgreedPrivacy] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim() || !agreedTerms || !agreedPrivacy || busy) return;
    setError("");
    setBusy(true);
    try {
      const now = Date.now();
      await completeSoloProfile({
        name,
        legalAcceptance: { termsVersion: TERMS_VERSION, termsAcceptedAt: now, privacyVersion: PRIVACY_VERSION, privacyAcceptedAt: now },
      });
    } catch (err) {
      setError(err.message || "Couldn't save your details — check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <SoloBackgroundFrame appDesign={soloAppDesign}>
      <div className="flex justify-center pt-10 pb-8">
        <Logo variant="mark" tone="white" className="h-12 w-auto" />
      </div>

      <div className="w-full max-w-sm mx-auto">
        <h1 className="text-white text-xl font-bold text-center mb-1">Finish setting up your account</h1>
        <p className="text-white/50 text-sm text-center mb-6">
          Your login{soloAuthUser?.email ? ` (${soloAuthUser.email})` : ""} was created, but your details didn't save. Confirm them to
          continue.
        </p>

        <form onSubmit={submit} className="space-y-4">
          <Field label="FULL NAME">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required />
          </Field>

          <div className="space-y-2.5">
            <label className="flex items-start gap-2.5 text-white/50 text-xs leading-relaxed">
              <input type="checkbox" checked={agreedTerms} onChange={(e) => setAgreedTerms(e.target.checked)} className="mt-0.5 shrink-0 accent-white" />
              <span>
                I agree to the{" "}
                <Link to="/legal/terms-of-service" target="_blank" rel="noopener noreferrer" className="text-white underline underline-offset-2">
                  Terms of Service
                </Link>
                .
              </span>
            </label>
            <label className="flex items-start gap-2.5 text-white/50 text-xs leading-relaxed">
              <input type="checkbox" checked={agreedPrivacy} onChange={(e) => setAgreedPrivacy(e.target.checked)} className="mt-0.5 shrink-0 accent-white" />
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

          <PrimaryButton type="submit" disabled={busy || !name.trim() || !agreedTerms || !agreedPrivacy} className="w-full !rounded-full">
            {busy ? "SAVING…" : "CONTINUE"}
          </PrimaryButton>
        </form>

        <p className="text-center mt-6">
          <button type="button" onClick={soloLogout} className="text-white/50 text-sm font-semibold underline underline-offset-2">
            Log out
          </button>
        </p>
      </div>
    </SoloBackgroundFrame>
  );
}
