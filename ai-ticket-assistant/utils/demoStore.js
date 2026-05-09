import { randomUUID } from "crypto";

const state = {
  enabled: false,
  reason: null,
  users: [],
  tickets: [],
};

const clone = (value) => JSON.parse(JSON.stringify(value));

const normalizeEmail = (email) => email?.trim().toLowerCase();

const findUserByEmail = (email) =>
  state.users.find((user) => user.email === normalizeEmail(email)) || null;

const toPublicUser = (user) => {
  if (!user) return null;

  const safeUser = clone(user);
  delete safeUser.password;
  return safeUser;
};

const ticketWithAssignee = (ticket) => {
  const copy = clone(ticket);
  if (copy.assignedTo) {
    copy.assignedTo = toPublicUser(state.users.find((user) => user._id === copy.assignedTo));
  }
  return copy;
};

export const enableDemoStore = (reason) => {
  state.enabled = true;
  state.reason = reason;
};

export const isDemoStoreEnabled = () => state.enabled;

export const getDemoStoreStatus = () => ({
  enabled: state.enabled,
  reason: state.reason,
  users: state.users.length,
  tickets: state.tickets.length,
});

export const demoUsers = {
  findByEmail(email) {
    const user = findUserByEmail(email);
    return user ? clone(user) : null;
  },

  hasAdmin() {
    return state.users.some((user) => user.role === "admin");
  },

  create({ email, password, role, skills = [] }) {
    const user = {
      _id: randomUUID(),
      email: normalizeEmail(email),
      password,
      role,
      skills: Array.isArray(skills) ? skills : [],
      createdAt: new Date().toISOString(),
    };

    state.users.push(user);
    return clone(user);
  },

  update(email, updates) {
    const user = findUserByEmail(email);
    if (!user) return null;

    if (Array.isArray(updates.skills)) {
      user.skills = updates.skills;
    }
    if (updates.role) {
      user.role = updates.role;
    }

    return clone(user);
  },

  list() {
    return state.users.map(toPublicUser);
  },
};

export const demoTickets = {
  create({ title, description, createdBy }) {
    const ticket = {
      _id: randomUUID(),
      title,
      description,
      status: "TODO",
      createdBy,
      assignedTo: null,
      priority: "medium",
      deadline: null,
      helpfulNotes:
        "Demo mode is active because the production MongoDB connection is unavailable. Add a valid MongoDB URI on Render to enable persistent AI triage.",
      relatedSkills: [],
      createdAt: new Date().toISOString(),
    };

    state.tickets.push(ticket);
    return ticketWithAssignee(ticket);
  },

  listForUser(user) {
    const tickets =
      user.role !== "user"
        ? state.tickets
        : state.tickets.filter((ticket) => ticket.createdBy === user._id);

    return tickets
      .slice()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map(ticketWithAssignee);
  },

  findForUser(id, user) {
    const ticket = state.tickets.find((item) => item._id === id);
    if (!ticket) return null;
    if (user.role === "user" && ticket.createdBy !== user._id) return null;

    return ticketWithAssignee(ticket);
  },
};
