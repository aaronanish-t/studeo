/**
 * Real HTML captured from the SRM Student Portal on 7 Sep 2026.
 *
 * These are verbatim fragments, not hand-written approximations — including the
 * portal's quirks (`valign="top"`, percentage-width attributes on every `th`,
 * an all-caps course title long enough to wrap). Parser tests run against this,
 * so if SRM changes their markup the tests fail rather than the production sync
 * silently returning zeroes.
 *
 * Re-capture with the browser console on the Attendance Details page:
 *   [...document.querySelectorAll('table')].map(t => t.outerHTML)
 */

export const ATTENDANCE_PERIOD_HEADING =
  "During the Period: 21/Jul/2026 To 03/Sep/2026";

export const ATTENDANCE_COURSE_TABLE_HTML = `
<table class="table mb-0"><thead><tr><th width="10%" scope="col">Code</th><th width="32%" scope="col">Description</th><th width="8%" scope="col">Max. hours</th><th width="8%" scope="col">Att. hours</th><th width="8%" scope="col">Absent hours</th><th width="8%" scope="col">Total Percentage</th></tr></thead><tbody><tr valign="top"><td>21CSC201J</td><td>DATA STRUCTURES AND ALGORITHMS</td><td>32</td><td>26</td><td>6</td><td>81.25</td></tr><tr valign="top"><td>21CSC202J</td><td>OPERATING SYSTEMS</td><td>32</td><td>25</td><td>7</td><td>78.13</td></tr><tr valign="top"><td>21CSC203P</td><td>ADVANCED PROGRAMMING PRACTICE</td><td>21</td><td>15</td><td>6</td><td>71.43</td></tr><tr valign="top"><td>21CSS201T</td><td>COMPUTER ORGANIZATION AND ARCHITECTURE</td><td>23</td><td>17</td><td>6</td><td>73.91</td></tr><tr valign="top"><td>21LEM201T</td><td>PROFESSIONAL ETHICS</td><td>6</td><td>5</td><td>1</td><td>83.33</td></tr><tr valign="top"><td>21LEM202T</td><td>UNIVERSAL HUMAN VALUES - II: UNDERSTANDING HARMONY AND ETHICAL HUMAN CONDUCT</td><td>4</td><td>4</td><td>0</td><td>100.00</td></tr><tr valign="top"><td>21MAB201T</td><td>TRANSFORMS AND BOUNDARY VALUE PROBLEMS</td><td>26</td><td>21</td><td>5</td><td>80.77</td></tr></tbody></table>
`.trim();

export const ATTENDANCE_MONTHLY_TABLE_HTML = `
<table class="table mb-0"><thead><tr><th width="15%" scope="col">Month / Year</th><th width="15%" scope="col">Present</th><th width="15%" scope="col">Absent</th></tr></thead><tbody><tr valign="top"><td>Jul-2026</td><td>39</td><td>9</td></tr><tr valign="top"><td>Aug-2026</td><td>62</td><td>20</td></tr><tr valign="top"><td>Sep-2026</td><td>12</td><td>2</td></tr></tbody></table>
`.trim();

/** The page serves both tables inside one container, plus the period heading. */
export const ATTENDANCE_PAGE_HTML = `
<div class="content">
  <h5>Course Wise Attendance (%)</h5>
  <p>${ATTENDANCE_PERIOD_HEADING}</p>
  ${ATTENDANCE_COURSE_TABLE_HTML}
  <h5>Cumulative Attendance (In Hours)</h5>
  ${ATTENDANCE_MONTHLY_TABLE_HTML}
</div>
`.trim();

/**
 * Internal Mark Details — summary list. Early in a semester most courses have
 * no marks at all, which is itself a case the parser must handle: the table
 * exists but carries only the courses that have been graded.
 */
export const MARKS_SUMMARY_HTML = `
<table class="table mb-0"><thead><tr><th scope="col">Code</th><th scope="col">Description</th><th scope="col">Mark / Max. Mark</th><th scope="col"></th></tr></thead><tbody>
<tr valign="top"><td>21CSS201T</td><td>COMPUTER ORGANIZATION AND ARCHITECTURE</td><td>4.20 / 5.00</td><td><button onclick="funViewComponentWiseMarks('39137', '21CSS201T', 'COMPUTER ORGANIZATION AND ARCHITECTURE',2)">View Details</button></td></tr>
<tr valign="top"><td>21MAB201T</td><td>TRANSFORMS AND BOUNDARY VALUE PROBLEMS</td><td>5.00 / 5.00</td><td><button onclick="funViewComponentWiseMarks('39210', '21MAB201T', 'TRANSFORMS AND BOUNDARY VALUE PROBLEMS',2)">View Details</button></td></tr>
</tbody></table>
`.trim();

/**
 * The per-course breakdown, captured verbatim from a live POST to
 *   /srmiststudentportal/students/report/studentInternalMarkDetailsInner.jsp
 *   iden=1 & hdnSubjectId=39137 & status=2
 *
 * Note the response is a bare fragment wrapped in a div, not a document, and
 * that this endpoint takes no csrfPreventionSalt — unlike the HRDSystem form
 * posts everything else on this portal goes through.
 */
export const MARKS_DETAIL_HTML = `
<div class="table-responsive table-billing-history "> <table class="table mb-0 "> <thead> <tr> <th scope="col">Entered on</th> <th scope="col">Component</th> <th scope="col">Mark / Max. Mark</th> </tr> </thead> <tbody> <tr valign="top"> <td>31/Aug/2026</td> <td>FT-I</td> <td>4.20 / 5.00</td> </tr> </tbody> </table> </div>
`.trim();

/**
 * Academic calendar. One row per date with an explicit day order — far easier
 * to parse than Academia's six-months-across grid. Holidays carry a null day
 * order and a reason, and crucially do NOT advance the cycle: note 25 Aug is
 * Day 5 even though 24 Aug (Monday) was suspended.
 */
export const CALENDAR_HTML = `
<table class="table mb-0"><thead><tr><th scope="col">DATE</th><th scope="col">DAY</th><th scope="col">STATUS</th><th scope="col">WEEK</th><th scope="col">DAY ORDER</th><th scope="col">REMARKS</th></tr></thead><tbody>
<tr valign="top"><td>21-07-2026</td><td>Tuesday</td><td>Working day</td><td>Wk 1</td><td>Day 1</td><td>-</td></tr>
<tr valign="top"><td>25-07-2026</td><td>Saturday</td><td>Holiday</td><td>Wk 0</td><td>-</td><td>Saturday</td></tr>
<tr valign="top"><td>27-07-2026</td><td>Monday</td><td>Working day</td><td>Wk 1</td><td>Day 5</td><td>-</td></tr>
<tr valign="top"><td>24-08-2026</td><td>Monday</td><td>Holiday</td><td>Wk 0</td><td>-</td><td>Classes Suspended</td></tr>
<tr valign="top"><td>25-08-2026</td><td>Tuesday</td><td>Working day</td><td>Wk 5</td><td>Day 5</td><td>-</td></tr>
<tr valign="top"><td>26-08-2026</td><td>Wednesday</td><td>Holiday</td><td>Wk 0</td><td>-</td><td>Milad-un-nabi</td></tr>
<tr valign="top"><td>27-08-2026</td><td>Thursday</td><td>Working day</td><td>Wk 6</td><td>Day 1</td><td>-</td></tr>
</tbody></table>
`.trim();
