# AST Tree Playback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the AST diagram and add stable progressive reveal with a persisted follow-camera toggle.

**Architecture:** Move AST text parsing into a dependency-free model module tested with Node's built-in runner. Keep SVG rendering in `AstTree.jsx`; playback supplies reveal progress and owns the persisted Follow setting.

**Tech Stack:** React 19, SVG, CSS, Vite, Node built-in test runner.

## Global Constraints

- Keep closing bracket nodes.
- Add no dependencies.
- Preserve static AST and evaluation-trace behavior.
- Respect reduced-motion preferences.

---

### Task 1: AST tree model

**Files:**
- Create: `frontend/src/astTreeModel.test.js`
- Create: `frontend/src/astTreeModel.js`
- Modify: `frontend/package.json`

**Interfaces:**
- Produces: `parseAstText(text)`, `flattenTree(root)`, and `getNewestRevealedNode(nodes, revealedLines)`.

- [ ] Write a failing Node test that imports the model, parses `Program\n\tBlock{\n\t\tPrint\n\t}` and asserts the `}` node is retained with `isStructural === true`.
- [ ] Run `node --test src/astTreeModel.test.js`; confirm it fails because the model does not exist.
- [ ] Implement parsing with `{ id, label, kind, detail, sourceLine, isStructural, children }` nodes and newest-revealed lookup.
- [ ] Add `"test": "node --test src/*.test.js"` to `package.json`.
- [ ] Run `npm test`; expect all model tests to pass.

### Task 2: Stable AST rendering and camera

**Files:**
- Modify: `frontend/src/AstTree.jsx`
- Modify: `frontend/src/App.css`

**Interfaces:**
- Consumes: `text`, optional `revealedLines`, optional `follow`, and optional `onFollowInterrupt`.
- Produces: a stable full-tree SVG with reveal states and camera controls.

- [ ] Replace the private parser with imports from `astTreeModel.js`.
- [ ] Lay out compact structural nodes and larger semantic nodes without changing positions during reveal.
- [ ] Render future nodes and edges faintly; render the newest revealed node with a short accent animation.
- [ ] Add accessible zoom out, Fit, and zoom in buttons.
- [ ] Derive follow-camera translation from the newest revealed node; manual wheel or drag calls `onFollowInterrupt`.
- [ ] Add CSS for cards, structural nodes, progress states, controls, and `prefers-reduced-motion`.
- [ ] Run `npm run lint && npm run build`; expect both to pass.

### Task 3: Playback follow controls

**Files:**
- Modify: `frontend/src/Playback.jsx`
- Modify: `frontend/src/App.css`

**Interfaces:**
- Consumes: `perTokenAstLines[cursor]`.
- Produces: persisted `ast-follow-camera` preference and reveal progress passed to `AstTree`.

- [ ] Initialize Follow from `localStorage`, defaulting to enabled when no preference exists.
- [ ] Persist toggle changes and pass `follow`, `revealedLines`, and an interrupt callback to `AstTree`.
- [ ] Replace sliced AST text with the full AST to keep layout stable.
- [ ] Add a progress bar and current build-step label.
- [ ] Run `npm test && npm run lint && npm run build`; expect all checks to pass.

### Task 4: Live verification

**Files:** None.

- [ ] Run the Python interpreter suite to ensure backend behavior remains unchanged.
- [ ] In the live app, verify bracket nodes remain, node positions stay fixed across steps, Follow survives reload, and manual pan disables Follow.
- [ ] Check dark/light themes, 390px mobile layout, and reduced-motion CSS.
