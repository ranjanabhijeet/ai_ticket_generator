export const normalizeSkill = (skill) =>
  typeof skill === "string" ? skill.trim().replace(/\s+/g, " ") : "";

export const normalizeSkillKey = (skill) => normalizeSkill(skill).toLowerCase();

export const normalizeSkills = (skills) => [
  ...new Set(
    (Array.isArray(skills) ? skills : [])
      .map(normalizeSkillKey)
      .filter(Boolean)
  ),
];

export const normalizeSkillList = (skills) => {
  if (!Array.isArray(skills)) {
    return null;
  }

  const normalizedKeys = new Set();
  const cleanSkills = [];

  for (const skill of skills) {
    const displaySkill = normalizeSkill(skill);
    const skillKey = normalizeSkillKey(skill);

    if (!displaySkill || !skillKey) {
      return null;
    }

    if (!normalizedKeys.has(skillKey)) {
      normalizedKeys.add(skillKey);
      cleanSkills.push(displaySkill);
    }
  }

  return cleanSkills;
};
