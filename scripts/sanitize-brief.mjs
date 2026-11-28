/**
 * Strip trailing originality/disclaimer boilerplate from a wrap brief.
 * Keeps the real design description, including "Original design inspired by …".
 * Keep in sync in any importer; do not append this wording to new drop briefs.
 */
export function sanitizeBrief(brief) {
  if (typeof brief !== "string") return brief;
  let s = brief.trim();
  if (!s) return s;

  // Keep "Original design inspired by …"; drop only the trailing disclaimer clause.
  s = s.replace(
    /(Original design inspired by [^.;]+)\s*;\s*no logos\b[^.]*\.\s*$/i,
    "$1.",
  );

  // Trailing "Original design; no logos/flags/marks/…" sentence (not "inspired by").
  s = s.replace(/\s*Original design;(?! inspired by)[^.]*\.\s*$/i, "");

  // Trailing standalone legal sentence used on a few older drops.
  s = s.replace(/\s*No text, logos, or licensed marks\.\s*$/i, "");

  // ";/,/— dense coverage, regenerated … impression, no logos…"
  // ";/,/— regenerated [word] impression, no logos…"
  // \S+ so adjectives like "moiré" match (JS \w is ASCII-only without the unicode flag).
  s = s.replace(
    /(?:[;,]|\s+[—–-])\s*(?:dense(?: full-body)? coverage,\s*)?regenerated(?:\s+\S+)?\s+impression(?:,\s*|\s+[—–-]\s*)no [^.]*\blogos\b[^.]*\.\s*$/i,
    "",
  );

  // Standalone sentence: "Regenerated … impression, no logos." / "Regenerated Starbase impression — no logos."
  s = s.replace(
    /\s*Regenerated(?:\s+\S+)?\s+impression(?:,\s*|\s+[—–-]\s*)no [^.]*\blogos\b[^.]*\.\s*$/i,
    "",
  );

  // "— regenerated, no logos." (no "impression" word)
  s = s.replace(/(?:[;,]|\s+[—–-])\s*regenerated, no logos\.\s*$/i, "");

  s = s.replace(/[ \t]+/g, " ").trim();
  if (s && !/[.!?]$/.test(s)) s += ".";
  return s;
}
