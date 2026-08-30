import "dotenv/config";
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

const PORT = process.env.PORT || 10000;
const HOST = process.env.HOST || "0.0.0.0";
const MONGO_URI = process.env.MONGO_URI || process.env.MONGO_URL;
const app = express();
const allowedOrigins = [
  process.env.CORS_ORIGIN,
  process.env.FRONTEND_URL,
  "http://localhost:5173",
]
  .filter(Boolean)
  .flatMap((origin) => origin.split(","))
  .map((origin) => origin.trim().replace(/\/$/, ""));

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin.replace(/\/$/, ""))) {
        callback(null, true);
        return;
      }

      try {
        if (/\.vercel\.app$/.test(new URL(origin).hostname)) {
          callback(null, true);
          return;
        }
      } catch {
        // Fall through to the CORS rejection below.
      }

      callback(new Error(`CORS blocked origin: ${origin}`));
    },
  })
);
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

const connectMongo = async () => {
  if (!MONGO_URI) {
    enableDemoStore("Missing MONGO_URI or MONGO_URL");
    console.warn("MongoDB URI missing. Starting with demo store.");
    return;
  }

  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    console.log("MongoDB connected");
  } catch (err) {
    enableDemoStore(err.message);
    console.error("MongoDB connection failed. Starting with demo store:", err.message);
  }
};

app.listen(PORT, HOST, () => {
  console.log(`Server listening on ${HOST}:${PORT}`);
  connectMongo();
});
