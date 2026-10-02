import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User, { USER_ROLES } from "../models/user.js";
import { inngest } from "../inngest/client.js";
import { demoUsers, isDemoStoreEnabled } from "../utils/demoStore.js";
import { normalizeSkillList } from "../utils/skills.js";

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

const toSafeUser = (user) => {
  const userObject = user?.toObject ? user.toObject() : { ...user };
  delete userObject.password;
  return userObject;
};

const requireAdmin = (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }

  if (req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }

  return true;
};

export const signup = async (req, res) => {
  const { email, password, skills = [] } = req.body;

  try {
    const normalizedEmail = email?.trim().toLowerCase();
    const normalizedSkills = normalizeSkillList(skills);

    if (!normalizedEmail || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    if (!normalizedSkills) {
      return res.status(400).json({ error: "Skills must be an array of non-empty strings" });
    }

    if (isDemoStoreEnabled()) {
      const existingUser = demoUsers.findByEmail(normalizedEmail);
      if (existingUser) {
        return res.status(409).json({ error: "Email already in use" });
      }

      const hashed = await bcrypt.hash(password, 10);
      const user = demoUsers.create({
        email: normalizedEmail,
        password: hashed,
        skills: normalizedSkills,
        role: demoUsers.hasAdmin() ? "user" : "admin",
      });

      const token = jwt.sign(
        { _id: user._id, role: user.role },
        process.env.JWT_SECRET
      );

      delete user.password;
      return res.json({ user, token });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ error: "Email already in use" });
    }

    const hashed = await bcrypt.hash(password, 10);

    const hasAdmin = await User.exists({ role: "admin" });

    const user = await User.create({
      email: normalizedEmail,
      password: hashed,
      skills: normalizedSkills,
      role: hasAdmin ? "user" : "admin",
    });

    try {
      await inngest.send({
        id: `user-signup:${user._id}`,
        name: "user/signup",
        data: { email: user.email },
      });
    } catch (inngestError) {
      console.warn("⚠️ Failed to publish signup event:", inngestError.message);
    }

    const token = jwt.sign(
      { _id: user._id, role: user.role },
      process.env.JWT_SECRET
    );

    return res.json({ user: toSafeUser(user), token });
  } catch (error) {
    console.error("Signup failed", error.message);
    return res.status(500).json({ error: "Signup failed" });
  }
};

export const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const normalizedEmail = email?.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    if (isDemoStoreEnabled()) {
      const user = demoUsers.findByEmail(normalizedEmail);
      if (!user)
        return res.status(401).json({ error: "User not found" });

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch)
        return res.status(401).json({ error: "Invalid credentials" });

      const token = jwt.sign(
        { _id: user._id, role: user.role },
        process.env.JWT_SECRET
      );

      delete user.password;
      return res.json({ user, token });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user)
      return res.status(401).json({ error: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      { _id: user._id, role: user.role },
      process.env.JWT_SECRET
    );

    res.json({ user: toSafeUser(user), token });
  } catch (error) {
    res.status(500).json({ error: "Login failed", details: error.message });
  }
};

export const logout = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Unauthorized" });

    jwt.verify(token, process.env.JWT_SECRET);
    res.json({ message: "Logout successful" });
  } catch (error) {
    res.status(500).json({ error: "Logout failed" });
  }
};

export const updateUser = async (req, res) => {
  const body = req.body || {};
  const { email } = body;
  const hasRole = hasOwn(body, "role");
  const hasSkills = hasOwn(body, "skills");

  try {
    if (!requireAdmin(req, res)) {
      return;
    }

    if (
      !email ||
      typeof email !== "string" ||
      !hasRole && !hasSkills ||
      Object.keys(body).some((key) => !["email", "role", "skills"].includes(key))
    ) {
      return res.status(400).json({ error: "Invalid user update request" });
    }

    if (hasRole && !USER_ROLES.includes(body.role)) {
      return res.status(400).json({ error: "Invalid user role" });
    }

    const normalizedSkills = hasSkills ? normalizeSkillList(body.skills) : null;
    if (hasSkills && !normalizedSkills) {
      return res.status(400).json({ error: "Skills must be an array of non-empty strings" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const updates = {
      ...(hasRole ? { role: body.role } : {}),
      ...(hasSkills ? { skills: normalizedSkills } : {}),
    };

    if (isDemoStoreEnabled()) {
      const updatedUser = demoUsers.update(normalizedEmail, updates);

      if (!updatedUser)
        return res.status(404).json({ error: "User not found" });

      return res.json({
        message: "User updated successfully",
        user: toSafeUser(updatedUser),
      });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user)
      return res.status(404).json({ error: "User not found" });

    Object.assign(user, updates);
    await user.save();

    return res.json({
      message: "User updated successfully",
      user: toSafeUser(user),
    });
  } catch (error) {
    console.error("User update failed", error.message);
    return res.status(500).json({ error: "Update failed" });
  }
};

export const getUsers = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) {
      return;
    }

    if (isDemoStoreEnabled()) {
      return res.json(demoUsers.list().map(toSafeUser));
    }

    const users = await User.find().select("-password");
    return res.json(users.map(toSafeUser));
  } catch (error) {
    console.error("Failed to fetch users", error.message);
    return res.status(500).json({ error: "Failed to fetch users" });
  }
};
