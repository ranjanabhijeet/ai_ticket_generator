import { inngest } from "../client.js";
import User from "../../models/user.js";
import { NonRetriableError } from "inngest";
import { sendMail } from "../../utils/mailer.js";

export const createSignupEmailHandler = ({
  findUserByEmail = (email) => User.findOne({ email }),
  sendEmail = sendMail,
} = {}) =>
  async ({ event, step }) => {
    const { email } = event.data || {};

    if (!email) {
      throw new NonRetriableError("user/signup event is missing email");
    }

    const user = await step.run("get-user-email", async () => {
      const userObject = await findUserByEmail(email);
      if (!userObject) {
        throw new NonRetriableError("User no longer exists in our database");
      }
      return userObject;
    });

    await step.run("send-welcome-email", async () => {
      await sendEmail(
        user.email,
        "Welcome to the app",
        "Hi,\n\nThanks for signing up. We're glad to have you onboard!"
      );
    });

    return { success: true };
  };

export const onUserSignup = inngest.createFunction(
  { id: "on-user-signup", retries: 2 },
  { event: "user/signup" },
  async (context) => {
    try {
      return await createSignupEmailHandler()(context);
    } catch (error) {
      console.error("Signup email processing failed:", error.message);
      throw error;
    }
  }
);
