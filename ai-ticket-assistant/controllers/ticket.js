import Ticket, { TICKET_STATUSES } from "../models/ticket.js";
import mongoose from "mongoose";
import { inngest } from "../inngest/client.js";
import analyzeTicket, { validateTicketAnalysis } from "../utils/ai.js";
import { demoTickets, isDemoStoreEnabled } from "../utils/demoStore.js";

const STALE_DEMO_ANALYSIS_PREFIX =
  "Demo mode is active because the production MongoDB connection is unavailable";

const ticketLookup = (id) => {
  const publicIdLookup = { ticketId: id };

  if (mongoose.Types.ObjectId.isValid(id)) {
    const objectIdLookup = { _id: id };
    return { $or: [objectIdLookup, publicIdLookup] };
  }

  return publicIdLookup;
};

const ticketAccessFilter = (user) => {
  if (user.role === "admin") return {};
  if (user.role === "moderator") return { assignedTo: user._id };
  return { createdBy: user._id };
};

const ticketLookupForUser = (id, user) => ({
  ...ticketLookup(id),
  ...ticketAccessFilter(user),
});

const ticketListFields =
  "ticketId title description status createdAt priority relatedSkills assignedTo";

const NEXT_STATUSES = {
  TODO: ["IN_PROGRESS"],
  IN_PROGRESS: ["DONE"],
  DONE: [],
};

const referenceId = (reference) => {
  if (!reference) return null;
  return String(reference._id || reference);
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
      const { priority, helpfulNotes, relatedSkills } = validateTicketAnalysis(aiResponse);
      const moderator = demoTickets.findModeratorForSkills(relatedSkills);

      demoTickets.update(ticket._id, {
        priority,
        helpfulNotes,
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

    try {
      await inngest.send({
        name: "ticket/created",
        data: { ticketId: newTicket.ticketId },
      });
    } catch (eventError) {
      console.error("Failed to publish ticket-created event:", eventError.message);
      return res.status(202).json({
        message: "Ticket created, but background processing could not be queued",
        ticket: newTicket,
      });
    }

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
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const user = req.user;

    if (isDemoStoreEnabled()) {
      return res.status(200).json(demoTickets.listForUser(user));
    }

    const tickets = await Ticket.find(ticketAccessFilter(user))
      .select(ticketListFields)
      .populate("assignedTo", ["email", "_id"])
      .sort({ createdAt: -1 });

    return res.status(200).json(tickets);
  } catch (error) {
    console.error("Error fetching tickets", error.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getTicket = async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

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

    if (user.role === "user") {
      ticket = await Ticket.findOne(ticketLookupForUser(req.params.id, user))
        .select(
          "ticketId title description status createdAt priority helpfulNotes relatedSkills assignedTo"
        )
        .populate("assignedTo", ["email", "_id"]);
    } else {
      ticket = await Ticket.findOne(ticketLookupForUser(req.params.id, user))
        .populate("assignedTo", ["email", "_id"]);
    }

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    return res.status(200).json({ ticket });
  } catch (error) {
    console.error("Error fetching ticket", error.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const updateTicket = async (req, res) => {
  const { status } = req.body || {};

  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!TICKET_STATUSES.includes(status)) {
    return res.status(400).json({ error: "Invalid ticket status" });
  }

  try {
    const ticket = isDemoStoreEnabled()
      ? demoTickets.findById(req.params.id)
      : await Ticket.findOne(ticketLookup(req.params.id));

    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    const isAdmin = req.user.role === "admin";
    const isAssignedModerator =
      req.user.role === "moderator" &&
      referenceId(ticket.assignedTo) === String(req.user._id);

    if (!isAdmin && !isAssignedModerator) {
      return res.status(403).json({ error: "Not authorized to update this ticket" });
    }

    if (!NEXT_STATUSES[ticket.status]?.includes(status)) {
      return res.status(400).json({
        error: `Invalid status transition from ${ticket.status} to ${status}`,
      });
    }

    const updatedTicket = isDemoStoreEnabled()
      ? demoTickets.update(ticket._id, { status })
      : await Ticket.findByIdAndUpdate(
          ticket._id,
          { status },
          { new: true, runValidators: true }
        );

    if (!updatedTicket) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    return res.json({
      message: "Ticket status updated",
      ticket: updatedTicket,
    });
  } catch (error) {
    console.error("Error updating ticket", error.message);
    return res.status(500).json({ error: "Unable to update ticket" });
  }
};
