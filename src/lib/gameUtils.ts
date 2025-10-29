export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Obstacle = Rect & {
  lane: number;
  speed: number;
  color: string;
};

export const clamp = (value: number, min: number, max: number) => {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
};

export const rectsOverlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;

export const pickRandom = <T>(items: readonly T[]): T => {
  const index = Math.floor(Math.random() * items.length);
  return items[Math.max(0, Math.min(items.length - 1, index))];
};

export const lerp = (start: number, end: number, t: number) =>
  start + (end - start) * t;
