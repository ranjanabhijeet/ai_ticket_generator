import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import { serve } from "inngest/express";
import userRoutes from "./routes/user.js";
import ticketRoutes from "./routes/ticket.js";
import { inngest } from "./inngest/client.js";
import { inngestFunctions } from "./inngest/functions/index.js";
import { enableDemoStore, getDemoStoreStatus } from "./utils/demoStore.js";
import { healthCheck } from "./utils/health.js";

const PORT = process.env.PORT || 10000;
const HOST = process.env.HOST || "0.0.0.0";
const MONGO_URI = process.env.MONGO_URI;
const isProduction = process.env.NODE_ENV === "production";
const canUseDemoStore = process.env.DEMO_MODE === "true" || !isProduction;
const app = express();
const allowedOrigins = [
  process.env.CORS_ORIGIN,
  process.env.FRONTEND_URL,
  ...(isProduction ? [] : ["http://localhost:5173"]),
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

      callback(new Error(`CORS blocked origin: ${origin}`));
    },
  })
);
app.use(express.json());

app.get("/health", healthCheck);

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
    functions: inngestFunctions,
  })
);

const connectMongo = async () => {
  if (!MONGO_URI) {
    if (canUseDemoStore) {
      enableDemoStore("Demo mode is enabled without MONGO_URI");
      console.warn("MONGO_URI is missing. Starting with the demo store.");
    } else {
      console.error(
        "MONGO_URI is required in production. Demo storage is disabled unless DEMO_MODE=true."
      );
    }
    return;
  }

  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    console.log("MongoDB connected");
  } catch (err) {
    if (canUseDemoStore) {
      enableDemoStore(err.message);
      console.error("MongoDB connection failed. Starting with the demo store:", err.message);
    } else {
      console.error(
        "MongoDB connection failed. Demo storage is disabled in production:",
        err.message
      );
    }
  }
};

app.listen(PORT, HOST, () => {
  console.log(`Server listening on ${HOST}:${PORT}`);
  connectMongo();
});
