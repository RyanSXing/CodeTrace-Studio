# SBML Interpreter

Interpreter for a small block-structured language (SBML), written in Python.
It parses SBML source code into an abstract syntax tree (AST) and evaluates it with support for variables, expressions, conditionals, loops, and user-defined functions.

> Example: computing the greatest common divisor (GCD)
> **Input:**
>
> ```sbml
> fun gcd(a, b) =
> {
>   t = b;
>   b = a mod b;
>   if (b == 0)
>   {
>     output = t;
>   }
>   else
>   {
>     output = gcd(t, b);
>   }
> }
> output;
> {
>   print(gcd(32, 18));
> }
> ```
>
> **Output:**
>
> ```text
> 2
> ```


## Features

* **Lexer & Parser**

  * Tokenizes SBML source code.
  * Builds an AST for programs, blocks, statements, and expressions.

* **AST Evaluation**

  * Environment stack for variables and scopes.
  * Function definitions and recursive calls.
  * `output` variable used to return values from functions.

* **Language Constructs**

  * Integer variables and assignments.
  * Arithmetic: `+`, `-`, `*`, `/`, `mod`
  * Comparisons: `==`, `!=`, `<`, `<=`, `>`, `>=`
  * `if` / `else`
  * `while` loops
  * `fun` function definitions
  * `print(...)` built-in

* **Semantic Error Checking**

  * Duplicate function names.
  * Invalid programs (parser / semantic errors) reported as `SEMANTIC ERROR` (following the assignment spec).


## Project Structure

```text
.
├── sbml_ast.py      # AST node classes and evaluation logic
├── sbml_parser.py   # Lexer and parser that build the AST
├── sbml_main.py     # Command-line entry point / driver
└── CSE307-S20-HWA05.pdf  # Original assignment specification (optional)
```


## Getting Started

### Prerequisites

* Python 3.x

No external dependencies should be required beyond the standard library.

### Running the Interpreter

Depending on how `sbml_main.py` is written, you’ll typically run the interpreter in one of these ways:

1. **Passing a source file as an argument**

   ```bash
   python3 sbml_main.py program.sbml
   ```

2. **Reading SBML from standard input**

   ```bash
   python3 sbml_main.py < program.sbml
   ```

On semantic or parsing errors, the interpreter prints:

```text
SEMANTIC ERROR
```

as required by the assignment.


## Example

Create a file `gcd.sbml`:

```sbml
fun gcd(a, b) =
{
  t = b;
  b = a mod b;
  if (b == 0)
  {
    output = t;
  }
  else
  {
    output = gcd(t, b);
  }
}
output;
{
  print(gcd(32, 18));
}
```

Run:

```bash
python3 sbml_main.py gcd.sbml
```

Expected output:

```text
2
```


## Implementation Details

* **Program Loading**

  * `sbml_main.py` reads the entire SBML program, passes it to the parser, and then evaluates the resulting `Program` object.

* **Function Table**

  * All function definitions are collected before program execution (e.g., in a global `FUNCTIONS` dictionary).
  * Duplicate function names raise a semantic error.

* **Environments / Scopes**

  * An environment stack tracks variable bindings.
  * New blocks and function calls push a new environment; exiting them pops it.
  * This supports nested scopes and recursion.

* **Error Handling**

  * Parsing or semantic issues raise custom exceptions (e.g., `SemanticError`).
  * The main driver catches these and prints `SEMANTIC ERROR` to match the spec.


## Possible Extensions

* Add more data types (strings, booleans as first-class values, arrays).
* Add `return` statements instead of using `output`.
* Improve error messages (line/column numbers, hints).
* Add a REPL (interactive prompt) for SBML.


## Acknowledgements

This interpreter was implemented as part of a programming languages course assignment based on a provided SBML specification. The language design and original problem description come from course materials; the parser, AST, and evaluator implementations are my own.
# Mini-language Interpreter (SBML)

This repository contains a small block-structured language interpreter (SBML) implemented in Python with an optional web-based frontend for interactive editing, token inspection, AST viewing, and execution tracing.

Two primary ways to use this project:

- Command-line interpreter (core Python implementation)
- Web UI (frontend) that talks to a Flask backend (`server.py`) for parsing, tokenization, execution, and tracing

**Status:** working prototype — parser, AST, evaluator, and a Vite-powered frontend are included.

**Key features**

- Full lexer & parser that builds an AST
- AST-based evaluator with scoped environments and functions
- Syntax (`SYNTAX ERROR`) and semantic (`SEMANTIC ERROR`) error handling
- HTTP API for running code, tokenizing, and generating execution traces
- Vite + React frontend for interactive exploration and playback

**Quick Links**

- File: [`server.py`](server.py#L1) — Flask backend exposing `/run`, `/tokens`, `/trace`
- File: [`sbml_parser.py`](sbml_parser.py#L1) — lexer & parser
- File: [`sbml_ast.py`](sbml_ast.py#L1) — AST node classes and evaluation
- File: [`sbml_main.py`](sbml_main.py#L1) — (optional) CLI driver for offline runs
- Folder: [`frontend/`](frontend) — web UI (Vite + React)

Repository layout

```
.
├── sbml_ast.py        # AST node classes and evaluation logic
├── sbml_parser.py     # Lexer and parser that build the AST
├── sbml_main.py       # CLI entry point (run SBML files from terminal)
├── server.py          # Flask backend used by the frontend (HTTP API)
├── requirements.txt   # Python backend dependencies
├── parsetab.py        # Generated parser table (PLY)
└── frontend/          # Vite + React web frontend
```

Prerequisites

- Python 3.8+ (3.10+ recommended)
- Node.js (16+) and `npm` to run the frontend

Installation

1. Install Python dependencies:

```bash
pip install -r requirements.txt
```

2. Install frontend dependencies (from the `frontend` folder):

```bash
cd frontend
npm install
```

Running the project

Backend (Flask API)

```bash
python server.py
```

The Flask server runs on port `5001` by default and exposes these endpoints:

- `POST /run` — runs SBML source. JSON body: `{ "code": "...", "mode": "E" }` where `mode` is `E` (evaluate) or `P` (print/pretty AST). Returns `{ "output": "...", "error": null }`.
- `POST /tokens` — tokenizes source and returns token ranges for highlighting.
- `POST /trace` — returns an execution trace (step-by-step) and AST text used by the frontend.

Web frontend (development)

Run the frontend dev server (from `frontend/`):

```bash
cd frontend
npm run dev
```

The frontend is configured to communicate with the backend at `http://localhost:5001` and expects the dev server to run (Vite defaults to port `5173`).

Command-line usage

You can still run SBML programs directly via the CLI driver:

```bash
python sbml_main.py path/to/program.sbml
```

Or pipe source via stdin:

```bash
python sbml_main.py < program.sbml
```

Error handling

- Syntax problems result in `SYNTAX ERROR` (printed to stdout or returned by API)
- Semantic issues (type/semantic checks) produce `SEMANTIC ERROR`

Development notes

- The parser uses PLY; `parsetab.py` is generated for performance. If you modify the grammar, remove `parsetab.py` to force regeneration.
- `server.py` uses the global `ENV` and `FUNCTIONS` from `sbml_ast.py` — expect global state to be cleared by the server before runs and traces.

Contributing

Feel free to open issues or PRs. Suggested enhancements:

- Add richer types (strings, booleans as first-class values)
- Add explicit `return` semantics instead of `output`
- Improve error messages with line/column info
- Add unit tests and CI

License

This repository does not include a license file. Add one if you intend to share the code publicly.

Acknowledgements

This code began as an academic assignment to implement a small block-structured language; the web UI was added to aid visualization and tracing of program execution.
