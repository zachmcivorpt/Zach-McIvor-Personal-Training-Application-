// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Register #97: form-check (and chat) videos are compressed with the fast
// WebCodecs path first, and the 200MB limit applies to the compressed file —
// a 2-minute iPhone clip is often 300MB+ before compression.

const mb = vi.hoisted(() => ({ result: null, valid: true, discarded: [], executed: 0 }));
vi.mock("mediabunny", () => {
  class Input {
    computeDuration() {
      return Promise.resolve(120);
    }
    dispose() {}
  }
  class Output {
    constructor({ target }) {
      this.target = target;
    }
  }
  class BufferTarget {
    buffer = null;
  }
  return {
    ALL_FORMATS: [],
    BlobSource: class {},
    Input,
    Output,
    BufferTarget,
    Mp4OutputFormat: class {},
    WebMOutputFormat: class {},
    canEncodeVideo: async (codec) => codec === "avc",
    Conversion: {
      init: async ({ output, video }) => {
        const opts = await video({ getDisplayWidth: async () => 1080, getDisplayHeight: async () => 1920 });
        mb.lastOptions = opts;
        return {
          isValid: mb.valid,
          discardedTracks: mb.discarded,
          cancel: async () => {},
          execute: async () => {
            mb.executed++;
            output.target.buffer = mb.result;
          },
        };
      },
    },
  };
});

const bigFile = (mb_) => {
  const f = new File(["x"], "IMG_0042.MOV", { type: "video/quicktime" });
  Object.defineProperty(f, "size", { value: mb_ * 1024 * 1024 });
  return f;
};

describe("maybeCompressVideo fast path", () => {
  beforeEach(() => {
    vi.resetModules();
    mb.valid = true;
    mb.discarded = [];
    mb.executed = 0;
    mb.result = new Uint8Array(30 * 1024).buffer;
    window.VideoEncoder = function () {};
    window.VideoDecoder = function () {};
  });
  afterEach(() => {
    delete window.VideoEncoder;
    delete window.VideoDecoder;
  });

  it("re-encodes a large clip to a small mp4, longest side 960, orientation kept", async () => {
    const { maybeCompressVideo } = await import("./videoCompress");
    const out = await maybeCompressVideo(bigFile(400));
    expect(mb.executed).toBe(1);
    expect(out.type).toBe("video/mp4");
    expect(out.name).toBe("IMG_0042_compressed.mp4");
    expect(out.size).toBe(30 * 1024);
    expect(mb.lastOptions).toMatchObject({ width: 540, height: 960, codec: "avc", bitrate: 2_000_000 });
  });

  it("compresses clips from 8MB up (was 20MB)", async () => {
    const { maybeCompressVideo } = await import("./videoCompress");
    const small = bigFile(7);
    expect(await maybeCompressVideo(small)).toBe(small);
    expect(mb.executed).toBe(0);
    await maybeCompressVideo(bigFile(12));
    expect(mb.executed).toBe(1);
  });

  it("falls back to the original file when the device can't encode the video", async () => {
    mb.valid = false;
    const { maybeCompressVideo } = await import("./videoCompress");
    const f = bigFile(50);
    expect(await maybeCompressVideo(f)).toBe(f); // jsdom has no MediaRecorder, so the playback path also returns it
    expect(mb.executed).toBe(0);
  });
});

describe("uploadMessageVideo size limit", () => {
  beforeEach(() => vi.resetModules());

  async function load(compressedSize) {
    vi.doMock("./firebase", () => ({ storage: {} }));
    vi.doMock("./image", () => ({ compressImageFile: vi.fn() }));
    vi.doMock("./videoCompress", () => ({
      maybeCompressVideo: async (file) => {
        if (compressedSize == null) return file;
        const out = new File(["y"], "c.mp4", { type: "video/mp4" });
        Object.defineProperty(out, "size", { value: compressedSize * 1024 * 1024 });
        return out;
      },
    }));
    const put = vi.fn();
    vi.doMock("firebase/storage", () => ({
      ref: (_s, path) => ({ path }),
      getDownloadURL: async () => "https://x/v.mp4",
      uploadBytesResumable: (r, file) => {
        put(r.path, file);
        return {
          cancel() {},
          on(_e, _p, _err, done) {
            setTimeout(done, 0);
          },
          snapshot: { ref: r },
        };
      },
    }));
    const mod = await import("./storage");
    return { ...mod, put };
  }

  it("uploads a 400MB clip once it compresses under the limit", async () => {
    const { uploadMessageVideo, put } = await load(30);
    const att = await uploadMessageVideo("c1", bigFile(400));
    expect(att.type).toBe("video");
    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0][1].size).toBe(30 * 1024 * 1024);
  });

  it("still rejects a clip that's over 200MB after compression", async () => {
    const { uploadMessageVideo, put } = await load(null);
    await expect(uploadMessageVideo("c1", bigFile(400))).rejects.toThrow(/400MB — please keep it under 200MB/);
    expect(put).not.toHaveBeenCalled();
  });
});
