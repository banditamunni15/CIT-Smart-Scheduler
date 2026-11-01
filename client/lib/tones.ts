// Shared colour tones. Full class names are written out so Tailwind can detect them.
export type Tone =
  | "indigo"
  | "sky"
  | "emerald"
  | "amber"
  | "rose"
  | "violet"
  | "teal";

export type ToneStyle = {
  /** Icon chip: soft tinted square. */
  chip: string;
  /** Thin accent bar on top of a card. */
  bar: string;
  /** Hover border colour. */
  hover: string;
};

export const toneStyles: Record<Tone, ToneStyle> = {
  indigo: {
    chip: "bg-indigo-100 text-indigo-600",
    bar: "from-indigo-500 to-violet-500",
    hover: "hover:border-indigo-300",
  },
  sky: {
    chip: "bg-sky-100 text-sky-600",
    bar: "from-sky-400 to-indigo-500",
    hover: "hover:border-sky-300",
  },
  emerald: {
    chip: "bg-emerald-100 text-emerald-600",
    bar: "from-emerald-400 to-teal-500",
    hover: "hover:border-emerald-300",
  },
  amber: {
    chip: "bg-amber-100 text-amber-600",
    bar: "from-amber-400 to-orange-500",
    hover: "hover:border-amber-300",
  },
  rose: {
    chip: "bg-rose-100 text-rose-600",
    bar: "from-rose-400 to-pink-500",
    hover: "hover:border-rose-300",
  },
  violet: {
    chip: "bg-violet-100 text-violet-600",
    bar: "from-violet-500 to-fuchsia-500",
    hover: "hover:border-violet-300",
  },
  teal: {
    chip: "bg-teal-100 text-teal-600",
    bar: "from-teal-400 to-cyan-500",
    hover: "hover:border-teal-300",
  },
};

export const toneCycle: Tone[] = [
  "indigo",
  "sky",
  "emerald",
  "amber",
  "rose",
  "violet",
  "teal",
];
