import "server-only";
import sharp from "sharp";
import { UserError } from "./safe-action";

// HEIC isn't here: the prebuilt image library can't decode it. Phones convert to JPEG when the
// page doesn't ask for HEIC.
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_INPUT_BYTES = 8 * 1024 * 1024;
// A serverless function has little memory, so keep decoding cheap: no cache, one thread, and a
// pixel limit well under what a phone camera produces after the browser has downscaled it.
sharp.cache(false);
sharp.concurrency(1);

export type ProcessedImage = { data: Buffer; mime: "image/webp"; width: number; height: number; bytes: number };

/**
 * Untrusted upload → safe image. The browser-declared type is only a first filter; sharp sniffs
 * the real format from magic bytes, and re-encoding drops EXIF/GPS and any embedded payloads.
 */
export async function processImage(file: File): Promise<ProcessedImage> {
  if (!(file instanceof File) || file.size === 0) throw new Error("Empty file");
  if (file.size > MAX_INPUT_BYTES) throw new Error("Photos must be under 8 MB");
  if (file.type && !ALLOWED.has(file.type)) throw new Error("Use a JPEG, PNG or WebP photo");

  const input = Buffer.from(await file.arrayBuffer());
  const img = sharp(input, { limitInputPixels: 24_000_000, failOn: "error" });
  const meta = await img.metadata();
  if (!meta.format || !["jpeg", "png", "webp"].includes(meta.format)) {
    throw new Error("That file isn't a supported image");
  }
  if (meta.depth && !["uchar", "char"].includes(meta.depth)) throw new Error("That image is too large to process");
  const { data, info } = await img
    .rotate() // apply EXIF orientation before metadata is dropped
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer({ resolveWithObject: true });
  return { data, mime: "image/webp", width: info.width, height: info.height, bytes: info.size };
}

/**
 * Decodes a post's photos one at a time (not all at once) and turns any decoder error into a plain
 * message, so the person never sees an internal library error.
 */
export async function processImages(files: File[]): Promise<ProcessedImage[]> {
  const out: ProcessedImage[] = [];
  for (const f of files) {
    try {
      out.push(await processImage(f));
    } catch (e) {
      const known = (e as Error).message;
      throw new UserError(
        ["Empty file", "Photos must be under 8 MB", "Use a JPEG, PNG or WebP photo", "That file isn't a supported image", "That image is too large to process"].includes(known)
          ? known
          : "That photo couldn't be read. Try a JPEG or PNG.",
      );
    }
  }
  return out;
}
