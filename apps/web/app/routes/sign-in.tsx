import { SignIn } from "@clerk/react-router";
import type { Route } from "./+types/sign-in";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Sign in — Batutô" }];
}

export default function SignInPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center">
      <SignIn />
    </main>
  );
}
