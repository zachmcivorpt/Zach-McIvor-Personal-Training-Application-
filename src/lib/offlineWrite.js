// Finishing a workout with no signal. Firestore's on-phone cache
// (persistentLocalCache in firebase.js) keeps a write the moment it's made
// and sends it by itself once there's a connection again, even after the
// app is closed and reopened — but the write's promise only settles when
// the server answers, so awaiting it offline left "Finish" spinning
// forever. This waits a few seconds for the server; past that the write is
// already kept on the phone, so it resolves "queued" and lets the app move
// on. A rejection that arrives after that goes to onLateError.
export const SAVED = "saved";
export const QUEUED = "queued";

export function savedOrQueued(writePromise, { onLateError, waitMs } = {}) {
  const ms = waitMs ?? (typeof navigator !== "undefined" && navigator.onLine === false ? 800 : 4000);
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      resolve(QUEUED);
    }, ms);
    writePromise.then(
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(SAVED);
      },
      (err) => {
        if (settled) return onLateError?.(err);
        settled = true;
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

// Local-first saves (coached client app). Firestore's on-phone cache shows
// a write on screen the moment it's made and keeps it until the server has
// it — even across an app restart — so a client action doesn't need to
// wait for the server at all: logging a food, editing an entry, finishing
// a workout, moving a session. This resolves straight away ("saved", or
// "queued" when the phone knows it has no signal) and hands a failure that
// only arrives later (e.g. the server refusing it) to onLateError and to
// any listener registered with onLocalWriteFailed, so it's never silent.
const lateFailureListeners = new Set();

export function onLocalWriteFailed(fn) {
  lateFailureListeners.add(fn);
  return () => lateFailureListeners.delete(fn);
}

export function localFirst(writePromise, { onLateError, label } = {}) {
  Promise.resolve(writePromise).catch((err) => {
    onLateError?.(err);
    lateFailureListeners.forEach((fn) => {
      try {
        fn(err, label);
      } catch {}
    });
  });
  return Promise.resolve(typeof navigator !== "undefined" && navigator.onLine === false ? QUEUED : SAVED);
}
