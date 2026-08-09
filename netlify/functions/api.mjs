import { getMemoryStore } from "../../src/adapters/memory.mjs";
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

function getService() {
  return new HotelService(getMemoryStore());
}

export async function handler(event, context) {
  if (event.httpMethod === "OPTIONS") return response(204, {});
  try {
    const path = routePath(event);
    if (event.httpMethod === "GET" && path === "/health") {
      return response(200, { ok: true, service: "linos-hotel", phase: 1 });
    }

    if (event.httpMethod === "POST" && path === "/auth/local") {
      const body = parseBody(event);
      const email = String(body.email || "").trim().toLowerCase();
      if (!email) throw new LinosError(400, "ERR-AUTH-010", "Email is required.");
      const service = getService();
      service.ensureDemo();
      const session = service.session({ email, sub: `local:${email}`, source: "local-login" }, "");
      return response(200, {
        ok: true,
        token: `local:${email}`,
        session
      });
    }

    const identity = identityFromRequest(event, context);
    const service = getService();
    const body = event.httpMethod === "GET" || event.httpMethod === "HEAD" ? {} : parseBody(event);
    const query = event.queryStringParameters || {};
    if (!query.propertyId) query.propertyId = requestedPropertyId(event);

    const result = service.handle(identity, event.httpMethod, path, body, query, event.headers || {});
    return response(200, result);
  } catch (error) {
    const linos = asLinosError(error);
    return response(linos.status || 500, linos.toJSON());
  }
}
