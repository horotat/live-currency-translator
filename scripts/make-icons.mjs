import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = new URL('../', import.meta.url);
const svgPath = new URL('assets/icon.svg', root);
const outDir = new URL('icons/', root);

await mkdir(fileURLToPath(outDir), { recursive: true });
const svg = await readFile(svgPath);

for (const size of [16, 32, 48, 128]) {
  const out = fileURLToPath(new URL(`icon-${size}.png`, outDir));
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(out);
  console.log('wrote', out);
}
