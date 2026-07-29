/**
 * Clinical Teal theme constants.
 * Mirrors the CSS custom properties defined in `@theme` in app/globals.css.
 * Use this file wherever a hex value is needed in JS (inline SVG styles,
 * chart configs, etc.) instead of hardcoding colors.
 */

export const primary = {
  50: "#E6F5F0",
  100: "#C8E6DC",
  200: "#9AD4C4",
  300: "#5FBFA8",
  400: "#2DA88C",
  500: "#0D7C66",
  600: "#0A6553",
  700: "#074D3F",
  800: "#1A3A33",
  900: "#0F2620",
} as const;

export const surface = {
  bg: "#F7FAFA",
  card: "#FFFFFF",
  border: "#E0EFED",
  hover: "#D4E8E3",
} as const;

export const text = {
  primary: "#1A3A33",
  secondary: "#5A7A73",
  muted: "#8BA39C",
} as const;

export const success = {
  bg: "#D4EDDA",
  text: "#155724",
  border: "#B8DCC4",
} as const;

export const danger = {
  bg: "#F8D7DA",
  text: "#721C24",
  border: "#F0B4BA",
} as const;

export const warning = {
  bg: "#FFF3CD",
  text: "#856404",
  border: "#FFE69C",
} as const;

export const info = {
  bg: "#D1ECF1",
  text: "#0C5460",
  border: "#A8D8E2",
} as const;

export const theme = {
  primary,
  surface,
  text,
  success,
  danger,
  warning,
  info,
} as const;
