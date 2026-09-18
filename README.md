# Nurikabe

Browser Nurikabe with a puzzle generator for several board sizes and four difficulty levels.

```
npm install
npm run dev     # play at http://localhost:5173
npm test        # solver / generator / analysis tests
npm run build
```

- `src/core/solver.ts`: rule-based solver in three tiers (easy rules, medium rules, trial and error), plus solution counting.
- `src/core/generator.ts`: builds a random valid layout, then changes it where the solver gets stuck until the puzzle has a unique solution at the requested tier. It runs in a Web Worker.
  Expert starts from a hard puzzle and keeps merging and growing islands for as long as the solution stays unique, which leaves fewer, larger islands.
- `src/core/analysis.ts`: live board analysis. It finds complete islands, separate wall groups, 2×2 pools, and broken islands.
- `src/ui/`: board rendering, input, timer, undo/redo, hints, and saved progress.
