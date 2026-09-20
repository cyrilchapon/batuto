// Intentionally empty. The bootstrap proof's helloWorldDto went with the proof
// (BAT-38) and the first real shapes arrive with BAT-42, so `zod` and the
// package's own tests are gone for now too — hence `--passWithNoTests`. The
// package itself stays: it is the head of the DTOs -> contract -> apps chain
// described in .agents/context/engineering/overview/monorepo-layout.md, and
// its build/declaration/typecheck wiring is worth more than the few lines it
// currently holds.
export {};
