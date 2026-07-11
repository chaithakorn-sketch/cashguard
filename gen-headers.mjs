import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'fs';

// Generates the header BACKGROUND images only: red banner + bleeding Cammo,
// NO text. The pill / eyebrow / title are real Flex text overlaid at runtime
// (crisp, correct sizes, matches the mockup). One bg per Cammo pose.
const S = 4;                 // scale (mockup 360x132 -> 1440x528)
const W = 360 * S, H = 132 * S;
const OUT = 'public/cashguard/headers';
mkdirSync(OUT, { recursive: true });

const b64 = (p) => 'data:image/png;base64,' + readFileSync(p).toString('base64');
const cammo = (pose) => b64(`public/cashguard/cammo-hd/${pose}.png`);

// pose -> horizontal bleed offset (px @1x, negative = past the right edge), matching the mockup
const POSES = [
  { pose: 'welcome', right: -8 },
  { pose: 'thumbsup', right: -6 },
  { pose: 'growth', right: -10 },
  { pose: 'checklist', right: -8 },
  { pose: 'warn', right: -8 },
  { pose: 'wait', right: -8 },
  { pose: 'inspect', right: -8 },
];

const cammoH = 158 * S;
for (const { pose, right } of POSES) {
  const cx = W - (right * S) - cammoH; // square cammo => width == height
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}">
  <rect width="100%" height="100%" fill="#DA1B27"/>
  <image xlink:href="${cammo(pose)}" x="${cx}" y="${-2 * S}" height="${cammoH}" width="${cammoH}"/>
</svg>`;
  await sharp(Buffer.from(svg)).resize(1080).png({ compressionLevel: 9, quality: 88 }).toFile(`${OUT}/bg-${pose}.png`);
  console.log('✓ bg-' + pose);
}
console.log('done', POSES.length, 'backgrounds');
