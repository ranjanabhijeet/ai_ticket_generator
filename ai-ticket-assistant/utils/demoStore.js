import { randomUUID } from "crypto";
import { selectAssignee } from "./assignment.js";

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
    const id = randomUUID();
    const ticket = {
      _id: id,
      ticketId: id,
      title,
      description,
      status: "TODO",
      createdBy,
      assignedTo: null,
      priority: null,
      deadline: null,
      helpfulNotes: "",
      relatedSkills: [],
      createdAt: new Date().toISOString(),
    };

    state.tickets.push(ticket);
    return ticketWithAssignee(ticket);
  },

  listForUser(user) {
    const tickets =
      user.role === "admin"
        ? state.tickets
        : user.role === "moderator"
          ? state.tickets.filter((ticket) => ticket.assignedTo === user._id)
          : state.tickets.filter((ticket) => ticket.createdBy === user._id);

    return tickets
      .slice()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map(ticketWithAssignee);
  },

  update(id, updates) {
    const ticket = state.tickets.find((item) => item._id === id);
    if (!ticket) return null;

    Object.assign(ticket, updates);
    return ticketWithAssignee(ticket);
  },

  findById(id) {
    const ticket = state.tickets.find(
      (item) => item._id === id || item.ticketId === id
    );

    return ticket ? ticketWithAssignee(ticket) : null;
  },

  findForUser(id, user) {
    const ticket = state.tickets.find(
      (item) => item._id === id || item.ticketId === id
    );
    if (!ticket) return null;
    if (user.role === "moderator" && ticket.assignedTo !== user._id) return null;
    if (user.role !== "admin" && user.role !== "moderator" && ticket.createdBy !== user._id) {
      return null;
    }

    return ticketWithAssignee(ticket);
  },

  findModeratorForSkills(skills = []) {
    const { assignee } = selectAssignee(state.users, skills);
    return toPublicUser(assignee);
  },
};
