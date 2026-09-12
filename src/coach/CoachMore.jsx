import React, { useEffect, useRef, useState } from "react";
import { useApp } from "../lib/AppContext";
import { Card, DangerButton, AvatarPicker, Tagline, TextArea, TextInput } from "../components/ui";
import { fileToDataUrl, removeFlatLogoBackground } from "../lib/image";
import { enablePush, disablePush } from "../lib/push";
import { uploadDesignImage, uploadLoginBackground } from "../lib/storage";
import {
  Video,
  LogOut,
  ChevronRight,
  MessageSquareText,
  Paperclip,
  X,
  Upload,
  BellRing,
  Download,
  User,
  Palette,
  Image as ImageIcon,
} from "lucide-react";

// Small on/off row shared by the two per-type notification toggles — same
// visual switch as the master toggle above it, just smaller and inline.
function NotifPrefRow({ label, on, onToggle }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-black/70 text-sm">{label}</span>
      <button
        onClick={onToggle}
        className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${on ? "bg-blue-500" : "bg-black/15"}`}
        aria-label={`Turn ${on ? "off" : "on"} ${label.toLowerCase()} notifications`}
      >
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}

function PushNotificationsCard({ userId, notificationPrefs, updateUser, showToast }) {
  const [enabled, setEnabled] = useState(() => !!localStorage.getItem("pushToken"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const prefs = { messages: true, checkins: true, ...notificationPrefs };

  async function toggle() {
    setError("");
    setBusy(true);
    try {
      if (enabled) {
        await disablePush(userId, localStorage.getItem("pushToken"));
        localStorage.removeItem("pushToken");
        setEnabled(false);
        showToast?.("Push notifications turned off");
      } else {
        const token = await enablePush(userId);
        localStorage.setItem("pushToken", token);
        setEnabled(true);
        showToast?.("Push notifications enabled");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function togglePref(key) {
    updateUser(userId, { notificationPrefs: { ...prefs, [key]: !prefs[key] } }).catch((err) =>
      showToast?.(err.message || "Couldn't save")
    );
  }

  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
          <BellRing size={18} className="text-blue-500" />
        </div>
        <div className="flex-1">
          <p className="text-black font-semibold text-sm">Push Notifications</p>
          <p className="text-black/40 text-xs mt-0.5">Get alerted on this device — even app closed</p>
        </div>
        <button
          onClick={toggle}
          disabled={busy}
          className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${enabled ? "bg-blue-500" : "bg-black/15"}`}
          aria-label={enabled ? "Turn off push notifications" : "Turn on push notifications"}
        >
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${enabled ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </div>
      {enabled && (
        <div className="mt-3.5 pt-3.5 border-t border-black/8 space-y-2.5">
          <NotifPrefRow label="New messages" on={prefs.messages} onToggle={() => togglePref("messages")} />
          <NotifPrefRow label="Check-in submissions" on={prefs.checkins} onToggle={() => togglePref("checkins")} />
        </div>
      )}
      {error && <p className="text-red-600 text-sm bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5 mt-3">{error}</p>}
    </Card>
  );
}

// Name is a plain Firestore field — safe to change any time. Email is the
// real Firebase Auth login credential, so changing it needs the current
// password re-typed (Firebase requires a "recent" login for this) and only
// takes effect once the coach clicks the verification link sent to the new
// address — the old email keeps working right up until then.
function AccountCard({ currentUser, updateUser, updateCoachEmail, showToast }) {
  const [name, setName] = useState(currentUser?.name || "");
  const [email, setEmail] = useState(currentUser?.email || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [error, setError] = useState("");

  const nameDirty = name.trim() !== (currentUser?.name || "") && name.trim().length > 0;
  const emailDirty = email.trim() !== (currentUser?.email || "");

  async function saveName() {
    if (!nameDirty) return;
    setSavingName(true);
    try {
      await updateUser(currentUser.id, { name: name.trim() });
      showToast?.("Name updated");
    } catch (err) {
      showToast?.(err.message || "Couldn't save");
    } finally {
      setSavingName(false);
    }
  }

  async function saveEmail(e) {
    e.preventDefault();
    setError("");
    if (!emailDirty) return;
    if (!currentPassword) {
      setError("Enter your current password to confirm this change.");
      return;
    }
    setSavingEmail(true);
    try {
      await updateCoachEmail({ currentPassword, newEmail: email });
      setCurrentPassword("");
      showToast?.(`Verification link sent to ${email.trim()}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingEmail(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center gap-3 mb-3.5">
        <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
          <User size={18} className="text-blue-500" />
        </div>
        <p className="text-black font-semibold text-sm">Account</p>
      </div>

      <p className="text-black/30 text-[11px] mb-1.5">NAME</p>
      <div className="flex gap-2 mb-4">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} className="flex-1" />
        <button
          onClick={saveName}
          disabled={!nameDirty || savingName}
          className="bg-black text-white text-xs font-bold px-4 rounded-xl disabled:opacity-30 shrink-0"
        >
          {savingName ? "…" : "Save"}
        </button>
      </div>

      <form onSubmit={saveEmail}>
        <p className="text-black/30 text-[11px] mb-1.5">LOGIN EMAIL</p>
        <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        {emailDirty && (
          <>
            <p className="text-black/30 text-[11px] mt-3 mb-1.5">CURRENT PASSWORD (to confirm)</p>
            <TextInput
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Required to change your email"
            />
            <p className="text-black/40 text-[11px] mt-2">
              We'll send a verification link to the new address — your login stays on the old one until you click it.
            </p>
          </>
        )}
        {error && <p className="text-red-600 text-sm bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5 mt-3">{error}</p>}
        {emailDirty && (
          <button
            type="submit"
            disabled={savingEmail}
            className="w-full mt-3 bg-black text-white text-sm font-bold py-2.5 rounded-xl disabled:opacity-50"
          >
            {savingEmail ? "Sending…" : "Update Email"}
          </button>
        )}
      </form>
    </Card>
  );
}

// One upload/preview/remove row shared by the two real-image assets (login
// background, app logo) — the profile picture keeps using the existing
// AvatarPicker instead, since it already has its own instant-save circular
// upload control used the same way elsewhere in the app.
function DesignAssetRow({
  label,
  description,
  previewUrl,
  previewType = "image",
  previewClassName,
  aspectClassName,
  accept = "image/*",
  uploading,
  progress,
  onUpload,
  onRemove,
  iconClassName = "text-black/20",
}) {
  const fileRef = useRef(null);

  return (
    <div>
      <p className="text-black/30 text-[11px] mb-1.5">{label.toUpperCase()}</p>
      {description && <p className="text-black/40 text-xs mb-2">{description}</p>}
      <div
        className={`relative rounded-xl overflow-hidden border border-black/10 bg-black/[0.03] flex items-center justify-center ${aspectClassName}`}
      >
        {previewUrl ? (
          previewType === "video" ? (
            <video src={previewUrl} className={previewClassName || "w-full h-full object-cover"} autoPlay muted loop playsInline />
          ) : (
            <img src={previewUrl} alt={label} className={previewClassName || "w-full h-full object-cover"} />
          )
        ) : (
          <ImageIcon size={22} className={iconClassName} />
        )}
        {uploading && (
          <div className="absolute inset-0 bg-white/75 flex items-center justify-center">
            <span className="text-black/60 text-xs font-bold">{Math.round((progress || 0) * 100)}%</span>
          </div>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onUpload(file);
        }}
      />
      <div className="flex gap-2 mt-2">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex-1 flex items-center justify-center gap-1.5 bg-black/5 border border-black/10 text-black text-xs font-semibold py-2 rounded-lg disabled:opacity-50"
        >
          <Upload size={12} /> {previewUrl ? "Replace" : "Upload"}
        </button>
        {previewUrl && (
          <button
            onClick={onRemove}
            disabled={uploading}
            className="px-3.5 bg-red-50 border border-red-100 text-red-600 text-xs font-semibold py-2 rounded-lg disabled:opacity-50"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

// Lets the coach customize the app's branding: the login screen's
// background (a photo, or a short looping video), their own profile
// picture, and the logo shown at the top of every page. Login background +
// logo are real uploads to Firebase Storage (see src/lib/storage.js's
// uploadLoginBackground / uploadDesignImage) with just the resulting URL
// (+ media type, for the background) saved to the public settings/appDesign
// doc via updateAppDesign — read by src/components/ui.jsx's Logo component
// and src/auth/LoginScreen.jsx, so a change here is reflected everywhere
// immediately with no other wiring needed. The profile picture reuses the
// existing AvatarPicker/avatarUrl flow already used on this same page.
function DesignSettingsCard() {
  const { db, updateAppDesign, currentUser, updateUser } = useApp();
  const design = db.appDesign || {};
  const clientDark = design.clientDarkMode === true;
  const [savingTheme, setSavingTheme] = useState(false);

  async function toggleClientTheme() {
    setSavingTheme(true);
    try {
      await updateAppDesign({ clientDarkMode: !clientDark });
    } finally {
      setSavingTheme(false);
    }
  }
  const [uploadingBg, setUploadingBg] = useState(false);
  const [bgProgress, setBgProgress] = useState(0);
  const [uploadingLogoDark, setUploadingLogoDark] = useState(false);
  const [logoDarkProgress, setLogoDarkProgress] = useState(0);
  const [uploadingLogoLight, setUploadingLogoLight] = useState(false);
  const [logoLightProgress, setLogoLightProgress] = useState(0);
  const [error, setError] = useState("");

  // Cuts out a flat/solid background (a white canvas, a single brand
  // color) so the mark sits cleanly on the target surface instead of
  // showing inside a visible box. Only kicks in when the file's corners
  // actually look like one flat color — a real photo behind the logo is
  // left untouched rather than risk mangling it (see
  // removeFlatLogoBackground for the exact rule). `field` picks which of
  // the two independent uploads this is — see the Logo component for why
  // there are two.
  async function handleLogoUpload(field, setUploading, setProgress, file) {
    setError("");
    setUploading(true);
    setProgress(0);
    try {
      const transparent = await removeFlatLogoBackground(file);
      const { url } = await uploadDesignImage(field, transparent, setProgress);
      await updateAppDesign({ [field]: url });
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  // Login background accepts an image OR a short video — the resulting
  // `type` ("image" | "video") from the upload is saved alongside the URL
  // so LoginScreen and this preview know which element to render.
  async function handleBgUpload(file) {
    setError("");
    setUploadingBg(true);
    setBgProgress(0);
    try {
      const { url, type } = await uploadLoginBackground(file, setBgProgress);
      await updateAppDesign({ loginBackgroundUrl: url, loginBackgroundType: type });
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingBg(false);
    }
  }

  async function handleRemove(field) {
    setError("");
    try {
      const patch = { [field]: null };
      if (field === "loginBackgroundUrl") patch.loginBackgroundType = null;
      await updateAppDesign(patch);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Card>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
          <Palette size={18} className="text-blue-500" />
        </div>
        <div>
          <p className="text-black font-semibold text-sm">Design Settings</p>
          <p className="text-black/40 text-xs mt-0.5">Customize how the app looks for you and your clients</p>
        </div>
      </div>

      <div className="space-y-5">
        <div>
          <p className="text-black/30 text-[11px] mb-1.5">CLIENT APP THEME</p>
          <div className="flex items-center justify-between bg-black/[0.03] border border-black/8 rounded-xl px-3.5 py-3">
            <div>
              <p className="text-black text-sm font-medium">{clientDark ? "Dark" : "Light"}</p>
              <p className="text-black/40 text-xs mt-0.5">Switches every client's app instantly — no update needed</p>
            </div>
            <button
              onClick={toggleClientTheme}
              disabled={savingTheme}
              className={`w-11 h-6 rounded-full relative transition-colors shrink-0 disabled:opacity-50 ${clientDark ? "bg-blue-500" : "bg-black/15"}`}
              aria-label={`Switch client app to ${clientDark ? "light" : "dark"} mode`}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${clientDark ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </div>
        </div>

        <div className="border-t border-black/8" />

        <DesignAssetRow
          label="Login Background"
          description="The photo or short video shown behind the sign-in screen"
          previewUrl={design.loginBackgroundUrl}
          previewType={design.loginBackgroundType === "video" ? "video" : "image"}
          accept="image/*,video/*"
          aspectClassName="aspect-[16/9]"
          uploading={uploadingBg}
          progress={bgProgress}
          onUpload={handleBgUpload}
          onRemove={() => handleRemove("loginBackgroundUrl")}
        />

        <div className="border-t border-black/8" />

        <div>
          <p className="text-black/30 text-[11px] mb-1.5">PROFILE PICTURE</p>
          <p className="text-black/40 text-xs mb-2">Shown wherever your trainer profile appears</p>
          <div className="flex items-center gap-3">
            <AvatarPicker
              name={currentUser?.name}
              url={currentUser?.avatarUrl}
              size={56}
              onChange={(dataUrl) => updateUser(currentUser.id, { avatarUrl: dataUrl })}
            />
            {currentUser?.avatarUrl && (
              <button
                onClick={() => updateUser(currentUser.id, { avatarUrl: null })}
                className="bg-red-50 border border-red-100 text-red-600 text-xs font-semibold px-3.5 py-2 rounded-lg"
              >
                Remove
              </button>
            )}
          </div>
        </div>

        <div className="border-t border-black/8" />

        <DesignAssetRow
          label="Logo — Dark Backgrounds"
          description="Login screen, your coach console header, and your client app when its theme is set to Dark above — needs a light-colored mark"
          previewUrl={design.appLogoUrlOnDark}
          previewClassName="max-w-[65%] max-h-[65%] object-contain"
          aspectClassName="h-24 !bg-black"
          iconClassName="text-white/25"
          uploading={uploadingLogoDark}
          progress={logoDarkProgress}
          onUpload={(file) => handleLogoUpload("appLogoUrlOnDark", setUploadingLogoDark, setLogoDarkProgress, file)}
          onRemove={() => handleRemove("appLogoUrlOnDark")}
        />

        <DesignAssetRow
          label="Logo — Light Backgrounds"
          description="Your client app when its theme is set to Light above — needs a dark-colored mark"
          previewUrl={design.appLogoUrlOnLight}
          previewClassName="max-w-[65%] max-h-[65%] object-contain"
          aspectClassName="h-24"
          uploading={uploadingLogoLight}
          progress={logoLightProgress}
          onUpload={(file) => handleLogoUpload("appLogoUrlOnLight", setUploadingLogoLight, setLogoLightProgress, file)}
          onRemove={() => handleRemove("appLogoUrlOnLight")}
        />
      </div>

      {error && <p className="text-red-600 text-sm bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5 mt-4">{error}</p>}
    </Card>
  );
}

function WelcomeMessageCard() {
  const { db, updateWelcomeMessage } = useApp();
  const saved = db.welcomeMessage || {};
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [justSaved, setJustSaved] = useState(false);

  // Local draft — only written to Firestore when the coach hits Save, so
  // typing never races the synced value and a failed write can't silently
  // discard what they wrote.
  const [text, setText] = useState(saved.text || "");
  const [autoSend, setAutoSend] = useState(!!saved.autoSend);
  const [attachmentName, setAttachmentName] = useState(saved.attachmentName || "");
  const [attachmentUrl, setAttachmentUrl] = useState(saved.attachmentUrl || "");
  const loadedRef = useRef(false);

  // Seed the draft from the synced doc once it's loaded — but only the
  // first time, so it never clobbers an edit in progress.
  useEffect(() => {
    if (loadedRef.current || !db.welcomeMessage) return;
    loadedRef.current = true;
    setText(db.welcomeMessage.text || "");
    setAutoSend(!!db.welcomeMessage.autoSend);
    setAttachmentName(db.welcomeMessage.attachmentName || "");
    setAttachmentUrl(db.welcomeMessage.attachmentUrl || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.welcomeMessage]);

  const dirty =
    text !== (saved.text || "") ||
    autoSend !== !!saved.autoSend ||
    attachmentName !== (saved.attachmentName || "") ||
    attachmentUrl !== (saved.attachmentUrl || "");

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf") return;
    setError("");
    // The PDF is stored inline in the Firestore doc as base64 (~33% larger
    // than the raw file), and the whole document must stay under 1MB —
    // reject oversized files here with a clear message instead of letting
    // the save silently fail later.
    const MAX_PDF_BYTES = 650_000;
    if (file.size > MAX_PDF_BYTES) {
      setError(
        `That PDF is ${(file.size / 1024 / 1024).toFixed(1)}MB — this only supports PDFs up to about ${(
          MAX_PDF_BYTES / 1024
        ).toFixed(0)}KB right now. Try compressing it (e.g. at smallpdf.com/compress-pdf) or trimming it down.`
      );
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      setAttachmentName(file.name);
      setAttachmentUrl(dataUrl);
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      await updateWelcomeMessage({ text, autoSend, attachmentName, attachmentUrl });
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
          <MessageSquareText size={18} className="text-blue-500" />
        </div>
        <div className="flex-1">
          <p className="text-black font-semibold text-sm">Automated Welcome Message</p>
          <p className="text-black/40 text-xs mt-0.5">Sent to a client automatically the moment they activate their account</p>
        </div>
        <button
          onClick={() => setAutoSend((v) => !v)}
          className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${autoSend ? "bg-blue-500" : "bg-black/15"}`}
          aria-label={autoSend ? "Turn off auto-send" : "Turn on auto-send"}
        >
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${autoSend ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </div>

      <p className="text-black/30 text-[11px] mt-3 mb-1.5">
        MESSAGE — use <span className="font-mono bg-black/5 px-1 rounded">{"{name}"}</span> for the client's first name
      </p>
      <TextArea rows={6} value={text} onChange={(e) => setText(e.target.value)} />

      <p className="text-black/30 text-[11px] mt-4 mb-1.5">ATTACHMENT (OPTIONAL)</p>
      {attachmentUrl ? (
        <div className="flex items-center gap-2 bg-black/5 border border-black/10 rounded-xl px-3.5 py-2.5">
          <Paperclip size={14} className="text-black/40 shrink-0" />
          <span className="text-black text-sm flex-1 truncate">{attachmentName}</span>
          <button
            onClick={() => {
              setAttachmentName("");
              setAttachmentUrl("");
            }}
            className="w-6 h-6 shrink-0 flex items-center justify-center text-black/30 hover:text-black/60"
            aria-label="Remove attachment"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <>
          <input ref={fileRef} type="file" accept="application/pdf" onChange={handleFile} className="hidden" />
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 bg-black/5 border border-dashed border-black/15 text-black/60 text-sm font-medium py-3 rounded-xl"
          >
            <Upload size={15} /> {uploading ? "Uploading…" : "Attach a PDF (e.g. a nutrition guide)"}
          </button>
        </>
      )}

      {error && <p className="text-red-600 text-sm bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5 mt-3">{error}</p>}

      <button
        onClick={save}
        disabled={!dirty || saving}
        className={`w-full mt-4 py-3 rounded-xl text-sm font-bold transition-colors ${
          !dirty && !saving ? "bg-black/8 text-black/30" : "bg-black text-white"
        }`}
      >
        {saving ? "SAVING…" : justSaved ? "SAVED ✓" : dirty ? "SAVE CHANGES" : "SAVED"}
      </button>
    </Card>
  );
}

// A manual, on-demand safety net on top of Firebase's own backups — every
// collection the coach can see, downloaded straight to their device as one
// JSON file. Not meant to be re-imported; just a copy the coach physically
// holds, independent of this app or Firebase staying online.
function DataBackupCard({ db }) {
  const [downloading, setDownloading] = useState(false);

  function download() {
    setDownloading(true);
    try {
      const payload = { exportedAt: new Date().toISOString(), ...db };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `zm-training-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
          <Download size={18} className="text-blue-500" />
        </div>
        <div className="flex-1">
          <p className="text-black font-semibold text-sm">Download Data Backup</p>
          <p className="text-black/40 text-xs mt-0.5">Every client, program and log as one JSON file, saved straight to this device</p>
        </div>
      </div>
      <button
        onClick={download}
        disabled={downloading}
        className="w-full mt-3 flex items-center justify-center gap-2 bg-black/5 border border-black/10 text-black text-sm font-semibold py-2.5 rounded-xl disabled:opacity-50"
      >
        <Download size={14} /> {downloading ? "Preparing…" : "Download Backup"}
      </button>
    </Card>
  );
}

export default function CoachMore({ onNavigate, onLogout, showToast }) {
  const { currentUser, updateUser, updateCoachEmail, db } = useApp();

  return (
    <div className="max-w-xl px-4 py-5 md:px-8 md:py-8 space-y-4">
      <div>
        <h1 className="text-black text-2xl font-bold">Settings</h1>
      </div>

      <Card>
        <div className="flex items-center gap-4">
          <AvatarPicker
            name={currentUser?.name}
            url={currentUser?.avatarUrl}
            size={64}
            onChange={(dataUrl) => updateUser(currentUser.id, { avatarUrl: dataUrl })}
          />
          <div>
            <p className="text-black font-bold">{currentUser?.name}</p>
            <p className="text-black/40 text-sm">{currentUser?.email}</p>
          </div>
        </div>
      </Card>

      <AccountCard currentUser={currentUser} updateUser={updateUser} updateCoachEmail={updateCoachEmail} showToast={showToast} />

      <DesignSettingsCard />

      <Card onClick={() => onNavigate("library")}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-black/10 flex items-center justify-center shrink-0">
            <Video size={18} className="text-black" />
          </div>
          <div className="flex-1">
            <p className="text-black font-semibold text-sm">Manage Exercise Library</p>
            <p className="text-black/40 text-xs mt-0.5">Upload custom exercise videos</p>
          </div>
          <ChevronRight size={18} className="text-black/30" />
        </div>
      </Card>

      <WelcomeMessageCard />

      {currentUser && (
        <PushNotificationsCard
          userId={currentUser.id}
          notificationPrefs={currentUser.notificationPrefs}
          updateUser={updateUser}
          showToast={showToast}
        />
      )}

      <DataBackupCard db={db} />

      <DangerButton className="w-full" onClick={onLogout}>
        <LogOut size={14} /> Sign out
      </DangerButton>

      <div className="flex justify-center pt-4">
        <Tagline />
      </div>
    </div>
  );
}
