/**
 * Signing in to Academia on a student's behalf.
 *
 * Academia is a Zoho Creator app behind Zoho's IAM, and unlike the Student
 * Portal its login has no CAPTCHA and no device-fingerprint tokens — so a
 * server can complete it with a username and password. That is the only reason
 * this file can exist; the Student Portal's login deliberately has no
 * equivalent here, and adding one would mean defeating bot detection.
 *
 * What this buys and what it doesn't, stated plainly because it shapes
 * everything downstream: an Academia session yields the course table (and
 * therefore the timetable) and the student's profile. It does NOT yield
 * attendance or internal marks — those live behind `page/My_Attendance`, which
 * answers "Page inaccessible — contact your administrator". The Student Portal
 * remains their only source, and the extension remains the only way to reach
 * it.
 *
 * On the password itself: it is a parameter, it is used once, and it is never
 * logged, never returned, and never persisted. Errors from here describe what
 * the endpoint said, never what was sent.
 */

const ORIGIN = "https://academia.srmist.edu.in";
const IAM = `${ORIGIN}/accounts/p/40-10002227248`;
const SERVICE_URL = `${ORIGIN}/portal/academia-academic-services/redirectFromLogin`;

const SIGNIN_URL =
  `${IAM}/signin?hide_fp=true&servicename=ZohoCreator&service_language=en&dcc=true` +
  `&serviceurl=${encodeURIComponent(SERVICE_URL)}`;

/** Why a sign-in didn't work, in terms the sign-in page can render. */
export type AcademiaAuthFailure =
  | "UNKNOWN_USER"
  | "BAD_PASSWORD"
  | "CAPTCHA_REQUIRED"
  | "TOO_MANY_SESSIONS"
  | "UPSTREAM_UNAVAILABLE";

export interface AcademiaAuthResult {
  ok: boolean;
  /** Present only on success. The caller uses it and drops it. */
  cookie?: string;
  failure?: AcademiaAuthFailure;
  /** Zoho's own words, for the trace. Never contains anything we sent. */
  detail?: string;
}

// ---------------------------------------------------------------------------
// Cookie plumbing
// ---------------------------------------------------------------------------

function setCookies(response: Response): string[] {
  return typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie")].filter((value): value is string => Boolean(value));
}

/**
 * Merge cookie jars, later values winning.
 *
 * Zoho spreads its session across several cookies set by three different
 * responses, and a request carrying only the newest is treated as anonymous.
 */
function mergeCookies(...jars: Array<string | undefined>): string {
  const byName = new Map<string, string>();

  for (const jar of jars) {
    for (const pair of (jar ?? "").split(";").map((part) => part.trim())) {
      const index = pair.indexOf("=");
      if (index <= 0) continue;
      byName.set(pair.slice(0, index).trim(), pair);
    }
  }

  return [...byName.values()].join("; ");
}

function pairsFrom(headers: string[]): string {
  return headers
    .map((header) => header.split(";")[0]?.trim())
    .filter((pair): pair is string => Boolean(pair) && pair.includes("="))
    .join("; ");
}

function cookieValue(jar: string, name: string): string | null {
  return jar.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1] ?? null;
}

function iamHeaders(jar: string, csrf: string | null): HeadersInit {
  return {
    accept: "*/*",
    "accept-language": "en-US,en;q=0.9",
    "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
    ...(csrf ? { "x-zcsrf-token": `iamcsrcoo=${csrf}` } : {}),
    ...(jar ? { cookie: jar } : {}),
    Referer: SIGNIN_URL,
  };
}

// ---------------------------------------------------------------------------
// The three steps
// ---------------------------------------------------------------------------

/** Step 1 — a fresh anonymous session and its CSRF token. */
async function seed(): Promise<{ jar: string; csrf: string | null }> {
  const response = await fetch(SIGNIN_URL, { method: "GET", redirect: "manual" });
  const jar = pairsFrom(setCookies(response));

  return {
    jar,
    csrf: cookieValue(jar, "iamcsr") ?? cookieValue(jar, "_zcsr_tmp"),
  };
}

/** Step 2 — does this account exist, and what handle does the password step want? */
async function lookup(
  netIdEmail: string,
  jar: string,
  csrf: string | null
): Promise<{ identifier: string; digest: string } | null> {
  const response = await fetch(`${IAM}/signin/v2/lookup/${encodeURIComponent(netIdEmail)}`, {
    method: "POST",
    headers: iamHeaders(jar, csrf),
    body:
      `mode=primary&cli_time=${Date.now()}&servicename=ZohoCreator&service_language=en` +
      `&serviceurl=${encodeURIComponent(SERVICE_URL)}`,
  });

  const body = (await response.json().catch(() => ({}))) as {
    lookup?: { identifier?: string; digest?: string };
  };

  const { identifier, digest } = body.lookup ?? {};
  return identifier && digest ? { identifier, digest } : null;
}

/**
 * Step 3 — the password, and the redirect that turns an IAM session into a
 * Creator one.
 *
 * Without that last hop the cookies authenticate against accounts.zoho but not
 * against the app, and every page fetch comes back as the login screen.
 */
async function submitPassword(
  identifier: string,
  digest: string,
  password: string,
  jar: string,
  csrf: string | null
): Promise<AcademiaAuthResult & { flowId?: string | null; sessionJar?: string }> {
  const response = await fetch(
    `${IAM}/signin/v2/primary/${identifier}/password` +
      `?digest=${digest}&cli_time=${Date.now()}&servicename=ZohoCreator&service_language=en` +
      `&serviceurl=${encodeURIComponent(SERVICE_URL)}`,
    {
      method: "POST",
      headers: iamHeaders(jar, csrf),
      body: JSON.stringify({ passwordauth: { password } }),
      redirect: "manual",
    }
  );

  const location = response.headers.get("location") ?? "";
  const sessionJar = mergeCookies(jar, pairsFrom(setCookies(response)));

  // SRM caps concurrent sessions. Phone plus laptop is enough to hit it, so
  // this is an ordinary Tuesday rather than an edge case.
  if (location.includes("sessions-reminder")) {
    return {
      ok: false,
      failure: "TOO_MANY_SESSIONS",
      flowId: new URL(location, ORIGIN).searchParams.get("flowId"),
      sessionJar,
    };
  }

  const raw = await response.text();
  let body: {
    status_code?: number;
    code?: string;
    message?: string;
    localized_message?: string;
    passwordauth?: { redirect_uri?: string };
  };

  try {
    body = JSON.parse(raw);
  } catch {
    return { ok: false, failure: "UPSTREAM_UNAVAILABLE", detail: "Zoho returned a non-JSON response." };
  }

  const redirect = body.passwordauth?.redirect_uri ?? "";
  if (body.code === "SI303" || redirect.includes("/preannouncement/block-sessions")) {
    return {
      ok: false,
      failure: "TOO_MANY_SESSIONS",
      flowId: redirect ? new URL(redirect, ORIGIN).searchParams.get("flowId") : null,
      sessionJar,
    };
  }

  if (body.status_code === 200 || body.status_code === 201) {
    let cookie = sessionJar;

    // The bridge: follow the service redirect so Creator issues its own cookies.
    try {
      const bridge = await fetch(SERVICE_URL, { method: "GET", headers: { cookie } });
      const extra = pairsFrom(setCookies(bridge));
      if (extra) cookie = mergeCookies(cookie, extra);
    } catch {
      // Non-fatal: we hold IAM cookies, and the page fetch will say if they
      // aren't enough.
    }

    return { ok: true, cookie };
  }

  const message = (body.localized_message ?? body.message ?? "").toLowerCase();

  if (message.includes("captcha")) {
    return { ok: false, failure: "CAPTCHA_REQUIRED", detail: body.localized_message ?? body.message };
  }

  return {
    ok: false,
    failure: "BAD_PASSWORD",
    detail: body.localized_message ?? body.message,
  };
}

/**
 * Ask Zoho to drop the student's other sessions, so a retry can succeed.
 *
 * Only ever called after SRM itself said the limit was reached, and it ends
 * sessions belonging to the account now proving it holds the password.
 */
async function terminateOtherSessions(
  flowId: string | null | undefined,
  jar: string | undefined
): Promise<void> {
  if (!jar) return;
  const csrf = cookieValue(jar, "iamcsr") ?? cookieValue(jar, "_zcsr_tmp");

  try {
    await fetch(`${IAM}/webclient/v1/announcement/pre/blocksessions`, {
      method: "DELETE",
      headers: {
        accept: "application/json, text/javascript, */*; q=0.01",
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        ...(csrf ? { "X-ZCSRF-TOKEN": `iamcsrcoo=${encodeURIComponent(csrf)}` } : {}),
        cookie: jar,
        Referer: `${IAM}/preannouncement/block-sessions`,
      },
    });
  } catch {
    // Best effort. The retry below will report the real outcome.
  }

  if (!flowId) return;

  try {
    await fetch(
      `${IAM}/webclient/v1/account/self/user/self/session/${encodeURIComponent(flowId)}`,
      {
        method: "DELETE",
        headers: {
          accept: "application/json, text/javascript, */*; q=0.01",
          "x-requested-with": "XMLHttpRequest",
          ...(csrf ? { "x-zcsrf-token": `iamcsrcoo=${csrf}` } : {}),
          cookie: jar,
        },
      }
    );
  } catch {
    // Same.
  }
}

// ---------------------------------------------------------------------------

/**
 * Sign in, returning a cookie jar good for fetching that student's pages.
 *
 * `netIdEmail` is the full address — Zoho's lookup wants it that way.
 */
export async function signInToAcademia(
  netIdEmail: string,
  password: string
): Promise<AcademiaAuthResult> {
  let session: { jar: string; csrf: string | null };

  try {
    session = await seed();
  } catch {
    return { ok: false, failure: "UPSTREAM_UNAVAILABLE", detail: "Academia didn't answer." };
  }

  const handle = await lookup(netIdEmail, session.jar, session.csrf).catch(() => null);
  if (!handle) return { ok: false, failure: "UNKNOWN_USER" };

  let attempt = await submitPassword(
    handle.identifier,
    handle.digest,
    password,
    session.jar,
    session.csrf
  );

  // One retry, and only for the session cap — never for a rejected password.
  // Retrying a password is how an account gets locked.
  if (!attempt.ok && attempt.failure === "TOO_MANY_SESSIONS") {
    await terminateOtherSessions(attempt.flowId, attempt.sessionJar);

    const fresh = await seed().catch(() => null);
    const freshHandle = fresh
      ? await lookup(netIdEmail, fresh.jar, fresh.csrf).catch(() => null)
      : null;

    if (fresh && freshHandle) {
      attempt = await submitPassword(
        freshHandle.identifier,
        freshHandle.digest,
        password,
        fresh.jar,
        fresh.csrf
      );
    }
  }

  return attempt.ok
    ? { ok: true, cookie: attempt.cookie }
    : { ok: false, failure: attempt.failure, detail: attempt.detail };
}
