#Ryan Xing 116607537

class SemanticError(Exception):
  def __init__(self, message=None):
    super().__init__(message)
  
  def __str__(self):
    return "SEMANTIC ERROR"

  def __repr__(self):
    return "SEMANTIC ERROR"
  
class EnvStack:
  def __init__(self):
    self.stack = [dict()]
  
  def push(self):
    self.stack.append(dict())
  
  def pop(self):
    if len(self.stack) == 1:
      raise SemanticError("SEMANTIC ERROR")
    self.stack.pop()

  def clear(self):
    self.stack = [dict()]

  def __contains__(self, name):
    for frame in reversed(self.stack):
      if name in frame: 
        return True
    return False
  
  def __getitem__(self, name):
    for frame in reversed(self.stack):
      if name in frame:
        return frame[name]
    raise SemanticError("SEMANTIC ERROR")
  
  def __setitem__(self, name, value):
    self.stack[-1][name] = value


ENV = EnvStack()
FUNCTIONS = {}

#type check helper methods 
def _is_int(x): return isinstance(x, int) and not isinstance(x, bool)
def _is_num(x): return isinstance(x, (int, float)) and not isinstance(x, bool)
def _is_str(x): return isinstance(x, str)
def _is_bool(x): return isinstance(x, bool)
def _is_List(x): return isinstance(x, list)
def _is_tuple(x): return isinstance(x, tuple)

#helper methods for spacing in __str__ methods
def tabs(n): 
  return "\t"*n

#base node class
class Node:
  def __init__(self):
    self.parent = None
  def parentCount(self):
        count = 0
        current = self.parent
        while current is not None:
            count += 1
            current = current.parent
        return count
  def evaluate(self): raise NotImplementedError()
  def __str__(self):
    return tabs(self.parentCount())+self.__class__.__name__
  
class Block(Node):
  def __init__(self, statements):
    super().__init__()
    self.statements = statements
    for s in self.statements:
      s.parent = self
  def evaluate(self):
    for s in self.statements:
      s.evaluate()
  def __str__(self):
    pc = self.parentCount()
    lines = [tabs(pc) + "Block{"]
    for s in self.statements:
      lines.append(str(s))
    lines.append(tabs(pc) + "}")
    return "\n".join(lines)
  
class Program(Node):
  def __init__(self, func_defs, main_block):
    super().__init__()
    self.func_defs = func_defs or []
    self.main_block = main_block
    for f in self.func_defs:
      f.parent = self
    self.main_block.parent=self

  def evaluate(self):
    FUNCTIONS.clear()
    for f in self.func_defs:
      if f.name in FUNCTIONS:
        raise SemanticError("SEMANTIC ERROR")
      FUNCTIONS[f.name] = f
    return self.main_block.evaluate()

  def __str__(self):
    pc = self.parentCount()
    lines = [tabs(pc) + "Program"]
    for f in self.func_defs:
      lines.append(str(f))
    lines.append(str(self.main_block))
    return "\n".join(lines)

class FunctionDef(Node):
  def __init__(self, name, params, block, return_expr):
    super().__init__()
    self.name = name
    self.params = params
    self.block = block
    self.return_expr = return_expr
    self.block.parent = self
    self.return_expr.parent = self

  def evaluate(self):
    FUNCTIONS[self.name] = self

  def __str__(self):
    pc = self.parentCount()
    header = tabs(pc) + f"FunctionDef({self.name}, params={self.params})"
    return "\n".join([header, str(self.block), str(self.return_expr)])
  
class FunctionCall(Node):
  def __init__(self, name, args):
    super().__init__()
    self.name = name
    self.args = args or []
    for a in self.args:
      a.parent = self
  
  def evaluate(self):
    if self.name not in FUNCTIONS:
      raise SemanticError("SEMANTIC ERROR")
    func_def = FUNCTIONS[self.name]

    if len(self.args) != len(func_def.params):
      raise SemanticError("SEMANTIC ERROR")
    
    arg_values = [arg.evaluate() for arg in self.args]

    ENV.push()
    try:
      for param_name, arg_value in zip(func_def.params, arg_values):
        ENV[param_name] = arg_value

      func_def.block.evaluate()
      result = func_def.return_expr.evaluate()
    finally:
      ENV.pop()

    return result
  
  def __str__(self):
    pc = self.parentCount()
    lines = [tabs(pc) + f"FunctionCall({self.name})"]
    for a in self.args:
      lines.append(str(a))
    return "\n".join(lines)
    



class Int(Node):
  def __init__(self, v): 
    super().__init__()
    self.value = int(v)
  def evaluate(self): return self.value
  def __str__(self):
    return  tabs(self.parentCount())+f"Int({self.value})"

class Real(Node):
  def __init__(self, v): 
    super().__init__()
    self.value = float(v)
  def evaluate(self): return self.value
  def __str__(self):
    return  tabs(self.parentCount())+f"Real({self.value})"

class String(Node):
    def __init__(self, s): self.value = str(s)
    def evaluate(self):  return self.value
    def __str__(self):   
      return tabs(self.parentCount())+f"String('{self.value}')"

class Bool(Node):
    def __init__(self, b): self.value = bool(b)
    def evaluate(self): return self.value
    def __str__(self):     
      return tabs(self.parentCount())+f"Bool({self.value})"
    
class List(Node):
  def __init__(self, element_nodes): 
    super().__init__(); self.value = element_nodes
    for e in self.value: e.parent = self
  def evaluate(self): return [e.evaluate() for e in self.value]
  def __str__(self):
    pc = self.parentCount()
    if not self.value: 
      return tabs(pc)+"List[]"
    lines = [tabs(pc)+"List["]
    for e in self.value: lines.append(str(e))
    lines.append(tabs(pc)+"]")
    return "\n".join(lines)

class Tuple(Node):
  def __init__(self, element_nodes): 
    super().__init__(); self.value = element_nodes
    for e in self.value: e.parent = self
  def evaluate(self): return tuple([e.evaluate() for e in self.value])
  def __str__(self):
    pc = self.parentCount()
    lines = [tabs(pc)+"Tuple("]
    for e in self.value: lines.append(str(e))
    lines.append(tabs(pc)+")")
    return "\n".join(lines)
  
class Var(Node):
  def __init__(self, name):
    super().__init__()
    self.name = name
  def evaluate(self):
    if self.name in ENV:
      return ENV[self.name]
    raise SemanticError("SEMANTIC ERROR")
  def __str__(self):
    return tabs(self.parentCount()) + f"Var({self.name})"
  
#handles all binary operators
class BinOp(Node):
  def __init__(self, operator, left, right):
    super().__init__(); 
    self.operator = operator; 
    self.left = left; 
    self.right = right
    self.left.parent = self; 
    self.right.parent = self
  #checks operator and typechecks then returns evlauted value or raises a semantic error
  def evaluate(self): 
    left_value = self.left.evaluate()
    right_value = self.right.evaluate()

    if self.operator == '+':
      if _is_num(left_value) and _is_num(right_value):
        return left_value + right_value
      elif _is_str(left_value) and _is_str(right_value):
        return left_value + right_value
      elif _is_List(left_value) and _is_List(right_value):
        return left_value + right_value
      else: 
        raise SemanticError("Type missmatch for + operator")

    elif self.operator == '-':
      if _is_num(left_value) and _is_num(right_value):
        return left_value - right_value
      else: 
        raise SemanticError("Type missmatch for - operator")
      
    elif self.operator == '*':
      if _is_num(left_value) and _is_num(right_value):
        return left_value * right_value
      else: 
        raise SemanticError("Type missmatch for * operator")
      
    elif self.operator == '**':
      if _is_num(left_value) and _is_num(right_value):
        return left_value ** right_value
      else: 
        raise SemanticError("Type missmatch for ** operator")
      
    elif self.operator == '/':
      if right_value == 0:
        raise SemanticError("Division by zero error")
      elif _is_num(left_value) and _is_num(right_value) and right_value != 0:
        return float(left_value) / float(right_value)
      else: 
        raise SemanticError("Type missmatch for / operator")
      
    elif self.operator == 'div':
      if right_value == 0:
        raise SemanticError("Division by zero error")
      elif _is_int(left_value) and _is_int(right_value) and right_value != 0:
        return left_value // right_value
      else:
        raise SemanticError("Type missmatch for div operator")
      
    elif self.operator == 'mod':
      if right_value == 0:
        raise SemanticError("Division by zero error")
      elif _is_int(left_value) and _is_int(right_value) and right_value != 0:
        return left_value % right_value
      else:
        raise SemanticError("Type missmatch for mod operator")
    
    elif self.operator == 'andalso':
      if _is_bool(left_value) and _is_bool(right_value):
        return left_value and right_value
      else:
        raise SemanticError("Type missmatch for andalso operator")
      
    elif self.operator == 'orelse':
      if _is_bool(left_value) and _is_bool(right_value):
        return left_value or right_value
      else:
        raise SemanticError("Type missmatch for orelse operator") 
      
    elif self.operator == '==':
      if _is_num(left_value) and _is_num(right_value):
        return left_value == right_value
      elif _is_str(left_value) and _is_str(right_value):
        return left_value == right_value
      else:
        raise SemanticError("Type missmatch for == operator")
      
    elif self.operator == '<>':
      if _is_num(left_value) and _is_num(right_value):
        return left_value != right_value
      elif _is_str(left_value) and _is_str(right_value):
        return left_value != right_value
      else:
        raise SemanticError("Type missmatch for <> operator")
      
    elif self.operator == '<':
      if _is_num(left_value) and _is_num(right_value):
        return left_value < right_value
      elif _is_str(left_value) and _is_str(right_value):
        return left_value < right_value
      else:
        raise SemanticError("Type missmatch for < operator")

    elif self.operator == '<=':
      if _is_num(left_value) and _is_num(right_value):
        return left_value <= right_value
      elif _is_str(left_value) and _is_str(right_value):
        return left_value <= right_value
      else:
        raise SemanticError("Type missmatch for <= operator")
      
    elif self.operator == '>':
      if _is_num(left_value) and _is_num(right_value):
        return left_value > right_value
      elif _is_str(left_value) and _is_str(right_value):
        return left_value > right_value
      else:
        raise SemanticError("Type missmatch for > operator")
      
    elif self.operator == '>=':
      if _is_num(left_value) and _is_num(right_value):
        return left_value >= right_value
      elif _is_str(left_value) and _is_str(right_value):
        return left_value >= right_value
      else:
        raise SemanticError("Type missmatch for >= operator")
      
    elif self.operator == '::':
      if _is_List(right_value):
          return [left_value] + right_value
      else:
          raise SemanticError("Type mismatch for :: operator")
    
    elif self.operator == 'in':
      if _is_str(right_value) or _is_List(right_value):
        return left_value in right_value
      else: 
        raise SemanticError("Type mismatch for in operator")
    
    else:
      raise SemanticError(f"Unrecognized Operator: {self.operator}")
  
  def __str__(self):
    pc = self.parentCount()
    lines = [
      tabs(pc)+f"BinOp({self.operator})",
      str(self.left),
      str(self.right),
    ]
    return "\n".join(lines)
    
#handles all unary operators
class UnaryOp(Node):
  def __init__(self, operator, operand):
    super().__init__(); 
    self.operator = operator; 
    self.operand = operand
    self.operand.parent = self
  #checks for operator and typechecks returns evaluated value or raises semantic error
  def evaluate(self):
      value = self.operand.evaluate()

      if self.operator == 'not':
        if _is_bool(value):
          return not value
        else:
          raise SemanticError("Type missmatch for not operator")
      elif self.operator == '-':
        if _is_num(value):
          return -value
        else: 
          raise SemanticError("Type missmatch for unary -")
      else:
        raise SemanticError(f"Unrecognized Operator: {self.operator}")
  def __str__(self):
    pc = self.parentCount()
    lines = [
      tabs(pc)+f"UnaryOp({self.operator})",
      str(self.operand)
    ]
    return "\n".join(lines)

class Index(Node):
  def __init__(self, sequence, index):
    super().__init__(); self.sequence = sequence; self.index = index
    self.sequence.parent = self; self.index.parent = self
  def evaluate(self):
    index_value = self.index.evaluate()
    sequence_value = self.sequence.evaluate()

#typechecks and then checks for index returns value at the index or raises semantic error
    if _is_int(index_value):
      if _is_str(sequence_value):
        if index_value < 0 or index_value >= len(sequence_value): 
          raise SemanticError("Index out of bounds")
        return sequence_value[index_value]
      elif _is_List(sequence_value):
        if index_value < 0 or index_value >= len(sequence_value):
          raise SemanticError("Index out of bounds")
        return sequence_value[index_value]
      else:
        raise SemanticError("Type mismatch sequence value must be a str or a list")
    else:
      raise SemanticError("Type mismatch index value must be a INT")
  def __str__(self):
    pc = self.parentCount()
    return "\n".join([
      tabs(pc)+"Index",
      str(self.sequence),
      str(self.index)
    ])
  
class TupleIndex(Node):
  def __init__(self, tuple_sequence, index):
    super().__init__(); self.tuple_sequence = tuple_sequence; self.index = index
    self.tuple_sequence.parent = self; self.index.parent = self
  def evaluate(self):
    index_value = self.index.evaluate()
    tuple_value = self.tuple_sequence.evaluate()

    if _is_int(index_value):
      if _is_tuple(tuple_value):
        if index_value < 1 or index_value > len(tuple_value):
          raise SemanticError("Index out of bounds")
        return tuple_value[index_value-1]
      else:
        raise SemanticError("Type mismatch sequence value must be a tuple")
    else:
      raise SemanticError("Type mismatch index value must be a INT")
  def __str__(self):
    pc = self.parentCount()
    return "\n".join([
      tabs(pc)+"TupleIndex",
      str(self.tuple_sequence),
      str(self.index)
    ])
  
class Assign(Node):
  def __init__(self, left, right):
    super().__init__()
    self.left = left
    self.right = right
    self.left.parent = self
    self.right.parent = self
  def evaluate(self):
    value = self.right.evaluate()
    if isinstance(self.left, Var):
      ENV[self.left.name] = value
      return 
    if isinstance(self.left, Index):
      ind = self.left.index.evaluate()
      container = self.left.sequence.evaluate()

      if not _is_int(ind):
        raise SemanticError("SEMANTIC ERROR")
      
      if not _is_List(container):
        raise SemanticError("SEMANTIC ERROR")
      
      if ind < 0 or ind >= len(container):
        raise SemanticError("SEMANTIC ERROR")
      
      container[ind] = value
      return 
    raise SemanticError("SEMANTIC ERROR")
  
  def __str__(self):
    pc = self.parentCount()
    return "\n".join([
      tabs(pc) + "Assign",
      str(self.left),
      str(self.right),
    ])

class Print(Node):
  def __init__(self, expr):
    super().__init__()
    self.expr = expr
    self.expr.parent = self

  def evaluate(self):
    val = self.expr.evaluate()
    print(val)
  
  def __str__(self):
    pc = self.parentCount()
    return "\n".join([
        tabs(pc) + "Print",
        str(self.expr)
    ])

class If(Node):
  def __init__(self, condition, then_block, else_block=None):
    super().__init__()
    self.condition = condition
    self.then_block = then_block
    self.else_block = else_block
    self.condition.parent = self
    self.then_block.parent = self
    if self.else_block:
      self.else_block.parent = self
    
  def evaluate(self):
    cond = self.condition.evaluate()
    if not _is_bool(cond):
      raise SemanticError("SEMANTIC ERROR")
    if cond:
      self.then_block.evaluate()
    elif self.else_block:
      self.else_block.evaluate()

  def __str__(self):
    pc = self.parentCount()
    lines = [
        tabs(pc) + "If",
        str(self.condition),
        str(self.then_block)
    ]
    if self.else_block:
        lines.append(str(self.else_block))
    return "\n".join(lines)

class While(Node):
  def __init__(self, condition, block):
    super().__init__()
    self.condition = condition
    self.block = block
    self.condition.parent = self
    self.block.parent = self

  def evaluate(self):
    while True:
      cond = self.condition.evaluate()
      if not _is_bool(cond):
        raise SemanticError("SEMANTIC ERROR")
      if not cond:
        break
      self.block.evaluate()
  
  def __str__(self):
    pc = self.parentCount()
    return "\n".join([
        tabs(pc) + "While",
        str(self.condition),
        str(self.block)
    ])
  
