import type { IncomingMessage } from "node:http";
import { type AuthResult, authenticateRequest } from "@batuto/auth";
import { toStandardUrl } from "@orpc/standard-server-node";
import { authClient } from "./auth.js";

export type AppContext = {
  auth: AuthResult;
};

const toFetchHeaders = (nodeHeaders: IncomingMessage["headers"]): Headers => {
  const headers = new Headers();

  for (const [key, value] of Object.entries(nodeHeaders)) {
    if (value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) {
      headers.append(key, v);
    }
  }

  return headers;
};

export const createContext = async (req: IncomingMessage): Promise<AppContext> => {
  const request = new Request(toStandardUrl(req), {
    method: req.method,
    headers: toFetchHeaders(req.headers),
  });

  return { auth: await authenticateRequest(authClient, request) };
};
