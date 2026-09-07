/**
 * Academia's "My Time Table" course table, captured from a live account on
 * 7 Sep 2026 (B.Tech CSE-AIML, semester 3).
 *
 * Real rows, real quirks:
 *  - 21CSC201J and 21CSC202J each appear TWICE — theory row and lab row, same
 *    code, same "Course Type", differing only by slot.
 *  - Faculty names carry a staff id in brackets.
 *  - Multi-hour slots are hyphen-joined WITH a trailing hyphen.
 *  - Professional Ethics is a zero-credit course held online.
 */

export const COURSE_TABLE_HTML = `
<table border="1" cellpadding="2">
<tr>
  <th>S.No</th><th>Course Code</th><th>Course Title</th><th>Credit</th>
  <th>Regn. Type</th><th>Category</th><th>Course Type</th><th>Faculty Name</th>
  <th>Slot</th><th>Room No.</th><th>Academic Year</th>
</tr>
<tr><td>1</td><td>21MAB201T</td><td>Transforms and Boundary Value Problems</td><td>4</td><td>Regular</td><td>Basic Science</td><td>Theory</td><td>Dr. K. Prabakaran (101859)</td><td>A</td><td>TP 506</td><td>AY2026-27-ODD</td></tr>
<tr><td>2</td><td>21CSC201J</td><td>Data Structures and Algorithms</td><td>4</td><td>Regular</td><td>Professional Core</td><td>Lab Based Theory</td><td>Dr. S. Joseph James (101959)</td><td>B</td><td>TP 506</td><td>AY2026-27-ODD</td></tr>
<tr><td>3</td><td>21CSS201T</td><td>Computer Organization and Architecture</td><td>4</td><td>Regular</td><td>Engineering Science</td><td>Theory</td><td>Dr.S.Sadagopan (102782)</td><td>C</td><td>TP 506</td><td>AY2026-27-ODD</td></tr>
<tr><td>4</td><td>21CSC203P</td><td>Advanced Programming Practice</td><td>4</td><td>Regular</td><td>Professional Core</td><td>Project Based Theory</td><td>Dr.M. Salomi Samsudeen (102862)</td><td>D</td><td>TP 506</td><td>AY2026-27-ODD</td></tr>
<tr><td>5</td><td>21CSC202J</td><td>Operating Systems</td><td>4</td><td>Regular</td><td>Professional Core</td><td>Lab Based Theory</td><td>Dr. S. Vimal (102820)</td><td>F</td><td>TP 506</td><td>AY2026-27-ODD</td></tr>
<tr><td>6</td><td>21LEM202T</td><td>UHV-II: Universal Human Values – Understanding Harmony and Ethical Human Conduct</td><td>3</td><td>Regular</td><td>Mandatory</td><td>Theory</td><td>Dr. Kanipriya M (102908)</td><td>L11-L12-</td><td>UB 801</td><td>AY2026-27-ODD</td></tr>
<tr><td>7</td><td>21LEM201T</td><td>Professional Ethics</td><td>0</td><td>Regular</td><td>Mandatory</td><td>Theory</td><td>Dr. D. Sundar Singh (103430)</td><td>P47-</td><td>online</td><td>AY2026-27-ODD</td></tr>
<tr><td>8</td><td>21CSC201J</td><td>Data Structures and Algorithms</td><td>4</td><td>Regular</td><td>Professional Core</td><td>Lab Based Theory</td><td>Dr. S. Joseph James (101959)</td><td>P9-P10-</td><td>CLS 403</td><td>AY2026-27-ODD</td></tr>
<tr><td>9</td><td>21CSC202J</td><td>Operating Systems</td><td>4</td><td>Regular</td><td>Professional Core</td><td>Lab Based Theory</td><td>Dr. S. Vimal (102820)</td><td>P33-P34-</td><td>UB 713B</td><td>AY2026-27-ODD</td></tr>
</table>
`.trim();

/** The Student Portal's profile block (form 1 / HRDSystem.jsp). */
export const STUDENT_PROFILE_HTML = `
<table class="table">
<tr><td>Student Name</td><td>AARON ANISH THADATHIL</td></tr>
<tr><td>Student ID</td><td>686316</td></tr>
<tr><td>Register No.</td><td>RA2511026010060</td></tr>
<tr><td>Email ID</td><td>at4152@srmist.edu.in</td></tr>
<tr><td>Institution</td><td>Faculty of Engineering and Technology, Kattankulathur</td></tr>
<tr><td>Program</td><td>B.Tech.-Computer Science and Engineering with specialization in Artificial Intelligence and Machine Learning[UG - FT - ACADEMIC]</td></tr>
<tr><td>Semester</td><td>3</td></tr>
<tr><td>Batch</td><td>1</td></tr>
<tr><td>Section</td><td>R1</td></tr>
</table>
`.trim();
