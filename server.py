import io
import contextlib
import threading

from flask import Flask, request, jsonify
from flask_cors import CORS

import sbml_parser as p
import sbml_ast as ast_module
from sbml_ast import SemanticError, ENV, FUNCTIONS

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "http://localhost:5173"}})
EXECUTION_LOCK = threading.Lock()


def _semantic_error(source: str, exc: SemanticError) -> str:
    if exc.position is None:
        return f"Semantic error: {exc}"
    line = source.count("\n", 0, exc.position) + 1
    column = exc.position - source.rfind("\n", 0, exc.position)
    return f"Semantic error at line {line}, column {column}: {exc}"


def run_interpreter(source: str, mode: str) -> dict:
    buf = io.StringIO()

    with contextlib.redirect_stdout(buf):
        try:
            root = p.parser.parse(source, lexer=p.new_lexer())
            if root is None:
                raise SyntaxError("empty parse result")
        except SyntaxError as exc:
            return {"output": "", "error": f"Syntax error {exc}"}
        except Exception as exc:
            return {"output": "", "error": f"Internal interpreter error: {exc}"}

        ENV.clear()

        if mode == "P":
            try:
                ENV.clear()
                print(root)
            except SemanticError as exc:
                return {"output": buf.getvalue(), "error": _semantic_error(source, exc)}
            except Exception as exc:
                return {"output": buf.getvalue(), "error": f"Internal interpreter error: {exc}"}

        elif mode == "E":
            try:
                ENV.clear()
                root.evaluate()
            except SemanticError as exc:
                return {"output": buf.getvalue(), "error": _semantic_error(source, exc)}
            except Exception as exc:
                return {"output": buf.getvalue(), "error": f"Internal interpreter error: {exc}"}

        else:
            return {"output": "", "error": f"Invalid mode: {mode}. Use 'E' or 'P'."}

    return {"output": buf.getvalue(), "error": None}


@app.route("/run", methods=["POST"])
def run_endpoint():
    data = request.get_json(force=True, silent=True)

    if not data:
        return jsonify({"output": "", "error": "Request body must be JSON"}), 400

    code = data.get("code", "")
    mode = data.get("mode", "E").upper()

    if mode not in ("E", "P"):
        return jsonify({"output": "", "error": "mode must be 'E' or 'P'"}), 400

    if not isinstance(code, str):
        return jsonify({"output": "", "error": "code must be a string"}), 400

    with EXECUTION_LOCK:
        result = run_interpreter(code, mode)
    return jsonify(result), 422 if result["error"] else 200


@app.route("/tokens", methods=["POST"])
def tokens_endpoint():
    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify({"tokens": [], "error": "Request body must be JSON"}), 400
    code = data.get("code", "")
    if not isinstance(code, str):
        return jsonify({"tokens": [], "error": "code must be a string"}), 400
    try:
        lex = p.new_lexer()
        lex.input(code)
        raw_tokens = []
        while True:
            tok = lex.token()
            if not tok:
                break
            if isinstance(tok.value, bool):
                raw_value = "True" if tok.value else "False"
            else:
                raw_value = str(tok.value)
            raw_tokens.append({"type": tok.type, "value": raw_value, "start": tok.lexpos})
    except SyntaxError as exc:
        return jsonify({"tokens": [], "error": f"Syntax error {exc}"}), 422
    # Compute end positions (walk back whitespace from next token's start)
    for i, t in enumerate(raw_tokens):
        end = raw_tokens[i + 1]["start"] if i + 1 < len(raw_tokens) else len(code)
        while end > t["start"] and code[end - 1] in (' ', '\t', '\n', '\r'):
            end -= 1
        t["end"] = end
    return jsonify({"tokens": raw_tokens, "error": None}), 200


def _env_snapshot():
    """Return a flat dict of all visible variables (outermost wins)."""
    result = {}
    for frame in ENV.stack:
        for k, v in frame.items():
            result[k] = repr(v)
    return result


def _val_repr(v):
    if v is None:
        return None
    if isinstance(v, bool):
        return "True" if v else "False"
    return repr(v)


def run_trace(source: str) -> dict:
    """Parse, then evaluate with instrumentation. Returns list of trace steps."""
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        try:
            root = p.parser.parse(source, lexer=p.new_lexer())
            if root is None:
                raise SyntaxError("empty parse result")
        except SyntaxError as exc:
            return {"steps": [], "ast": "", "error": f"Syntax error {exc}"}

    # Get the full AST text (needed by the frontend for node matching)
    ast_buf = io.StringIO()
    with contextlib.redirect_stdout(ast_buf):
        try:
            ENV.clear()
            print(root)
        except Exception:
            pass
    ast_text = ast_buf.getvalue().rstrip("\n")

    # Build a map: first line of each node's __str__ → list of nodes
    # We'll assign each node a unique sequential "node_id" by DFS order
    node_id_map = {}  # id(node) -> int
    counter = [0]

    def assign_ids(node):
        if not isinstance(node, ast_module.Node):
            return
        node_id_map[id(node)] = counter[0]
        counter[0] += 1
        # Recurse into known child attributes
        for attr in ('func_defs', 'statements', 'args', 'value'):
            child_list = getattr(node, attr, None)
            if isinstance(child_list, list):
                for c in child_list:
                    if isinstance(c, ast_module.Node):
                        assign_ids(c)
        for attr in ('main_block', 'block', 'return_expr', 'expr',
                     'condition', 'then_block', 'else_block',
                     'left', 'right', 'operand', 'sequence', 'index',
                     'tuple_sequence'):
            child = getattr(node, attr, None)
            if isinstance(child, ast_module.Node):
                assign_ids(child)

    assign_ids(root)

    # Instrument: wrap every node class's evaluate() to record steps
    steps = []
    stdout_buf = io.StringIO()

    # Classes that have evaluate() methods
    node_classes = [
        ast_module.Program, ast_module.Block, ast_module.FunctionDef,
        ast_module.FunctionCall, ast_module.Int, ast_module.Real,
        ast_module.String, ast_module.Bool, ast_module.List, ast_module.Tuple,
        ast_module.Var, ast_module.BinOp, ast_module.UnaryOp, ast_module.Index,
        ast_module.TupleIndex, ast_module.Assign, ast_module.Print,
        ast_module.If, ast_module.While,
    ]

    original_evals = {cls: cls.evaluate for cls in node_classes}

    def make_wrapper(cls, orig_eval):
        def wrapper(self_node):
            node_id = node_id_map.get(id(self_node), -1)
            # Capture the node's label (first line of __str__, stripped of tabs)
            label = str(self_node).split("\n")[0].strip()
            depth = self_node.parentCount()
            env_before = _env_snapshot()
            printed_before = stdout_buf.getvalue()

            step_idx = len(steps)
            steps.append({
                "step": step_idx,
                "nodeId": node_id,
                "nodeType": cls.__name__,
                "label": label,
                "depth": depth,
                "phase": "enter",
                "env": env_before,
                "returned": None,
                "printed": "",
            })

            try:
                result = orig_eval(self_node)
            except SemanticError as exc:
                printed_now = stdout_buf.getvalue()[len(printed_before):]
                steps.append({
                    "step": len(steps),
                    "nodeId": node_id,
                    "nodeType": cls.__name__,
                    "label": label,
                    "depth": depth,
                    "phase": "error",
                    "env": _env_snapshot(),
                    "returned": None,
                    "printed": printed_now,
                    "error": str(exc),
                })
                raise

            printed_now = stdout_buf.getvalue()[len(printed_before):]
            steps[step_idx]["phase"] = "eval"
            steps.append({
                "step": len(steps),
                "nodeId": node_id,
                "nodeType": cls.__name__,
                "label": label,
                "depth": depth,
                "phase": "return",
                "env": _env_snapshot(),
                "returned": _val_repr(result),
                "printed": printed_now,
            })
            return result
        return wrapper

    # Patch
    for cls in node_classes:
        cls.evaluate = make_wrapper(cls, original_evals[cls])

    try:
        ENV.clear()
        FUNCTIONS.clear()
        with contextlib.redirect_stdout(stdout_buf):
            try:
                root.evaluate()
            except SemanticError:
                pass
            except Exception:
                pass
    finally:
        # Always restore original methods
        for cls in node_classes:
            cls.evaluate = original_evals[cls]

    return {"steps": steps, "ast": ast_text, "error": None}


def _build_playback_data(source: str):
    """
    Parse source, extract tokens with positions, and compute per-token AST line visibility.

    Each AST node has a _lexpos attribute (set by the parser rules) equal to the char
    position of its last token in source. We use this to determine exactly when each
    AST line should be revealed during playback.

    Returns dict with:
      - tokens: list of {type, value, start, end}
      - astText: full AST as string
      - perTokenAstLines: list of ints (one per token); perTokenAstLines[i] = number of
        AST lines that should be visible after token i is highlighted
      - error: None or error string
    """
    import io as _io
    import contextlib as _ctx

    # 1. Lex tokens with positions
    try:
        lex = p.new_lexer()
        lex.input(source)
        raw_tokens = []
        while True:
            tok = lex.token()
            if not tok:
                break
            if isinstance(tok.value, bool):
                raw_value = "True" if tok.value else "False"
            else:
                raw_value = str(tok.value)
            raw_tokens.append({"type": tok.type, "value": raw_value, "start": tok.lexpos})
    except SyntaxError as exc:
        return {"tokens": [], "astText": "", "perTokenAstLines": [], "error": f"Syntax error {exc}"}

    # Compute end positions (trim trailing whitespace from next token's start)
    for i, t in enumerate(raw_tokens):
        end = raw_tokens[i + 1]["start"] if i + 1 < len(raw_tokens) else len(source)
        while end > t["start"] and source[end - 1] in (' ', '\t', '\n', '\r'):
            end -= 1
        t["end"] = end

    if not raw_tokens:
        return {"tokens": [], "astText": "", "perTokenAstLines": [], "error": None}

    # 2. Parse — each node gets ._lexpos set by the parser rules
    try:
        root = p.parser.parse(source, lexer=p.new_lexer())
        if root is None:
            raise SyntaxError("empty parse")
    except SyntaxError as exc:
        return {"tokens": raw_tokens, "astText": "", "perTokenAstLines": [0] * len(raw_tokens), "error": f"Syntax error {exc}"}

    # 3. Get full AST text
    ast_buf = _io.StringIO()
    with _ctx.redirect_stdout(ast_buf):
        try:
            ENV.clear()
            print(root)
        except Exception:
            pass
    ast_text = ast_buf.getvalue().rstrip('\n')

    if not ast_text:
        return {"tokens": raw_tokens, "astText": "", "perTokenAstLines": [0] * len(raw_tokens), "error": None}

    total_ast_lines = ast_text.count('\n') + 1

    # 4. Build a lookup: token start position -> token index
    pos_to_tok = {t["start"]: i for i, t in enumerate(raw_tokens)}

    def tok_idx_for_lexpos(lexpos):
        """Return the token index whose start position == lexpos, or the nearest preceding one."""
        if lexpos in pos_to_tok:
            return pos_to_tok[lexpos]
        # Find the last token that starts at or before lexpos
        best = 0
        for i, t in enumerate(raw_tokens):
            if t["start"] <= lexpos:
                best = i
            else:
                break
        return best

    # 5. Walk the AST in the same order __str__ emits lines, assigning each AST line
    #    the token index at which it should be revealed.
    #    Container headers use _start_lexpos (first token), closing brackets use _lexpos.
    #    This ensures reveal order is top-to-bottom monotonically non-decreasing.
    line_reveal_token = [len(raw_tokens) - 1] * total_ast_lines

    def mark_start(offset, node):
        """Reveal at the node's first token (_start_lexpos), for container headers."""
        if offset < total_ast_lines:
            lp = getattr(node, '_start_lexpos', node._lexpos)
            line_reveal_token[offset] = tok_idx_for_lexpos(lp)

    def mark_end(offset, node):
        """Reveal at the node's last token (_lexpos), for closing brackets."""
        if offset < total_ast_lines:
            line_reveal_token[offset] = tok_idx_for_lexpos(node._lexpos)

    def mark_leaf(offset, node):
        """Reveal leaf nodes at their single token position."""
        if offset < total_ast_lines:
            line_reveal_token[offset] = tok_idx_for_lexpos(node._lexpos)

    def assign_node_lines(node, offset):
        if not isinstance(node, ast_module.Node):
            return offset
        cls = node.__class__.__name__

        if cls == 'Program':
            mark_start(offset, node); offset += 1
            for f in (node.func_defs or []):
                offset = assign_node_lines(f, offset)
            offset = assign_node_lines(node.main_block, offset)

        elif cls == 'Block':
            mark_start(offset, node); offset += 1   # "Block{"
            for s in node.statements:
                offset = assign_node_lines(s, offset)
            mark_end(offset, node); offset += 1     # closing "}"

        elif cls == 'FunctionDef':
            mark_start(offset, node); offset += 1   # "fun name(...)"
            offset = assign_node_lines(node.block, offset)
            offset = assign_node_lines(node.return_expr, offset)

        elif cls == 'FunctionCall':
            mark_start(offset, node); offset += 1   # "name("
            for a in (node.args or []):
                offset = assign_node_lines(a, offset)

        elif cls == 'If':
            mark_start(offset, node); offset += 1   # "If"
            offset = assign_node_lines(node.condition, offset)
            offset = assign_node_lines(node.then_block, offset)
            if node.else_block:
                offset = assign_node_lines(node.else_block, offset)

        elif cls == 'While':
            mark_start(offset, node); offset += 1   # "While"
            offset = assign_node_lines(node.condition, offset)
            offset = assign_node_lines(node.block, offset)

        elif cls == 'Assign':
            mark_start(offset, node); offset += 1   # "Assign"
            offset = assign_node_lines(node.left, offset)
            offset = assign_node_lines(node.right, offset)

        elif cls == 'Print':
            mark_start(offset, node); offset += 1   # "Print"
            offset = assign_node_lines(node.expr, offset)

        elif cls == 'BinOp':
            mark_start(offset, node); offset += 1   # "BinOp(op)"
            offset = assign_node_lines(node.left, offset)
            offset = assign_node_lines(node.right, offset)

        elif cls == 'UnaryOp':
            mark_start(offset, node); offset += 1   # "UnaryOp(op)"
            offset = assign_node_lines(node.operand, offset)

        elif cls == 'Index':
            mark_start(offset, node); offset += 1   # "Index"
            offset = assign_node_lines(node.sequence, offset)
            offset = assign_node_lines(node.index, offset)

        elif cls == 'TupleIndex':
            mark_start(offset, node); offset += 1   # "TupleIndex"
            offset = assign_node_lines(node.tuple_sequence, offset)
            offset = assign_node_lines(node.index, offset)

        elif cls == 'List':
            elements = node.value if isinstance(node.value, list) else []
            mark_start(offset, node); offset += 1   # "List[" or "List[]"
            for e in elements:
                offset = assign_node_lines(e, offset)
            if elements:
                mark_end(offset, node); offset += 1  # closing "]"

        elif cls == 'Tuple':
            elements = node.value if isinstance(node.value, list) else []
            mark_start(offset, node); offset += 1   # "Tuple("
            for e in elements:
                offset = assign_node_lines(e, offset)
            mark_end(offset, node); offset += 1     # closing ")"

        else:
            # Leaf: Int, Real, String, Bool, Var — single line
            mark_leaf(offset, node); offset += 1

        return offset

    assign_node_lines(root, 0)

    # Apply a cumulative-max pass so line_reveal_token is monotonically non-decreasing.
    # This guarantees astLines.slice(0, N) always shows a consistent top-to-bottom prefix.
    for i in range(1, total_ast_lines):
        if line_reveal_token[i] < line_reveal_token[i - 1]:
            line_reveal_token[i] = line_reveal_token[i - 1]

    # 6. perTokenAstLines[i] = number of lines revealed after processing token i
    #    A line is revealed when its reveal_token <= i (i.e. that token has been stepped to)
    per_token = []
    for tok_idx in range(len(raw_tokens)):
        count = sum(1 for rt in line_reveal_token if rt <= tok_idx)
        per_token.append(count)

    return {
        "tokens": raw_tokens,
        "astText": ast_text,
        "perTokenAstLines": per_token,
        "error": None,
    }


@app.route("/playback", methods=["POST"])
def playback_endpoint():
    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify({"tokens": [], "astText": "", "perTokenAstLines": [], "error": "Request body must be JSON"}), 400
    code = data.get("code", "")
    if not isinstance(code, str):
        return jsonify({"tokens": [], "astText": "", "perTokenAstLines": [], "error": "code must be a string"}), 400
    with EXECUTION_LOCK:
        result = _build_playback_data(code)
    return jsonify(result), 422 if result["error"] else 200


@app.route("/trace", methods=["POST"])
def trace_endpoint():
    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify({"steps": [], "ast": "", "error": "Request body must be JSON"}), 400
    code = data.get("code", "")
    if not isinstance(code, str):
        return jsonify({"steps": [], "ast": "", "error": "code must be a string"}), 400
    with EXECUTION_LOCK:
        result = run_trace(code)
    return jsonify(result), 422 if result["error"] else 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)
