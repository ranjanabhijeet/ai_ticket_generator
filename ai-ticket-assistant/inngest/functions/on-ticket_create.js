import { inngest } from "../client.js";
import { processTicket } from "../../services/processTicket.js";

export const createTicketAssignedEvent = (ticket) => {
  const ticketId = ticket?.ticketId || (ticket?._id ? String(ticket._id) : null);
  const assignedTo = ticket?.assignedTo?._id || ticket?.assignedTo;
  const assignedToId = assignedTo ? String(assignedTo) : null;

  if (!ticketId || !assignedToId) {
    return null;
  }

  return {
    id: `ticket-assigned:${ticketId}:${assignedToId}`,
    name: "ticket/assigned",
    data: { ticketId, assignedToId },
  };
};

export const createTicketCreatedHandler = ({
  processTicketService = processTicket,
} = {}) =>
  async ({ event, step }) => {
    const { ticketId } = event.data || {};

    if (!ticketId) {
      throw new Error("ticket/created event is missing ticketId");
    }

    const ticket = await step.run("process-ticket", async () =>
      processTicketService(ticketId)
    );
    const assignmentEvent = createTicketAssignedEvent(ticket);

    if (assignmentEvent) {
      await step.sendEvent("publish-ticket-assigned", assignmentEvent);
    }

    return { success: true, assignmentEmailQueued: Boolean(assignmentEvent) };
  };

export const onTicketCreated = inngest.createFunction(
  { id: "on-ticket-created", retries: 2 },
  { event: "ticket/created" },
  async (context) => {
    try {
      return await createTicketCreatedHandler()(context);
    } catch (error) {
      console.error("Ticket processing failed:", error.message);
      throw error;
    }
  }
);
