// Loose mdast node typing for the converters. The profile's node set spans mdast core + GFM + math;
// the converters are structural (a node's `type`/`children`/`value`/attrs), so a permissive shape keeps
// the mapping total without fighting the discriminated unions for every extension package.

export interface Md {
  type: string;
  value?: string;
  identifier?: string;
  label?: string;
  url?: string;
  title?: string | null;
  alt?: string | null;
  lang?: string | null;
  meta?: string | null;
  depth?: number;
  ordered?: boolean | null;
  start?: number | null;
  spread?: boolean | null;
  checked?: boolean | null;
  align?: (string | null)[];
  children?: Md[];
  position?: { start: { offset: number }; end: { offset: number } };
  [key: string]: unknown;
}

export interface MdRoot {
  type: "root";
  children: Md[];
}
