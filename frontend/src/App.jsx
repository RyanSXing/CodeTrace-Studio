import { useState, useRef, useCallback, useEffect } from 'react'
import Editor from '@monaco-editor/react'
import AstTree from './AstTree.jsx'
import Playback from './Playback.jsx'
import EvalTrace from './EvalTrace.jsx'
import './App.css'

// ── Sample programs ───────────────────────────────────────────
const SAMPLES = [
  {
    label: 'GCD (recursion)',
    desc: 'Recursive greatest common divisor',
    code:
`fun gcd(a, b) = {
  t = b;
  b = a mod b;
  if (b == 0) { output = t; }
  else { output = gcd(t, b); }
}
output;
{ print(gcd(32, 18)); }`,
  },
  {
    label: 'Fibonacci',
    desc: 'Recursive nth Fibonacci number',
    code:
`fun fib(n) = {
  if (n <= 1) { output = n; }
  else { output = fib(n - 1) + fib(n - 2); }
}
output;
{
  i = 0;
  while (i < 10) {
    print(fib(i));
    i = i + 1;
  }
}`,
  },
  {
    label: 'Factorial',
    desc: 'Iterative factorial with a while loop',
    code:
`{
  n = 8;
  result = 1;
  i = 1;
  while (i <= n) {
    result = result * i;
    i = i + 1;
  }
  print(result);
}`,
  },
  {
    label: 'List operations',
    desc: 'Building and indexing a list',
    code:
`{
  nums = [10, 20, 30, 40, 50];
  print(nums[0]);
  print(nums[2]);
  nums[1] = 99;
  print(nums);
  more = 5 :: nums;
  print(more);
  combined = [1, 2] + [3, 4];
  print(combined);
  print(3 in nums);
  print(99 in nums);
}`,
  },
  {
    label: 'Tuples & projection',
    desc: 'Creating tuples and projecting elements',
    code:
`{
  point = (3, 4);
  print(#1(point));
  print(#2(point));
  triple = (10, 20, 30);
  print(#3(triple));
  singleton = (42,);
  print(#1(singleton));
}`,
  },
  {
    label: 'String operations',
    desc: 'String literals, concatenation and indexing',
    code:
`{
  greeting = "Hello";
  name = "World";
  msg = greeting + ", " + name + "!";
  print(msg);
  print(msg[0]);
  print(msg[7]);
  print("lo" in greeting);
}`,
  },
  {
    label: 'Boolean logic',
    desc: 'andalso, orelse, not and comparisons',
    code:
`{
  x = 5;
  y = 10;
  print(x < y);
  print(x == y);
  print(x <> y);
  print(True andalso False);
  print(True orelse False);
  print(not True);
  print((x < y) andalso (y < 20));
}`,
  },
  {
    label: 'Higher-order example',
    desc: 'Power function and nested calls',
    code:
`fun pow(base, exp) = {
  result = 1;
  i = 0;
  while (i < exp) {
    result = result * base;
    i = i + 1;
  }
  output = result;
}
output;
{
  print(pow(2, 10));
  print(pow(3, 5));
  print(pow(pow(2, 3), 2));
}`,
  },
]

const EXAMPLE_CODE = SAMPLES[0].code

// ── Syntax reference ─────────────────────────────────────────
const SYNTAX_SECTIONS = [
  {
    title: 'Program Structure',
    items: [
      { syntax: 'fun name(p1, p2) = { body } return_expr;', desc: 'Define a function. Body is a block; the final expression is the return value.' },
      { syntax: '{ stmt1; stmt2; }', desc: 'A block of statements. Also used as the main program body.' },
    ],
  },
  {
    title: 'Statements',
    items: [
      { syntax: 'x = expr;',                          desc: 'Assign a value to a variable.' },
      { syntax: 'list[i] = expr;',                    desc: 'Assign to a list index.' },
      { syntax: 'print(expr);',                       desc: 'Print a value to output.' },
      { syntax: 'if (cond) { ... }',                  desc: 'Conditional — runs block if cond is True.' },
      { syntax: 'if (cond) { ... } else { ... }',     desc: 'Conditional with else branch.' },
      { syntax: 'while (cond) { ... }',               desc: 'Loop while condition is True.' },
      { syntax: '{ ... }',                            desc: 'Inline block (nested scope).' },
    ],
  },
  {
    title: 'Arithmetic',
    items: [
      { syntax: 'a + b',   desc: 'Addition (int/float/string/list).' },
      { syntax: 'a - b',   desc: 'Subtraction (int/float).' },
      { syntax: 'a * b',   desc: 'Multiplication (int/float).' },
      { syntax: 'a / b',   desc: 'Division → float.' },
      { syntax: 'a div b', desc: 'Integer division.' },
      { syntax: 'a mod b', desc: 'Modulo (int only).' },
      { syntax: 'a ** b',  desc: 'Exponentiation.' },
      { syntax: '-a',      desc: 'Unary negation.' },
    ],
  },
  {
    title: 'Comparison',
    items: [
      { syntax: 'a == b', desc: 'Equal (int/float/string).' },
      { syntax: 'a <> b', desc: 'Not equal.' },
      { syntax: 'a < b',  desc: 'Less than.' },
      { syntax: 'a <= b', desc: 'Less than or equal.' },
      { syntax: 'a > b',  desc: 'Greater than.' },
      { syntax: 'a >= b', desc: 'Greater than or equal.' },
    ],
  },
  {
    title: 'Logic',
    items: [
      { syntax: 'a andalso b', desc: 'Logical AND (bool only).' },
      { syntax: 'a orelse b',  desc: 'Logical OR (bool only).' },
      { syntax: 'not a',       desc: 'Logical NOT (bool only).' },
    ],
  },
  {
    title: 'Lists',
    items: [
      { syntax: '[1, 2, 3]', desc: 'List literal.' },
      { syntax: '[]',        desc: 'Empty list.' },
      { syntax: 'list[i]',   desc: 'Index into a list (0-based).' },
      { syntax: 'x :: list', desc: 'Prepend element x to list.' },
      { syntax: 'a + b',     desc: 'Concatenate two lists.' },
      { syntax: 'x in list', desc: 'Check membership.' },
    ],
  },
  {
    title: 'Tuples',
    items: [
      { syntax: '(a, b, c)',   desc: 'Tuple literal (2+ elements).' },
      { syntax: '(a,)',        desc: 'Singleton tuple.' },
      { syntax: '#1(tuple)',   desc: 'Project 1st element (1-indexed).' },
      { syntax: '#2(a, b, c)', desc: 'Project from an inline tuple.' },
    ],
  },
  {
    title: 'Types & Literals',
    items: [
      { syntax: '42',                desc: 'Integer.' },
      { syntax: '3.14',              desc: 'Real (float).' },
      { syntax: '"hello" \'world\'', desc: 'String (single or double quotes).' },
      { syntax: 'True  False',       desc: 'Boolean literals.' },
    ],
  },
  {
    title: 'Functions',
    items: [
      { syntax: 'name(arg1, arg2)', desc: 'Call a user-defined function.' },
      { syntax: 'output',           desc: 'Special return-value variable inside a function body.' },
    ],
  },
]

// ── Monaco registration ──────────────────────────────────────
const LANG_ID = 'sbml'
let langRegistered = false

function registerSbmlLanguage(monaco) {
  if (langRegistered) return
  langRegistered = true

  monaco.languages.register({ id: LANG_ID })
  monaco.languages.setMonarchTokensProvider(LANG_ID, {
    tokenizer: {
      root: [
        [/"[^"\n]*"/, 'string'],
        [/'[^'\n]*'/, 'string'],
        [/\d+\.\d*([eE][+-]?\d+)?/, 'number.float'],
        [/\.\d+([eE][+-]?\d+)?/, 'number.float'],
        [/\d+/, 'number'],
        [/\b(True|False)\b/, 'constant'],
        [/\b(fun|if|else|while|print|in|not|andalso|orelse|div|mod)\b/, 'keyword'],
        [/[a-zA-Z][a-zA-Z0-9_]*(?=\s*\()/, 'function'],
        [/[a-zA-Z][a-zA-Z0-9_]*/, 'identifier'],
        [/::|\*\*|<=|>=|<>|==|[+\-*/<>]/, 'operator'],
        [/#/, 'operator'],
        [/[{}[\]()]/, 'delimiter'],
        [/[;,=]/, 'delimiter'],
        [/\s+/, 'white'],
      ],
    },
  })

  monaco.editor.defineTheme('sbml-dark', {
    base: 'vs-dark', inherit: true,
    rules: [
      { token: 'keyword',      foreground: 'C586C0' },
      { token: 'constant',     foreground: '569CD6' },
      { token: 'string',       foreground: 'CE9178' },
      { token: 'number',       foreground: 'B5CEA8' },
      { token: 'number.float', foreground: 'B5CEA8' },
      { token: 'function',     foreground: 'DCDCAA' },
      { token: 'operator',     foreground: 'D4D4D4' },
      { token: 'delimiter',    foreground: 'D4D4D4' },
      { token: 'identifier',   foreground: '9CDCFE' },
    ],
    colors: {},
  })

  monaco.editor.defineTheme('sbml-light', {
    base: 'vs', inherit: true,
    rules: [
      { token: 'keyword',      foreground: '7B2D8B' },
      { token: 'constant',     foreground: '0070C1' },
      { token: 'string',       foreground: 'A31515' },
      { token: 'number',       foreground: '098658' },
      { token: 'number.float', foreground: '098658' },
      { token: 'function',     foreground: '795E26' },
      { token: 'operator',     foreground: '333333' },
      { token: 'delimiter',    foreground: '333333' },
      { token: 'identifier',   foreground: '001080' },
    ],
    colors: {},
  })
}

// ── SVG icons ────────────────────────────────────────────────
function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" fill="currentColor" stroke="none" opacity="0.9"/>
      <line x1="12" y1="1"  x2="12" y2="4"  />
      <line x1="12" y1="20" x2="12" y2="23" />
      <line x1="4.22" y1="4.22"   x2="6.34" y2="6.34"  />
      <line x1="17.66" y1="17.66" x2="19.78" y2="19.78"/>
      <line x1="1"  y1="12" x2="4"  y2="12" />
      <line x1="20" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="6.34" y2="17.66" />
      <line x1="17.66" y1="6.34" x2="19.78" y2="4.22" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/>
    </svg>
  )
}

// ── Examples dropdown ────────────────────────────────────────
function ExamplesDropdown({ onSelect }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div className="examples-wrap" ref={ref}>
      <button className="examples-btn" onClick={() => setOpen(o => !o)}>
        Examples ▾
      </button>
      {open && (
        <div className="examples-menu">
          {SAMPLES.map((s, i) => (
            <button
              key={i}
              className="examples-item"
              onClick={() => { onSelect(s.code); setOpen(false) }}
            >
              <span className="examples-item-label">{s.label}</span>
              <span className="examples-item-desc">{s.desc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Resizable split pane ─────────────────────────────────────
function ResizeHandle({ onDrag }) {
  const dragging = useRef(false)

  const onMouseDown = useCallback((e) => {
    e.preventDefault()
    dragging.current = true

    const onMove = (e) => { if (dragging.current) onDrag(e.clientX) }
    const onUp   = ()  => { dragging.current = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [onDrag])

  return <div className="resize-handle" onMouseDown={onMouseDown} />
}

// ── App ──────────────────────────────────────────────────────
export default function App() {
  const [code, setCode]         = useState(EXAMPLE_CODE)
  const [output, setOutput]     = useState('')
  const [astText, setAstText]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [hasError, setHasError] = useState(false)
  const [rightTab, setRightTab] = useState('output')
  const [isDark, setIsDark]     = useState(true)
  const [splitPct, setSplitPct] = useState(55)
  const bodyRef   = useRef(null)
  const editorRef = useRef(null)
  const monacoRef = useRef(null)

  function handleEditorMount(editor, monaco) {
    editorRef.current = editor
    monacoRef.current = monaco
    registerSbmlLanguage(monaco)
    const model = editor.getModel()
    if (model) monaco.editor.setModelLanguage(model, LANG_ID)
    editor.addCommand(2048 | 3, handleRun)
  }

  function toggleTheme() {
    const next = !isDark
    setIsDark(next)
    if (monacoRef.current) monacoRef.current.editor.setTheme(next ? 'sbml-dark' : 'sbml-light')
  }

  const handleResize = useCallback((clientX) => {
    if (!bodyRef.current) return
    const rect = bodyRef.current.getBoundingClientRect()
    const pct  = Math.min(80, Math.max(20, ((clientX - rect.left) / rect.width) * 100))
    setSplitPct(pct)
    setTimeout(() => editorRef.current?.layout(), 0)
  }, [])

  async function handleRun() {
    setLoading(true)
    setHasError(false)
    setOutput('')
    setAstText('')

    try {
      // Run both evaluate and parse in parallel
      const [evalRes, parseRes] = await Promise.all([
        fetch('/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, mode: 'E' }),
        }),
        fetch('/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, mode: 'P' }),
        }),
      ])

      const [evalData, parseData] = await Promise.all([evalRes.json(), parseRes.json()])

      // Output tab
      if (evalData.error) {
        setHasError(true)
        setOutput(evalData.error)
      } else {
        const txt = evalData.output || ''
        const isErr = txt.startsWith('SYNTAX') || txt.startsWith('SEMANTIC')
        setOutput(txt || '(no output)')
        if (isErr) setHasError(true)
      }

      // AST tabs
      if (!parseData.error) {
        const ptxt = parseData.output || ''
        const isParseErr = ptxt.startsWith('SYNTAX') || ptxt.startsWith('SEMANTIC')
        if (!isParseErr) setAstText(ptxt)
        else setAstText('')
      }

      setRightTab('output')
    } catch (err) {
      setHasError(true)
      setOutput(`Network error: ${err.message}\nIs the Flask server running?\n  python3 server.py`)
      setRightTab('output')
    } finally {
      setLoading(false)
    }
  }

  const tabs = [
    { id: 'output',   label: 'Output' },
    { id: 'ast-text', label: 'AST Text' },
    { id: 'ast-tree', label: 'AST Tree' },
    { id: 'syntax',   label: 'Syntax Reference' },
    { id: 'playback',   label: 'Playback' },
    { id: 'eval-trace', label: 'Eval Trace' },
  ]

  return (
    <div className={`app ${isDark ? 'dark' : 'light'}`}>
      <header className="app-header">
        <h1>SBML Web IDE</h1>
        <div className="controls">
          <ExamplesDropdown onSelect={setCode} />
          <button className="theme-btn" onClick={toggleTheme} title="Toggle theme">
            {isDark ? <SunIcon /> : <MoonIcon />}
          </button>
          <button className="run-button" onClick={handleRun} disabled={loading}>
            {loading ? 'Running…' : '▶ Run'}
          </button>
        </div>
      </header>

      <main className="app-body" ref={bodyRef}>
        <section className="editor-pane" style={{ width: `${splitPct}%` }}>
          <Editor
            height="100%"
            language={LANG_ID}
            theme={isDark ? 'sbml-dark' : 'sbml-light'}
            value={code}
            onChange={val => setCode(val ?? '')}
            onMount={handleEditorMount}
            options={{
              fontSize: 14,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              lineNumbers: 'on',
              renderLineHighlight: 'all',
              fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
              padding: { top: 12 },
            }}
          />
        </section>

        <ResizeHandle onDrag={handleResize} />

        <section className="right-pane" style={{ width: `${100 - splitPct}%` }}>
          <div className="tab-bar">
            {tabs.map(t => (
              <button
                key={t.id}
                className={`tab-btn ${rightTab === t.id ? 'active' : ''}`}
                onClick={() => setRightTab(t.id)}
              >
                {t.label}
              </button>
            ))}
            {(rightTab === 'output' || rightTab === 'ast-text') && (output || astText) && (
              <button
                className="clear-btn"
                onClick={() => { setOutput(''); setAstText(''); setHasError(false) }}
              >
                Clear
              </button>
            )}
          </div>

          {rightTab === 'output' && (
            <pre className={`output-content ${hasError ? 'error' : ''}`}>
              {output || 'Click ▶ Run (or Ctrl+Enter) to execute your code.'}
            </pre>
          )}

          {rightTab === 'ast-text' && (
            <pre className="output-content ast-text-content">
              {astText || 'Run the code to see the AST text.'}
            </pre>
          )}

          {rightTab === 'ast-tree' && (
            <AstTree text={astText} isDark={isDark} />
          )}

          {rightTab === 'playback' && (
            <Playback code={code} isDark={isDark} />
          )}

          {rightTab === 'eval-trace' && (
            <EvalTrace code={code} isDark={isDark} />
          )}

          {rightTab === 'syntax' && (
            <div className="syntax-panel">
              {SYNTAX_SECTIONS.map(section => (
                <div key={section.title} className="syntax-section">
                  <div className="syntax-section-title">{section.title}</div>
                  <table className="syntax-table">
                    <tbody>
                      {section.items.map(item => (
                        <tr key={item.syntax}>
                          <td className="syntax-code">{item.syntax}</td>
                          <td className="syntax-desc">{item.desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
