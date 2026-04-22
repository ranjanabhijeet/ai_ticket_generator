import { createAgent, gemini } from "@inngest/agent-kit";

const CANDIDATE_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"];
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
  { skill: "React", keywords: ["react", "jsx", "component", "hook"] },
  { skill: "JavaScript", keywords: ["javascript", "js", "node"] },
  { skill: "TypeScript", keywords: ["typescript", "ts"] },
  { skill: "MongoDB", keywords: ["mongo", "mongoose"] },
  { skill: "Express", keywords: ["express", "api", "route"] },
  { skill: "Authentication", keywords: ["jwt", "token", "login", "signup", "auth"] },
  { skill: "CSS", keywords: ["css", "tailwind", "daisyui", "style", "ui"] },
];

const parseJsonFromModelOutput = (raw) => {
  if (!raw || typeof raw !== "string") {
    return null;
  }

  const fenced = raw.match(/```json\s*([\s\S]*?)\s*```/i);
  const objectLike = raw.match(/\{[\s\S]*\}/);
  const jsonString = fenced ? fenced[1] : objectLike ? objectLike[0] : raw.trim();
  const parsed = JSON.parse(jsonString);

  return {
    summary: parsed.summary || "",
    priority: ["low", "medium", "high"].includes(parsed.priority)
      ? parsed.priority
      : "medium",
    helpfulNotes: parsed.helpfulNotes || "",
    relatedSkills: Array.isArray(parsed.relatedSkills)
      ? parsed.relatedSkills
      : [],
  };
};

const inferRelatedSkills = (title = "", description = "") => {
  const text = `${title} ${description}`.toLowerCase();
  const skills = [];

  for (const { skill, keywords } of SKILL_HINTS) {
    if (keywords.some((keyword) => text.includes(keyword))) {
      skills.push(skill);
    }
  }

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

const buildFallbackAnalysis = (ticket) => {
  const title = ticket?.title || "";
  const description = ticket?.description || "";
  const relatedSkills = inferRelatedSkills(title, description);
  const priority = inferPriority(title, description);

  return {
    summary: `Ticket reports: ${title || "an issue"}${description ? ` - ${description}` : ""}`,
    priority,
    helpfulNotes:
      "AI response was unavailable, so this is an auto-generated fallback. Reproduce the issue, capture exact error logs, verify recent changes, and isolate whether the problem is frontend, backend, or integration. Add detailed steps to reproduce and related logs before assignment.",
    relatedSkills,
  };
};

const analyzeTicket = async (ticket) => {
  const fallback = buildFallbackAnalysis(ticket);

  if (!process.env.GEMINI_API_KEY) {
    console.warn("⚠️ GEMINI_API_KEY is not configured; using fallback analysis");
    return fallback;
  }

  for (const modelName of CANDIDATE_MODELS) {
    try {
      const supportAgent = createAgent({
        model: gemini({
          model: modelName,
          apiKey: process.env.GEMINI_API_KEY,
          defaultParameters: {
            generationConfig: {
              responseMimeType: "application/json",
            },
          },
        }),
        name: "AI Ticket Triage Assistant",
        system: `You are an expert AI assistant that processes technical support tickets. 

Your job is to:
1. Summarize the issue.
2. Estimate its priority.
3. Provide helpful notes and resource links for human moderators.
4. List relevant technical skills required.

IMPORTANT:
- Respond with *only* valid raw JSON.
- Do NOT include markdown, code fences, comments, or any extra formatting.
- The format must be a raw JSON object.

Repeat: Do not wrap your output in markdown or code fences.`,
      });

      const response =
        await supportAgent.run(`You are a ticket triage agent. Only return a strict JSON object with no extra text, headers, or markdown.
        
Analyze the following support ticket and provide a JSON object with:

- summary: A short 1-2 sentence summary of the issue.
- priority: One of "low", "medium", or "high".
- helpfulNotes: A detailed technical explanation that a moderator can use to solve this issue. Include useful external links or resources if possible.
- relatedSkills: An array of relevant skills required to solve the issue (e.g., ["React", "MongoDB"]).

Respond ONLY in this JSON format and do not include any other text or markdown in the answer:

{
"summary": "Short summary of the ticket",
"priority": "high",
"helpfulNotes": "Here are useful tips...",
"relatedSkills": ["React", "Node.js"]
}

---

Ticket information:

- Title: ${ticket.title}
- Description: ${ticket.description}`);

      const raw =
        response?.output?.[0]?.content ||
        response?.output?.[0]?.context ||
        "";
      const parsed = parseJsonFromModelOutput(raw);
      if (parsed) {
        return {
          ...fallback,
          ...parsed,
          helpfulNotes: parsed.helpfulNotes || fallback.helpfulNotes,
          relatedSkills:
            parsed.relatedSkills && parsed.relatedSkills.length
              ? parsed.relatedSkills
              : fallback.relatedSkills,
        };
      }

      console.warn(`⚠️ AI returned invalid JSON with model ${modelName}`);
    } catch (e) {
      console.warn(`⚠️ AI inference failed with model ${modelName}: ${e.message}`);
    }
  }

  return fallback;
};

export default analyzeTicket;
