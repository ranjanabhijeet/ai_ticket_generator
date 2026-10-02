const configuredApiBaseUrl = import.meta.env.VITE_SERVER_URL?.trim();

if (import.meta.env.PROD && !configuredApiBaseUrl) {
  throw new Error("VITE_SERVER_URL is required for production builds");
}

const apiBaseUrl = configuredApiBaseUrl || "http://localhost:10000/api";

export const API_BASE_URL = `${apiBaseUrl.replace(/\/+$/, "").replace(/\/api$/, "")}/api`;
