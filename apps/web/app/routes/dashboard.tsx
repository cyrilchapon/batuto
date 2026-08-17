import { useAuth } from "@clerk/react-router";
import { getAuth } from "@clerk/react-router/server";
import { useMutation } from "@tanstack/react-query";
import { redirect } from "react-router";
import { Button } from "~/components/ui/button";
import { orpcClient } from "~/lib/orpc";
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

  // BAT-23's full-stack proof: an authenticated request through the whole
  // chain (oRPC client -> contract -> Express -> Prisma -> Postgres),
  // read/writing a real row and reflecting it back here.
  const privateHello = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return orpcClient.privateHello(
        { name: "Batuto" },
        { context: { token: token ?? undefined } },
      );
    },
  });

  // The other half of the same proof: an intentional server-side error,
  // reported to AppSignal (see apps/api/src/router.ts's boom handler).
  const boom = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return orpcClient.boom(undefined, { context: { token: token ?? undefined } });
    },
  });

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="text-muted-foreground">Signed in as {loaderData.userId}</p>

      <div className="flex flex-col items-center gap-2">
        <Button onClick={() => privateHello.mutate()} disabled={privateHello.isPending}>
          Trigger authenticated round trip
        </Button>
        {privateHello.data && <p className="text-muted-foreground">{privateHello.data.message}</p>}
        {privateHello.isError && (
          <p className="text-destructive">Error: {privateHello.error.message}</p>
        )}
      </div>

      <div className="flex flex-col items-center gap-2">
        <Button variant="destructive" onClick={() => boom.mutate()} disabled={boom.isPending}>
          Trigger intentional error
        </Button>
        {boom.isError && <p className="text-destructive">Error: {boom.error.message}</p>}
      </div>
    </main>
  );
}
