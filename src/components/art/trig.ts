// Trig rounded to 4 decimals so server- and client-rendered SVG coordinates match exactly.
export const cosR = (a: number) => Math.round(Math.cos(a) * 1e4) / 1e4;
export const sinR = (a: number) => Math.round(Math.sin(a) * 1e4) / 1e4;
