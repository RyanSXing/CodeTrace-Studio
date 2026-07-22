const CLOSERS = new Set(['}', ']', ')'])
const MATCHING_KIND = { '}': 'Block', ']': 'List', ')': 'Tuple' }

export function describeNode(label) {
  if (CLOSERS.has(label)) {
    return { kind: 'Close', detail: label, isStructural: true }
  }

  const call = label.match(/^([A-Za-z]+)\((.*)\)$/)
  if (call) {
    return { kind: call[1], detail: call[2], isStructural: false }
  }

  if (label.endsWith('[]') && /^[A-Za-z]+$/.test(label.slice(0, -2))) {
    return { kind: label.slice(0, -2), detail: '[]', isStructural: false }
  }

  const opener = label.at(-1)
  const openerKind = label.slice(0, -1)
  if (['(', '{', '['].includes(opener) && /^[A-Za-z]+$/.test(openerKind)) {
    return { kind: openerKind, detail: opener, isStructural: false }
  }

  return { kind: label, detail: '', isStructural: false }
}

export function parseAstText(text) {
  const lines = text
    .split('\n')
    .map((raw, sourceLine) => ({ raw, sourceLine }))
    .filter(({ raw }) => raw.trim())

  if (!lines.length) return null

  let id = 0
  const makeNode = (label, sourceLine) => ({
    id: id++,
    label,
    sourceLine,
    ...describeNode(label),
    children: [],
  })

  const rootLine = lines[0]
  const root = makeNode(rootLine.raw.trim(), rootLine.sourceLine)
  const stack = [{ node: root, depth: 0 }]

  for (const { raw, sourceLine } of lines.slice(1)) {
    const depth = (raw.match(/^\t+/) || [''])[0].length
    const label = raw.trim()
    const node = makeNode(label, sourceLine)

    if (CLOSERS.has(label)) {
      const expectedKind = MATCHING_KIND[label]
      let openerIndex = stack.length - 1
      while (openerIndex >= 0 && stack[openerIndex].node.kind !== expectedKind) openerIndex -= 1
      if (openerIndex >= 0) {
        stack[openerIndex].node.children.push(node)
        stack.length = openerIndex
        continue
      }
    }

    while (stack.length > 1 && stack.at(-1).depth >= depth) stack.pop()
    stack.at(-1).node.children.push(node)
    stack.push({ node, depth })
  }

  return root
}

export function flattenTree(root) {
  if (!root) return []
  return [root, ...root.children.flatMap(flattenTree)]
}

export function getNewestRevealedNode(nodes, revealedLines) {
  if (revealedLines == null) return null
  return nodes.reduce(
    (newest, node) => node.sourceLine < revealedLines && (!newest || node.sourceLine > newest.sourceLine)
      ? node
      : newest,
    null,
  )
}

export function getCameraTarget(nodes, revealedLines, highlightNodeId) {
  return getNewestRevealedNode(nodes, revealedLines)
    ?? nodes.find(node => node.id === highlightNodeId)
    ?? null
}
