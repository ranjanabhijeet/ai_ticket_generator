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

const getGeminiApiKey = () =>
  process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_KEY;

const isQuotaExceededError = (error) => {
  const message = `${error?.message || ""} ${error?.status || ""}`.toLowerCase();
  return message.includes("429") || message.includes("quota");
};

const buildPrompt = (ticket) => `You are an expert technical support ticket triage assistant.

Analyze the following support ticket and respond only with a valid JSON object.

The JSON object must use this shape:
{
  "summary": "Short 1-2 sentence summary of the ticket",
  "priority": "low | medium | high",
  "helpfulNotes": "Detailed technical explanation for a human moderator. Include practical debugging steps and useful resources if possible.",
  "relatedSkills": ["Relevant skill names"]
}

Ticket information:
- Title: ${ticket.title}
- Description: ${ticket.description}`;

const extractTextFromGeminiResponse = (data) =>
  data?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim() || "";

const callGemini = async ({ apiKey, modelName, ticket }) => {
  const url = new URL(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`
  );
  url.searchParams.set("key", apiKey);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: buildPrompt(ticket) }],
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

  const raw = extractTextFromGeminiResponse(data);
  return parseJsonFromModelOutput(raw);
};

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

const buildFallbackAnalysis = (ticket, reason = "AI response was unavailable") => {
  const title = ticket?.title || "";
  const description = ticket?.description || "";
  const relatedSkills = inferRelatedSkills(title, description);
  const priority = inferPriority(title, description);

  return {
    summary: `Ticket reports: ${title || "an issue"}${description ? ` - ${description}` : ""}`,
    priority,
    helpfulNotes:
      `${reason}, so this is an auto-generated fallback. Reproduce the issue, capture exact error logs, verify recent changes, and isolate whether the problem is frontend, backend, or integration. Add detailed steps to reproduce and related logs before assignment.`,
    relatedSkills,
  };
};

const analyzeTicket = async (ticket) => {
  const geminiApiKey = getGeminiApiKey();
  const fallback = buildFallbackAnalysis(ticket);

  if (!geminiApiKey) {
    console.warn(
      "⚠️ GEMINI_API_KEY or GOOGLE_GEMINI_KEY is not configured; using fallback analysis"
    );
    return fallback;
  }

  for (const modelName of CANDIDATE_MODELS) {
    try {
      const parsed = await callGemini({
        apiKey: geminiApiKey,
        modelName,
        ticket,
      });

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
      if (isQuotaExceededError(e)) {
        return buildFallbackAnalysis(
          ticket,
          "Gemini API quota was exceeded for the configured Google project"
        );
      }
    }
  }

  return fallback;
};

export default analyzeTicket;
