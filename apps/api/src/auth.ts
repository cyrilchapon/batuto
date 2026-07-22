import { type AuthClient, createAuthClient } from "@batuto/auth";
import { appEnv } from "./env.js";

export const authClient: AuthClient = createAuthClient(appEnv);
