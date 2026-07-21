import type { AuthClient } from "./client.js";

export type AuthResult = {
  userId: string | null;
};

export const authenticateRequest = async (
  client: AuthClient,
  request: Request,
): Promise<AuthResult> => {
  const requestState = await client.authenticateRequest(request);
  const auth = requestState.toAuth();

  return { userId: auth?.userId ?? null };
};
