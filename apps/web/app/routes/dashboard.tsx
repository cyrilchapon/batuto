import { useAuth } from "@clerk/react-router";
import { getAuth } from "@clerk/react-router/server";
import { useQuery } from "@tanstack/react-query";
import { redirect } from "react-router";
import { orpc, orpcClient } from "~/lib/orpc";
import type { Route } from "./+types/dashboard";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Dashboard — Batutô" }];
}

export async function loader(args: Route.LoaderArgs) {
  const { userId } = await getAuth(args);

  if (!userId) {
    throw redirect("/sign-in");
  }

  return { userId };
}

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const { getToken } = useAuth();

  // The one authenticated call the app makes so far, and the worked example of
  // attaching a fresh Clerk token per request — see
  // .agents/context/engineering/modules/api-procedures.md. The token has to be
  // awaited inside queryFn rather than passed to queryOptions' `context`, which
  // is a plain value resolved when the options are built, not per request.
  const ping = useQuery({
    queryKey: orpc.privatePing.key(),
    queryFn: async () => {
      const token = await getToken();
      return orpcClient.privatePing(undefined, { context: { token: token ?? undefined } });
    },
  });

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="text-muted-foreground">Signed in as {loaderData.userId}</p>

      <p className="text-muted-foreground">
        {ping.isPending && "Checking the API..."}
        {ping.isError && <span className="text-destructive">Error: {ping.error.message}</span>}
        {ping.data && `API says: ${ping.data.userId}`}
      </p>
    </main>
  );
}
