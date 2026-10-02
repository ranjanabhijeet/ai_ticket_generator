import assert from "node:assert/strict";
import test from "node:test";
import {
  createTicketAnalyzer,
  parseTicketAnalysis,
} from "../utils/ai.js";
import { selectAssignee } from "../utils/assignment.js";

const ticket = {
  title: "Deployment help",
  description: "My application fails after deployment.",
};

const analysisJson = (overrides = {}) =>
  JSON.stringify({
    priority: "medium",
    relatedSkills: ["React", "JavaScript"],
    helpfulNotes: "Review the failing build output and browser errors before checking the deployment configuration.",
    ...overrides,
  });

test("accepts a valid Gemini JSON analysis", () => {
  assert.deepEqual(parseTicketAnalysis(analysisJson()), {
    priority: "medium",
    relatedSkills: ["React", "JavaScript"],
    helpfulNotes: "Review the failing build output and browser errors before checking the deployment configuration.",
  });
});

test("accepts Gemini JSON inside a Markdown code fence", () => {
  const result = parseTicketAnalysis(`\n\`\`\`json\n${analysisJson()}\n\`\`\`\n`);

  assert.equal(result.priority, "medium");
  assert.deepEqual(result.relatedSkills, ["React", "JavaScript"]);
});

test("removes duplicate skills case-insensitively", () => {
  const result = parseTicketAnalysis(
    analysisJson({ relatedSkills: ["React", " react ", "REACT", "JavaScript"] })
  );

  assert.deepEqual(result.relatedSkills, ["React", "JavaScript"]);
});

test("keeps the first normalized skill capitalization", () => {
  const result = parseTicketAnalysis(
    analysisJson({ relatedSkills: ["  pYtHoN  ", "MACHINE   LEARNING"] })
  );

  assert.deepEqual(result.relatedSkills, ["pYtHoN", "MACHINE LEARNING"]);
});

test("removes empty skill values", () => {
  const result = parseTicketAnalysis(
    analysisJson({ relatedSkills: ["React", "", "   ", "JavaScript"] })
  );

  assert.deepEqual(result.relatedSkills, ["React", "JavaScript"]);
});

test("normalizes safe priority capitalization and rejects invalid values", () => {
  assert.equal(
    parseTicketAnalysis(analysisJson({ priority: " HIGH " })).priority,
    "high"
  );
  assert.throws(
    () => parseTicketAnalysis(analysisJson({ priority: "urgent" })),
    /priority must be low, medium, or high/
  );
});

test("rejects analyses with a required field missing", () => {
  assert.throws(
    () =>
      parseTicketAnalysis(
        JSON.stringify({
          priority: "medium",
          relatedSkills: ["React"],
        })
      ),
    /helpfulNotes is required/
  );
});

test("rejects malformed Gemini JSON", () => {
  assert.throws(() => parseTicketAnalysis("{ priority: medium }"), /not valid JSON/);
});

test("Python and Machine Learning metadata selects the best matching moderator", () => {
  const analysis = parseTicketAnalysis(
    analysisJson({
      relatedSkills: ["Python", "Machine Learning"],
      helpfulNotes: "Inspect the Python traceback, model inputs, package versions, and production runtime configuration.",
    })
  );
  const { assignee } = selectAssignee(
    [
      { _id: "react-mod", role: "moderator", skills: ["React", "JavaScript"] },
      { _id: "python-mod", role: "moderator", skills: ["Python", "Machine Learning"] },
    ],
    analysis.relatedSkills
  );

  assert.equal(assignee._id, "python-mod");
});

test("React and JavaScript metadata selects the best matching moderator", () => {
  const analysis = parseTicketAnalysis(analysisJson());
  const { assignee } = selectAssignee(
    [
      { _id: "react-mod", role: "moderator", skills: ["React", "JavaScript"] },
      { _id: "python-mod", role: "moderator", skills: ["Python", "Machine Learning"] },
    ],
    analysis.relatedSkills
  );

  assert.equal(assignee._id, "react-mod");
});

test("Gemini failures throw in strict production mode", async () => {
  const analyzer = createTicketAnalyzer({
    getApiKey: () => "test-key",
    request: async () => {
      throw new Error("Gemini unavailable");
    },
  });

  await assert.rejects(
    analyzer(ticket, { fallbackOnError: false }),
    /Gemini unavailable/
  );
});

test("demo analysis uses its separate fallback after a Gemini failure", async () => {
  const analyzer = createTicketAnalyzer({
    getApiKey: () => "test-key",
    request: async () => {
      throw new Error("Gemini unavailable");
    },
  });

  const result = await analyzer({
    title: "Python machine learning project",
    description: "The deployed model is failing with a Python traceback.",
  });

  assert.deepEqual(result.relatedSkills, ["Python", "Machine Learning"]);
  assert.match(result.helpfulNotes, /demo mode/i);
});
