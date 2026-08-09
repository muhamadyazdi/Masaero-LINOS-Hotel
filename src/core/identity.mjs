import { LinosError } from "./errors.mjs";

export function identityFromRequest(event, context = {}) {
  const localEmail = String(process.env.LINOS_LOCAL_DEV_EMAIL || "").trim().toLowerCase();
  const authHeader = String(event.headers?.authorization || event.headers?.Authorization || "");
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (bearer.startsWith("local:")) {
    return {
      email: bearer.slice(6).toLowerCase(),
      sub: `local:${bearer.slice(6).toLowerCase()}`,
      source: "local-bearer"
    };
  }

  if (localEmail && process.env.NODE_ENV !== "production") {
    const headerEmail = String(event.headers?.["x-linos-dev-email"] || event.headers?.["X-Linos-Dev-Email"] || "").trim().toLowerCase();
    if (headerEmail) {
      return { email: headerEmail, sub: `dev:${headerEmail}`, source: "dev-header" };
    }
    if (!bearer) {
      return { email: localEmail, sub: `dev:${localEmail}`, source: "dev-env" };
    }
  }

  const netlifyUser = context.clientContext?.user || context.user;
  if (netlifyUser?.email) {
    return {
      email: String(netlifyUser.email).toLowerCase(),
      sub: String(netlifyUser.sub || netlifyUser.id || netlifyUser.email),
      source: "netlify-identity"
    };
  }

  if (bearer && bearer.includes("@")) {
    return { email: bearer.toLowerCase(), sub: `token:${bearer.toLowerCase()}`, source: "email-bearer" };
  }

  throw new LinosError(401, "ERR-AUTH-001", "Sign in is required.");
}

export function requestedPropertyId(event) {
  return String(
    event.queryStringParameters?.propertyId ||
      event.headers?.["x-linos-property-id"] ||
      event.headers?.["X-Linos-Property-Id"] ||
      ""
  ).trim();
}
