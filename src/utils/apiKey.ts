import { createHash } from "node:crypto";
import { Request } from "express";

const hashApiKey = (apiKey: string) => createHash("sha256").update(apiKey).digest("hex");

const getApiKeyHash = (req: Request) => {
  const apiKey = req.get("authorization")?.match(/^Bearer ([a-f0-9]{64})$/i)?.[1];
  return apiKey ? hashApiKey(apiKey) : undefined;
}

export {getApiKeyHash, hashApiKey};
