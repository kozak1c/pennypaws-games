// The post-build step on the command line: npm run build is "astro build && node ops/postbuild-cli.mjs".
// It always runs ops/postbuild.mjs's run(): no "am I the main module" guard, which a directory
// junction can turn silently false. tests/postbuild.test.mjs runs this exactly as npm does and
// fails unless it printed the line that says the step finished.
import process from "node:process";
import { run } from "./postbuild.mjs";

process.exit(run());
