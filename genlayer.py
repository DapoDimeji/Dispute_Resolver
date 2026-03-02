# Minimal genlayer SDK stub for local unit testing
from typing import Any, Callable

# Simple DynArray and TreeMap stand-ins
DynArray = list
TreeMap = dict

# u64 alias
def u64(x=0):
    return int(x)

# allow_storage decorator (no-op for tests)
def allow_storage(cls_or_fn=None):
    return cls_or_fn

# gl namespace
class _Message:
    def __init__(self):
        self.sender_address = '0xtester'
        self.timestamp = 0

class _Nondet:
    def exec_prompt(self, prompt: str):
        # For tests this should be monkeypatched
        return "{}"

class _VM:
    def run_nondet(self, fn: Callable, validator: Callable):
        # Call the leader fn and validate
        res = fn()
        if validator(res):
            return res
        raise Exception('nondet validation failed')

class _gl:
    message = _Message()
    nondet = _Nondet()
    vm = _VM()
    public = type('pub', (), {'write': lambda *a, **k: (lambda f: f), 'view': lambda *a, **k: (lambda f: f)})
    # attach Contract placeholder for compatibility
    Contract = None

# expose module-level names expected by contract
gl = _gl()

# no-op Contract base class
class Contract:
    pass

# attach Contract class into gl namespace for compatibility
gl.Contract = Contract

# Export names
__all__ = ['gl', 'allow_storage', 'DynArray', 'TreeMap', 'u64', 'Contract']
