# AST Tree Playback Design

## Goal

Make the AST easier to read and easier to follow while parser playback builds it.

## Approved interaction

- Render the complete AST as a faint, stable roadmap so nodes never shift during playback.
- Reveal nodes and incoming edges in place as parsing advances.
- Keep closing bracket nodes, but render them as compact neutral structural cards.
- Give semantic nodes a two-level label: node type first, value or operator second.
- Add Fit, zoom out, and zoom in controls.
- Add a Follow toggle to parser playback. Persist its value in `localStorage`.
- When Follow is enabled, center the camera on the newest revealed node.
- Manual pan or zoom disables Follow until the user enables it again.
- Respect `prefers-reduced-motion`.

## Data flow

`Playback.jsx` already receives the complete AST text and `perTokenAstLines`. It will pass the complete text plus the current revealed-line count to `AstTree`. `AstTree` will attach each node to its source AST line, derive the newest visible node, and use that node for reveal styling and camera focus.

## Testing

Use Node's built-in test runner for the pure AST text model. Verify that closing nodes remain in the model, labels split into type/detail, and reveal selection finds the newest visible node. Verify the React UI with ESLint, a Vite production build, and live browser checks for stable node positions and persisted Follow behavior.
