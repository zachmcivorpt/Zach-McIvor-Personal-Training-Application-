// @vitest-environment jsdom
//
// #129: client videos took too long to start for the coach. Phone clips
// that weren't re-encoded kept their index ("moov") at the end, so a player
// had to download the whole file before it could start; uploads had no
// cache header, so re-watching downloaded it again.
import { describe, it, expect, vi, beforeEach } from "vitest";

const mb = vi.hoisted(() => ({ inits: 0, initArgs: null }));
vi.mock("mediabunny", () => ({
  ALL_FORMATS: [],
  BlobSource: class {},
  Input: class {
    dispose() {}
  },
  Output: class {
    constructor({ target }) {
      this.target = target;
    }
  },
  BufferTarget: class {
    buffer = null;
  },
  Mp4OutputFormat: class {
    constructor(opts) {
      mb.formatOpts = opts;
    }
  },
  Conversion: {
    init: async (args) => {
      mb.inits++;
      mb.initArgs = args;
      return { isValid: true, discardedTracks: [], execute: async () => (args.output.target.buffer = new Uint8Array([1, 2, 3]).buffer) };
    },
  },
}));

const storage = vi.hoisted(() => ({ calls: [] }));
vi.mock("firebase/storage", () => ({
  ref: (_s, path) => ({ path }),
  getDownloadURL: async () => "https://example.com/v.mp4",
  uploadBytesResumable: (ref, file, metadata) => {
    storage.calls.push({ ref, file, metadata });
    const snapshot = { ref, bytesTransferred: file.size, totalBytes: file.size };
    return { snapshot, cancel() {}, on: (_e, progress, _err, done) => setTimeout(() => (progress(snapshot), done()), 0) };
  },
}));
vi.mock("./firebase", () => ({ storage: {} }));

function box(type, bodyBytes = 8) {
  const b = new Uint8Array(8 + bodyBytes);
  new DataView(b.buffer).setUint32(0, 8 + bodyBytes);
  for (let i = 0; i < 4; i++) b[4 + i] = type.charCodeAt(i);
  return b;
}
const clip = (types, type = "video/quicktime", name = "IMG_1.MOV") => new File(types.map((t) => box(t)), name, { type });

beforeEach(() => {
  mb.inits = 0;
  storage.calls = [];
});

describe("fast start (#129)", () => {
  it("spots a clip whose index comes after the video data", async () => {
    const { moovAfterData } = await import("./videoCompress");
    expect(await moovAfterData(clip(["ftyp", "wide", "mdat", "moov"]))).toBe(true);
    expect(await moovAfterData(clip(["ftyp", "moov", "mdat"]))).toBe(false);
  });

  it("re-packages such a clip as an MP4 with the index first, copying the tracks (no re-encode)", async () => {
    const { ensureFastStart } = await import("./videoCompress");
    const out = await ensureFastStart(clip(["ftyp", "mdat", "moov"]));
    expect(mb.inits).toBe(1);
    expect(mb.initArgs.video).toBeUndefined(); // tracks copied as they are
    expect(mb.formatOpts).toEqual({ fastStart: "in-memory" });
    expect(out.type).toBe("video/mp4");
    expect(out.name).toBe("IMG_1.mp4");
  });

  it("leaves a clip that already starts fast, or isn't MP4/MOV, untouched", async () => {
    const { ensureFastStart } = await import("./videoCompress");
    const ready = clip(["ftyp", "moov", "mdat"]);
    expect(await ensureFastStart(ready)).toBe(ready);
    const webm = clip(["ftyp", "mdat", "moov"], "video/webm", "a.webm");
    expect(await ensureFastStart(webm)).toBe(webm);
    expect(mb.inits).toBe(0);
  });

  it("uploads chat videos with a long-lived cache header, so re-watching doesn't download again", async () => {
    const { uploadMessageVideo } = await import("./storage");
    await uploadMessageVideo("c1", clip(["ftyp", "moov", "mdat"]));
    expect(storage.calls[0].metadata).toEqual({ contentType: "video/quicktime", cacheControl: "public, max-age=31536000, immutable" });
  });
});
