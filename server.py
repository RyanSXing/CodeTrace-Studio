import sys
import io
import contextlib
import copy

from flask import Flask, request, jsonify
from flask_cors import CORS

import sbml_parser as p
import sbml_ast as ast_module
from sbml_ast import SemanticError, ENV, FUNCTIONS

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "http://localhost:5173"}})


def run_interpreter(source: str, mode: str) -> dict:
    buf = io.StringIO()

    with contextlib.redirect_stdout(buf):
        try:
            root = p.parser.parse(source, lexer=p.lexer.clone())
            if root is None:
                raise SyntaxError("empty parse result")
        except Exception:
            print("SYNTAX ERROR")
            return {"output": buf.getvalue(), "error": None}

        try:
            ENV.clear()
        except Exception:
            pass

        if mode == "P":
            try:
                ENV.clear()
                print(root)
            except SemanticError:
                print("SEMANTIC ERROR")
            except Exception:
                print("SEMANTIC ERROR")

        elif mode == "E":
            try:
                ENV.clear()
                root.evaluate()
            except SemanticError:
                print("SEMANTIC ERROR")
            except Exception:
                print("SEMANTIC ERROR")

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

    result = run_interpreter(code, mode)
    return jsonify(result), 200


@app.route("/tokens", methods=["POST"])
def tokens_endpoint():
    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify({"tokens": [], "error": "Request body must be JSON"}), 400
    code = data.get("code", "")
    if not isinstance(code, str):
        return jsonify({"tokens": [], "error": "code must be a string"}), 400
    try:
        lex = p.lexer.clone()
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
    except SyntaxError:
        return jsonify({"tokens": [], "error": "SYNTAX ERROR"}), 200
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
            root = p.parser.parse(source, lexer=p.lexer.clone())
            if root is None:
                raise SyntaxError("empty parse result")
        except Exception:
            return {"steps": [], "ast": "", "error": "SYNTAX ERROR"}

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
            except SemanticError:
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
                    "error": "SEMANTIC ERROR",
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


@app.route("/trace", methods=["POST"])
def trace_endpoint():
    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify({"steps": [], "ast": "", "error": "Request body must be JSON"}), 400
    code = data.get("code", "")
    if not isinstance(code, str):
        return jsonify({"steps": [], "ast": "", "error": "code must be a string"}), 400
    result = run_trace(code)
    return jsonify(result), 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True)
