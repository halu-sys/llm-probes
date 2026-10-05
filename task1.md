# Task: refactor the llm-probes runners

The repo has five runners (src/run-p1.ts, run-p3.ts, run-p4.ts, run-p5.ts, run-p6.ts).
Each one repeats the same skeleton: parse argv, loop sizes x seeds, call chat()
with try/catch, push a row, print a per-run line, print a per-size scoreboard,
save results/<probe>-<timestamp>.json.

Plan the refactor to extract a shared runner (e.g. src/runner.ts) that all five
use, WITHOUT changing any probe's grading logic or the existing results file
format (results/*.json must stay byte-compatible for the offline regrade script).

Deliver:
1. The exact shape of the shared runner (function signature + what varies per probe).
2. Every file that must change and what changes in it.
3. The order of changes so tests (35, vitest) stay green at every step.
4. What could break: name the 2 riskiest spots and how the tests catch them.

Constraints: TypeScript ESM, no new dependencies, keep the CLI usage identical
(npx tsx src/run-pN.ts model sizesCsv ...).
