import { prisma } from "./db";

/**
 * Internal marks.
 *
 * Two shapes arrive from the Student Portal and both end up here:
 *
 *  - the summary row, which carries only a course total. lib/ingest.ts stores
 *    it under the reserved test code "TOTAL".
 *  - the per-component breakdown behind each "View Details" expander — FT-I,
 *    CLA-1 and so on — which needs a second request per course.
 *
 * A course may therefore have a total with no components, components with no
 * stored total, or both. The reserved code is filtered out of the component
 * list and used as the total only when there are no real components to sum,
 * so the two never double-count.
 */

const TOTAL_CODE = "TOTAL";

export interface MarkComponent {
  id: string;
  testCode: string;
  obtained: number | null;
  maxMarks: number;
  weightage: number | null;
  capturedAt: Date;
}

export interface CourseMarks {
  id: string;
  code: string;
  title: string;
  components: MarkComponent[];
  /** Null when nothing has been graded yet — distinct from a genuine zero. */
  obtained: number | null;
  maxMarks: number;
  percentage: number | null;
  /** True when we only have the course total, not the components behind it. */
  totalOnly: boolean;
}

export interface MarksData {
  courses: CourseMarks[];
  graded: number;
  /** Across every graded course. Null before anything is graded. */
  overall: { obtained: number; maxMarks: number; percentage: number } | null;
}

export async function getMarks(netId: string): Promise<MarksData | null> {
  const user = await prisma.user.findUnique({
    where: { netId },
    select: { id: true },
  });
  if (!user) return null;

  const courses = await prisma.course.findMany({
    where: { userId: user.id },
    orderBy: { code: "asc" },
    include: { marks: { orderBy: { testCode: "asc" } } },
  });

  const withMarks: CourseMarks[] = courses
    .filter((course) => course.marks.length > 0)
    .map((course) => {
      const components = course.marks
        .filter((mark) => mark.testCode !== TOTAL_CODE)
        .map((mark) => ({
          id: mark.id,
          testCode: mark.testCode,
          obtained: mark.obtained,
          maxMarks: mark.maxMarks,
          weightage: mark.weightage,
          capturedAt: mark.capturedAt,
        }));

      const stored = course.marks.find((mark) => mark.testCode === TOTAL_CODE);
      const totalOnly = components.length === 0 && stored !== undefined;

      const obtained = totalOnly
        ? (stored?.obtained ?? null)
        : sumOrNull(components.map((component) => component.obtained));

      const maxMarks = totalOnly
        ? (stored?.maxMarks ?? 0)
        : components.reduce((sum, component) => sum + component.maxMarks, 0);

      return {
        id: course.id,
        code: course.code,
        title: course.title,
        components,
        obtained,
        maxMarks,
        percentage:
          obtained === null || maxMarks === 0
            ? null
            : Number(((obtained / maxMarks) * 100).toFixed(1)),
        totalOnly,
      };
    });

  const gradedCourses = withMarks.filter((course) => course.obtained !== null);

  const obtained = gradedCourses.reduce((sum, c) => sum + (c.obtained ?? 0), 0);
  const maxMarks = gradedCourses.reduce((sum, c) => sum + c.maxMarks, 0);

  return {
    // Worst first, matching the dashboard — the one you'd act on is at the top.
    courses: withMarks.sort(
      (a, b) => (a.percentage ?? Infinity) - (b.percentage ?? Infinity)
    ),
    graded: gradedCourses.length,
    overall:
      gradedCourses.length === 0 || maxMarks === 0
        ? null
        : {
            obtained: Number(obtained.toFixed(2)),
            maxMarks: Number(maxMarks.toFixed(2)),
            percentage: Number(((obtained / maxMarks) * 100).toFixed(1)),
          },
  };
}

/**
 * Sum, but null if nothing has a value.
 *
 * A course where every component is ungraded must read as "not marked yet",
 * not as zero — those look identical in a total and mean opposite things.
 */
function sumOrNull(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) return null;

  return Number(present.reduce((sum, value) => sum + value, 0).toFixed(2));
}
