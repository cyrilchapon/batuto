import { contract } from "@batuto/contract";
import { createORPCClient } from "@orpc/client";
import type { ContractRouterClient } from "@orpc/contract";
import { OpenAPILink } from "@orpc/openapi-client/fetch";
import { createORPCReactQueryUtils } from "@orpc/react-query";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

const link = new OpenAPILink(contract, { url: apiUrl });

const client: ContractRouterClient<typeof contract> = createORPCClient(link);

export const orpc = createORPCReactQueryUtils(client);
