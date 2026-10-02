import { NonRetriableError } from "inngest";
import { inngest } from "../client.js";
import Ticket from "../../models/ticket.js";
import User from "../../models/user.js";
import { sendMail } from "../../utils/mailer.js";

const findTicketByTicketId = (ticketId) => Ticket.findOne({ ticketId });
const findUserById = (userId) => User.findById(userId);

export const createTicketAssignmentEmailHandler = ({
  findTicket = findTicketByTicketId,
  findUser = findUserById,
  sendEmail = sendMail,
} = {}) =>
  async ({ event, step }) => {
    const { ticketId, assignedToId } = event.data || {};

    if (!ticketId || !assignedToId) {
      throw new NonRetriableError(
        "ticket/assigned event is missing ticketId or assignedToId"
      );
    }

    const assignment = await step.run("load-assignment-email-details", async () => {
      const ticket = await findTicket(ticketId);
      if (!ticket) {
        throw new NonRetriableError("Ticket no longer exists in our database");
      }

      const currentAssigneeId = ticket.assignedTo?._id || ticket.assignedTo;
      if (String(currentAssigneeId) !== String(assignedToId)) {
        throw new NonRetriableError("Ticket assignment no longer matches this event");
      }

      const assignee = await findUser(assignedToId);
      if (!assignee?.email) {
        throw new NonRetriableError("Assigned user no longer exists in our database");
      }

      return {
        ticketId: ticket.ticketId,
        title: ticket.title,
        assigneeEmail: assignee.email,
      };
    });

    await step.run("send-assignment-email", async () => {
      await sendEmail(
        assignment.assigneeEmail,
        "Ticket Assigned",
        `A new ticket is assigned to you: ${assignment.title}`
      );
    });

    return { success: true, ticketId: assignment.ticketId };
  };

export const onTicketAssigned = inngest.createFunction(
  { id: "on-ticket-assigned", retries: 2 },
  { event: "ticket/assigned" },
  async (context) => {
    try {
      return await createTicketAssignmentEmailHandler()(context);
    } catch (error) {
      console.error("Ticket assignment email failed:", error.message);
      throw error;
    }
  }
);
