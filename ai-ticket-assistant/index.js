import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import { serve } from "inngest/express";
import userRoutes from "./routes/user.js";
import ticketRoutes from "./routes/ticket.js";
import { inngest } from "./inngest/client.js";
import { onUserSignup } from "./inngest/functions/on-signup.js";
import { onTicketCreated } from "./inngest/functions/on-ticket-create.js";
import { enableDemoStore, getDemoStoreStatus } from "./utils/demoStore.js";


import dotenv from "dotenv";
dotenv.config();

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || process.env.MONGO_URL;
const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({
    status: "ok",
    service: "ai-ticket-assistant-api",
    dataStore: getDemoStoreStatus().enabled ? "demo" : "mongodb",
  });
});

app.use("/api/auth", userRoutes);
app.use("/api/tickets", ticketRoutes);

app.use(
  "/api/inngest",
  serve({
    client: inngest,
    functions: [onUserSignup, onTicketCreated],
  })
);

const listen = () => {
  app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
};

const start = async () => {
  if (!MONGO_URI) {
    enableDemoStore("Missing MONGO_URI or MONGO_URL");
    console.warn("MongoDB URI missing. Starting with demo store.");
    listen();
    return;
  }

  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    console.log("MongoDB connected");
  } catch (err) {
    enableDemoStore(err.message);
    console.error("MongoDB connection failed. Starting with demo store:", err.message);
  }

  listen();
};

start();
