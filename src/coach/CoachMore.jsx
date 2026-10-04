import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../lib/AppContext";
import { Card, DangerButton, AvatarPicker, Tagline, TextArea, TextInput, DeleteAccountSheet } from "../components/ui";
import { fileToDataUrl, removeFlatLogoBackground } from "../lib/image";
import { enablePush, disablePush } from "../lib/push";
import { uploadDesignImage, uploadLoginBackground } from "../lib/storage";
import { DarkPage, DarkPageHeader } from "./darkUI";
import { MEASURE_BLUE, CLIENT_DARK_SURFACE_2, CLIENT_DARK_BORDER, OVER_RED } from "../theme";
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
  ZoomIn,
  ZoomOut,
  Check,
} from "lucide-react";

// Small on/off row shared by the two per-type notification toggles — same
// visual switch as the master toggle above it, just smaller and inline.
function NotifPrefRow({ label, on, onToggle }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-white/70 text-sm">{label}</span>
      <button
        onClick={onToggle}
        className="w-9 h-5 rounded-full relative transition-colors shrink-0"
        style={{ backgroundColor: on ? MEASURE_BLUE : "rgba(255,255,255,0.15)" }}
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
    <Card dark>
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl border flex items-center justify-center shrink-0"
          style={{ backgroundColor: "rgba(47,143,255,0.12)", borderColor: "rgba(47,143,255,0.25)" }}
        >
          <BellRing size={18} style={{ color: MEASURE_BLUE }} />
        </div>
        <div className="flex-1">
          <p className="text-white font-semibold text-sm">Push Notifications</p>
          <p className="text-white/40 text-xs mt-0.5">Get alerted on this device — even app closed</p>
        </div>
        <button
          onClick={toggle}
          disabled={busy}
          className="w-11 h-6 rounded-full relative transition-colors shrink-0"
          style={{ backgroundColor: enabled ? MEASURE_BLUE : "rgba(255,255,255,0.15)" }}
          aria-label={enabled ? "Turn off push notifications" : "Turn on push notifications"}
        >
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${enabled ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </div>
      {enabled && (
        <div className="mt-3.5 pt-3.5 border-t space-y-2.5" style={{ borderColor: CLIENT_DARK_BORDER }}>
          <NotifPrefRow label="New messages" on={prefs.messages} onToggle={() => togglePref("messages")} />
          <NotifPrefRow label="Check-in submissions" on={prefs.checkins} onToggle={() => togglePref("checkins")} />
        </div>
      )}
      {error && (
        <p className="text-sm rounded-xl px-3.5 py-2.5 mt-3 border" style={{ backgroundColor: "rgba(239,68,68,0.1)", borderColor: "rgba(239,68,68,0.3)", color: OVER_RED }}>
          {error}
        </p>
      )}
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
    <Card dark>
      <div className="flex items-center gap-3 mb-3.5">
        <div
          className="w-10 h-10 rounded-xl border flex items-center justify-center shrink-0"
          style={{ backgroundColor: "rgba(47,143,255,0.12)", borderColor: "rgba(47,143,255,0.25)" }}
        >
          <User size={18} style={{ color: MEASURE_BLUE }} />
        </div>
        <p className="text-white font-semibold text-sm">Account</p>
      </div>

      <p className="text-white/30 text-[11px] mb-1.5">NAME</p>
      <div className="flex gap-2 mb-4">
        <TextInput dark value={name} onChange={(e) => setName(e.target.value)} className="flex-1" />
        <button
          onClick={saveName}
          disabled={!nameDirty || savingName}
          className="bg-white text-black text-xs font-bold px-4 rounded-xl disabled:opacity-30 shrink-0"
        >
          {savingName ? "…" : "Save"}
        </button>
      </div>

      <form onSubmit={saveEmail}>
        <p className="text-white/30 text-[11px] mb-1.5">LOGIN EMAIL</p>
        <TextInput dark type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        {emailDirty && (
          <>
            <p className="text-white/30 text-[11px] mt-3 mb-1.5">CURRENT PASSWORD (to confirm)</p>
            <TextInput
              dark
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Required to change your email"
            />
            <p className="text-white/40 text-[11px] mt-2">
              We'll send a verification link to the new address — your login stays on the old one until you click it.
            </p>
          </>
        )}
        {error && (
          <p className="text-sm rounded-xl px-3.5 py-2.5 mt-3 border" style={{ backgroundColor: "rgba(239,68,68,0.1)", borderColor: "rgba(239,68,68,0.3)", color: OVER_RED }}>
            {error}
          </p>
        )}
        {emailDirty && (
          <button
            type="submit"
            disabled={savingEmail}
            className="w-full mt-3 bg-white text-black text-sm font-bold py-2.5 rounded-xl disabled:opacity-50"
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
  iconClassName = "text-white/20",
}) {
  const fileRef = useRef(null);

  return (
    <div>
      <p className="text-white/30 text-[11px] mb-1.5">{label.toUpperCase()}</p>
      {description && <p className="text-white/40 text-xs mb-2">{description}</p>}
      <div
        className={`relative rounded-xl overflow-hidden border flex items-center justify-center ${aspectClassName}`}
        style={{ borderColor: CLIENT_DARK_BORDER, backgroundColor: "rgba(255,255,255,0.03)" }}
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
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
            <span className="text-white/80 text-xs font-bold">{Math.round((progress || 0) * 100)}%</span>
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
          className="flex-1 flex items-center justify-center gap-1.5 border text-white text-xs font-semibold py-2 rounded-lg disabled:opacity-50"
          style={{ backgroundColor: "rgba(255,255,255,0.05)", borderColor: CLIENT_DARK_BORDER }}
        >
          <Upload size={12} /> {previewUrl ? "Replace" : "Upload"}
        </button>
        {previewUrl && (
          <button
            onClick={onRemove}
            disabled={uploading}
            className="px-3.5 border text-xs font-semibold py-2 rounded-lg disabled:opacity-50"
            style={{ backgroundColor: "rgba(239,68,68,0.1)", borderColor: "rgba(239,68,68,0.3)", color: OVER_RED }}
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

const CROP_FRAME = 280; // on-screen square crop frame, in px
const CROP_OUTPUT = 1024; // exported square canvas, in px

// Lets a coach pan and zoom their uploaded logo within a square frame before
// it's saved. The most common reason an uploaded mark "comes out too small"
// is a source file with a lot of empty padding baked in around it — the
// logo ends up occupying a small fraction of its own canvas everywhere the
// app displays it. This gives direct control to scale the mark up and
// recenter it so it actually fills the frame, instead of only being able to
// upload the file exactly as exported.
function LogoCropModal({ file, onCancel, onDone }) {
  const [imgEl, setImgEl] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef(null);
  const objectUrlRef = useRef(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    const img = new Image();
    img.onload = () => setImgEl(img);
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // "Cover" scale — the smallest scale that still fills the whole square
  // frame with no gaps — so zoom starts at a fully-filled frame rather than
  // a small image floating in empty space.
  const baseScale = imgEl ? Math.max(CROP_FRAME / imgEl.width, CROP_FRAME / imgEl.height) : 1;
  const dispW = imgEl ? imgEl.width * baseScale * zoom : 0;
  const dispH = imgEl ? imgEl.height * baseScale * zoom : 0;

  function clamp(o, w, h) {
    const minX = Math.min(0, CROP_FRAME - w);
    const minY = Math.min(0, CROP_FRAME - h);
    return { x: Math.min(0, Math.max(minX, o.x)), y: Math.min(0, Math.max(minY, o.y)) };
  }

  function onPointerDown(e) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origin: offset };
  }
  function onPointerMove(e) {
    if (!dragRef.current) return;
    const { startX, startY, origin } = dragRef.current;
    setOffset(clamp({ x: origin.x + (e.clientX - startX), y: origin.y + (e.clientY - startY) }, dispW, dispH));
  }
  function onPointerUp() {
    dragRef.current = null;
  }

  function changeZoom(next) {
    const clamped = Math.min(4, Math.max(1, next));
    const newW = imgEl.width * baseScale * clamped;
    const newH = imgEl.height * baseScale * clamped;
    setZoom(clamped);
    setOffset((o) => clamp(o, newW, newH));
  }

  function confirm() {
    const canvas = document.createElement("canvas");
    canvas.width = CROP_OUTPUT;
    canvas.height = CROP_OUTPUT;
    const ctx = canvas.getContext("2d");
    const k = CROP_OUTPUT / CROP_FRAME;
    ctx.drawImage(imgEl, offset.x * k, offset.y * k, dispW * k, dispH * k);
    canvas.toBlob((blob) => {
      if (!blob) return;
      onDone(new File([blob], (file.name || "logo").replace(/\.\w+$/, "") + ".png", { type: "image/png" }));
    }, "image/png");
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl p-5 w-full max-w-sm">
        <p className="text-black font-semibold text-sm mb-1">Position your logo</p>
        <p className="text-black/40 text-xs mb-4">Drag to reposition, use the slider to zoom in so it fills the frame</p>

        <div
          className="relative mx-auto rounded-xl overflow-hidden bg-black/[0.06] border border-black/10 touch-none select-none"
          style={{ width: CROP_FRAME, height: CROP_FRAME }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          {imgEl && (
            <img
              src={objectUrlRef.current}
              alt=""
              draggable={false}
              className="absolute top-0 left-0 pointer-events-none"
              style={{ width: dispW, height: dispH, transform: `translate(${offset.x}px, ${offset.y}px)` }}
            />
          )}
        </div>

        <div className="flex items-center gap-2.5 mt-4">
          <ZoomOut size={15} className="text-black/30 shrink-0" />
          <input
            type="range"
            min={1}
            max={4}
            step={0.01}
            value={zoom}
            onChange={(e) => changeZoom(Number(e.target.value))}
            className="flex-1 accent-blue-500"
          />
          <ZoomIn size={15} className="text-black/30 shrink-0" />
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onCancel} className="flex-1 bg-black/5 border border-black/10 text-black text-sm font-semibold py-2.5 rounded-xl">
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={!imgEl}
            className="flex-1 flex items-center justify-center gap-1.5 bg-blue-500 text-white text-sm font-semibold py-2.5 rounded-xl disabled:opacity-50"
          >
            <Check size={15} /> Use This
          </button>
        </div>
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
  // A logo file goes through the crop/zoom modal first — see LogoCropModal —
  // before it's actually uploaded, so a coach can scale it up to fill the
  // frame rather than uploading it exactly as exported.
  const [cropRequest, setCropRequest] = useState(null);

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
    <Card dark>
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-10 h-10 rounded-xl border flex items-center justify-center shrink-0"
          style={{ backgroundColor: "rgba(47,143,255,0.12)", borderColor: "rgba(47,143,255,0.25)" }}
        >
          <Palette size={18} style={{ color: MEASURE_BLUE }} />
        </div>
        <div>
          <p className="text-white font-semibold text-sm">Design Settings</p>
          <p className="text-white/40 text-xs mt-0.5">Customize how the app looks for you and your clients</p>
        </div>
      </div>

      <div className="space-y-5">
        <div>
          <p className="text-white/30 text-[11px] mb-1.5">CLIENT APP THEME</p>
          <div
            className="flex items-center justify-between rounded-xl px-3.5 py-3 border"
            style={{ backgroundColor: CLIENT_DARK_SURFACE_2, borderColor: CLIENT_DARK_BORDER }}
          >
            <div>
              <p className="text-white text-sm font-medium">{clientDark ? "Dark" : "Light"}</p>
              <p className="text-white/40 text-xs mt-0.5">Switches every client's app instantly — no update needed</p>
            </div>
            <button
              onClick={toggleClientTheme}
              disabled={savingTheme}
              className="w-11 h-6 rounded-full relative transition-colors shrink-0 disabled:opacity-50"
              style={{ backgroundColor: clientDark ? MEASURE_BLUE : "rgba(255,255,255,0.15)" }}
              aria-label={`Switch client app to ${clientDark ? "light" : "dark"} mode`}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${clientDark ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </div>
        </div>

        <div className="border-t" style={{ borderColor: CLIENT_DARK_BORDER }} />

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

        <div className="border-t" style={{ borderColor: CLIENT_DARK_BORDER }} />

        <div>
          <p className="text-white/30 text-[11px] mb-1.5">PROFILE PICTURE</p>
          <p className="text-white/40 text-xs mb-2">Shown wherever your trainer profile appears</p>
          <div className="flex items-center gap-3">
            <AvatarPicker
              dark
              name={currentUser?.name}
              url={currentUser?.avatarUrl}
              size={56}
              onChange={(dataUrl) => updateUser(currentUser.id, { avatarUrl: dataUrl })}
            />
            {currentUser?.avatarUrl && (
              <button
                onClick={() => updateUser(currentUser.id, { avatarUrl: null })}
                className="text-xs font-semibold px-3.5 py-2 rounded-lg border"
                style={{ backgroundColor: "rgba(239,68,68,0.1)", borderColor: "rgba(239,68,68,0.3)", color: OVER_RED }}
              >
                Remove
              </button>
            )}
          </div>
        </div>

        <div className="border-t" style={{ borderColor: CLIENT_DARK_BORDER }} />

        <DesignAssetRow
          label="Logo — Dark Backgrounds"
          description="Login screen, your coach console header, and your client app when its theme is set to Dark above — needs a light-colored mark"
          previewUrl={design.appLogoUrlOnDark}
          previewClassName="max-w-[65%] max-h-[65%] object-contain"
          aspectClassName="h-24 !bg-black"
          iconClassName="text-white/25"
          uploading={uploadingLogoDark}
          progress={logoDarkProgress}
          onUpload={(file) => setCropRequest({ field: "appLogoUrlOnDark", setUploading: setUploadingLogoDark, setProgress: setLogoDarkProgress, file })}
          onRemove={() => handleRemove("appLogoUrlOnDark")}
        />

        <DesignAssetRow
          label="Logo — Light Backgrounds"
          description="Your client app when its theme is set to Light above — needs a dark-colored mark"
          previewUrl={design.appLogoUrlOnLight}
          previewClassName="max-w-[65%] max-h-[65%] object-contain"
          aspectClassName="h-24 !bg-white"
          iconClassName="text-black/20"
          uploading={uploadingLogoLight}
          progress={logoLightProgress}
          onUpload={(file) => setCropRequest({ field: "appLogoUrlOnLight", setUploading: setUploadingLogoLight, setProgress: setLogoLightProgress, file })}
          onRemove={() => handleRemove("appLogoUrlOnLight")}
        />
      </div>

      {error && (
        <p className="text-sm rounded-xl px-3.5 py-2.5 mt-4 border" style={{ backgroundColor: "rgba(239,68,68,0.1)", borderColor: "rgba(239,68,68,0.3)", color: OVER_RED }}>
          {error}
        </p>
      )}

      {cropRequest && (
        <LogoCropModal
          file={cropRequest.file}
          onCancel={() => setCropRequest(null)}
          onDone={(croppedFile) => {
            const { field, setUploading, setProgress } = cropRequest;
            setCropRequest(null);
            handleLogoUpload(field, setUploading, setProgress, croppedFile);
          }}
        />
      )}
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
    <Card dark>
      <div className="flex items-center gap-3 mb-1">
        <div
          className="w-10 h-10 rounded-xl border flex items-center justify-center shrink-0"
          style={{ backgroundColor: "rgba(47,143,255,0.12)", borderColor: "rgba(47,143,255,0.25)" }}
        >
          <MessageSquareText size={18} style={{ color: MEASURE_BLUE }} />
        </div>
        <div className="flex-1">
          <p className="text-white font-semibold text-sm">Automated Welcome Message</p>
          <p className="text-white/40 text-xs mt-0.5">Sent to a client automatically the moment they activate their account</p>
        </div>
        <button
          onClick={() => setAutoSend((v) => !v)}
          className="w-11 h-6 rounded-full relative transition-colors shrink-0"
          style={{ backgroundColor: autoSend ? MEASURE_BLUE : "rgba(255,255,255,0.15)" }}
          aria-label={autoSend ? "Turn off auto-send" : "Turn on auto-send"}
        >
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${autoSend ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </div>

      <p className="text-white/30 text-[11px] mt-3 mb-1.5">
        MESSAGE — use <span className="font-mono px-1 rounded text-white/80" style={{ backgroundColor: "rgba(255,255,255,0.1)" }}>{"{name}"}</span> for the client's first name
      </p>
      <TextArea dark rows={6} value={text} onChange={(e) => setText(e.target.value)} />

      <p className="text-white/30 text-[11px] mt-4 mb-1.5">ATTACHMENT (OPTIONAL)</p>
      {attachmentUrl ? (
        <div
          className="flex items-center gap-2 rounded-xl px-3.5 py-2.5 border"
          style={{ backgroundColor: CLIENT_DARK_SURFACE_2, borderColor: CLIENT_DARK_BORDER }}
        >
          <Paperclip size={14} className="text-white/40 shrink-0" />
          <span className="text-white text-sm flex-1 truncate">{attachmentName}</span>
          <button
            onClick={() => {
              setAttachmentName("");
              setAttachmentUrl("");
            }}
            className="w-6 h-6 shrink-0 flex items-center justify-center text-white/30 hover:text-white/60"
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
            className="w-full flex items-center justify-center gap-2 border border-dashed text-white/60 text-sm font-medium py-3 rounded-xl"
            style={{ backgroundColor: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.15)" }}
          >
            <Upload size={15} /> {uploading ? "Uploading…" : "Attach a PDF (e.g. a nutrition guide)"}
          </button>
        </>
      )}

      {error && (
        <p className="text-sm rounded-xl px-3.5 py-2.5 mt-3 border" style={{ backgroundColor: "rgba(239,68,68,0.1)", borderColor: "rgba(239,68,68,0.3)", color: OVER_RED }}>
          {error}
        </p>
      )}

      <button
        onClick={save}
        disabled={!dirty || saving}
        className="w-full mt-4 py-3 rounded-xl text-sm font-bold transition-colors"
        style={!dirty && !saving ? { backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.3)" } : { backgroundColor: "#FFFFFF", color: "#000000" }}
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
    <Card dark>
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl border flex items-center justify-center shrink-0"
          style={{ backgroundColor: "rgba(47,143,255,0.12)", borderColor: "rgba(47,143,255,0.25)" }}
        >
          <Download size={18} style={{ color: MEASURE_BLUE }} />
        </div>
        <div className="flex-1">
          <p className="text-white font-semibold text-sm">Download Data Backup</p>
          <p className="text-white/40 text-xs mt-0.5">Every client, program and log as one JSON file, saved straight to this device</p>
        </div>
      </div>
      <button
        onClick={download}
        disabled={downloading}
        className="w-full mt-3 flex items-center justify-center gap-2 border text-white text-sm font-semibold py-2.5 rounded-xl disabled:opacity-50"
        style={{ backgroundColor: "rgba(255,255,255,0.05)", borderColor: CLIENT_DARK_BORDER }}
      >
        <Download size={14} /> {downloading ? "Preparing…" : "Download Backup"}
      </button>
    </Card>
  );
}

export default function CoachMore({ onNavigate, onLogout, showToast }) {
  const { currentUser, updateUser, updateCoachEmail, db, deleteMyAccount } = useApp();
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <DarkPage>
      <div className="max-w-xl mx-auto space-y-4">
      <DarkPageHeader title="Settings" />

      <Card dark>
        <div className="flex items-center gap-4">
          <AvatarPicker
            dark
            name={currentUser?.name}
            url={currentUser?.avatarUrl}
            size={64}
            onChange={(dataUrl) => updateUser(currentUser.id, { avatarUrl: dataUrl })}
          />
          <div>
            <p className="text-white font-bold">{currentUser?.name}</p>
            <p className="text-white/40 text-sm">{currentUser?.email}</p>
          </div>
        </div>
      </Card>

      <AccountCard currentUser={currentUser} updateUser={updateUser} updateCoachEmail={updateCoachEmail} showToast={showToast} />

      <DesignSettingsCard />

      <Card dark onClick={() => onNavigate("library")}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "rgba(255,255,255,0.08)" }}>
            <Video size={18} className="text-white/70" />
          </div>
          <div className="flex-1">
            <p className="text-white font-semibold text-sm">Manage Exercise Library</p>
            <p className="text-white/40 text-xs mt-0.5">Upload custom exercise videos</p>
          </div>
          <ChevronRight size={18} className="text-white/30" />
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

      <DangerButton className="w-full" dark onClick={onLogout}>
        <LogOut size={14} /> Sign out
      </DangerButton>

      <div className="flex items-center justify-center gap-4 pt-1">
        <Link to="/legal/privacy-policy" className="text-white/30 text-xs font-medium">
          Privacy Policy
        </Link>
        <Link to="/legal/terms-of-service" className="text-white/30 text-xs font-medium">
          Terms of Service
        </Link>
        <button onClick={() => setDeleteOpen(true)} className="text-xs font-medium" style={{ color: OVER_RED, opacity: 0.7 }}>
          Delete account
        </button>
      </div>

      <div className="flex justify-center pt-4">
        <Tagline tone="white" />
      </div>

      <DeleteAccountSheet
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        warning="This permanently deletes your own coach login and profile. It does NOT delete your clients, programs, or library — those stay intact and coach sign-up re-opens so you (or someone else) can create a new coach account and pick everything back up. This can't be undone."
        onConfirm={async (password) => {
          await deleteMyAccount(password);
        }}
      />
      </div>
    </DarkPage>
  );
}
