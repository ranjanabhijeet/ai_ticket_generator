import { normalizeSkill, normalizeSkillList } from "./skills.js";

export const TICKET_PRIORITIES = ["low", "medium", "high"];

const getGeminiModel = () => process.env.GEMINI_MODEL || "gemini-2.5-flash";
const getGeminiApiKey = () => process.env.GEMINI_API_KEY;

const PRIORITY_HIGH_HINTS = [
  "production",
  "critical",
  "outage",
  "down",
  "500",
  "payment",
  "security",
];
const PRIORITY_MEDIUM_HINTS = ["error", "bug", "failed", "issue", "not working"];
const SKILL_HINTS = [
  { skill: "Python", keywords: ["python", "django", "flask", "fastapi"] },
  {
    skill: "Machine Learning",
    keywords: [
      "machine learning",
      "tensorflow",
      "pytorch",
      "scikit-learn",
      "model training",
    ],
  },
  { skill: "React", keywords: ["react", "jsx", "component", "hook"] },
  { skill: "JavaScript", keywords: ["javascript", "node.js", "node"] },
  { skill: "TypeScript", keywords: ["typescript"] },
  { skill: "MongoDB", keywords: ["mongo", "mongoose"] },
  { skill: "Express", keywords: ["express", "api", "route"] },
  { skill: "Authentication", keywords: ["jwt", "token", "login", "signup", "auth"] },
  { skill: "CSS", keywords: ["css", "tailwind", "daisyui", "style", "ui"] },
];

const validationError = (message) =>
  new Error(`Invalid Gemini ticket analysis: ${message}`);

export const buildTicketAnalysisPrompt = (ticket) => `You are an expert technical support ticket triage assistant.

Analyze the support ticket below. Return only a valid JSON object with exactly these fields:
{
  "priority": "low | medium | high",
  "relatedSkills": ["Technical skills required to resolve the ticket"],
  "helpfulNotes": "Specific technical guidance for the assigned moderator"
}

Rules:
- Select technical skills that are actually needed to solve the problem. For example, Python machine-learning issues should include Python and Machine Learning; React JavaScript issues should include React and JavaScript.
- Set priority to only low, medium, or high.
- Write helpfulNotes with concrete investigation, debugging, and solution direction based on the ticket. Do not return a generic error message.
- Do not include Markdown, commentary, or fields outside the JSON object.

Ticket title: ${JSON.stringify(String(ticket?.title || ""))}
Ticket description: ${JSON.stringify(String(ticket?.description || ""))}`;

export const extractTextFromGeminiResponse = (data) =>
  data?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim() || "";

const stripJsonCodeFence = (raw) => {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
};

const normalizePriority = (priority) => {
  if (typeof priority !== "string") {
    throw validationError("priority must be a string");
  }

  const normalized = priority.trim().toLowerCase();
  if (!TICKET_PRIORITIES.includes(normalized)) {
    throw validationError("priority must be low, medium, or high");
  }

  return normalized;
};

const normalizeRelatedSkills = (relatedSkills) => {
  if (!Array.isArray(relatedSkills)) {
    throw validationError("relatedSkills must be an array");
  }

  if (relatedSkills.some((skill) => typeof skill !== "string")) {
    throw validationError("relatedSkills must contain only strings");
  }

  return normalizeSkillList(
    relatedSkills.filter((skill) => Boolean(normalizeSkill(skill)))
  );
};

const normalizeHelpfulNotes = (helpfulNotes) => {
  if (typeof helpfulNotes !== "string" || !helpfulNotes.trim()) {
    throw validationError("helpfulNotes must be a non-empty string");
  }

  return helpfulNotes.trim();
};

export const validateTicketAnalysis = (analysis) => {
  if (!analysis || typeof analysis !== "object" || Array.isArray(analysis)) {
    throw validationError("response must be a JSON object");
  }

  if (!("priority" in analysis)) {
    throw validationError("priority is required");
  }
  if (!("relatedSkills" in analysis)) {
    throw validationError("relatedSkills is required");
  }
  if (!("helpfulNotes" in analysis)) {
    throw validationError("helpfulNotes is required");
  }

  return {
    priority: normalizePriority(analysis.priority),
    relatedSkills: normalizeRelatedSkills(analysis.relatedSkills),
    helpfulNotes: normalizeHelpfulNotes(analysis.helpfulNotes),
  };
};

export const parseTicketAnalysis = (raw) => {
  if (!raw || typeof raw !== "string") {
    throw validationError("response is empty");
  }

  let parsed;
  try {
    parsed = JSON.parse(stripJsonCodeFence(raw));
  } catch {
    throw validationError("response is not valid JSON");
  }

  return validateTicketAnalysis(parsed);
};

export const callGemini = async ({ apiKey, modelName, ticket, request = fetch }) => {
  const url = new URL(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`
  );
  url.searchParams.set("key", apiKey);

  const response = await request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: buildTicketAnalysisPrompt(ticket) }],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      data?.error?.message || `Gemini API request failed with ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return parseTicketAnalysis(extractTextFromGeminiResponse(data));
};

const inferRelatedSkills = (title = "", description = "") => {
  const text = `${title} ${description}`.toLowerCase();
  const skills = SKILL_HINTS.filter(({ keywords }) =>
    keywords.some((keyword) => text.includes(keyword))
  ).map(({ skill }) => skill);

  return skills.length ? skills : ["Debugging"];
};

const inferPriority = (title = "", description = "") => {
  const text = `${title} ${description}`.toLowerCase();
  if (PRIORITY_HIGH_HINTS.some((hint) => text.includes(hint))) {
    return "high";
  }
  if (PRIORITY_MEDIUM_HINTS.some((hint) => text.includes(hint))) {
    return "medium";
  }
  return "low";
};

export const buildDemoFallbackAnalysis = (
  ticket,
  reason = "Gemini analysis is unavailable in demo mode"
) =>
  validateTicketAnalysis({
    priority: inferPriority(ticket?.title, ticket?.description),
    relatedSkills: inferRelatedSkills(ticket?.title, ticket?.description),
    helpfulNotes: `${reason}. Reproduce the issue, capture exact error logs, verify recent changes, and investigate the relevant frontend, backend, or deployment components before assignment.`,
  });

export const createTicketAnalyzer = ({
  request = fetch,
  getApiKey = getGeminiApiKey,
  getModel = getGeminiModel,
} = {}) =>
  async (ticket, { fallbackOnError = true } = {}) => {
    const modelName = getModel();
    const geminiApiKey = getApiKey();

    try {
      if (!geminiApiKey) {
        throw new Error("GEMINI_API_KEY is not configured");
      }

      return await callGemini({
        apiKey: geminiApiKey,
        modelName,
        ticket,
        request,
      });
    } catch (error) {
      console.error(`Gemini ticket analysis failed with model ${modelName}: ${error.message}`);

      if (!fallbackOnError) {
        throw error;
      }

      console.warn("Using demo fallback ticket analysis after Gemini failure");
      return buildDemoFallbackAnalysis(ticket);
    }
  };

const analyzeTicket = createTicketAnalyzer();

export default analyzeTicket;
