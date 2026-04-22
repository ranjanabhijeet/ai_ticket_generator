import "dotenv/config";
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import User from "../models/user.js";

const MONGO_URI = process.env.MONGO_URI || process.env.MONGO_URL;

if (!MONGO_URI) {
  throw new Error("Missing MONGO_URI/MONGO_URL in environment");
}

const DEMO_PASSWORD = "12345678";

const demoUsers = [
  { email: "one@gmail.com", role: "admin", skills: [] },
  { email: "two@gmail.com", role: "moderator", skills: ["react", "full stack"] },
  { email: "three@gmail.com", role: "moderator", skills: ["python", "machine learning"] },
  { email: "four@gmail.com", role: "user", skills: [] },
];

const run = async () => {
  await mongoose.connect(MONGO_URI);
  const hashed = await bcrypt.hash(DEMO_PASSWORD, 10);

  for (const user of demoUsers) {
    await User.updateOne(
      { email: user.email.toLowerCase() },
      {
        $set: {
          email: user.email.toLowerCase(),
          role: user.role,
          skills: user.skills,
          password: hashed,
        },
      },
      { upsert: true }
    );
  }

  console.log("Demo users ready.");
  console.log("Emails: one@gmail.com, two@gmail.com, three@gmail.com, four@gmail.com");
  console.log(`Password for all demo users: ${DEMO_PASSWORD}`);

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error(error.message);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
