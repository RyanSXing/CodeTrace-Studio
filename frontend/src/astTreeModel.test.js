import assert from 'node:assert/strict'
import test from 'node:test'

const model = await import('./astTreeModel.js').catch(() => ({}))

test('keeps closing brackets as structural children', () => {
  assert.equal(typeof model.parseAstText, 'function')

  const root = model.parseAstText('Program\n\tBlock{\n\t\tPrint\n\t\t\tInt(1)\n\t}')
  const block = root.children[0]
  const close = block.children.at(-1)

  assert.equal(close.label, '}')
  assert.equal(close.isStructural, true)
  assert.equal(close.kind, 'Close')
})

test('splits node labels into readable type and detail', () => {
  assert.equal(typeof model.describeNode, 'function')
  assert.deepEqual(model.describeNode('BinOp(mod)'), {
    kind: 'BinOp',
    detail: 'mod',
    isStructural: false,
  })
})

test('recognizes an empty list as a List node', () => {
  assert.deepEqual(model.describeNode('List[]'), {
    kind: 'List',
    detail: '[]',
    isStructural: false,
  })
})

test('finds the newest node revealed by the current AST line count', () => {
  assert.equal(typeof model.getNewestRevealedNode, 'function')

  const root = model.parseAstText('Program\n\tBlock{\n\t\tPrint\n\t\t\tInt(1)\n\t}')
  const nodes = model.flattenTree(root)

  assert.equal(model.getNewestRevealedNode(nodes, 3).label, 'Print')
  assert.equal(model.getNewestRevealedNode(nodes, 5).label, '}')
})

test('targets the highlighted node when following an evaluation trace', () => {
  assert.equal(typeof model.getCameraTarget, 'function')

  const root = model.parseAstText('Program\n\tBlock{\n\t\tPrint\n\t\t\tInt(1)\n\t}')
  const nodes = model.flattenTree(root)

  assert.equal(model.getCameraTarget(nodes, null, 3).label, 'Int(1)')
  assert.equal(model.getCameraTarget(nodes, 3, null).label, 'Print')
})
