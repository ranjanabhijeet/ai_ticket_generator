import mongoose from "mongoose";

export const USER_ROLES = ["user", "moderator", "admin"];

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: USER_ROLES,
    default: "user",
  },
  skills: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now },
});

const User = mongoose.models.User || mongoose.model("User", userSchema);

export default User;
