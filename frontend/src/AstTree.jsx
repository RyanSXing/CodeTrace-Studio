import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { flattenTree, getCameraTarget, getNewestRevealedNode, parseAstText } from './astTreeModel.js'

const NODE_DESCRIPTIONS = {
  Program: 'The program root. Contains function definitions and the main block.',
  Block: 'A sequence of statements enclosed in braces.',
  FunctionDef: 'A named function with parameters, a body, and a return expression.',
  FunctionCall: 'Evaluates arguments and runs the named function.',
  If: 'Runs one of two blocks based on a boolean condition.',
  While: 'Repeats a block while its condition remains True.',
  Assign: 'Stores an evaluated value in a variable or list index.',
  Print: 'Writes an evaluated value to program output.',
  BinOp: 'Combines two expressions with a binary operator.',
  UnaryOp: 'Applies one operator to a single expression.',
  Var: 'Looks up a variable in the current environment.',
  Int: 'An integer literal.',
  Real: 'A real-number literal.',
  String: 'A string literal.',
  Bool: 'A boolean literal.',
  List: 'A list literal.',
  Tuple: 'A tuple literal.',
  Index: 'Reads an item from a list or string.',
  TupleIndex: 'Reads a tuple item using one-based projection.',
  Close: 'Closes the surrounding AST structure.',
}

const NODE_STYLES = {
  Program:      { fill: '#312e81', stroke: '#818cf8', text: '#eef2ff' },
  Block:        { fill: '#0c4a6e', stroke: '#38bdf8', text: '#e0f2fe' },
  FunctionDef:  { fill: '#14532d', stroke: '#4ade80', text: '#dcfce7' },
  FunctionCall: { fill: '#064e3b', stroke: '#34d399', text: '#d1fae5' },
  If:           { fill: '#713f12', stroke: '#facc15', text: '#fef9c3' },
  While:        { fill: '#7c2d12', stroke: '#fb923c', text: '#ffedd5' },
  Assign:       { fill: '#581c87', stroke: '#c084fc', text: '#f3e8ff' },
  Print:        { fill: '#1e3a5f', stroke: '#60a5fa', text: '#dbeafe' },
  BinOp:        { fill: '#7f1d1d', stroke: '#f87171', text: '#fee2e2' },
  UnaryOp:      { fill: '#7f1d1d', stroke: '#fb7185', text: '#ffe4e6' },
  Var:          { fill: '#134e4a', stroke: '#2dd4bf', text: '#ccfbf1' },
  Int:          { fill: '#365314', stroke: '#84cc16', text: '#ecfccb' },
  Real:         { fill: '#365314', stroke: '#84cc16', text: '#ecfccb' },
  String:       { fill: '#78350f', stroke: '#f59e0b', text: '#fef3c7' },
  Bool:         { fill: '#164e63', stroke: '#22d3ee', text: '#cffafe' },
  List:         { fill: '#164e63', stroke: '#67e8f9', text: '#cffafe' },
  Tuple:        { fill: '#334155', stroke: '#94a3b8', text: '#f1f5f9' },
  Index:        { fill: '#713f12', stroke: '#fbbf24', text: '#fef3c7' },
  TupleIndex:   { fill: '#713f12', stroke: '#fbbf24', text: '#fef3c7' },
  Close:        { fill: '#27272a', stroke: '#71717a', text: '#d4d4d8' },
}

const DEFAULT_STYLE = { fill: '#27272a', stroke: '#71717a', text: '#e4e4e7' }
const SEMANTIC_W = 174
const SEMANTIC_H = 54
const STRUCTURAL_W = 58
const STRUCTURAL_H = 34
const H_GAP = 28
const LEVEL_GAP = 104

function layoutTree(root) {
  function computeWidth(node) {
    node._nodeWidth = node.isStructural ? STRUCTURAL_W : SEMANTIC_W
    node._nodeHeight = node.isStructural ? STRUCTURAL_H : SEMANTIC_H
    if (!node.children.length) {
      node._branchWidth = node._nodeWidth
      return node._branchWidth
    }
    const childrenWidth = node.children.reduce((sum, child) => sum + computeWidth(child), 0)
      + H_GAP * (node.children.length - 1)
    node._branchWidth = Math.max(node._nodeWidth, childrenWidth)
    return node._branchWidth
  }

  computeWidth(root)
  const positions = []

  function assign(node, x, y) {
    node._x = x + node._branchWidth / 2
    node._y = y
    positions.push(node)
    const childrenWidth = node.children.reduce((sum, child) => sum + child._branchWidth, 0)
      + H_GAP * Math.max(0, node.children.length - 1)
    let childX = x + (node._branchWidth - childrenWidth) / 2
    for (const child of node.children) {
      assign(child, childX, y + LEVEL_GAP)
      childX += child._branchWidth + H_GAP
    }
  }

  assign(root, 0, 0)
  return positions
}

function Tooltip({ node, pos, isDark }) {
  if (!node || !pos) return null
  const style = NODE_STYLES[node.kind] || DEFAULT_STYLE

  return (
    <div
      className="ast-tooltip"
      style={{
        left: pos.x,
        top: pos.y + 10,
        borderColor: style.stroke,
        background: isDark ? '#18181b' : '#ffffff',
      }}
    >
      <div className="ast-tooltip-title" style={{ color: style.stroke }}>{node.label}</div>
      <div className="ast-tooltip-copy">{NODE_DESCRIPTIONS[node.kind] || node.label}</div>
    </div>
  )
}

function clampZoom(value) {
  return Math.max(0.45, Math.min(3.5, value))
}

export default function AstTree({
  text,
  isDark,
  highlightNodeId = null,
  revealedLines = null,
  follow = false,
  onFollowInterrupt,
}) {
  const containerRef = useRef(null)
  const dragging = useRef(false)
  const lastPoint = useRef(null)
  const markerId = `ast-arrow-${useId().replaceAll(':', '')}`
  const glowId = `ast-glow-${useId().replaceAll(':', '')}`
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const [hoverInfo, setHoverInfo] = useState(null)

  const tree = useMemo(() => parseAstText(text), [text])
  const nodes = useMemo(() => tree ? layoutTree(tree) : [], [tree])
  const flatNodes = useMemo(() => flattenTree(tree), [tree])
  const newestNode = useMemo(
    () => getNewestRevealedNode(flatNodes, revealedLines),
    [flatNodes, revealedLines],
  )
  const cameraTarget = useMemo(
    () => getCameraTarget(flatNodes, revealedLines, highlightNodeId),
    [flatNodes, highlightNodeId, revealedLines],
  )

  const viewBox = useMemo(() => {
    if (!nodes.length) return { x: 0, y: -40, w: 900, h: 620 }
    const pad = 64
    const minX = Math.min(...nodes.map(node => node._x - node._nodeWidth / 2)) - pad
    const minY = Math.min(...nodes.map(node => node._y - node._nodeHeight / 2)) - pad
    const maxX = Math.max(...nodes.map(node => node._x + node._nodeWidth / 2)) + pad
    const maxY = Math.max(...nodes.map(node => node._y + node._nodeHeight / 2)) + pad
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
  }, [nodes])

  const followScale = follow && cameraTarget ? Math.max(scale, 1.35) : scale
  const followPan = useMemo(() => {
    if (!follow || !cameraTarget) return pan
    return {
      x: viewBox.x + viewBox.w / 2 - cameraTarget._x * followScale,
      y: viewBox.y + viewBox.h / 2 - cameraTarget._y * followScale,
    }
  }, [cameraTarget, follow, followScale, pan, viewBox])

  const stopFollowing = useCallback(() => {
    if (!follow) return
    setPan(followPan)
    setScale(followScale)
    onFollowInterrupt?.()
  }, [follow, followPan, followScale, onFollowInterrupt])

  const zoomBy = useCallback((factor) => {
    stopFollowing()
    setScale(current => clampZoom(current * factor))
  }, [stopFollowing])

  const fitTree = useCallback(() => {
    stopFollowing()
    setPan({ x: 0, y: 0 })
    setScale(1)
  }, [stopFollowing])

  const onWheel = useCallback((event) => {
    event.preventDefault()
    stopFollowing()
    setScale(current => clampZoom(current * (event.deltaY < 0 ? 1.12 : 0.9)))
  }, [stopFollowing])

  const onMouseDown = useCallback((event) => {
    if (event.button !== 0) return
    stopFollowing()
    dragging.current = true
    lastPoint.current = { x: event.clientX, y: event.clientY }
  }, [stopFollowing])

  const onMouseMove = useCallback((event) => {
    if (!dragging.current || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const dx = (event.clientX - lastPoint.current.x) * viewBox.w / rect.width
    const dy = (event.clientY - lastPoint.current.y) * viewBox.h / rect.height
    setPan(current => ({ x: current.x + dx, y: current.y + dy }))
    lastPoint.current = { x: event.clientX, y: event.clientY }
  }, [viewBox])

  const onMouseUp = useCallback(() => { dragging.current = false }, [])

  useEffect(() => {
    const element = containerRef.current
    if (!element) return undefined
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [onWheel, tree])

  if (!tree) return <div className="ast-empty">Run the code to see the AST diagram.</div>

  const isRevealed = (node) => revealedLines == null || node.sourceLine < revealedLines
  const activeNodeId = highlightNodeId ?? newestNode?.id ?? null
  const traceMode = highlightNodeId != null
  const edges = nodes.flatMap(parent => parent.children.map(child => {
    const x1 = parent._x
    const y1 = parent._y + parent._nodeHeight / 2
    const x2 = child._x
    const y2 = child._y - child._nodeHeight / 2
    const middleY = (y1 + y2) / 2
    return {
      id: `${parent.id}-${child.id}`,
      child,
      d: `M${x1},${y1} C${x1},${middleY} ${x2},${middleY} ${x2},${y2}`,
    }
  }))

  const cameraStyle = {
    transform: `translate(${followPan.x}px, ${followPan.y}px) scale(${followScale})`,
    transformOrigin: '0 0',
  }
  const background = isDark ? '#101114' : '#f5f7fb'
  const grid = isDark ? '#24272d' : '#d9dee8'

  return (
    <div
      ref={containerRef}
      className={`ast-container ${follow ? 'is-following' : ''}`}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={() => { dragging.current = false; setHoverInfo(null) }}
      style={{
        backgroundColor: background,
        backgroundImage: `radial-gradient(${grid} 1px, transparent 1px)`,
      }}
    >
      <div className="ast-camera-controls" role="group" aria-label="AST camera controls" onMouseDown={event => event.stopPropagation()}>
        <button type="button" onClick={() => zoomBy(0.85)} aria-label="Zoom out">−</button>
        <button type="button" onClick={fitTree}>Fit</button>
        <button type="button" onClick={() => zoomBy(1.18)} aria-label="Zoom in">+</button>
      </div>
      <div className="ast-hint">Drag to pan · Scroll to zoom · Hover for details</div>

      <svg width="100%" height="100%" viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`} role="img" aria-label="Abstract syntax tree">
        <defs>
          <marker id={markerId} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
            <path d="M0,0 L0,7 L7,3.5 z" fill={isDark ? '#64748b' : '#94a3b8'} />
          </marker>
          <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        <g className="ast-camera" style={cameraStyle}>
          {edges.map(edge => {
            const revealed = isRevealed(edge.child)
            const active = edge.child.id === activeNodeId
            return (
              <path
                key={edge.id}
                className={`ast-edge ${revealed ? 'is-revealed' : 'is-pending'} ${active ? 'is-active' : ''}`}
                d={edge.d}
                markerEnd={`url(#${markerId})`}
              />
            )
          })}

          {nodes.map(node => {
            const style = NODE_STYLES[node.kind] || DEFAULT_STYLE
            const x = node._x - node._nodeWidth / 2
            const y = node._y - node._nodeHeight / 2
            const revealed = isRevealed(node)
            const active = node.id === activeNodeId
            const dimmed = traceMode && !active
            const kind = node.kind.length > 17 ? `${node.kind.slice(0, 16)}…` : node.kind
            const detail = node.detail.length > 23 ? `${node.detail.slice(0, 22)}…` : node.detail

            return (
              <g
                key={node.id}
                className={`ast-node ${node.isStructural ? 'is-structural' : ''} ${revealed ? 'is-revealed' : 'is-pending'} ${active ? 'is-active' : ''} ${dimmed ? 'is-dimmed' : ''}`}
                onMouseEnter={(event) => {
                  if (dragging.current || !revealed) return
                  const rect = event.currentTarget.querySelector('.ast-node-card')?.getBoundingClientRect()
                  if (rect) setHoverInfo({ node, pos: { x: rect.left + rect.width / 2, y: rect.bottom } })
                }}
                onMouseLeave={() => setHoverInfo(null)}
                style={{ '--node-fill': style.fill, '--node-stroke': style.stroke, '--node-text': style.text }}
              >
                <rect className="ast-node-shadow" x={x + 3} y={y + 5} width={node._nodeWidth} height={node._nodeHeight} rx={node.isStructural ? 10 : 12} />
                <rect
                  className="ast-node-card"
                  x={x}
                  y={y}
                  width={node._nodeWidth}
                  height={node._nodeHeight}
                  rx={node.isStructural ? 10 : 12}
                  filter={active ? `url(#${glowId})` : undefined}
                />
                {!node.isStructural && <rect className="ast-node-accent" x={x} y={y} width="5" height={node._nodeHeight} rx="3" />}
                {node.isStructural ? (
                  <text className="ast-node-structure-text" x={node._x} y={node._y + 1}>{node.detail}</text>
                ) : (
                  <>
                    <text className="ast-node-kind" x={x + 16} y={y + 21}>{kind}</text>
                    <text className="ast-node-detail" x={x + 16} y={y + 40}>{detail || 'node'}</text>
                  </>
                )}
              </g>
            )
          })}
        </g>
      </svg>

      {hoverInfo && <Tooltip node={hoverInfo.node} pos={hoverInfo.pos} isDark={isDark} />}
    </div>
  )
}
