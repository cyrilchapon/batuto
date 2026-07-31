import { contract } from "@batuto/contract";
import { createORPCClient } from "@orpc/client";
import type { ContractRouterClient } from "@orpc/contract";
import { OpenAPILink } from "@orpc/openapi-client/fetch";
import { createORPCReactQueryUtils } from "@orpc/react-query";
import { appEnv } from "../env.js";

// Lets a caller attach a fresh Clerk session token per request (see
// dashboard.tsx's privateHello/boom calls) without threading it through
// the link's construction, which happens once at module load.
export type OrpcClientContext = { token?: string };

const link = new OpenAPILink<OrpcClientContext>(contract, {
  url: appEnv.VITE_API_URL,
  headers: (options) =>
    options.context?.token ? { authorization: `Bearer ${options.context.token}` } : {},
});

const client: ContractRouterClient<typeof contract, OrpcClientContext> = createORPCClient(link);

export const orpc = createORPCReactQueryUtils(client);
export const orpcClient = client;
