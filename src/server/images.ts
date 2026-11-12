import "server-only";
import sharp from "sharp";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/avif"]);
const MAX_INPUT_BYTES = 8 * 1024 * 1024;

export type ProcessedImage = { data: Buffer; mime: "image/webp"; width: number; height: number; bytes: number };

/**
 * Untrusted upload → safe image. The browser-declared type is only a first filter; sharp sniffs
 * the real format from magic bytes, and re-encoding drops EXIF/GPS and any embedded payloads.
 */
export async function processImage(file: File): Promise<ProcessedImage> {
  if (!(file instanceof File) || file.size === 0) throw new Error("Empty file");
  if (file.size > MAX_INPUT_BYTES) throw new Error("Photos must be under 8 MB");
  if (file.type && !ALLOWED.has(file.type)) throw new Error("Only JPEG, PNG, WebP or HEIC photos");

  const input = Buffer.from(await file.arrayBuffer());
  const img = sharp(input, { limitInputPixels: 40_000_000, failOn: "error" });
  const meta = await img.metadata();
  if (!meta.format || !["jpeg", "png", "webp", "heif", "avif"].includes(meta.format)) {
    throw new Error("That file isn't a supported image");
  }
  const { data, info } = await img
    .rotate() // apply EXIF orientation before metadata is dropped
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer({ resolveWithObject: true });
  return { data, mime: "image/webp", width: info.width, height: info.height, bytes: info.size };
}
