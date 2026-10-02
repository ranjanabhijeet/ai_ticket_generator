import assert from "node:assert/strict";
import test from "node:test";
import nodemailer from "nodemailer";
import User from "../models/user.js";
import { inngest } from "../inngest/client.js";
import { signup } from "../controllers/user.js";
import { sendMail } from "../utils/mailer.js";
import { createSignupEmailHandler } from "../inngest/functions/onSignUp.js";
import {
  createTicketAssignedEvent,
  createTicketCreatedHandler,
} from "../inngest/functions/on-ticket_create.js";
import { createTicketAssignmentEmailHandler } from "../inngest/functions/on-ticket-assigned.js";
import { inngestFunctions } from "../inngest/functions/index.js";

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

const immediateStep = {
  run: async (_name, handler) => handler(),
  sendEvent: async () => undefined,
};

const withEnvironment = async (updates, run) => {
  const previous = Object.fromEntries(
    Object.keys(updates).map((key) => [key, process.env[key]])
  );

  Object.entries(updates).forEach(([key, value]) => {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  });

  try {
    return await run();
  } finally {
    Object.entries(previous).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  }
};

test("signup saves the user before publishing the background email event", async () => {
  const originalFindOne = User.findOne;
  const originalExists = User.exists;
  const originalCreate = User.create;
  const originalSend = inngest.send;
  const user = {
    _id: "user-one",
    email: "member@example.com",
    password: "hashed-password",
    role: "user",
    skills: [],
    toObject() {
      return { ...this };
    },
  };
  let userCreated = false;
  let publishedEvent;

  User.findOne = async () => null;
  User.exists = async () => true;
  User.create = async () => {
    userCreated = true;
    return user;
  };
  inngest.send = async (event) => {
    assert.equal(userCreated, true);
    publishedEvent = event;
  };

  const res = response();

  try {
    await withEnvironment({ JWT_SECRET: "test-secret" }, () =>
      signup(
        { body: { email: user.email, password: "password" } },
        res
      )
    );
  } finally {
    User.findOne = originalFindOne;
    User.exists = originalExists;
    User.create = originalCreate;
    inngest.send = originalSend;
  }

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.user.email, user.email);
  assert.equal("password" in res.payload.user, false);
  assert.deepEqual(publishedEvent, {
    id: "user-signup:user-one",
    name: "user/signup",
    data: { email: user.email },
  });
});

test("signup response does not depend on SMTP availability", async () => {
  const originalFindOne = User.findOne;
  const originalExists = User.exists;
  const originalCreate = User.create;
  const originalSend = inngest.send;
  const user = {
    _id: "user-two",
    email: "smtp-independent@example.com",
    password: "hashed-password",
    role: "user",
    skills: [],
    toObject() {
      return { ...this };
    },
  };

  User.findOne = async () => null;
  User.exists = async () => true;
  User.create = async () => user;
  inngest.send = async () => undefined;
  const res = response();

  try {
    await withEnvironment(
      {
        JWT_SECRET: "test-secret",
        MAILTRAP_SMTP_HOST: undefined,
        MAILTRAP_SMTP_PORT: undefined,
        MAILTRAP_SMTP_USER: undefined,
        MAILTRAP_SMTP_PASS: undefined,
      },
      () => signup({ body: { email: user.email, password: "password" } }, res)
    );
  } finally {
    User.findOne = originalFindOne;
    User.exists = originalExists;
    User.create = originalCreate;
    inngest.send = originalSend;
  }

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.user.email, user.email);
});

test("signup email worker throws so Inngest can retry after email failure", async () => {
  const handler = createSignupEmailHandler({
    findUserByEmail: async () => ({ email: "member@example.com" }),
    sendEmail: async () => {
      throw new Error("SMTP unavailable");
    },
  });

  await assert.rejects(
    handler({ event: { data: { email: "member@example.com" } }, step: immediateStep }),
    /SMTP unavailable/
  );
});

test("successful ticket processing publishes one deterministic ticket/assigned event", async () => {
  const published = [];
  const handler = createTicketCreatedHandler({
    processTicketService: async () => ({
      _id: "ticket-object-id",
      ticketId: "ticket-uuid",
      assignedTo: "moderator-one",
      status: "IN_PROGRESS",
    }),
  });
  const step = {
    run: immediateStep.run,
    sendEvent: async (stepId, event) => published.push({ stepId, event }),
  };

  const result = await handler({
    event: { data: { ticketId: "ticket-uuid" } },
    step,
  });

  assert.equal(result.assignmentEmailQueued, true);
  assert.deepEqual(published, [
    {
      stepId: "publish-ticket-assigned",
      event: {
        id: "ticket-assigned:ticket-uuid:moderator-one",
        name: "ticket/assigned",
        data: { ticketId: "ticket-uuid", assignedToId: "moderator-one" },
      },
    },
  ]);
});

test("ticket assignment email worker receives the persisted ticket and moderator", async () => {
  const sent = [];
  const handler = createTicketAssignmentEmailHandler({
    findTicket: async () => ({
      ticketId: "ticket-uuid",
      title: "Production deployment issue",
      status: "IN_PROGRESS",
      assignedTo: "moderator-one",
    }),
    findUser: async () => ({ email: "moderator@example.com" }),
    sendEmail: async (...args) => sent.push(args),
  });

  const result = await handler({
    event: {
      data: { ticketId: "ticket-uuid", assignedToId: "moderator-one" },
    },
    step: immediateStep,
  });

  assert.equal(result.ticketId, "ticket-uuid");
  assert.deepEqual(sent, [
    [
      "moderator@example.com",
      "Ticket Assigned",
      "A new ticket is assigned to you: Production deployment issue",
    ],
  ]);
});

test("assignment SMTP failure throws without changing the IN_PROGRESS ticket", async () => {
  const ticket = {
    ticketId: "ticket-uuid",
    title: "Production deployment issue",
    status: "IN_PROGRESS",
    assignedTo: "moderator-one",
  };
  const handler = createTicketAssignmentEmailHandler({
    findTicket: async () => ticket,
    findUser: async () => ({ email: "moderator@example.com" }),
    sendEmail: async () => {
      throw new Error("SMTP unavailable");
    },
  });

  await assert.rejects(
    handler({
      event: { data: { ticketId: "ticket-uuid", assignedToId: "moderator-one" } },
      step: immediateStep,
    }),
    /SMTP unavailable/
  );
  assert.equal(ticket.status, "IN_PROGRESS");
});

test("incomplete SMTP configuration never attempts a localhost connection", async () => {
  const originalCreateTransport = nodemailer.createTransport;
  let transporterCreated = false;
  nodemailer.createTransport = () => {
    transporterCreated = true;
    throw new Error("Transport should not be created");
  };

  try {
    await withEnvironment(
      {
        MAILTRAP_SMTP_HOST: undefined,
        MAILTRAP_SMTP_PORT: undefined,
        MAILTRAP_SMTP_USER: undefined,
        MAILTRAP_SMTP_PASS: undefined,
      },
      async () => {
        await assert.rejects(sendMail("member@example.com", "Subject", "Body"), {
          message: "SMTP configuration is incomplete",
        });
      }
    );
  } finally {
    nodemailer.createTransport = originalCreateTransport;
  }

  assert.equal(transporterCreated, false);
});

test("complete SMTP configuration creates the configured transport and sends email", async () => {
  const originalCreateTransport = nodemailer.createTransport;
  let transportOptions;
  let message;
  nodemailer.createTransport = (options) => {
    transportOptions = options;
    return {
      sendMail: async (payload) => {
        message = payload;
        return { messageId: "message-id" };
      },
    };
  };

  try {
    const result = await withEnvironment(
      {
        MAILTRAP_SMTP_HOST: "smtp.example.test",
        MAILTRAP_SMTP_PORT: "587",
        MAILTRAP_SMTP_USER: "smtp-user",
        MAILTRAP_SMTP_PASS: "smtp-password",
      },
      () => sendMail("member@example.com", "Subject", "Body")
    );

    assert.equal(result.messageId, "message-id");
  } finally {
    nodemailer.createTransport = originalCreateTransport;
  }

  assert.equal(transportOptions.host, "smtp.example.test");
  assert.equal(transportOptions.port, 587);
  assert.equal(transportOptions.secure, false);
  assert.equal(message.to, "member@example.com");
  assert.equal(message.subject, "Subject");
  assert.equal(message.text, "Body");
});

test("all expected Inngest functions are registered exactly once", () => {
  const ids = inngestFunctions.map((functionDefinition) => functionDefinition.opts.id);
  const eventTriggers = inngestFunctions.map(
    (functionDefinition) => functionDefinition.opts.triggers[0].event
  );

  assert.deepEqual(ids, ["on-user-signup", "on-ticket-created", "on-ticket-assigned"]);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(eventTriggers, ["user/signup", "ticket/created", "ticket/assigned"]);
});

test("assignment event generation is skipped when no moderator is assigned", () => {
  assert.equal(
    createTicketAssignedEvent({ ticketId: "ticket-uuid", assignedTo: null }),
    null
  );
});
