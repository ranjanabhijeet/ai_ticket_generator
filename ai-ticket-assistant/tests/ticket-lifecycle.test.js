import assert from "node:assert/strict";
import test from "node:test";
import Ticket from "../models/ticket.js";
import { getTicket, getTickets, updateTicket } from "../controllers/ticket.js";

const ticketId = "2a794b54-c158-4d5a-9ff4-e1da27044d31";

const response = () => ({
  statusCode: 200,
  payload: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.payload = payload;
    return this;
  },
});

const withTicketModel = async ({ ticket, user, status, id = ticketId }) => {
  const originalFindOne = Ticket.findOne;
  const originalFindByIdAndUpdate = Ticket.findByIdAndUpdate;
  let lookup;
  let update;

  Ticket.findOne = async (filter) => {
    lookup = filter;
    return ticket;
  };
  Ticket.findByIdAndUpdate = async (ticketObjectId, updates) => {
    update = { ticketObjectId, updates };
    return ticket ? { ...ticket, ...updates } : null;
  };

  const res = response();

  try {
    await updateTicket(
      {
        params: { id },
        body: { status },
        user,
      },
      res
    );
    return { lookup, update, res };
  } finally {
    Ticket.findOne = originalFindOne;
    Ticket.findByIdAndUpdate = originalFindByIdAndUpdate;
  }
};

const withTicketListModel = async ({ tickets, user }) => {
  const originalFind = Ticket.find;
  let lookup;

  Ticket.find = (filter) => {
    lookup = filter;
    return {
      select() {
        return this;
      },
      populate() {
        return this;
      },
      sort: async () => tickets,
    };
  };

  const res = response();

  try {
    await getTickets({ user }, res);
    return { lookup, res };
  } finally {
    Ticket.find = originalFind;
  }
};

const withTicketDetailModel = async ({ ticket, user, id = ticketId }) => {
  const originalFindOne = Ticket.findOne;
  let lookup;

  Ticket.findOne = (filter) => {
    lookup = filter;
    return {
      select() {
        return this;
      },
      populate: async () => ticket,
    };
  };

  const res = response();

  try {
    await getTicket({ params: { id }, user }, res);
    return { lookup, res };
  } finally {
    Ticket.findOne = originalFindOne;
  }
};

test("a user can see only tickets they created", async () => {
  const result = await withTicketListModel({
    tickets: [{ ticketId, createdBy: "user-one" }],
    user: { _id: "user-one", role: "user" },
  });

  assert.equal(result.res.statusCode, 200);
  assert.deepEqual(result.res.payload, [{ ticketId, createdBy: "user-one" }]);
  assert.deepEqual(result.lookup, { createdBy: "user-one" });
});

test("a user cannot fetch another user's ticket", async () => {
  const result = await withTicketDetailModel({
    ticket: null,
    user: { _id: "user-one", role: "user" },
  });

  assert.equal(result.res.statusCode, 404);
  assert.deepEqual(result.lookup, { ticketId, createdBy: "user-one" });
});

test("a moderator can see tickets assigned to them", async () => {
  const result = await withTicketListModel({
    tickets: [{ ticketId, assignedTo: "moderator-one" }],
    user: { _id: "moderator-one", role: "moderator" },
  });

  assert.equal(result.res.statusCode, 200);
  assert.deepEqual(result.lookup, { assignedTo: "moderator-one" });
});

test("a moderator can open a ticket assigned to them", async () => {
  const ticket = {
    ticketId,
    assignedTo: "moderator-one",
    priority: "medium",
    relatedSkills: ["React"],
    helpfulNotes: "Inspect the failing component and browser errors.",
  };
  const result = await withTicketDetailModel({
    ticket,
    user: { _id: "moderator-one", role: "moderator" },
  });

  assert.equal(result.res.statusCode, 200);
  assert.equal(result.res.payload.ticket, ticket);
  assert.deepEqual(result.lookup, { ticketId, assignedTo: "moderator-one" });
});

test("a moderator cannot fetch another moderator's ticket", async () => {
  const result = await withTicketDetailModel({
    ticket: null,
    user: { _id: "moderator-one", role: "moderator" },
  });

  assert.equal(result.res.statusCode, 404);
  assert.deepEqual(result.lookup, { ticketId, assignedTo: "moderator-one" });
});

test("an admin can see all tickets", async () => {
  const result = await withTicketListModel({
    tickets: [{ ticketId, assignedTo: "moderator-one" }],
    user: { _id: "admin-one", role: "admin" },
  });

  assert.equal(result.res.statusCode, 200);
  assert.deepEqual(result.lookup, {});
});

test("an unauthenticated ticket-list request is rejected", async () => {
  const res = response();

  await getTickets({}, res);

  assert.equal(res.statusCode, 401);
  assert.equal(res.payload.error, "Unauthorized");
});

test("an assigned moderator can move a ticket from IN_PROGRESS to DONE", async () => {
  const ticket = {
    _id: "ticket-object-id",
    ticketId,
    status: "IN_PROGRESS",
    assignedTo: "moderator-one",
  };
  const result = await withTicketModel({
    ticket,
    user: { _id: "moderator-one", role: "moderator" },
    status: "DONE",
  });

  assert.equal(result.res.statusCode, 200);
  assert.equal(result.res.payload.ticket.status, "DONE");
  assert.deepEqual(result.lookup, { ticketId });
  assert.deepEqual(result.update, {
    ticketObjectId: "ticket-object-id",
    updates: { status: "DONE" },
  });
});

test("a moderator cannot update a ticket assigned to another moderator", async () => {
  const result = await withTicketModel({
    ticket: {
      _id: "ticket-object-id",
      status: "IN_PROGRESS",
      assignedTo: "moderator-two",
    },
    user: { _id: "moderator-one", role: "moderator" },
    status: "DONE",
  });

  assert.equal(result.res.statusCode, 403);
  assert.match(result.res.payload.error, /Not authorized/);
  assert.equal(result.update, undefined);
});

test("an admin can update any ticket", async () => {
  const result = await withTicketModel({
    ticket: {
      _id: "ticket-object-id",
      status: "TODO",
      assignedTo: "moderator-one",
    },
    user: { _id: "admin-one", role: "admin" },
    status: "IN_PROGRESS",
  });

  assert.equal(result.res.statusCode, 200);
  assert.equal(result.res.payload.ticket.status, "IN_PROGRESS");
});

test("a regular user cannot update a ticket status", async () => {
  const result = await withTicketModel({
    ticket: {
      _id: "ticket-object-id",
      status: "TODO",
      assignedTo: "moderator-one",
    },
    user: { _id: "user-one", role: "user" },
    status: "IN_PROGRESS",
  });

  assert.equal(result.res.statusCode, 403);
  assert.equal(result.update, undefined);
});

test("an invalid status returns 400", async () => {
  const result = await withTicketModel({
    ticket: {
      _id: "ticket-object-id",
      status: "TODO",
      assignedTo: "moderator-one",
    },
    user: { _id: "moderator-one", role: "moderator" },
    status: "CLOSED",
  });

  assert.equal(result.res.statusCode, 400);
  assert.equal(result.res.payload.error, "Invalid ticket status");
  assert.equal(result.lookup, undefined);
});

test("a lifecycle transition cannot skip from TODO to DONE", async () => {
  const result = await withTicketModel({
    ticket: {
      _id: "ticket-object-id",
      status: "TODO",
      assignedTo: "moderator-one",
    },
    user: { _id: "moderator-one", role: "moderator" },
    status: "DONE",
  });

  assert.equal(result.res.statusCode, 400);
  assert.equal(result.res.payload.error, "Invalid status transition from TODO to DONE");
  assert.equal(result.update, undefined);
});

test("DONE remains a terminal ticket status", async () => {
  const result = await withTicketModel({
    ticket: {
      _id: "ticket-object-id",
      status: "DONE",
      assignedTo: "moderator-one",
    },
    user: { _id: "moderator-one", role: "moderator" },
    status: "IN_PROGRESS",
  });

  assert.equal(result.res.statusCode, 400);
  assert.equal(result.res.payload.error, "Invalid status transition from DONE to IN_PROGRESS");
  assert.equal(result.update, undefined);
});

test("a nonexistent ticket returns 404", async () => {
  const result = await withTicketModel({
    ticket: null,
    user: { _id: "admin-one", role: "admin" },
    status: "IN_PROGRESS",
  });

  assert.equal(result.res.statusCode, 404);
  assert.equal(result.res.payload.error, "Ticket not found");
  assert.equal(result.update, undefined);
});

test("UUID ticket lookup still works on the ticket-detail endpoint", async () => {
  const originalFindOne = Ticket.findOne;
  const ticket = {
    _id: "ticket-object-id",
    ticketId,
    status: "IN_PROGRESS",
  };
  let lookup;

  Ticket.findOne = (filter) => {
    lookup = filter;
    return {
      populate: async () => ticket,
    };
  };

  const res = response();

  try {
    await getTicket(
      {
        params: { id: ticketId },
        user: { _id: "admin-one", role: "admin" },
      },
      res
    );
  } finally {
    Ticket.findOne = originalFindOne;
  }

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.ticket.ticketId, ticketId);
  assert.deepEqual(lookup, { ticketId });
});
