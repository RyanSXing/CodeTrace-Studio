import { useMemo, useState, useRef, useEffect, useCallback } from 'react'

// ── Node descriptions for tooltips ──────────────────────────
const NODE_DESCRIPTIONS = {
  Program:      'The root of the program. Contains all function definitions and the main block.',
  Block:        'A sequence of statements enclosed in { }. Creates a new variable scope.',
  FunctionDef:  'A function definition. Declares a named function with parameters, a body block, and a return expression.',
  FunctionCall: 'A function call. Evaluates arguments and runs the named function\'s body.',
  If:           'A conditional statement. Evaluates the condition; if True runs the then-block, otherwise the else-block (if present).',
  While:        'A loop statement. Repeatedly evaluates the condition and runs the body block while it is True.',
  Assign:       'An assignment statement. Evaluates the right-hand expression and stores it in the left-hand variable or index.',
  Print:        'Prints the value of the expression to output.',
  BinOp:        'A binary operation between two expressions (e.g. +, -, *, mod, ==, andalso).',
  UnaryOp:      'A unary operation applied to one expression (e.g. not, negation -).',
  Var:          'A variable reference. Looks up the variable\'s current value in the environment.',
  Int:          'An integer literal value.',
  Real:         'A floating-point (real number) literal value.',
  String:       'A string literal value.',
  Bool:         'A boolean literal: True or False.',
  List:         'A list literal containing zero or more elements.',
  Tuple:        'A tuple literal containing two or more elements.',
  Index:        'An index operation. Accesses an element of a list or string by integer index (0-based).',
  TupleIndex:   'A tuple projection. Accesses an element of a tuple by position (1-based, using #N syntax).',
}

function getNodeDesc(label) {
  for (const [key, desc] of Object.entries(NODE_DESCRIPTIONS)) {
    if (label.startsWith(key)) return desc
  }
  return label
}

// ── Node color categories ────────────────────────────────────
function getNodeStyle(label) {
  if (/^Program$/.test(label))     return { fill: '#5b3fa0', stroke: '#9b7ee0', text: '#ede0ff' }
  if (/^Block/.test(label))        return { fill: '#154e7a', stroke: '#3b9dd8', text: '#c5e5f8' }
  if (/^FunctionDef/.test(label))  return { fill: '#145232', stroke: '#29a85e', text: '#b0eece' }
  if (/^FunctionCall/.test(label)) return { fill: '#0e5e41', stroke: '#1acc8a', text: '#9fe8cc' }
  if (/^If$/.test(label))          return { fill: '#6b5400', stroke: '#e8c02a', text: '#fff6c0' }
  if (/^While$/.test(label))       return { fill: '#6b2a0e', stroke: '#e07030', text: '#ffe0c8' }
  if (/^Assign$/.test(label))      return { fill: '#42145e', stroke: '#b060d8', text: '#e8c8f8' }
  if (/^Print$/.test(label))       return { fill: '#0e3358', stroke: '#4da8e8', text: '#cce8fa' }
  if (/^BinOp/.test(label))        return { fill: '#822015', stroke: '#e84030', text: '#ffd8d4' }
  if (/^UnaryOp/.test(label))      return { fill: '#6e1a10', stroke: '#d03828', text: '#ffd8d4' }
  if (/^Var/.test(label))          return { fill: '#0e4050', stroke: '#20c0a0', text: '#9ae8d8' }
  if (/^Int|^Real/.test(label))    return { fill: '#124a24', stroke: '#30d060', text: '#c0f0d0' }
  if (/^String/.test(label))       return { fill: '#5e2800', stroke: '#e08840', text: '#ffe0b8' }
  if (/^Bool/.test(label))         return { fill: '#103c60', stroke: '#50b8e8', text: '#c8e8fa' }
  if (/^List/.test(label))         return { fill: '#104260', stroke: '#70b8e0', text: '#c8e8fa' }
  if (/^Tuple/.test(label))        return { fill: '#243448', stroke: '#6898c0', text: '#c8daf0' }
  if (/^Index$/.test(label))       return { fill: '#432c10', stroke: '#c89020', text: '#ffe8b0' }
  if (/^TupleIndex$/.test(label))  return { fill: '#382410', stroke: '#b07e28', text: '#ffe8b0' }
  return                                  { fill: '#282828', stroke: '#606060', text: '#cccccc' }
}

// ── Parse indented text → tree ───────────────────────────────
function parseAstText(text) {
  const lines = text.split('\n').filter(l => l.trim())
  if (!lines.length) return null

  let id = 0
  const makeNode = (label) => ({ id: id++, label, children: [] })

  const root = makeNode(lines[0].replace(/^\t+/, '').trim())
  const stack = [{ node: root, depth: 0 }]

  for (let i = 1; i < lines.length; i++) {
    const line  = lines[i]
    const depth = (line.match(/^\t+/) || [''])[0].length
    const label = line.replace(/^\t+/, '').trim()
    if (!label) continue

    const node = makeNode(label)
    while (stack.length > 1 && stack[stack.length - 1].depth >= depth) stack.pop()
    stack[stack.length - 1].node.children.push(node)
    stack.push({ node, depth })
  }

  return root
}

// ── Reingold-Tilford-style layout ────────────────────────────
const NODE_W = 140
const NODE_H = 38
const H_GAP  = 20
const V_GAP  = 64

function layoutTree(root) {
  function computeWidth(node) {
    if (!node.children.length) { node._w = NODE_W; return node._w }
    let total = node.children.reduce((s, c) => s + computeWidth(c), 0)
    total += H_GAP * (node.children.length - 1)
    node._w = Math.max(NODE_W, total)
    return node._w
  }
  computeWidth(root)

  const positions = []
  function assign(node, x, y) {
    node._x = x + node._w / 2
    node._y = y
    positions.push(node)
    let cx = x
    for (const c of node.children) {
      assign(c, cx, y + NODE_H + V_GAP)
      cx += c._w + H_GAP
    }
  }
  assign(root, 0, 0)
  return positions
}

// ── Tooltip component ────────────────────────────────────────
// pos is { x, y } in screen (client) pixels — the bottom-center of the hovered node rect
function Tooltip({ node, pos, isDark }) {
  if (!node || !pos) return null

  const s         = getNodeStyle(node.label)
  const desc      = getNodeDesc(node.label)
  const bg        = isDark ? '#1c1c1e' : '#ffffff'
  const textColor = isDark ? '#d4d4d4' : '#1e1e1e'

  return (
    <div style={{
      position: 'fixed',
      left: pos.x,
      top:  pos.y + 8,
      transform: 'translateX(-50%)',
      zIndex: 1000,
      background: bg,
      border: `1.5px solid ${s.stroke}`,
      borderRadius: 8,
      padding: '8px 12px',
      maxWidth: 260,
      pointerEvents: 'none',
      boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
    }}>
      <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12, color: s.stroke, marginBottom: 4 }}>
        {node.label}
      </div>
      <div style={{ fontSize: 12, color: textColor, lineHeight: 1.5 }}>
        {desc}
      </div>
    </div>
  )
}

// ── Main AstTree component ───────────────────────────────────
export default function AstTree({ text, isDark, highlightNodeId = null }) {
  const containerRef = useRef(null)
  const [viewBox, setViewBox]       = useState({ x: 0, y: -20, w: 800, h: 600 })
  const [pan, setPan]               = useState({ x: 0, y: 0 })
  const [scale, setScale]           = useState(1)
  const [hoverInfo, setHoverInfo]   = useState(null) // { node, pos: {x, y} }
  const dragging = useRef(false)
  const lastPt   = useRef(null)

  const tree  = useMemo(() => parseAstText(text), [text])
  const nodes = useMemo(() => tree ? layoutTree(tree) : [], [tree])

  // Fit tree on load
  useEffect(() => {
    if (!nodes.length) return
    const xs = nodes.map(n => n._x)
    const ys = nodes.map(n => n._y)
    const pad = 32
    const minX = Math.min(...xs) - NODE_W / 2 - pad
    const minY = Math.min(...ys) - NODE_H / 2 - pad
    const maxX = Math.max(...xs) + NODE_W / 2 + pad
    const maxY = Math.max(...ys) + NODE_H / 2 + pad
    setViewBox({ x: minX, y: minY, w: maxX - minX, h: maxY - minY })
    setPan({ x: 0, y: 0 })
    setScale(1)
  }, [nodes])

  const onWheel = useCallback((e) => {
    e.preventDefault()
    setScale(s => Math.max(0.1, Math.min(6, s * (e.deltaY < 0 ? 1.12 : 0.9))))
  }, [])

  const onMouseDown = useCallback((e) => {
    if (e.button !== 0) return
    dragging.current = true
    lastPt.current = { x: e.clientX, y: e.clientY }
  }, [])

  const onMouseMove = useCallback((e) => {
    if (!dragging.current) return
    const dx = (e.clientX - lastPt.current.x) / scale
    const dy = (e.clientY - lastPt.current.y) / scale
    setPan(p => ({ x: p.x + dx, y: p.y + dy }))
    lastPt.current = { x: e.clientX, y: e.clientY }
  }, [scale])

  const onMouseUp = useCallback(() => { dragging.current = false }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [onWheel, tree])

  if (!tree) return (
    <div className="ast-empty">Run the code to see the AST diagram.</div>
  )

  const bg        = isDark ? '#141414' : '#f0f2f5'
  const edgeColor = isDark ? '#4a4a4a' : '#b0b8c8'
  const vb = `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`

  const edges = []
  for (const node of nodes) {
    for (const child of node.children) {
      const x1 = node._x,  y1 = node._y + NODE_H / 2
      const x2 = child._x, y2 = child._y - NODE_H / 2
      const my = (y1 + y2) / 2
      edges.push({ id: `${node.id}-${child.id}`, d: `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}` })
    }
  }

  return (
    <div
      ref={containerRef}
      className="ast-container"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={() => { dragging.current = false; setHoverInfo(null) }}
      style={{ cursor: dragging.current ? 'grabbing' : 'grab', background: bg }}
    >
      <div className="ast-hint">Scroll to zoom · Drag to pan · Hover nodes for info</div>

      <svg
        width="100%"
        height="100%"
        viewBox={vb}
        style={{
          transform: `scale(${scale}) translate(${pan.x}px, ${pan.y}px)`,
          transformOrigin: 'center center',
          overflow: 'visible',
        }}
      >
        <defs>
          <marker id="arrowDark" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
            <path d="M0,0 L0,7 L7,3.5 z" fill={edgeColor} />
          </marker>
          <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        {edges.map(e => (
          <path
            key={e.id}
            d={e.d}
            stroke={edgeColor}
            strokeWidth="1.8"
            fill="none"
            markerEnd="url(#arrowDark)"
          />
        ))}

        {nodes.map(node => {
          const s          = getNodeStyle(node.label)
          const x          = node._x - NODE_W / 2
          const y          = node._y - NODE_H / 2
          const isHover    = hoverInfo?.node.id === node.id
          const isActive   = highlightNodeId !== null && node.id === highlightNodeId
          const display    = node.label.length > 22 ? node.label.slice(0, 20) + '…' : node.label

          return (
            <g
              key={node.id}
              onMouseEnter={(e) => {
                if (dragging.current) return
                const rect = e.currentTarget.querySelector('rect.main-rect')
                if (rect) {
                  const br = rect.getBoundingClientRect()
                  setHoverInfo({ node, pos: { x: br.left + br.width / 2, y: br.bottom } })
                }
              }}
              onMouseLeave={() => setHoverInfo(null)}
              style={{ cursor: 'default' }}
            >
              <rect
                x={x + 2} y={y + 3}
                width={NODE_W} height={NODE_H}
                rx="7" ry="7"
                fill="rgba(0,0,0,0.35)"
              />
              <rect
                className="main-rect"
                x={x} y={y}
                width={NODE_W} height={NODE_H}
                rx="7" ry="7"
                fill={isActive ? s.stroke : s.fill}
                stroke={isActive ? '#ffffff' : isHover ? '#ffffff' : s.stroke}
                strokeWidth={isActive ? 3 : isHover ? 2.5 : 1.8}
                filter={isActive ? 'url(#glow)' : isHover ? 'url(#glow)' : undefined}
                opacity={highlightNodeId !== null && !isActive ? 0.35 : 1}
              />
              <rect
                x={x} y={y}
                width={NODE_W} height={4}
                rx="7" ry="7"
                fill={s.stroke}
                opacity={highlightNodeId !== null && !isActive ? 0.2 : 0.7}
              />
              <text
                x={node._x}
                y={node._y + 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="11.5"
                fontFamily="'JetBrains Mono','Fira Code',monospace"
                fontWeight="700"
                fill={isActive ? '#ffffff' : isHover ? '#ffffff' : s.text}
                opacity={highlightNodeId !== null && !isActive ? 0.4 : 1}
              >
                {display}
              </text>
            </g>
          )
        })}
      </svg>

      {hoverInfo && (
        <Tooltip node={hoverInfo.node} pos={hoverInfo.pos} isDark={isDark} />
      )}
    </div>
  )
}
