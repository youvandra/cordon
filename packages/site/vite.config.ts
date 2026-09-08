import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const local = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/**
 * The design system and the fixtures are consumed as source from sibling
 * packages. A `file:` dependency would not survive a clone; an alias does, and
 * the import path reads exactly as it would from npm.
 *
 * Those siblings sit outside this package, so Node resolution from inside them
 * never reaches this package's `node_modules`. The three runtime deps are
 * therefore pointed at this package's copy — at the package DIRECTORY, so Vite
 * still reads each package's own `exports` map. Aliasing a deep file such as
 * `framer-motion/dist/es/index.mjs` bypasses that map and yields a build whose
 * animations never start: every element sits at its `initial` value and the
 * page renders blank.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^cordon-ui$/, replacement: local("../ui/index.ts") },
      { find: /^@cordon\/fixtures$/, replacement: local("../fixtures/src/index.ts") },
      { find: /^@cordon\/fixtures\/preview$/, replacement: local("../fixtures/src/preview.ts") },
      { find: /^react$/, replacement: local("./node_modules/react") },
      { find: /^react-dom$/, replacement: local("./node_modules/react-dom") },
      { find: /^framer-motion$/, replacement: local("./node_modules/framer-motion") },
    ],
    dedupe: ["react", "react-dom", "framer-motion"],
  },
  /* `host: true` binds IPv4 as well. Vite's default binds ::1 only, and a
     browser that resolves localhost to 127.0.0.1 then gets nothing. */
  /* PORT lets a harness that already owns 5274 hand this server another one.
     Unset, it keeps the port the other package's links point at. */
  server: { port: Number(process.env.PORT ?? 5274), host: true },
  preview: { port: Number(process.env.PORT ?? 5280), host: true },
});
