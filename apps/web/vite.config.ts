import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
  ssr: {
    // Works around a Clerk/React Router dev-SSR bug where an externalized
    // @clerk/react-router pulls in a second copy of react-router, breaking
    // context-dependent hooks like useNavigate() inside ClerkProvider.
    // https://github.com/clerk/javascript/issues/4826
    noExternal: ["@clerk/react-router"],
  },
});
