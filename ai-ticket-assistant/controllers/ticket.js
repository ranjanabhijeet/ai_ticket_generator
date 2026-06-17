import Ticket from "../models/ticket.js";
import { processTicket } from "../services/processTicket.js";
import { demoTickets, isDemoStoreEnabled } from "../utils/demoStore.js";

const queueAnalysisIfPending = (ticket) => {
  if (!ticket || (ticket.priority && ticket.helpfulNotes)) {
    return;
  }

  processTicket(ticket._id).catch((error) => {
    console.error("Ticket analysis failed:", error.message);
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

      return res.status(201).json({
        message: "Ticket created in demo mode",
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
        .select("title description status createdAt")
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

      return res.status(200).json({ ticket });
    }

    if (user.role !== "user") {
      ticket = await Ticket.findById(req.params.id).populate("assignedTo", [
        "email",
        "_id",
      ]);
    } else {
      ticket = await Ticket.findOne({
        createdBy: user._id,
        _id: req.params.id,
      }).select(
        "title description status createdAt priority helpfulNotes relatedSkills assignedTo"
      );
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
