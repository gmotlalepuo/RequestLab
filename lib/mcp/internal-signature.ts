import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { HttpError } from "@/lib/security/http";

const MAX_CLOCK_SKEW_SECONDS = 60;

export function verifyMcpSignature(rawBody: string, timestampValue: string | null, signatureValue: string | null) {
  const secret = process.env.MCP_INTERNAL_SIGNING_SECRET;
  if (!secret || secret.length < 32) throw new HttpError(503, "MCP internal signing is not configured.");
  if (!timestampValue || !/^\d{10}$/.test(timestampValue) || !signatureValue || !/^[a-f0-9]{64}$/i.test(signatureValue)) {
    throw new HttpError(401, "The MCP request signature is invalid.");
  }
  const timestamp = Number(timestampValue);
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > MAX_CLOCK_SKEW_SECONDS) {
    throw new HttpError(401, "The MCP request signature has expired.");
  }
  const expected = createHmac("sha256", secret).update(`${timestampValue}.${rawBody}`).digest("hex");
  const expectedBytes = Buffer.from(expected, "hex");
  const suppliedBytes = Buffer.from(signatureValue, "hex");
  if (expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) {
    throw new HttpError(401, "The MCP request signature is invalid.");
  }
}
