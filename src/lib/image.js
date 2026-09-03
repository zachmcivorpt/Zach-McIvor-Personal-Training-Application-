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
