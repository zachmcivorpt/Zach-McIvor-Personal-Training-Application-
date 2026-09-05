// Firebase Storage — the one place this app needs real file storage rather
// than a small base64 blob inline in a Firestore doc (the welcome-message
// PDF and profile photos stay base64 since they're capped small; a
// form-check video or a real client-facing PDF is routinely too big for
// Firestore's 1MB-per-document limit).
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage } from "./firebase";

const MAX_VIDEO_BYTES = 75 * 1024 * 1024; // 75MB
const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20MB

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
