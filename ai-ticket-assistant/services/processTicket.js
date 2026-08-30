import Ticket from "../models/ticket.js";
import User from "../models/user.js";
import mongoose from "mongoose";
import analyzeTicket from "../utils/ai.js";
import { sendMail } from "../utils/mailer.js";

const normalizePriority = (priority) =>
  ["low", "medium", "high"].includes(priority) ? priority : "medium";

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const findTicketById = (ticketId) => {
  if (mongoose.Types.ObjectId.isValid(ticketId)) {
    return Ticket.findOne({ $or: [{ _id: ticketId }, { ticketId }] });
  }

  return Ticket.findOne({ ticketId });
};

export const processTicket = async (ticketId) => {
  const ticket = await findTicketById(ticketId);
  if (!ticket) {
    throw new Error(`Ticket not found: ${ticketId}`);
  }

  await Ticket.findByIdAndUpdate(ticket._id, { status: "IN_PROGRESS" });

  const aiResponse = await analyzeTicket(ticket);
  const relatedSkills = Array.isArray(aiResponse?.relatedSkills)
    ? aiResponse.relatedSkills.filter(Boolean)
    : [];

  let moderator = null;
  if (relatedSkills.length) {
    const skillsPattern = relatedSkills.map(escapeRegex).join("|");
    moderator = await User.findOne({
      role: "moderator",
      skills: {
        $elemMatch: {
          $regex: skillsPattern,
          $options: "i",
        },
      },
    });
  }

  if (!moderator) {
    moderator = await User.findOne({ role: "admin" });
  }

  const finalTicket = await Ticket.findByIdAndUpdate(
    ticket._id,
    {
      priority: normalizePriority(aiResponse?.priority),
      helpfulNotes:
        aiResponse?.helpfulNotes ||
        "AI analysis completed, but no detailed notes were returned.",
      status: "IN_PROGRESS",
      relatedSkills,
      assignedTo: moderator?._id || null,
    },
    { new: true }
  );

  if (moderator) {
    try {
      await sendMail(
        moderator.email,
        "Ticket Assigned",
        `A new ticket is assigned to you ${finalTicket.title}`
      );
    } catch (error) {
      console.warn("Failed to send assignment email:", error.message);
    }
  }

  return finalTicket;
};
