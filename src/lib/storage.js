// Firebase Storage — the one place this app needs real file storage rather
// than a small base64 blob inline in a Firestore doc (the PDF welcome
// attachment and profile photos stay base64 since they're capped small;
// a form-check video is routinely tens of MB, which would blow past
// Firestore's 1MB-per-document limit).
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage } from "./firebase";

const MAX_VIDEO_BYTES = 75 * 1024 * 1024; // 75MB

// Firebase's own error text for the two most common setup gaps ("storage/
// unknown" and "storage/unauthorized") is a cryptic server-response dump
// that gives a client no idea what actually went wrong or what to do about
// it — both almost always mean Storage itself was never turned on for this
// project, or STORAGE_RULES.txt was never published. Translate them into
// something actionable instead of the raw SDK message.
function friendlyStorageError(err) {
  const code = err?.code || "";
  if (code === "storage/unknown") {
    return "Video upload isn't set up yet — Firebase Storage needs to be turned on for this project (see STORAGE_RULES.txt for the steps), then try again.";
  }
  if (code === "storage/unauthorized") {
    return "Video upload was blocked — the Storage security rules need to be published (see STORAGE_RULES.txt), then try again.";
  }
  if (code === "storage/canceled") {
    return "Upload canceled.";
  }
  if (code === "storage/quota-exceeded") {
    return "Storage is full — contact your coach.";
  }
  return err?.message || "Upload failed — check your connection and try again.";
}

// Uploads a video to messageVideos/{clientId}/... and resolves with an
// attachment object ready to pass straight into sendMessage(). onProgress
// is called with a 0..1 fraction as the upload streams.
export function uploadMessageVideo(clientId, file, onProgress) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("video/")) {
      reject(new Error("Please choose a video file."));
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      reject(
        new Error(
          `That video is ${(file.size / 1024 / 1024).toFixed(0)}MB — please keep it under ${MAX_VIDEO_BYTES / 1024 / 1024}MB.`
        )
      );
      return;
    }
    const path = `messageVideos/${clientId}/${Date.now()}_${file.name}`;
    const task = uploadBytesResumable(ref(storage, path), file);
    task.on(
      "state_changed",
      (snap) => onProgress?.(snap.totalBytes ? snap.bytesTransferred / snap.totalBytes : 0),
      (err) => reject(new Error(friendlyStorageError(err))),
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          resolve({ url, name: file.name, type: "video" });
        } catch (err) {
          reject(new Error(friendlyStorageError(err)));
        }
      }
    );
  });
}
