import assert from "node:assert/strict";
import test from "node:test";
import User from "../models/user.js";
import { getUsers, updateUser } from "../controllers/user.js";
import { selectAssignee } from "../utils/assignment.js";

const admin = { _id: "admin-one", role: "admin" };

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

const createUser = (overrides = {}) => {
  const user = {
    _id: "user-one",
    email: "member@example.com",
    password: "hashed-password",
    role: "user",
    skills: ["React"],
    saved: false,
    ...overrides,
    toObject() {
      return {
        _id: this._id,
        email: this.email,
        password: this.password,
        role: this.role,
        skills: [...this.skills],
      };
    },
    async save() {
      this.saved = true;
      return this;
    },
  };

  return user;
};

const updateWithUser = async ({ user, body, requestUser = admin }) => {
  const originalFindOne = User.findOne;
  let lookup;
  User.findOne = async (filter) => {
    lookup = filter;
    return user;
  };

  const res = response();

  try {
    await updateUser({ body, user: requestUser }, res);
    return { res, user, lookup };
  } finally {
    User.findOne = originalFindOne;
  }
};

test("an admin can list users without password hashes", async () => {
  const originalFind = User.find;
  const listedUsers = [createUser(), createUser({ _id: "moderator-one", email: "mod@example.com" })];
  User.find = () => ({ select: async () => listedUsers });
  const res = response();

  try {
    await getUsers({ user: admin }, res);
  } finally {
    User.find = originalFind;
  }

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.length, 2);
  assert.equal("password" in res.payload[0], false);
});

test("a non-admin cannot list users", async () => {
  const res = response();

  await getUsers({ user: { _id: "moderator-one", role: "moderator" } }, res);

  assert.equal(res.statusCode, 403);
  assert.equal(res.payload.error, "Forbidden");
});

test("an admin can promote a user to moderator", async () => {
  const user = createUser();
  const { res } = await updateWithUser({
    user,
    body: { email: user.email, role: "moderator" },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(user.role, "moderator");
  assert.deepEqual(user.skills, ["React"]);
});

test("an admin can demote a moderator to user", async () => {
  const user = createUser({ role: "moderator", skills: ["Python"] });
  const { res } = await updateWithUser({
    user,
    body: { email: user.email, role: "user" },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(user.role, "user");
});

test("an invalid role is rejected", async () => {
  const user = createUser();
  const { res } = await updateWithUser({
    user,
    body: { email: user.email, role: "owner" },
  });

  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.error, "Invalid user role");
  assert.equal(user.saved, false);
});

test("an admin can add normalized skills", async () => {
  const user = createUser({ skills: ["React"] });
  const { res } = await updateWithUser({
    user,
    body: { email: user.email, skills: ["React", "  JavaScript  "] },
  });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(user.skills, ["React", "JavaScript"]);
});

test("an admin can remove skills by replacing the list", async () => {
  const user = createUser({ skills: ["React", "JavaScript"] });
  const { res } = await updateWithUser({
    user,
    body: { email: user.email, skills: ["React"] },
  });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(user.skills, ["React"]);
});

test("an admin can replace the complete skill list with an empty list", async () => {
  const user = createUser({ skills: ["React", "JavaScript"] });
  const { res } = await updateWithUser({
    user,
    body: { email: user.email, skills: [] },
  });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(user.skills, []);
});

test("duplicate and case-variant skills are stored once", async () => {
  const user = createUser({ skills: [] });
  const { res } = await updateWithUser({
    user,
    body: {
      email: user.email,
      skills: [" React ", "react", "REACT", "Machine   Learning"],
    },
  });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(user.skills, ["React", "Machine Learning"]);
});

test("updating only the role preserves existing skills", async () => {
  const user = createUser({ skills: ["Python", "Machine Learning"] });
  const { res } = await updateWithUser({
    user,
    body: { email: user.email, role: "moderator" },
  });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(user.skills, ["Python", "Machine Learning"]);
});

test("updating only skills preserves the existing role", async () => {
  const user = createUser({ role: "moderator", skills: ["Python"] });
  const { res } = await updateWithUser({
    user,
    body: { email: user.email, skills: ["Express"] },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(user.role, "moderator");
  assert.deepEqual(user.skills, ["Express"]);
});

test("a moderator cannot update user roles or skills", async () => {
  const user = createUser();
  const { res } = await updateWithUser({
    user,
    body: { email: user.email, role: "admin" },
    requestUser: { _id: "moderator-one", role: "moderator" },
  });

  assert.equal(res.statusCode, 403);
  assert.equal(user.role, "user");
});

test("a regular user cannot change their own role", async () => {
  const user = createUser();
  const { res } = await updateWithUser({
    user,
    body: { email: user.email, role: "admin" },
    requestUser: { _id: user._id, role: "user" },
  });

  assert.equal(res.statusCode, 403);
  assert.equal(user.role, "user");
});

test("the update response never includes a password hash", async () => {
  const user = createUser();
  const { res } = await updateWithUser({
    user,
    body: { email: user.email, role: "moderator" },
  });

  assert.equal(res.statusCode, 200);
  assert.equal("password" in res.payload.user, false);
});

test("updated moderator skills remain eligible for deterministic assignment", async () => {
  const moderator = createUser({
    _id: "moderator-python",
    role: "moderator",
    skills: ["Python", "Machine Learning"],
  });
  const { assignee } = selectAssignee(
    [moderator, { _id: "admin-one", role: "admin", skills: [] }],
    ["python", "machine learning"]
  );

  assert.equal(assignee._id, "moderator-python");
});
