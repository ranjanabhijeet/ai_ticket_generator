import mongoose from "mongoose";
import { randomUUID } from "crypto";

const ticketSchema = new mongoose.Schema({
  ticketId: {
    type: String,
    default: randomUUID,
    unique: true,
    sparse: true,
    index: true,
  },
  title: String,
  description: String,
  status: { type: String, default: "TODO" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  priority: String,
  deadline: Date,
  helpfulNotes: String,
  relatedSkills: [String],
  createdAt: { type: Date, default: Date.now },
});

const Ticket = mongoose.models.Ticket || mongoose.model("Ticket", ticketSchema);

export default Ticket;
