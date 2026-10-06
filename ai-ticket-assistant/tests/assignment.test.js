import assert from "node:assert/strict";
import test from "node:test";
import { selectAssignee } from "../utils/assignment.js";

const moderators = [
  {
    _id: "moderator-react",
    role: "moderator",
    skills: ["React", "JavaScript", "Full Stack"],
  },
  {
    _id: "moderator-python",
    role: "moderator",
    skills: ["Python", "Machine Learning"],
  },
  { _id: "admin-fallback", role: "admin", skills: [] },
];

test("assigns Python and Machine Learning tickets to the Python moderator", () => {
  const { assignee } = selectAssignee(moderators, ["Python", "Machine Learning"]);

  assert.equal(assignee._id, "moderator-python");
});

test("assigns React and JavaScript tickets to the React moderator", () => {
  const { assignee } = selectAssignee(moderators, ["React", "JavaScript"]);

  assert.equal(assignee._id, "moderator-react");
});

test("prefers two skill matches over one", () => {
  const { assignee } = selectAssignee(
    [
      { _id: "one-match", role: "moderator", skills: ["Python"] },
      {
        _id: "two-matches",
        role: "moderator",
        skills: ["Python", "Machine Learning"],
      },
    ],
    ["Python", "Machine Learning"]
  );

  assert.equal(assignee._id, "two-matches");
});

test("uses the lowest-id admin as a deterministic fallback when no moderator matches", () => {
  const { assignee, assignmentMode } = selectAssignee(
    [
      { _id: "moderator-react", role: "moderator", skills: ["React"] },
      { _id: "admin-z", role: "admin", skills: [] },
      { _id: "admin-a", role: "admin", skills: [] },
    ],
    ["Python"]
  );

  assert.equal(assignee._id, "admin-a");
  assert.equal(assignmentMode, "admin-fallback");
});

test("uses the existing admin fallback when AI returns no related skills", () => {
  const { assignee, assignmentMode } = selectAssignee(
    [
      { _id: "moderator-react", role: "moderator", skills: ["React"] },
      { _id: "admin-fallback", role: "admin", skills: [] },
    ],
    []
  );

  assert.equal(assignee._id, "admin-fallback");
  assert.equal(assignmentMode, "admin-fallback");
});

test("normalizes capitalization and whitespace without matching unrelated skills", () => {
  const { assignee, candidateScores } = selectAssignee(
    [
      {
        _id: "normalized-match",
        role: "moderator",
        skills: [" python ", "machine   learning"],
      },
      { _id: "unrelated", role: "moderator", skills: ["Pythonista"] },
    ],
    ["Python", "Machine Learning"]
  );

  assert.equal(assignee._id, "normalized-match");
  assert.equal(candidateScores.find((candidate) => candidate.moderator._id === "normalized-match").score, 2);
  assert.equal(candidateScores.find((candidate) => candidate.moderator._id === "unrelated").score, 0);
});
