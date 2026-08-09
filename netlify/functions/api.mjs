import { getStore as getBlobStore } from "@netlify/blobs";
import { getMemoryStore } from "../../src/adapters/memory.mjs";
import { createMemoryStore } from "../../src/core/memoryStore.mjs";
import { asLinosError, LinosError } from "../../src/core/errors.mjs";
import { identityFromRequest, requestedPropertyId } from "../../src/core/identity.mjs";
import { HotelService } from "../../src/core/service.mjs";

const headers = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff"
};

function response(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function parseBody(event) {
  if (!event.body) return {};
  try {
    return JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body);
  } catch {
    throw new LinosError(400, "ERR-HTTP-001", "The request body is not valid JSON.");
  }
}

function routePath(event) {
  return String(event.path || "")
    .replace(/^\/\.netlify\/functions\/api/, "")
    .replace(/^\/api/, "")
    .replace(/\/$/, "") || "/";
}

let runtimeStore = getMemoryStore();
let persistencePromise = null;
let persistenceDisabled = false;

function hydrateStore(snapshot) {
  const store = createMemoryStore();
  for (const [name, rows] of Object.entries(snapshot || {})) {
    if (!Array.isArray(store.raw[name]) || !Array.isArray(rows)) continue;
    store.raw[name].push(...rows);
  }
  return store;
}

function getService() {
  return new HotelService(runtimeStore);
}

function getPersistentStore() {
  return getBlobStore("masaero-linos-hotel-state");
}

async function loadPersistentState() {
  if (persistenceDisabled) return;
  if (!persistencePromise) {
    persistencePromise = (async () => {
      try {
        const snapshot = await getPersistentStore().get("state", { type: "json" });
        if (snapshot && typeof snapshot === "object") runtimeStore = hydrateStore(snapshot);
      } catch (error) {
        persistenceDisabled = true;
        console.warn("Persistent workspace storage is unavailable; using runtime storage.", error?.message || error);
      }
    })();
  }
  await persistencePromise;
}

async function persistState() {
  if (persistenceDisabled) return;
  try {
    await getPersistentStore().setJSON("state", runtimeStore.snapshot());
  } catch (error) {
    persistenceDisabled = true;
    console.warn("Could not persist workspace state.", error?.message || error);
  }
}

async function sendFeedbackToLinear(feedback) {
  const apiKey = String(process.env.LINEAR_API_KEY || "").trim();
  const teamId = String(process.env.LINEAR_TEAM_ID || "").trim();
  const projectId = String(process.env.LINEAR_PROJECT_ID || "").trim();
  if (!apiKey || !teamId || !projectId) return { configured: false };

  const response = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      authorization: apiKey,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      query: `mutation CreateFeedback($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue { id identifier url }
        }
      }`,
      variables: {
        input: {
          teamId,
          projectId,
          title: `[User feedback] ${feedback.category}`,
          description: `**From:** ${feedback.user_email}\n**Property:** ${feedback.property_id}\n**Category:** ${feedback.category}\n\n${feedback.message}`
        }
      }
    })
  });
  const payload = await response.json();
  const issue = payload?.data?.issueCreate?.issue;
  if (!response.ok || payload?.errors?.length || !issue) {
    throw new Error(payload?.errors?.[0]?.message || `Linear request failed (${response.status})`);
  }
  return { configured: true, issue };
}

export async function handler(event, context) {
  if (event.httpMethod === "OPTIONS") return response(204, {});
  try {
    await loadPersistentState();
    const path = routePath(event);
    if (event.httpMethod === "GET" && path === "/health") {
      return response(200, { ok: true, service: "linos-hotel", phase: 1 });
    }

    if (event.httpMethod === "POST" && path === "/auth/register") {
      const body = parseBody(event);
      const service = getService();
      const result = service.createTrialAccount(body);
      await persistState();
      return response(200, result);
    }

    if (event.httpMethod === "POST" && path === "/auth/local") {
      const body = parseBody(event);
      const propertyCountBefore = runtimeStore.list("properties").length;
      const result = getService().authenticateLocal(body.email, body.password);
      // Only persist when demo seed ran; plain sign-in must stay fast on Netlify.
      if (runtimeStore.list("properties").length !== propertyCountBefore) await persistState();
      return response(200, result);
    }

    const identity = identityFromRequest(event, context);
    const service = getService();
    const body = event.httpMethod === "GET" || event.httpMethod === "HEAD" ? {} : parseBody(event);
    const query = event.queryStringParameters || {};
    if (!query.propertyId) query.propertyId = requestedPropertyId(event);

    if (event.httpMethod === "POST" && path === "/feedback") {
      const result = service.submitFeedback(identity, body);
      try {
        const linear = await sendFeedbackToLinear(result.feedback);
        if (linear.issue) {
          result.feedback = runtimeStore.update("feedback", result.feedback.id, {
            status: "sent_to_linear",
            linear_issue_id: linear.issue.identifier || linear.issue.id,
            linear_issue_url: linear.issue.url || null
          });
        }
        result.linear = linear;
      } catch (error) {
        result.linear = { configured: true, sent: false, error: error.message };
      }
      await persistState();
      return response(200, result);
    }

    const result = service.handle(identity, event.httpMethod, path, body, query, event.headers || {});
    if (!["GET", "HEAD"].includes(event.httpMethod)) await persistState();
    return response(200, result);
  } catch (error) {
    const linos = asLinosError(error);
    return response(linos.status || 500, linos.toJSON());
  }
}
