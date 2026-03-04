#Ryan Xing 116607537

tokens = (
  'INT','REAL','STRING','BOOL', 'NAME',
  'LPAREN','RPAREN','LBRACK', 'RBRACK', 'LBRACE', 'RBRACE',
  'COMMA', 'HASH', 'SEMI', 'ASSIGN',
  'EXP', 'TIMES', 'DIV','INTDIV', 'MOD', 'PLUS', 'MINUS',
  'IN', 'CONS',
  'NOT', 'ANDALSO', 'ORELSE',
  'LESSTHAN', 'LESSTHANEQUAL', 'EQUALSTO', 'NOTEQUAL', 'GREATERTHANEQUAL', 'GREATERTHAN',
  'PRINT', 'IF', 'ELSE', 'WHILE', 'FUN'
)

t_LESSTHANEQUAL     = r'<='
t_GREATERTHANEQUAL  = r'>='
t_EQUALSTO          = r'=='
t_NOTEQUAL          = r'<>'
t_LESSTHAN          = r'<'
t_GREATERTHAN       = r'>'

t_LPAREN  = r'\('
t_RPAREN  = r'\)'
t_LBRACK  = r'\['
t_RBRACK  = r'\]'
t_LBRACE  = r'\{'
t_RBRACE  = r'\}'
t_COMMA   = r','
t_HASH    = r'\#'
t_SEMI     = r';'
t_ASSIGN   = r'='

t_EXP     = r'\*\*'
t_TIMES   = r'\*'
t_DIV     = r'/'
# t_INTDIV  = r'div'
# t_MOD     = r'mod'
t_PLUS    = r'\+'
t_MINUS   = r'-'

t_IN      = r'in'
t_CONS    = r'::'
# t_NOT     = r'not'
# t_ANDALSO = r'andalso'
# t_ORELSE  = r'orelse'

reserved = {
    'in': 'IN',
    'not': 'NOT',
    'andalso': 'ANDALSO',
    'orelse': 'ORELSE',
    'div': 'INTDIV',
    'mod': 'MOD',
    'print': 'PRINT',
    'if': 'IF',
    'else': 'ELSE',
    'while': 'WHILE',
    'fun': 'FUN',
}

def t_BOOL(t):
  r'True|False'
  t.value = (t.value == 'True')
  return t

def t_NAME(t):
    r'[a-zA-Z][a-zA-Z0-9_]*'
    t.type = reserved.get(t.value, 'NAME')
    return t

def t_STRING(t):
    r'(?:"[^"\n]*"|\'[^\'\n]*\')'
    t.value = t.value[1:-1]
    return t


def t_REAL(t):
  r'((\d+\.\d*)|(\.\d+)|(\d+\.\d+))([eE][+-]?\d+)?'
  try:
    t.value = float(t.value)
  except ValueError:
    print("Integer value too large %d", t.value)
    t.value = 0.0
  return t

def t_INT(t):
  r'\d+'
  try:
    t.value = int(t.value)
  except:
    print("Integer value too large %d", t.value)
    t.value = 0
  return t



t_ignore = " \t"

def t_newline(t):
  r'\n+'
  t.lexer.lineno += t.value.count("\n")

def t_error(t):
  #print("Illegal character '%s'" % t.value[0])
  raise SyntaxError("SYNTAX ERROR")
  #t.lexer.skip(1)

import ply.lex as lex
lexer = lex.lex()

precedence = (
  ('left', 'ORELSE'),
  ('left', 'ANDALSO'),
  ('right', 'NOT'),
  ('nonassoc', 'LESSTHAN', 'LESSTHANEQUAL','EQUALSTO','NOTEQUAL','GREATERTHANEQUAL','GREATERTHAN'),
  ('right', 'CONS'),
  ('left', 'IN'),
  ('left', 'PLUS', 'MINUS'),
  ('left', 'TIMES','DIV','INTDIV','MOD'),
  ('right', 'EXP'),
  ('left', 'HASH'),
  ('left', 'LBRACK', 'RBRACK')
)

import sbml_ast as ast

start = 'program'

def p_program_with_funcs(t):
  'program : funcdef_list block'
  t[0] = ast.Program(t[1], t[2])
  t[0]._lexpos = t[2]._lexpos
  t[0]._start_lexpos = t[1][0]._start_lexpos if t[1] else t[2]._start_lexpos

def p_program_block_only(t):
  'program : block'
  t[0] = t[1]

def p_block(t):
  'block : LBRACE stmt_list RBRACE'
  t[0] = ast.Block(t[2])
  t[0]._lexpos = t.lexpos(3)       # RBRACE
  t[0]._start_lexpos = t.lexpos(1) # LBRACE

def p_funcdef_list_multi(t):
  'funcdef_list : funcdef_list funcdef'
  t[0] = t[1] + [t[2]]

def p_funcdef_single(t):
  'funcdef_list : funcdef'
  t[0] = [t[1]]

def p_param_list_single(t):
  'param_list : NAME'
  t[0] = [t[1]]

def p_param_list_multi(t):
  'param_list : param_list COMMA NAME'
  t[0] = t[1] + [t[3]]

def p_param_list_opt_empty(t):
  'param_list_opt : '
  t[0] = []

def p_param_list_opt(t):
  'param_list_opt : param_list'
  t[0] = t[1]

def p_funcdef(t):
  'funcdef : FUN NAME LPAREN param_list_opt RPAREN ASSIGN block expr SEMI'
  t[0] = ast.FunctionDef(t[2], t[4], t[7], t[8])
  t[0]._lexpos = t.lexpos(9)        # SEMI
  t[0]._start_lexpos = t.lexpos(1)  # FUN

def p_stmt_list_multi(t):
  'stmt_list : stmt_list statement'
  t[0] = t[1] + [t[2]]

def p_stmt_list_single(t):
  'stmt_list : statement'
  t[0] = [t[1]]

def p_stmt_list_empty(t):
  'stmt_list : '
  t[0] = []

def p_statement_assign(t):
  'statement : lvalue ASSIGN expr SEMI'
  t[0] = ast.Assign(t[1], t[3])
  t[0]._lexpos = t.lexpos(4)          # SEMI
  t[0]._start_lexpos = t[1]._lexpos   # start of lvalue

def p_statement_print(t):
  'statement : PRINT LPAREN expr RPAREN SEMI'
  t[0] = ast.Print(t[3])
  t[0]._lexpos = t.lexpos(5)        # SEMI
  t[0]._start_lexpos = t.lexpos(1)  # PRINT

def p_statement_if(t):
  'statement : IF LPAREN expr RPAREN block'
  t[0] = ast.If(t[3], t[5])
  t[0]._lexpos = t[5]._lexpos       # end of then_block (RBRACE)
  t[0]._start_lexpos = t.lexpos(1)  # IF

def p_statement_if_else(t):
  'statement : IF LPAREN expr RPAREN block ELSE block'
  t[0] = ast.If(t[3], t[5], t[7])
  t[0]._lexpos = t[7]._lexpos       # end of else_block (RBRACE)
  t[0]._start_lexpos = t.lexpos(1)  # IF

def p_statement_while(t):
  'statement : WHILE LPAREN expr RPAREN block'
  t[0] = ast.While(t[3], t[5])
  t[0]._lexpos = t[5]._lexpos       # end of block (RBRACE)
  t[0]._start_lexpos = t.lexpos(1)  # WHILE

def p_statement_block(t):
    'statement : block'
    t[0] = t[1]

def p_lvalue_name(t):
    'lvalue : NAME'
    t[0] = ast.Var(t[1])
    t[0]._lexpos = t.lexpos(1)  # NAME

def p_lvalue_index(t):
    'lvalue : expr LBRACK expr RBRACK'
    t[0] = ast.Index(t[1], t[3])
    t[0]._lexpos = t.lexpos(4)          # RBRACK
    t[0]._start_lexpos = t[1]._lexpos   # start of sequence expr

def p_expr_fun_call(t):
    'expr : NAME LPAREN arg_list_opt RPAREN'
    t[0] = ast.FunctionCall(t[1], t[3])
    t[0]._lexpos = t.lexpos(4)        # RPAREN
    t[0]._start_lexpos = t.lexpos(1)  # NAME

def p_arg_list_single(t):
    'arg_list : expr'
    t[0] = [t[1]]

def p_arg_list_multi(t):
    'arg_list : arg_list COMMA expr'
    t[0] = t[1] + [t[3]]

def p_arg_list_opt_empty(t):
    'arg_list_opt : '
    t[0] = []

def p_arg_list_opt(t):
    'arg_list_opt : arg_list'
    t[0] = t[1]

def p_expr_name(t):
    'expr : NAME'
    t[0] = ast.Var(t[1])
    t[0]._lexpos = t.lexpos(1)  # NAME

def p_expr_tuple_index_expr(p):
    'expr : HASH INT LPAREN expr RPAREN'
    p[0] = ast.TupleIndex(p[4], ast.Int(p[2]))
    p[0]._lexpos = p.lexpos(5)         # RPAREN
    p[0]._start_lexpos = p.lexpos(1)   # HASH
    p[0].index._lexpos = p.lexpos(2)   # INT

def p_expr_tuple_index_tuple_literal(p):
    'expr : HASH INT LPAREN expr COMMA tuple_list RPAREN'
    p[0] = ast.TupleIndex(ast.Tuple([p[4]] + p[6]), ast.Int(p[2]))
    p[0]._lexpos = p.lexpos(7)         # RPAREN
    p[0]._start_lexpos = p.lexpos(1)   # HASH
    p[0].index._lexpos = p.lexpos(2)   # INT

def p_expr_int(t):
  'expr : INT'
  t[0] = ast.Int(t[1])
  t[0]._lexpos = t.lexpos(1)  # INT

def p_expr_real(t):
  'expr : REAL'
  t[0] = ast.Real(t[1])
  t[0]._lexpos = t.lexpos(1)  # REAL

def p_expr_str(t):
  'expr : STRING'
  t[0] = ast.String(t[1])
  t[0]._lexpos = t.lexpos(1)  # STRING

def p_expr_bool(t):
  'expr : BOOL'
  t[0] = ast.Bool(t[1])
  t[0]._lexpos = t.lexpos(1)  # BOOL

def p_expr_paren(t):
  'expr : LPAREN expr RPAREN'
  t[0] = t[2]
  # lexpos already set on t[2]; keep it (inner expr ends at its last token)

def p_expr_singleton_tuple(t):
  'expr : LPAREN expr COMMA RPAREN'
  t[0] = ast.Tuple([t[2]])
  t[0]._lexpos = t.lexpos(4)        # RPAREN
  t[0]._start_lexpos = t.lexpos(1)  # LPAREN

def p_expr_tuple(t):
  'expr : LPAREN expr COMMA tuple_list RPAREN'
  t[0] = ast.Tuple([t[2]] + t[4])
  t[0]._lexpos = t.lexpos(5)        # RPAREN
  t[0]._start_lexpos = t.lexpos(1)  # LPAREN

def p_tuple_list(t):
  'tuple_list : expr COMMA tuple_list'
  t[0] = [t[1]] + t[3]

def p_tuple_list_end(t):
  'tuple_list : expr'
  t[0] = [t[1]]

def p_expr_empty_list(t):
  'expr : LBRACK RBRACK'
  t[0] = ast.List([])
  t[0]._lexpos = t.lexpos(2)        # RBRACK
  t[0]._start_lexpos = t.lexpos(1)  # LBRACK

def p_expr_list(t):
  'expr : LBRACK list_elements RBRACK'
  t[0] = ast.List(t[2])
  t[0]._lexpos = t.lexpos(3)        # RBRACK
  t[0]._start_lexpos = t.lexpos(1)  # LBRACK

def p_list_elements(t):
  'list_elements : expr COMMA list_elements'
  t[0] = [t[1]] + t[3]

def p_list_elements_end(t):
  'list_elements : expr'
  t[0] = [t[1]]

def p_expr_binop(t):
  '''expr : expr PLUS expr
          | expr MINUS expr
          | expr TIMES expr
          | expr EXP expr
          | expr DIV expr
          | expr INTDIV expr
          | expr MOD expr
          | expr ANDALSO expr
          | expr ORELSE expr
          | expr EQUALSTO expr
          | expr NOTEQUAL expr
          | expr LESSTHAN expr
          | expr LESSTHANEQUAL expr
          | expr GREATERTHAN expr
          | expr GREATERTHANEQUAL expr
          | expr CONS expr
          | expr IN expr'''
  t[0] = ast.BinOp(t[2], t[1], t[3])
  t[0]._lexpos = t[3]._lexpos          # end of right operand
  t[0]._start_lexpos = t[1]._lexpos    # start of left operand

def p_expr_index(t):
  'expr : expr LBRACK expr RBRACK'
  t[0] = ast.Index(t[1], t[3])
  t[0]._lexpos = t.lexpos(4)         # RBRACK
  t[0]._start_lexpos = t[1]._lexpos  # start of sequence expr

def p_expr_unary_not(t):
  'expr : NOT expr'
  t[0] = ast.UnaryOp('not', t[2])
  t[0]._lexpos = t[2]._lexpos        # end of operand
  t[0]._start_lexpos = t.lexpos(1)   # NOT

def p_expr_unary_minus(t):
  'expr : MINUS expr %prec NOT'
  t[0] = ast.UnaryOp('-', t[2])
  t[0]._lexpos = t[2]._lexpos        # end of operand
  t[0]._start_lexpos = t.lexpos(1)   # MINUS

def p_error(t):
  raise SyntaxError("SYNTAX ERROR")

import ply.yacc as yacc
parser = yacc.yacc()

def parse_line(s):
  return parser.parse(s)
