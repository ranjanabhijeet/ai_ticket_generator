import Ticket from "../models/ticket.js";
import mongoose from "mongoose";
import { processTicket } from "../services/processTicket.js";
import analyzeTicket from "../utils/ai.js";
import { demoTickets, isDemoStoreEnabled } from "../utils/demoStore.js";

const FALLBACK_ANALYSIS_PREFIX = "AI response was unavailable";
const STALE_DEMO_ANALYSIS_PREFIX =
  "Demo mode is active because the production MongoDB connection is unavailable";
const normalizePriority = (priority) =>
  ["low", "medium", "high"].includes(priority) ? priority : "medium";

const ticketLookupForUser = (id, user) => {
  const publicIdLookup = { ticketId: id };

  if (mongoose.Types.ObjectId.isValid(id)) {
    const objectIdLookup = { _id: id };
    return user.role !== "user"
      ? { $or: [objectIdLookup, publicIdLookup] }
      : {
          createdBy: user._id,
          $or: [objectIdLookup, publicIdLookup],
        };
  }

  return user.role !== "user"
    ? publicIdLookup
    : { createdBy: user._id, ...publicIdLookup };
};

const queueAnalysisIfPending = (ticket) => {
  const helpfulNotes = ticket?.helpfulNotes || "";
  const hasRealAnalysis =
    ticket?.priority &&
    helpfulNotes &&
    !helpfulNotes.startsWith(FALLBACK_ANALYSIS_PREFIX);

  if (!ticket || hasRealAnalysis) {
    return;
  }

  processTicket(ticket._id).catch((error) => {
    console.error("Ticket analysis failed:", error.message);
  });
};

const queueDemoAnalysisIfPending = (ticket) => {
  const helpfulNotes = ticket?.helpfulNotes || "";
  const hasStaleDemoAnalysis = helpfulNotes.startsWith(
    STALE_DEMO_ANALYSIS_PREFIX
  );

  if (
    !ticket ||
    (ticket.status === "IN_PROGRESS" && !hasStaleDemoAnalysis) ||
    (ticket.priority && helpfulNotes && !hasStaleDemoAnalysis)
  ) {
    return;
  }

  demoTickets.update(ticket._id, { status: "IN_PROGRESS" });

  analyzeTicket(ticket)
    .then((aiResponse) => {
      const relatedSkills = Array.isArray(aiResponse?.relatedSkills)
        ? aiResponse.relatedSkills.filter(Boolean)
        : [];
      const moderator = demoTickets.findModeratorForSkills(relatedSkills);

      demoTickets.update(ticket._id, {
        priority: normalizePriority(aiResponse?.priority),
        helpfulNotes:
          aiResponse?.helpfulNotes ||
          "AI analysis completed, but no detailed notes were returned.",
        status: "IN_PROGRESS",
        relatedSkills,
        assignedTo: moderator?._id || null,
      });
    })
    .catch((error) => {
      console.error("Demo ticket analysis failed:", error.message);
      demoTickets.update(ticket._id, {
        priority: "medium",
        helpfulNotes:
          "AI response was unavailable, so this ticket needs manual review. Check the backend logs and verify GEMINI_API_KEY is configured.",
        status: "TODO",
        relatedSkills: [],
      });
    });
};

export const createTicket = async (req, res) => {
  try {
    const { title, description } = req.body;

    if (!title || !description) {
      return res
        .status(400)
        .json({ message: "Title and description are required" });
    }

    if (isDemoStoreEnabled()) {
      const newTicket = demoTickets.create({
        title,
        description,
        createdBy: req.user._id,
      });

      queueDemoAnalysisIfPending(newTicket);

      return res.status(201).json({
        message: "Ticket created in demo mode and AI processing started",
        ticket: newTicket,
      });
    }

    const newTicket = await Ticket.create({
      title,
      description,
      createdBy: req.user._id,
    });

    queueAnalysisIfPending(newTicket);

    return res.status(201).json({
      message: "Ticket created and processing started",
      ticket: newTicket,
    });
  } catch (error) {
    console.error("Error creating ticket", error.message);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
};

export const getTickets = async (req, res) => {
  try {
    const user = req.user;
    let tickets;

    if (isDemoStoreEnabled()) {
      return res.status(200).json(demoTickets.listForUser(user));
    }

    if (user.role !== "user") {
      tickets = await Ticket.find({})
        .populate("assignedTo", ["email", "_id"])
        .sort({ createdAt: -1 });
    } else {
      tickets = await Ticket.find({ createdBy: user._id })
        .select("ticketId title description status createdAt")
        .sort({ createdAt: -1 });
    }

    return res.status(200).json(tickets);
  } catch (error) {
    console.error("Error fetching tickets", error.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getTicket = async (req, res) => {
  try {
    const user = req.user;
    let ticket;

    if (isDemoStoreEnabled()) {
      ticket = demoTickets.findForUser(req.params.id, user);

      if (!ticket) {
        return res.status(404).json({ message: "Ticket not found" });
      }

      queueDemoAnalysisIfPending(ticket);

      return res.status(200).json({ ticket });
    }

    if (user.role !== "user") {
      ticket = await Ticket.findOne(ticketLookupForUser(req.params.id, user))
        .populate("assignedTo", ["email", "_id"]);
    } else {
      ticket = await Ticket.findOne(ticketLookupForUser(req.params.id, user))
        .select(
          "ticketId title description status createdAt priority helpfulNotes relatedSkills assignedTo"
        )
        .populate("assignedTo", ["email", "_id"]);
    }

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    queueAnalysisIfPending(ticket);

    return res.status(200).json({ ticket });
  } catch (error) {
    console.error("Error fetching ticket", error.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
