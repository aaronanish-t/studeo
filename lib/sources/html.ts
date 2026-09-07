import * as cheerio from "cheerio";

/**
 * Shared HTML-scraping helpers.
 *
 * Both portals are server-rendered tables, and both need the same three things:
 * find a table by what its header says, read its body as rows of text, and
 * normalise the dashes and blanks they use for "no value".
 *
 * Tables are always located by HEADER TEXT, never by index. The Student Portal
 * renders two structurally identical `table.mb-0` elements on one page, and
 * indexing into them means a layout change silently parses the monthly rollup
 * as course data instead of failing.
 */

export class PortalParseError extends Error {
  constructor(what: string, source = "portal") {
    super(
      `Could not find the ${what} table. The ${source} markup has probably changed — ` +
        `re-capture the fixture in lib/sources/fixtures and update the parser.`
    );
    this.name = "PortalParseError";
  }
}

export const clean = (value: string): string => value.replace(/\s+/g, " ").trim();

/** Portals write "-" for "no value". Treat it as absent, not as text. */
export const orNull = (value: string): string | null => {
  const text = clean(value);
  return text === "" || text === "-" ? null : text;
};

export function toNumber(value: string): number {
  const parsed = Number.parseFloat(clean(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function toNullableNumber(value: string): number | null {
  const parsed = Number.parseFloat(clean(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export type Row = string[];

/**
 * Find the one table whose header row contains every required phrase, and
 * return its body rows as arrays of cell text.
 *
 * Falls back to reading every row when a table has no <tbody> — some of these
 * pages emit bare <tr>s — while still skipping the header.
 */
export function tableRows(
  html: string,
  required: string[],
  label: string,
  source?: string
): Row[] {
  const $ = cheerio.load(html);

  const match = $("table")
    .toArray()
    .find((table) => {
      const header = $(table)
        .find("tr")
        .first()
        .find("th, td")
        .toArray()
        .map((cell) => clean($(cell).text()).toLowerCase())
        .join(" | ");

      return required.every((needle) => header.includes(needle.toLowerCase()));
    });

  if (!match) throw new PortalParseError(label, source);

  const body = $(match).find("tbody tr");
  const rows = body.length > 0 ? body : $(match).find("tr").slice(1);

  return rows
    .toArray()
    .map((tr) =>
      $(tr)
        .find("td")
        .toArray()
        .map((td) => clean($(td).text()))
    )
    .filter((cells) => cells.length > 0 && cells.some((cell) => cell !== ""));
}

/**
 * Read a label/value table — the shape both portals use for profile blocks,
 * where cells alternate "Register No." | "RA25…" across a row.
 */
export function labelledValues(html: string): Map<string, string> {
  const $ = cheerio.load(html);
  const values = new Map<string, string>();

  $("table tr").each((_, tr) => {
    const cells = $(tr)
      .find("td, th")
      .toArray()
      .map((cell) => clean($(cell).text()));

    // Walk in pairs: a label cell followed by its value cell.
    for (let index = 0; index + 1 < cells.length; index += 2) {
      const key = cells[index].replace(/[:\s]+$/, "").toLowerCase();
      const value = cells[index + 1];
      if (key && value && !values.has(key)) values.set(key, value);
    }
  });

  return values;
}
