import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { dirname } from "node:path";

const local = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/**
 * Where a runtime dependency actually is, asked rather than assumed.
 *
 * These were written as `./node_modules/react`, which is true when every
 * package installs its own and false the moment npm workspaces hoist them to
 * the root — the layout CI installs. The build then failed on a path that had
 * never existed there, while the same command passed on a developer's machine
 * with the older per-package layout.
 *
 * Node's own resolution answers for both. It still yields the package
 * DIRECTORY, so Vite reads each package's `exports` map; aliasing a deep file
 * bypasses that map and yields a build whose animations never start.
 */
const req = createRequire(import.meta.url);
const pkg = (name: string) => dirname(req.resolve(`${name}/package.json`));

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
      { find: /^react$/, replacement: pkg("react") },
      { find: /^react-dom$/, replacement: pkg("react-dom") },
      { find: /^framer-motion$/, replacement: pkg("framer-motion") },
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
