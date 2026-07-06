import imageCompression from "browser-image-compression";

export async function compressImage(file: File): Promise<File> {
  // Videos aren't images — pass them through untouched instead of trying
  // (and failing) to run them through image compression.
  if (!file.type.startsWith("image/")) {
    return file;
  }

  try {
    return await imageCompression(file, {
      maxSizeMB: 0.8,
      maxWidthOrHeight: 1600,
      useWebWorker: true,
      fileType: "image/jpeg",
    });
  } catch {
    return file;
  }
}
