import { normalizeSkills } from "./skills.js";

export { normalizeSkills };

const compareById = (left, right) =>
  String(left?._id || "").localeCompare(String(right?._id || ""));

export const selectAssignee = (users, requiredSkills) => {
  const normalizedRequiredSkills = normalizeSkills(requiredSkills);
  const moderators = (Array.isArray(users) ? users : [])
    .filter((user) => user.role === "moderator")
    .sort(compareById);
  const candidateScores = moderators.map((moderator) => {
    const moderatorSkills = new Set(normalizeSkills(moderator.skills));
    const score = normalizedRequiredSkills.filter((skill) =>
      moderatorSkills.has(skill)
    ).length;

    return { moderator, score };
  });
  const bestMatch = candidateScores
    .filter((candidate) => candidate.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score || compareById(left.moderator, right.moderator)
    )[0];

  if (bestMatch) {
    return {
      assignee: bestMatch.moderator,
      candidateScores,
      normalizedRequiredSkills,
      assignmentMode: "skill-match",
    };
  }

  const fallbackAdmin = (Array.isArray(users) ? users : [])
    .filter((user) => user.role === "admin")
    .sort(compareById)[0];

  return {
    assignee: fallbackAdmin || null,
    candidateScores,
    normalizedRequiredSkills,
    assignmentMode: fallbackAdmin ? "admin-fallback" : "unassigned",
  };
};
