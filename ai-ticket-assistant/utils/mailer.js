import nodemailer from "nodemailer";

const pickEnv = (...keys) => {
  for (const key of keys) {
    if (process.env[key]) {
      return process.env[key];
    }
  }
  return undefined;
};

export const sendMail = async (to, subject, text) => {
  try {
    const host = pickEnv("MAILTRAP_SMTP_HOST", "MAILTRAP-SMTP_HOST");
    const port = Number(pickEnv("MAILTRAP_SMTP_PORT", "MAILTRAP-SMTP_PORT"));
    const user = pickEnv("MAILTRAP_SMTP_USER", "MAILTRAP-SMTP_USER");
    const pass = pickEnv("MAILTRAP_SMTP_PASS", "MAILTRAP-SMTP_PASS");

    if (!host || !port || !user || !pass) {
      console.warn("SMTP is not fully configured; skipping assignment email.");
      return null;
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

    console.log("Message sent:", info.messageId);
    return info;
  } catch (error) {
    console.error("❌ Mail error", error.message);
    return null;
  }
};
