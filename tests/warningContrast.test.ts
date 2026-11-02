import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(__dirname, '../src/assets/styles/index.css'), 'utf8');
const modal = readFileSync(
  join(__dirname, '../src/views/connect/components/connecting-modal.vue'),
  'utf8',
);
const warningStyle = modal.match(/\.connecting-warning\s*\{([^}]+)\}/)![1];
const textToken = warningStyle.match(/color:\s*hsl\(var\(--([\w-]+)\)\)/)![1];
const [, backgroundToken, opacity] = warningStyle.match(
  /background:\s*hsl\(var\(--([\w-]+)\)\s*\/\s*([\d.]+)\)/,
)!;

const parseTokens = (block: string): Record<string, string> =>
  Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value]),
  );

const light = parseTokens(css.match(/:root\s*\{([^}]+)\}/)![1]);
const dark = { ...light, ...parseTokens(css.match(/\[theme='dark'\]\s*\{([^}]+)\}/)![1]) };

const toRgb = (hsl: string): number[] => {
  const [hue, saturation, lightness] = hsl.match(/[\d.]+/g)!.map(Number);
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const offset = l - chroma / 2;
  const channels = [
    [chroma, x, 0],
    [x, chroma, 0],
    [0, chroma, x],
    [0, x, chroma],
    [x, 0, chroma],
    [chroma, 0, x],
  ][Math.floor(hue / 60) % 6];
  return channels.map(value => value + offset);
};

const luminance = (rgb: number[]): number =>
  rgb
    .map(value => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);

it.each([
  ['light', light],
  ['dark', dark],
] as const)('keeps connecting warnings readable in the %s theme', (_name, tokens) => {
  const surface = toRgb(tokens.background);
  const background = toRgb(tokens[backgroundToken]).map(
    (value, index) => value * Number(opacity) + surface[index] * (1 - Number(opacity)),
  );
  const foregroundLuminance = luminance(toRgb(tokens[textToken]));
  const backgroundLuminance = luminance(background);
  const contrast =
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);

  expect(contrast).toBeGreaterThanOrEqual(4.5);
});
