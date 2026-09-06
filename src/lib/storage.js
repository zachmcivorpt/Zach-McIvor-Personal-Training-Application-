// Firebase Storage — the one place this app needs real file storage rather
// than a small base64 blob inline in a Firestore doc (the welcome-message
// PDF and profile photos stay base64 since they're capped small; a
// form-check video or a real client-facing PDF is routinely too big for
// Firestore's 1MB-per-document limit).
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage } from "./firebase";

const MAX_VIDEO_BYTES = 75 * 1024 * 1024; // 75MB
const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20MB
const MAX_MESSAGE_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_DESIGN_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB
// A background video autoplays for every single visitor on every visit to
// the login screen — capped well below the message-video limit so it
// doesn't turn "sign in" into a slow, data-heavy download on someone's
// phone. 25MB is still generous for a short, muted, looping clip.
const MAX_LOGIN_BG_VIDEO_BYTES = 25 * 1024 * 1024; // 25MB

// Firebase's own error text for the two most common setup gaps ("storage/
// unknown" and "storage/unauthorized") is a cryptic server-response dump
// that gives a client no idea what actually went wrong or what to do about
// it — both almost always mean Storage itself was never turned on for this
// project, or STORAGE_RULES.txt was never published. Translate them into
// something actionable instead of the raw SDK message.
function friendlyStorageError(err, kind) {
  const code = err?.code || "";
  if (code === "storage/unknown") {
    return `${kind} upload isn't set up yet — Firebase Storage needs to be turned on for this project (see STORAGE_RULES.txt for the steps), then try again.`;
  }
  if (code === "storage/unauthorized") {
    return `${kind} upload was blocked — the Storage security rules need to be published (see STORAGE_RULES.txt), then try again.`;
  }
  if (code === "storage/canceled") {
    return "Upload canceled.";
  }
  if (code === "storage/quota-exceeded") {
    return "Storage is full — contact your coach.";
  }
  return err?.message || "Upload failed — check your connection and try again.";
}

function uploadToPath(path, file, type, kind, onProgress) {
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(ref(storage, path), file);
    task.on(
      "state_changed",
      (snap) => onProgress?.(snap.totalBytes ? snap.bytesTransferred / snap.totalBytes : 0),
      (err) => reject(new Error(friendlyStorageError(err, kind))),
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          resolve({ url, name: file.name, type });
        } catch (err) {
          reject(new Error(friendlyStorageError(err, kind)));
        }
      }
    );
  });
}

// Uploads a video to messageVideos/{clientId}/... and resolves with an
// attachment object ready to pass straight into sendMessage(). onProgress
// is called with a 0..1 fraction as the upload streams.
export function uploadMessageVideo(clientId, file, onProgress) {
  if (!file.type.startsWith("video/")) {
    return Promise.reject(new Error("Please choose a video file."));
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return Promise.reject(
      new Error(`That video is ${(file.size / 1024 / 1024).toFixed(0)}MB — please keep it under ${MAX_VIDEO_BYTES / 1024 / 1024}MB.`)
    );
  }
  return uploadToPath(`messageVideos/${clientId}/${Date.now()}_${file.name}`, file, "video", "Video", onProgress);
}

// A photo attached to a regular message (a meal, an injury, gym setup,
// etc.) — same reasoning as video/PDF: a real Storage upload rather than
// base64 so it isn't squeezed by Firestore's 1MB document cap.
export function uploadMessageImage(clientId, file, onProgress) {
  if (!file.type.startsWith("image/")) {
    return Promise.reject(new Error("Please choose an image file."));
  }
  if (file.size > MAX_MESSAGE_IMAGE_BYTES) {
    return Promise.reject(
      new Error(`That image is ${(file.size / 1024 / 1024).toFixed(1)}MB — please keep it under ${MAX_MESSAGE_IMAGE_BYTES / 1024 / 1024}MB.`)
    );
  }
  return uploadToPath(`messageImages/${clientId}/${Date.now()}_${file.name}`, file, "image", "Image", onProgress);
}

// Same idea for a PDF attached to a regular message (a program summary, an
// invoice, a form, etc.) — unlike the welcome-message PDF this isn't capped
// at ~650KB, since it goes through real Storage rather than sitting inline
// in a Firestore document.
export function uploadMessagePdf(clientId, file, onProgress) {
  if (file.type !== "application/pdf") {
    return Promise.reject(new Error("Please choose a PDF file."));
  }
  if (file.size > MAX_PDF_BYTES) {
    return Promise.reject(
      new Error(`That PDF is ${(file.size / 1024 / 1024).toFixed(1)}MB — please keep it under ${MAX_PDF_BYTES / 1024 / 1024}MB.`)
    );
  }
  return uploadToPath(`messageDocs/${clientId}/${Date.now()}_${file.name}`, file, "pdf", "PDF", onProgress);
}

// Coach-only branding images (login background photo, app logo) — a real
// object upload rather than base64 in Firestore, since a photographic
// background in particular is routinely well over what fits comfortably in
// a Firestore document. `kind` is just a filename prefix ("login-bg" /
// "logo") so the two don't collide in the design/ folder.
export function uploadDesignImage(kind, file, onProgress) {
  if (!file.type.startsWith("image/")) {
    return Promise.reject(new Error("Please choose an image file."));
  }
  if (file.size > MAX_DESIGN_IMAGE_BYTES) {
    return Promise.reject(
      new Error(`That image is ${(file.size / 1024 / 1024).toFixed(1)}MB — please keep it under ${MAX_DESIGN_IMAGE_BYTES / 1024 / 1024}MB.`)
    );
  }
  return uploadToPath(`design/${kind}_${Date.now()}_${file.name}`, file, "image", "Image", onProgress);
}

// The login background specifically also accepts a short video (autoplayed
// muted + looped behind the sign-in form) — a separate, tighter size cap
// than a still image, since it downloads on every visit.
export function uploadLoginBackground(file, onProgress) {
  const isVideo = file.type.startsWith("video/");
  const isImage = file.type.startsWith("image/");
  if (!isVideo && !isImage) {
    return Promise.reject(new Error("Please choose an image or video file."));
  }
  if (isVideo && file.size > MAX_LOGIN_BG_VIDEO_BYTES) {
    return Promise.reject(
      new Error(`That video is ${(file.size / 1024 / 1024).toFixed(0)}MB — please keep a login background video under ${MAX_LOGIN_BG_VIDEO_BYTES / 1024 / 1024}MB.`)
    );
  }
  if (isImage && file.size > MAX_DESIGN_IMAGE_BYTES) {
    return Promise.reject(
      new Error(`That image is ${(file.size / 1024 / 1024).toFixed(1)}MB — please keep it under ${MAX_DESIGN_IMAGE_BYTES / 1024 / 1024}MB.`)
    );
  }
  return uploadToPath(`design/login-bg_${Date.now()}_${file.name}`, file, isVideo ? "video" : "image", isVideo ? "Video" : "Image", onProgress);
}
