import { useQuery } from "@tanstack/react-query";
import { Button } from "~/components/ui/button";
import { orpc } from "~/lib/orpc";
import type { Route } from "./+types/home";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Batutô" }, { name: "description", content: "Batutô" }];
}

export default function Home() {
  const { data, isPending, error } = useQuery(
    orpc.hello.queryOptions({ input: { name: "Batuto" } }),
  );

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">Batutô</h1>
      <Button>Shadcn is wired up</Button>
      <p className="text-muted-foreground">
        {isPending && "Loading..."}
        {error && `Error: ${error.message}`}
        {data?.message}
      </p>
    </main>
  );
}
