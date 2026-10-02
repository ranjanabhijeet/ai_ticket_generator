import nodemailer from "nodemailer";

export const sendMail = async (to, subject, text) => {
  const host = process.env.MAILTRAP_SMTP_HOST;
  const port = Number(process.env.MAILTRAP_SMTP_PORT);
  const user = process.env.MAILTRAP_SMTP_USER;
  const pass = process.env.MAILTRAP_SMTP_PASS;

  if (!host || !port || !user || !pass) {
    console.warn(
      "SMTP configuration is incomplete; background email delivery will be retried."
    );
    throw new Error("SMTP configuration is incomplete");
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
  });

  const info = await transporter.sendMail({
    from: '"Inngest TMS" <no-reply@ticketing.local>',
    to,
    subject,
    text,
  });

  console.log("Email delivered", { messageId: info.messageId });
  return info;
};
