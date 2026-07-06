import sharp from "sharp";
import { mkdirSync } from "fs";

mkdirSync("public/icons", { recursive: true });

function eggSvg(size) {
  const cx = size / 2;
  const rx = size * 0.27;
  const ry = size * 0.34;
  return `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" rx="${size * 0.18}" fill="#1f7a4d"/>
      <ellipse cx="${cx}" cy="${size * 0.56}" rx="${rx}" ry="${ry}" fill="#fff8e7"/>
      <ellipse cx="${cx - rx * 0.3}" cy="${size * 0.46}" rx="${rx * 0.18}" ry="${ry * 0.14}" fill="#e8c86a"/>
      <ellipse cx="${cx + rx * 0.25}" cy="${size * 0.62}" rx="${rx * 0.14}" ry="${ry * 0.1}" fill="#e8c86a"/>
    </svg>`;
}

const sizes = [
  ["public/icons/icon-192.png", 192],
  ["public/icons/icon-512.png", 512],
  ["public/icons/apple-touch-icon.png", 180],
];

for (const [path, size] of sizes) {
  await sharp(Buffer.from(eggSvg(size))).png().toFile(path);
  console.log("wrote", path);
}
