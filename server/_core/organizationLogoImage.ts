import sharp from 'sharp';
import { SaxesParser } from 'saxes';

export const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const MIME_FORMAT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/webp': 'webp', 'image/svg+xml': 'svg' };
const SVG_TAGS = new Set('svg g defs path rect circle ellipse line polyline polygon text tspan textPath title desc linearGradient radialGradient stop clipPath mask pattern use symbol filter feGaussianBlur feOffset feBlend feColorMatrix feComponentTransfer feFuncR feFuncG feFuncB feFuncA feComposite feFlood feMerge feMergeNode feMorphology feTurbulence feDisplacementMap feDropShadow'.split(' '));

/** Reject active/external content before libvips sees XML; only local references. */
export function validateLogoSvg(data: Buffer) {
  const xml = new TextDecoder('utf-8', { fatal: true }).decode(data);
  if (/<!(?:DOCTYPE|ENTITY)/i.test(xml) || /<\?(?!xml\s)/i.test(xml)) throw new Error('SVG содержит запрещённые инструкции');
  const parser = new SaxesParser({ xmlns: true });
  let count = 0, depth = 0;
  parser.on('error', () => { throw new Error('Некорректный SVG'); });
  parser.on('opentag', tag => {
    if (++count > 20000 || ++depth > 64 || !SVG_TAGS.has(tag.local) || (tag.uri && tag.uri !== 'http://www.w3.org/2000/svg') || (count === 1 && tag.local !== 'svg')) throw new Error('Неподдерживаемое содержимое SVG');
    for (const attr of Object.values(tag.attributes)) {
      if (attr.name === 'xmlns' || attr.prefix === 'xmlns') continue;
      const name = attr.local.toLowerCase(), value = attr.value;
      if (name.startsWith('on') || name === 'base' || name === 'src' || (name === 'href' && !/^#[A-Za-z_][\w:.-]*$/.test(value)) || /(?:@import|@font-face|javascript:|data:|https?:|file:|ftp:|\/\/|\\|\/\*)/i.test(value)) throw new Error('SVG содержит внешние ссылки или скрипты');
      for (const match of value.matchAll(/url\s*\(([^)]*)\)/gi)) {
        if (!/^\s*['"]?#[A-Za-z_][\w:.-]*['"]?\s*$/.test(match[1])) throw new Error('В SVG разрешены только внутренние ссылки');
      }
    }
  });
  parser.on('closetag', () => { depth--; });
  parser.write(xml).close();
  if (!count) throw new Error('Пустой SVG');
}

export async function normalizeLogo(data: Buffer, mime: string): Promise<Buffer> {
  if (!data.length || data.length > MAX_LOGO_BYTES) throw new Error('Файл должен быть непустым и не больше 5 МБ');
  const expected = MIME_FORMAT[mime];
  if (!expected) throw new Error('Разрешены PNG, JPG, WebP и SVG');
  if (expected === 'svg') validateLogoSvg(data);
  const image = sharp(data, { limitInputPixels: 16_000_000, failOn: 'warning' });
  const meta = await image.metadata();
  if (meta.format !== expected || !meta.width || !meta.height || meta.width > 8192 || meta.height > 8192 || (meta.pages ?? 1) > 1) throw new Error('Некорректный формат, размеры или анимированный файл');
  // Lossless pixels, no crop/resizing/tint/flatten. ICC converted to sRGB.
  const output = await image.rotate().toColourspace('srgb').png().timeout({ seconds: 10 }).toBuffer();
  if (output.length > 32 * 1024 * 1024) throw new Error('Изображение слишком большое после обработки');
  return output;
}
