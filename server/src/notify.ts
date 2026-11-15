import nodemailer, { type Transporter } from 'nodemailer';

let transporter: Transporter | null = null;

function getTransporter(): { mailer: Transporter; from: string; to: string } | null {
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  if (!user || !pass) return null;

  if (!transporter) {
    const host = process.env.SMTP_HOST?.trim() || 'smtp.gmail.com';
    const port = Number(process.env.SMTP_PORT || '465');
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }
  const to = process.env.ALERT_EMAIL?.trim() || user;
  return { mailer: transporter, from: `"ARENA11 Alerts" <${user}>`, to };
}

/** Sends an asynchronous admin email alert when SMTP_USER and SMTP_PASS (Gmail App Password) are set. */
export async function sendAdminBookingEmail(subject: string, lines: string[]): Promise<void> {
  const cfg = getTransporter();
  if (!cfg) return;
  await cfg.mailer.sendMail({
    from: cfg.from,
    to: cfg.to,
    subject,
    text: lines.join('\n'),
  });
}
