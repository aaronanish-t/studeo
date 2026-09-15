import { createTransport } from "nodemailer";

/**
 * Outbound email. One job: deliver a sign-in link.
 *
 * Plain SMTP rather than a provider SDK, because Studeo has no domain of its
 * own to verify — it lives at a *.vercel.app address — and the transactional
 * providers' free tiers won't send to strangers without one. A Gmail app
 * password or a Brevo SMTP key both work here, and swapping between them is a
 * change of environment variables, not code.
 *
 * Without SMTP configured, development logs the link to the server console
 * instead of failing, so the whole sign-in flow can be exercised locally with
 * no mail account at all. Production with no SMTP is an error, loudly: a
 * sign-in page that silently sends nothing is worse than one that says so.
 */

export interface MagicLinkMail {
  to: string;
  url: string;
  /** How long the link works, for the copy. */
  minutes: number;
}

function transport() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;

  const port = Number(process.env.SMTP_PORT ?? 587);

  return createTransport({
    host,
    port,
    secure: port === 465, // implicit TLS on 465; STARTTLS everywhere else
    auth: { user, pass },
  });
}

export class MailNotConfiguredError extends Error {
  constructor() {
    super("SMTP_HOST, SMTP_USER and SMTP_PASS are not set, so no email can be sent.");
    this.name = "MailNotConfiguredError";
  }
}

export async function sendMagicLink({ to, url, minutes }: MagicLinkMail): Promise<void> {
  const smtp = transport();

  if (!smtp) {
    if (process.env.NODE_ENV === "production") throw new MailNotConfiguredError();

    // Local development: the link is the thing you need, so print it.
    console.log(`\n[studeo] sign-in link for ${to} (no SMTP configured):\n  ${url}\n`);
    return;
  }

  const from = process.env.MAIL_FROM ?? `Studeo <${process.env.SMTP_USER}>`;

  await smtp.sendMail({
    from,
    to,
    subject: "Your Studeo sign-in link",
    text: [
      "Here's your link to sign in to Studeo:",
      "",
      url,
      "",
      `It works once and expires in ${minutes} minutes. If you didn't ask for it, ignore this — nothing happens unless the link is opened.`,
      "",
      "Studeo is an independent student project, not affiliated with SRM Institute of Science and Technology.",
    ].join("\n"),
    html: `
      <p>Here's your link to sign in to Studeo:</p>
      <p><a href="${url}" style="display:inline-block;padding:10px 18px;background:#1a1a1a;color:#fff;border-radius:999px;text-decoration:none;font-weight:500">Sign in to Studeo</a></p>
      <p style="color:#5a5a58;font-size:14px">It works once and expires in ${minutes} minutes. If you didn't ask for it, ignore this — nothing happens unless the link is opened.</p>
      <p style="color:#8d8b86;font-size:12px">Studeo is an independent student project, not affiliated with SRM Institute of Science and Technology.</p>
    `,
  });
}
