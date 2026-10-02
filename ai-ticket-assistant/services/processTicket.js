import Ticket from "../models/ticket.js";
import User from "../models/user.js";
import mongoose from "mongoose";
import analyzeTicket, { validateTicketAnalysis } from "../utils/ai.js";
import { selectAssignee } from "../utils/assignment.js";

const findTicketById = (ticketId) => {
  if (mongoose.Types.ObjectId.isValid(ticketId)) {
    return Ticket.findOne({ $or: [{ _id: ticketId }, { ticketId }] });
  }

  return Ticket.findOne({ ticketId });
};

export const createTicketProcessor = ({
  findTicket = findTicketById,
  analyze = analyzeTicket,
  findAssignmentCandidates = () =>
    User.find({ role: { $in: ["moderator", "admin"] } }).sort({ _id: 1 }),
  updateTicket = (ticketId, updates) =>
    Ticket.findByIdAndUpdate(ticketId, updates, { new: true }),
} = {}) =>
  async (ticketId) => {
    const ticket = await findTicket(ticketId);
    if (!ticket) {
      throw new Error(`Ticket not found: ${ticketId}`);
    }

    const aiResponse = validateTicketAnalysis(
      await analyze(ticket, { fallbackOnError: false })
    );
    const { priority, helpfulNotes, relatedSkills } = aiResponse;

    const assignmentCandidates = await findAssignmentCandidates();
    const { assignee, candidateScores, normalizedRequiredSkills, assignmentMode } =
      selectAssignee(assignmentCandidates, relatedSkills);

    console.info("Ticket assignment evaluated", {
      ticketId: ticket.ticketId || String(ticket._id),
      requiredSkills: normalizedRequiredSkills,
      candidates: candidateScores.map(({ moderator, score }) => ({
        moderatorId: String(moderator._id),
        score,
      })),
      selectedModeratorId: assignee?._id ? String(assignee._id) : null,
      assignmentMode,
    });

    return updateTicket(ticket._id, {
      priority,
      helpfulNotes,
      status: "IN_PROGRESS",
      relatedSkills,
      assignedTo: assignee?._id || null,
    });
  };

export const processTicket = createTicketProcessor();
