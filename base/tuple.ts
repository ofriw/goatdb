export type Tuple4 = number;

export type Tuple4Position = 0 | 1 | 2 | 3;

export type Tuple4Values = [number, number, number, number];

export function tuple4Get(tuple: Tuple4, pos: Tuple4Position): number {
  return ((tuple & (255 << (pos * 8))) >> (pos * 8)) & 255;
}

export function tuple4Set(
  tuple: Tuple4,
  pos: Tuple4Position,
  value: number,
): Tuple4 {
  const mask = ~(255 << (pos * 8));
  value &= 255;
  return (tuple & mask) | (value << (pos * 8));
}

export function tuple4Make(values: Tuple4Values): Tuple4 {
  return (
    (values[3] & 255) |
    ((values[2] & 255) << 8) |
    ((values[1] & 255) << 16) |
    ((values[0] & 255) << 24)
  );
}

export function tuple4Break(tuple: Tuple4): Tuple4Values {
  return [
    tuple4Get(tuple, 3),
    tuple4Get(tuple, 2),
    tuple4Get(tuple, 1),
    tuple4Get(tuple, 0),
  ];
}

export function tuple4ToString(tuple: Tuple4): string {
  const lastValue = tuple4Get(tuple, 0);
  return `${tuple4Get(tuple, 3)}.${tuple4Get(tuple, 2)}.${tuple4Get(tuple, 1)}${
    lastValue ? `-${lastValue}` : ''
  }`;
}
