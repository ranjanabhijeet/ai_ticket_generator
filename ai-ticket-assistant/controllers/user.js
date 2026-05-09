import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../models/user.js";
import { inngest } from "../inngest/client.js";
import { demoUsers, isDemoStoreEnabled } from "../utils/demoStore.js";

export const signup = async (req, res) => {
  const { email, password, skills = [] } = req.body;

  try {
    const normalizedEmail = email?.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      return res.status(400).json({ error: "Email and password are required" });
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
        skills,
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
      skills,
      role: hasAdmin ? "user" : "admin",
    });

    try {
      await inngest.send({
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

    const safeUser = user.toObject();
    delete safeUser.password;

    res.json({ user: safeUser, token });
  } catch (error) {
    res.status(500).json({ error: "Signup failed", details: error.message });
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

    const safeUser = user.toObject();
    delete safeUser.password;

    res.json({ user: safeUser, token });
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
  const { skills = [], role, email } = req.body;

  try {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (isDemoStoreEnabled()) {
      const normalizedEmail = email?.trim().toLowerCase();
      const updatedUser = demoUsers.update(normalizedEmail, {
        skills: skills.length ? skills : undefined,
        role,
      });

      if (!updatedUser)
        return res.status(404).json({ error: "User not found" });

      return res.json({ message: "User updated successfully" });
    }

    const user = await User.findOne({ email });
    if (!user)
      return res.status(404).json({ error: "User not found" });

    await User.updateOne(
      { email },
      { skills: skills.length ? skills : user.skills, role }
    );

    res.json({ message: "User updated successfully" });
  } catch (error) {
    res.status(500).json({ error: "Update failed", details: error.message });
  }
};

export const getUsers = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (isDemoStoreEnabled()) {
      return res.json(demoUsers.list());
    }

    const users = await User.find().select("-password");
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
};
