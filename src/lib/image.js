// Reads any file (PDF, etc.) to a base64 data URL as-is — no compression,
// since that only makes sense for raster images.
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

// Strips a flat/solid background color (white canvas, a single brand
// color, etc. — the overwhelming majority of real logo files) so only the
// mark itself shows once it's placed over the dark login screen or a
// colored header, instead of sitting inside a visible box. This is a
// client-side colour-key, not a general background-removal model: it
// samples the four corners, and only proceeds if they roughly agree with
// each other (a real flat background does; a photo behind the logo
// doesn't) — anything that doesn't look like a clean flat background is
// left untouched rather than risk mangling it. Always resolves to a PNG
// (only PNG carries an alpha channel), even if nothing was keyed out.
export function removeFlatLogoBackground(file, { maxDim = 1200, innerTolerance = 26, outerTolerance = 64 } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.onload = () => {
      img.onerror = () => reject(new Error("Couldn't read that image."));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);

        const data = ctx.getImageData(0, 0, w, h);
        const px = data.data;
        const corner = (x, y) => {
          const i = (y * w + x) * 4;
          return [px[i], px[i + 1], px[i + 2]];
        };
        const corners = [corner(0, 0), corner(w - 1, 0), corner(0, h - 1), corner(w - 1, h - 1)];
        const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
        let maxCornerSpread = 0;
        for (let i = 0; i < corners.length; i++) {
          for (let j = i + 1; j < corners.length; j++) {
            maxCornerSpread = Math.max(maxCornerSpread, dist(corners[i], corners[j]));
          }
        }

        // Corners disagree too much to be one flat background — most likely
        // a photo or gradient behind the mark. Leave every pixel as-is
        // rather than guess wrong and cut a hole through the actual logo.
        if (maxCornerSpread <= outerTolerance) {
          const bg = [
            corners.reduce((s, c) => s + c[0], 0) / 4,
            corners.reduce((s, c) => s + c[1], 0) / 4,
            corners.reduce((s, c) => s + c[2], 0) / 4,
          ];
          for (let i = 0; i < px.length; i += 4) {
            const d = dist([px[i], px[i + 1], px[i + 2]], bg);
            if (d <= innerTolerance) {
              px[i + 3] = 0;
            } else if (d < outerTolerance) {
              // Soft-edge the cutoff instead of a hard on/off boundary, so
              // anti-aliased pixels along the mark's own edge fade out
              // smoothly rather than leaving a harsh halo ring.
              px[i + 3] = Math.round(px[i + 3] * ((d - innerTolerance) / (outerTolerance - innerTolerance)));
            }
          }
          ctx.putImageData(data, 0, 0);
        }

        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error("Couldn't process that image."));
            return;
          }
          resolve(new File([blob], (file.name || "logo").replace(/\.\w+$/, "") + ".png", { type: "image/png" }));
        }, "image/png");
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Downscales an uploaded image client-side before it goes into the local
// store — a phone photo can be several MB; a 900px-wide JPEG is plenty for
// a progress-photo thumbnail/detail view and keeps localStorage healthy.
export function fileToCompressedDataUrl(file, maxDim = 900, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.onload = () => {
      img.onerror = () => reject(new Error("Couldn't read that image."));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
