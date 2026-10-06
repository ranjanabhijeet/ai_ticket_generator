import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import test from "node:test";
import Ticket from "../models/ticket.js";
import { updateTicket } from "../controllers/ticket.js";
import { createTicketAssignedEvent, createTicketCreatedHandler } from "../inngest/functions/on-ticket_create.js";
import { createTicketAssignmentEmailHandler } from "../inngest/functions/on-ticket-assigned.js";
import { createTicketProcessor } from "../services/processTicket.js";
import { healthCheck } from "../utils/health.js";

const immediateStep = {
  run: async (_name, handler) => handler(),
  sendEvent: async () => undefined,
};

const backendDirectory = fileURLToPath(new URL("..", import.meta.url));

const waitForServerOutput = (child, expectedOutput) =>
  new Promise((resolve, reject) => {
    const expectedOutputs = Array.isArray(expectedOutput)
      ? expectedOutput
      : [expectedOutput];
    let output = "";
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for backend output: ${output}`));
    }, 5000);

    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (expectedOutputs.every((message) => output.includes(message))) {
        clearTimeout(timeout);
        resolve(output);
      }
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timeout);
      if (expectedOutputs.every((message) => output.includes(message))) {
        resolve(output);
        return;
      }
      reject(new Error(`Backend exited early with code ${code}: ${output}`));
    });
  });

const stopProcess = async (child) => {
  if (child.exitCode !== null || child.killed) return;

  child.kill("SIGTERM");
  await once(child, "exit");
};

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

const createWorkflow = ({ analysis, candidates }) => {
  const ticket = {
    _id: "ticket-object-id",
    ticketId: "c2b9c9fe-0c1e-4498-9e12-d93ca9f31a43",
    title: "Production model deployment fails",
    description: "The Python machine learning model fails during deployment.",
    status: "TODO",
    assignedTo: null,
    priority: null,
    relatedSkills: [],
    helpfulNotes: "",
  };
  const processor = createTicketProcessor({
    findTicket: async () => ticket,
    analyze: async () => analysis,
    findAssignmentCandidates: async () => candidates,
    updateTicket: async (_ticketId, updates) => {
      Object.assign(ticket, updates);
      return ticket;
    },
  });

  return { processor, ticket };
};

test("health endpoint is a non-sensitive liveness check", () => {
  const res = response();

  healthCheck({}, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload, { status: "ok" });
});

test("npm start binds on the Render host without waiting for MongoDB", async () => {
  const port = String(19000 + (process.pid % 1000));
  const child = spawn(process.execPath, ["index.js"], {
    cwd: backendDirectory,
    env: {
      ...process.env,
      PORT: port,
      NODE_ENV: "production",
      MONGO_URI: "",
      DEMO_MODE: "",
      DOTENV_CONFIG_PATH: `/private/tmp/ai-ticket-test-${process.pid}.env`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    const output = await waitForServerOutput(child, [
      `Server listening on 0.0.0.0:${port}`,
      "MONGO_URI is required in production",
    ]);

    assert.match(output, new RegExp(`Server listening on 0\\.0\\.0\\.0:${port}`));
    assert.match(output, /MONGO_URI is required in production/);
  } finally {
    await stopProcess(child);
  }
});

test("ticket creation flows from TODO through AI assignment, email, and DONE", async () => {
  const pythonModerator = {
    _id: "moderator-python",
    role: "moderator",
    skills: ["Python", "Machine Learning"],
  };
  const { processor, ticket } = createWorkflow({
    analysis: {
      priority: "high",
      relatedSkills: ["Python", "Machine Learning"],
      helpfulNotes: "Inspect the traceback, model artifact, package versions, and deployment logs.",
    },
    candidates: [
      { _id: "moderator-react", role: "moderator", skills: ["React", "JavaScript"] },
      pythonModerator,
      { _id: "admin-one", role: "admin", skills: [] },
    ],
  });
  const events = [];
  const processTicketCreated = createTicketCreatedHandler({
    processTicketService: processor,
  });

  await processTicketCreated({
    event: { data: { ticketId: ticket.ticketId } },
    step: {
      run: immediateStep.run,
      sendEvent: async (_stepName, event) => events.push(event),
    },
  });

  assert.equal(ticket.status, "IN_PROGRESS");
  assert.equal(ticket.priority, "high");
  assert.deepEqual(ticket.relatedSkills, ["Python", "Machine Learning"]);
  assert.equal(ticket.assignedTo, pythonModerator._id);
  assert.deepEqual(events, [
    createTicketAssignedEvent(ticket),
  ]);

  const sent = [];
  const sendAssignmentEmail = createTicketAssignmentEmailHandler({
    findTicket: async () => ticket,
    findUser: async (id) => (id === pythonModerator._id ? { email: "python@example.com" } : null),
    sendEmail: async (...message) => sent.push(message),
  });

  await sendAssignmentEmail({ event: { data: events[0].data }, step: immediateStep });

  assert.deepEqual(sent, [
    [
      "python@example.com",
      "Ticket Assigned",
      `A new ticket is assigned to you: ${ticket.title}`,
    ],
  ]);

  const originalFindOne = Ticket.findOne;
  const originalFindByIdAndUpdate = Ticket.findByIdAndUpdate;
  Ticket.findOne = async () => ticket;
  Ticket.findByIdAndUpdate = async (_id, updates) => {
    Object.assign(ticket, updates);
    return ticket;
  };

  try {
    const deniedResponse = response();
    await updateTicket(
      {
        params: { id: ticket.ticketId },
        body: { status: "DONE" },
        user: { _id: "ticket-creator", role: "user" },
      },
      deniedResponse
    );
    assert.equal(deniedResponse.statusCode, 403);
    assert.equal(ticket.status, "IN_PROGRESS");

    const doneResponse = response();
    await updateTicket(
      {
        params: { id: ticket.ticketId },
        body: { status: "DONE" },
        user: { _id: pythonModerator._id, role: "moderator" },
      },
      doneResponse
    );
    assert.equal(doneResponse.statusCode, 200);
    assert.equal(ticket.status, "DONE");

    const reopenedResponse = response();
    await updateTicket(
      {
        params: { id: ticket.ticketId },
        body: { status: "IN_PROGRESS" },
        user: { _id: pythonModerator._id, role: "moderator" },
      },
      reopenedResponse
    );
    assert.equal(reopenedResponse.statusCode, 400);
    assert.match(reopenedResponse.payload.error, /Invalid status transition/);
  } finally {
    Ticket.findOne = originalFindOne;
    Ticket.findByIdAndUpdate = originalFindByIdAndUpdate;
  }
});

test("React and JavaScript analysis selects the React moderator", async () => {
  const { processor, ticket } = createWorkflow({
    analysis: {
      priority: "medium",
      relatedSkills: ["React", "JavaScript"],
      helpfulNotes: "Inspect the component state, browser console, and failing API request.",
    },
    candidates: [
      { _id: "moderator-python", role: "moderator", skills: ["Python"] },
      { _id: "moderator-react", role: "moderator", skills: ["React", "JavaScript"] },
    ],
  });

  await processor(ticket.ticketId);

  assert.equal(ticket.assignedTo, "moderator-react");
  assert.equal(ticket.status, "IN_PROGRESS");
});

test("invalid AI output leaves the ticket TODO and does not publish assignment work", async () => {
  const { processor, ticket } = createWorkflow({
    analysis: { priority: "urgent", relatedSkills: ["Python"], helpfulNotes: "Investigate." },
    candidates: [{ _id: "moderator-python", role: "moderator", skills: ["Python"] }],
  });
  const handler = createTicketCreatedHandler({ processTicketService: processor });

  await assert.rejects(
    handler({ event: { data: { ticketId: ticket.ticketId } }, step: immediateStep }),
    /priority must be low, medium, or high/
  );

  assert.equal(ticket.status, "TODO");
  assert.equal(ticket.assignedTo, null);
});

test("a no-match AI result uses the deterministic admin fallback", async () => {
  const { processor, ticket } = createWorkflow({
    analysis: {
      priority: "low",
      relatedSkills: ["Rust"],
      helpfulNotes: "Inspect the Rust compiler output and dependency versions.",
    },
    candidates: [
      { _id: "moderator-react", role: "moderator", skills: ["React"] },
      { _id: "admin-z", role: "admin", skills: [] },
      { _id: "admin-a", role: "admin", skills: [] },
    ],
  });

  await processor(ticket.ticketId);

  assert.equal(ticket.assignedTo, "admin-a");
  assert.equal(ticket.status, "IN_PROGRESS");
});
