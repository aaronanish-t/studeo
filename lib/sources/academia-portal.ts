import { clean, orNull, tableRows, toNumber } from "./html";

/**
 * Academia's course-registration table — the only thing we still need from
 * Academia, and the one thing the Student Portal cannot give us.
 *
 * The Student Portal's timetable page returns "No Time Table Found..!", so
 * course SLOTS come from here. A slot ("A", "P9-P10-") is then resolved to real
 * (day order, hour) placements by lib/sources/slot-grid.ts.
 *
 * Captured structure, verified against a live account:
 *
 *   S.No | Course Code | Course Title | Credit | Regn. Type | Category |
 *   Course Type | Faculty Name | Slot | Room No. | Academic Year
 *
 * A lab-based course appears TWICE under the same code — once for its theory
 * slot and once for its lab slot — with the same "Course Type" on both rows.
 * That is why theory-vs-practical is decided by the slot prefix and not by the
 * course type column.
 */

export interface AcademiaCourseRow {
  code: string;
  title: string;
  credits: number;
  /** "Regular", occasionally "Re-registration". */
  registration: string | null;
  /** "Professional Core", "Basic Science", "Mandatory", … */
  category: string | null;
  /** "Theory", "Lab Based Theory", "Project Based Theory". */
  courseType: string | null;
  /** Carries a staff id in brackets: "Dr. S. Joseph James (101959)". */
  faculty: string | null;
  /** Hyphen-joined, trailing hyphen included: "A", "P9-P10-", "L11-L12-". */
  slot: string | null;
  room: string | null;
  /** "AY2026-27-ODD" — scopes a course to one semester. */
  academicYear: string | null;
  kind: "THEORY" | "PRACTICAL" | "PROJECT";
}

/** Slot prefix decides the kind — see the note above on why not courseType. */
export function kindForSlot(
  slot: string | null,
  courseType?: string | null
): AcademiaCourseRow["kind"] {
  const codes = (slot ?? "")
    .split("-")
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean);

  if (codes.some((code) => /^P\d+$/.test(code))) return "PRACTICAL";
  if ((courseType ?? "").toLowerCase().includes("project")) return "PROJECT";
  return "THEORY";
}

/** Strip the trailing staff id: "Dr. S. Vimal (102820)" -> "Dr. S. Vimal". */
export function facultyName(value: string | null): string | null {
  if (!value) return null;
  return clean(value.replace(/\(\s*\d+\s*\)\s*$/, "")) || null;
}

export function parseCourseTable(html: string): AcademiaCourseRow[] {
  const rows = tableRows(
    html,
    ["course code", "course title", "slot"],
    "course registration",
    "Academia"
  );

  return rows
    // Skip any total/footer row: a real row starts with a serial number and
    // carries a course code in SRM's format.
    .filter((cells) => cells.length >= 10 && /^[0-9]{2}[A-Z]{2,4}[0-9]{3}[A-Z]$/i.test(cells[1]))
    .map((cells) => {
      const slot = orNull(cells[8]);
      const courseType = orNull(cells[6]);

      return {
        code: cells[1].toUpperCase(),
        title: cells[2],
        credits: toNumber(cells[3]),
        registration: orNull(cells[4]),
        category: orNull(cells[5]),
        courseType,
        faculty: facultyName(orNull(cells[7])),
        slot,
        room: orNull(cells[9]),
        academicYear: orNull(cells[10] ?? ""),
        kind: kindForSlot(slot, courseType),
      };
    });
}
