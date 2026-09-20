import { Show, SignInButton, UserButton } from "@clerk/react-router";
import { Link } from "react-router";
import { Button } from "~/components/ui/button";
import type { Route } from "./+types/home";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Batutô" }, { name: "description", content: "Batutô" }];
}

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">Batutô</h1>
      <Button>Shadcn is wired up</Button>
      <Show when="signed-out">
        <SignInButton />
      </Show>
      <Show when="signed-in">
        <div className="flex items-center gap-2">
          <UserButton />
          <Link to="/dashboard" className="underline">
            Dashboard
          </Link>
        </div>
      </Show>
    </main>
  );
}
