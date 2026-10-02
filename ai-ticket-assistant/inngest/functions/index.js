import { onUserSignup } from "./on-signup.js";
import { onTicketCreated } from "./on-ticket-create.js";
import { onTicketAssigned } from "./on-ticket-assigned.js";

export const inngestFunctions = [
  onUserSignup,
  onTicketCreated,
  onTicketAssigned,
];
