// Jednostavan generator PNG ikona za PWA manifest (bez vanjskih ovisnosti).
// Crta plavi kvadrat sa zaobljenim rubovima, bijelim satom (kazaljke) - simbol evidencije radnog vremena.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'public');
mkdirSync(outDir, { recursive: true });

const BG = [21, 94, 239]; // #155eef - ista boja kao primarni gumb u aplikaciji
const FG = [255, 255, 255];

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = [];
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function drawIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const center = size / 2;
  const clockRadius = size * 0.32;
  const cornerRadius = size * 0.18;

  // Klasicna pozicija kazaljki sata: ~10:10 (uobicajeno u satnim logotipovima, jasno se razlikuju)
  const hourAngle = -Math.PI / 2 + Math.PI * (10 / 6); // kazaljka sati prema "10"
  const minuteAngle = -Math.PI / 2 + Math.PI * (2 / 6); // kazaljka minuta prema "2" (10 min)

  function isInsideRoundedSquare(x, y) {
    const dx = Math.max(Math.abs(x - center) - (center - cornerRadius), 0);
    const dy = Math.max(Math.abs(y - center) - (center - cornerRadius), 0);
    return dx * dx + dy * dy <= cornerRadius * cornerRadius;
  }

  function distToSegment(px, py, ax, ay, bx, by) {
    const abx = bx - ax;
    const aby = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby)));
    const cx = ax + t * abx;
    const cy = ay + t * aby;
    return Math.hypot(px - cx, py - cy);
  }

  const ringThickness = size * 0.045;
  const tickLength = size * 0.045;
  const tickThickness = size * 0.022;
  const hourLen = clockRadius * 0.5;
  const minuteLen = clockRadius * 0.78;
  const hourThickness = size * 0.038;
  const minuteThickness = size * 0.028;

  // Male oznake na 12/3/6/9 satu (crticama), da lice jasnije izgleda kao sat
  const tickAngles = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      let color = BG;

      if (isInsideRoundedSquare(x, y)) {
        const dx = x - center;
        const dy = y - center;
        const dist = Math.hypot(dx, dy);

        const onRing = Math.abs(dist - clockRadius) <= ringThickness;

        let onTick = false;
        for (const angle of tickAngles) {
          const tx = center + Math.cos(angle) * (clockRadius - ringThickness / 2);
          const ty = center + Math.sin(angle) * (clockRadius - ringThickness / 2);
          const tx2 = center + Math.cos(angle) * (clockRadius - ringThickness / 2 - tickLength);
          const ty2 = center + Math.sin(angle) * (clockRadius - ringThickness / 2 - tickLength);
          if (distToSegment(x, y, tx, ty, tx2, ty2) <= tickThickness) {
            onTick = true;
            break;
          }
        }

        const onHourHand = distToSegment(
          x, y, center, center,
          center + Math.cos(hourAngle) * hourLen,
          center + Math.sin(hourAngle) * hourLen
        ) <= hourThickness;

        const onMinuteHand = distToSegment(
          x, y, center, center,
          center + Math.cos(minuteAngle) * minuteLen,
          center + Math.sin(minuteAngle) * minuteLen
        ) <= minuteThickness;

        const onCenterDot = dist <= size * 0.035;

        color = (onRing || onTick || onHourHand || onMinuteHand || onCenterDot) ? FG : BG;
      }

      pixels[idx] = color[0];
      pixels[idx + 1] = color[1];
      pixels[idx + 2] = color[2];
      pixels[idx + 3] = 255;
    }
  }

  // Dodaj filter-byte (0 = None) na pocetak svakog reda, kako PNG format zahtijeva
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = deflateSync(raw);

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

for (const size of [192, 512]) {
  const png = drawIcon(size);
  const filePath = join(outDir, `pwa-${size}x${size}.png`);
  writeFileSync(filePath, png);
  console.log(`Generirano: ${filePath} (${png.length} bajtova)`);
}

// Maskable ikona (isti dizajn, koristi se i za maskable jer je pozadina puna boja bez providnosti)
const maskable = drawIcon(512);
writeFileSync(join(outDir, 'pwa-maskable-512x512.png'), maskable);
console.log('Generirana maskable ikona.');
