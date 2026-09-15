// @rhema/tokens — the §5.9 design tokens (values + the SSR theme stylesheet). Consumed by @rhema/ui and
// apps/web for the beta shell, and (later) by the full IDE design system (P1.01).

export const PACKAGE_NAME = "@rhema/tokens" as const;

export {
  DARK_VARS,
  LIGHT_VARS,
  SPACING,
  RADIUS,
  TYPOGRAPHY,
  cssVar,
  darkHexValues,
} from "./tokens.js";
export type { VarMap } from "./tokens.js";
export { themeCss } from "./theme-css.js";
