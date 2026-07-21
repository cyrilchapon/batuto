import { contract } from "@batuto/contract";
import { createORPCClient } from "@orpc/client";
import type { ContractRouterClient } from "@orpc/contract";
import { OpenAPILink } from "@orpc/openapi-client/fetch";
import { createORPCReactQueryUtils } from "@orpc/react-query";
import { appEnv } from "../env.js";

const link = new OpenAPILink(contract, { url: appEnv.VITE_API_URL });

const client: ContractRouterClient<typeof contract> = createORPCClient(link);

export const orpc = createORPCReactQueryUtils(client);
