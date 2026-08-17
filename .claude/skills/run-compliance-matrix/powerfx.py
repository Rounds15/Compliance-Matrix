#!/usr/bin/env python3
"""A Power Fx subset evaluator, enough to lay a canvas screen out on a page.

This is not an interpreter for the language. It resolves the slice of Power Fx
that decides what a screen *looks like* - geometry, colour, font, and static
text - and returns None for everything else. None is a first-class answer here:
a caller that cannot resolve `Filter(dsFunctions, ...)` still knows the gallery
is 62px tall and 1238px wide, which is all the layout needs.

Unresolved subexpressions poison their parents rather than raising, so one
opaque formula never takes a screen down. render.py counts the Nones and
reports them, so the gap between "rendered" and "rendered exactly" is visible
instead of implied.
"""

from __future__ import annotations

import datetime as _dt
import re

# The mockup data expresses every date as DateAdd(Today(), n, TimeUnit.Days),
# so a screen's whole deadline story - overdue counts, due pills, the fiscal
# year label - hangs off one value. driver.py sets this; pinning it makes a
# render reproducible, which is what makes two screenshots comparable.
TODAY = _dt.date.today()


def set_today(d: _dt.date) -> None:
    global TODAY
    TODAY = d

# ---------------------------------------------------------------------------
# values
# ---------------------------------------------------------------------------


class Color:
    """An RGBA colour. Kept distinct from tuples so `+` on it stays an error."""

    __slots__ = ("r", "g", "b", "a")

    def __init__(self, r, g, b, a=1.0):
        self.r, self.g, self.b, self.a = (
            max(0, min(255, int(round(r)))),
            max(0, min(255, int(round(g)))),
            max(0, min(255, int(round(b)))),
            max(0.0, min(1.0, float(a))),
        )

    def css(self) -> str:
        return f"rgba({self.r},{self.g},{self.b},{self.a:g})"

    def hex(self) -> str:
        return f"#{self.r:02X}{self.g:02X}{self.b:02X}"

    def luminance(self) -> float:
        """WCAG relative luminance, for the contrast audit."""

        def ch(v):
            v = v / 255.0
            return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4

        return 0.2126 * ch(self.r) + 0.7152 * ch(self.g) + 0.0722 * ch(self.b)

    def over(self, bg: "Color") -> "Color":
        """Flatten against a background. Canvas alpha is common (RGBA(0,0,0,0)
        transparent buttons everywhere), and contrast needs a solid colour."""
        if self.a >= 1.0:
            return self
        a = self.a
        return Color(
            self.r * a + bg.r * (1 - a),
            self.g * a + bg.g * (1 - a),
            self.b * a + bg.b * (1 - a),
            1.0,
        )

    def __repr__(self):
        return f"Color({self.hex()} a={self.a:g})"


class Enum:
    """A dotted enum member such as FontWeight.Bold or Align.Center.

    Carried as a value rather than resolved to a string at parse time because
    the same token space holds Color.White, which is a colour.
    """

    __slots__ = ("family", "member")

    def __init__(self, family, member):
        self.family, self.member = family, member

    def __repr__(self):
        return f"{self.family}.{self.member}"


# Power Fx `Color.X` named colours that this app actually references.
NAMED_COLORS = {
    "white": Color(255, 255, 255),
    "black": Color(0, 0, 0),
    "transparent": Color(0, 0, 0, 0),
    "red": Color(255, 0, 0),
    "gray": Color(128, 128, 128),
    "lightgray": Color(211, 211, 211),
}


# ---------------------------------------------------------------------------
# tokenizer
# ---------------------------------------------------------------------------

TOKEN_RE = re.compile(
    r"""
      (?P<ws>\s+)
    | (?P<comment>//[^\n]*)
    | (?P<interp>\$"(?:[^"\\]|\\.|"")*")
    | (?P<string>"(?:[^"\\]|\\.|"")*")
    | (?P<number>\d+\.\d+|\.\d+|\d+)
    | (?P<name>[A-Za-z_][A-Za-z_0-9]*)
    | (?P<op><=|>=|<>|&&|\|\||[-+*/&=<>(),.!;\[\]{}:^])
    """,
    re.VERBOSE,
)


def tokenize(src: str):
    toks, i, n = [], 0, len(src)
    while i < n:
        m = TOKEN_RE.match(src, i)
        if not m:
            # An unknown character: swallow it. Better a None result than a
            # crash on some formula this evaluator was never meant to read.
            i += 1
            continue
        i = m.end()
        kind = m.lastgroup
        if kind in ("ws", "comment"):
            continue
        toks.append((kind, m.group()))
    return toks


def unquote(lit: str) -> str:
    body = lit[1:-1] if not lit.startswith('$') else lit[2:-1]
    return body.replace('""', '"').replace('\\"', '"').replace("\\n", "\n")


# ---------------------------------------------------------------------------
# parser / evaluator
# ---------------------------------------------------------------------------

# Precedence, loosest first. `&` is Power Fx string concatenation.
BINARY_LEVELS = [
    ("||",),
    ("&&",),
    ("=", "<>", "<", ">", "<=", ">="),
    ("&",),
    ("+", "-"),
    ("*", "/"),
]


class Evaluator:
    """Evaluates one formula against a resolution context.

    The context is a dict of hooks the caller supplies:

      ident(parts)      -> value or NOTFOUND, for a dotted identifier
      call(name, args)  -> value or NOTFOUND, for a function call

    Both are consulted before the built-ins, so render.py can resolve
    `Parent.Width` and `ThisItem.su_name` without this module knowing what a
    screen is.
    """

    NOTFOUND = object()

    def __init__(self, ident=None, call=None):
        self._ident = ident
        self._call = call
        self.unresolved: list[str] = []

    # -- public ------------------------------------------------------------

    def eval(self, formula):
        """Evaluate a property value as written in the .fx.yaml.

        Canvas properties are strings beginning with '='. A value that does not
        is a literal (Variant, Control) and comes back unchanged.
        """
        if formula is None:
            return None
        if not isinstance(formula, str):
            return formula
        text = formula.strip()
        if not text.startswith("="):
            return text
        text = text[1:]
        self.toks = tokenize(text)
        self.pos = 0
        try:
            val = self._expr(0)
        except Exception:
            return None
        return val

    # -- recursive descent -------------------------------------------------

    def _peek(self):
        return self.toks[self.pos] if self.pos < len(self.toks) else (None, None)

    def _next(self):
        t = self._peek()
        self.pos += 1
        return t

    def _expr(self, level):
        if level >= len(BINARY_LEVELS):
            return self._unary()
        left = self._expr(level + 1)
        while True:
            kind, val = self._peek()
            if kind == "op" and val in BINARY_LEVELS[level]:
                self._next()
                right = self._expr(level + 1)
                left = self._binary(val, left, right)
            elif kind == "name" and val.lower() == "in" and level == 2:
                # `x in ["a","b"]` - membership, same precedence as comparison.
                self._next()
                right = self._expr(level + 1)
                left = None if left is None or right is None else (left in right)
            else:
                return left

    def _binary(self, op, left, right):
        """Apply a binary operator, propagating None rather than raising.

        Power Fx uses `=` for comparison (not assignment) and `&` for string
        concatenation. Arithmetic on a None operand yields None so an
        unresolvable subexpression cannot masquerade as zero - a control at
        X=0 because a formula failed looks identical to one the author put
        there, which is exactly the confusion this renderer has to avoid.
        """

        def num(v):
            if isinstance(v, bool) or not isinstance(v, (int, float)):
                return None
            return v

        if op == "&":
            # Power Fx concatenation absorbs Blank(): `Blank() & "x"` is "x",
            # not blank. Many labels here concatenate a lookup that is empty in
            # the mock slice, and rendering those as a placeholder would report
            # a resolution failure where Studio would just show a short string.
            # Whether anything was genuinely unresolvable is tracked separately,
            # in self.unresolved.
            if left is None and right is None:
                return None
            return as_text(left) + as_text(right)

        if op in ("+", "-", "*", "/"):
            a, b = num(left), num(right)
            if a is None or b is None:
                return None
            if op == "+":
                return a + b
            if op == "-":
                return a - b
            if op == "*":
                return a * b
            return None if b == 0 else a / b

        if op in ("=", "<>"):
            if left is None or right is None:
                # Blank compares equal to blank, and unknown to nothing.
                if left is None and right is None:
                    return op == "="
                return None
            if isinstance(left, Color) and isinstance(right, Color):
                same = (left.r, left.g, left.b, left.a) == (
                    right.r, right.g, right.b, right.a)
            elif isinstance(left, Enum) or isinstance(right, Enum):
                same = as_text(left) == as_text(right)
            else:
                same = left == right
            return same if op == "=" else not same

        if op in ("<", ">", "<=", ">="):
            a, b = num(left), num(right)
            if a is None or b is None:
                da, db = as_date(left), as_date(right)
                if da is not None and db is not None:
                    a, b = da, db
                elif isinstance(left, str) and isinstance(right, str):
                    a, b = left, right
                else:
                    return None
            return {"<": a < b, ">": a > b, "<=": a <= b, ">=": a >= b}[op]

        if op == "&&":
            if left is False or right is False:
                return False
            if left is None or right is None:
                return None
            return bool(left) and bool(right)

        if op == "||":
            if left is True or right is True:
                return True
            if left is None or right is None:
                return None
            return bool(left) or bool(right)

        return None

    def _unary(self):
        kind, val = self._peek()
        if kind == "op" and val == "-":
            self._next()
            v = self._unary()
            return None if not isinstance(v, (int, float)) or isinstance(v, bool) else -v
        if kind == "op" and val == "!":
            self._next()
            v = self._unary()
            return None if v is None else (not v)
        return self._postfix()

    def _postfix(self):
        val = self._atom()
        # Trailing `.Field` on a call result, e.g. First(dsX).su_name or
        # drp_X.Selected.Value.
        while True:
            kind, tok = self._peek()
            if kind == "op" and tok == ".":
                self._next()
                k2, field = self._next()
                if k2 != "name":
                    return None
                if isinstance(val, dict):
                    val = val.get(field)
                else:
                    val = None
            else:
                return val

    def _atom(self):
        kind, tok = self._next()
        if kind == "number":
            return float(tok) if "." in tok else int(tok)
        if kind == "string":
            return unquote(tok)
        if kind == "interp":
            return self._interpolate(unquote(tok))
        if kind == "op" and tok == "(":
            v = self._expr(0)
            self._expect(")")
            return v
        if kind == "op" and tok == "[":
            items = []
            if not self._at(")]"[1]):
                while True:
                    items.append(self._expr(0))
                    if self._at(","):
                        self._next()
                        continue
                    break
            self._expect("]")
            return items
        if kind == "op" and tok == "{":
            rec = {}
            while not self._at("}"):
                k, name = self._next()
                if k != "name":
                    break
                self._expect(":")
                rec[name] = self._expr(0)
                if self._at(","):
                    self._next()
            self._expect("}")
            return rec
        if kind == "name":
            return self._name(tok)
        return None

    def _at(self, ch):
        kind, tok = self._peek()
        return kind == "op" and tok == ch

    def _expect(self, ch):
        if self._at(ch):
            self._next()

    def _name(self, first):
        # Function call?
        if self._at("("):
            self._next()
            args = []
            if not self._at(")"):
                while True:
                    args.append(self._arg_raw())
                    if self._at(","):
                        self._next()
                        continue
                    break
            self._expect(")")
            return self._invoke(first, args)

        # Dotted identifier.
        parts = [first]
        while self._at("."):
            save = self.pos
            self._next()
            kind, tok = self._peek()
            if kind != "name":
                self.pos = save
                break
            self._next()
            # A method call on an identifier is out of scope; bail to None.
            if self._at("("):
                return None
            parts.append(tok)
        return self._resolve(parts)

    def _arg_raw(self):
        """Capture an argument both as a value and as source text.

        If/Switch need lazy branches, and the table functions need the *name*
        of the collection rather than its (unresolvable) filtered contents.
        """
        start = self.pos
        depth = 0
        # First, record the token span so the caller can recover source text.
        while self.pos < len(self.toks):
            kind, tok = self._peek()
            if kind == "op":
                if tok in "([{":
                    depth += 1
                elif tok in ")]}":
                    if depth == 0:
                        break
                    depth -= 1
                elif tok == "," and depth == 0:
                    break
            self._next()
        span = self.toks[start:self.pos]
        end = self.pos
        # Now evaluate that span in isolation.
        sub = Evaluator(self._ident, self._call)
        sub.toks, sub.pos = span, 0
        try:
            value = sub._expr(0)
        except Exception:
            value = None
        self.unresolved.extend(sub.unresolved)
        self.pos = end
        return Arg(value, span)

    # -- resolution --------------------------------------------------------

    def _resolve(self, parts):
        if self._ident is not None:
            got = self._ident(parts)
            if got is not self.NOTFOUND:
                return got

        head = parts[0]
        low = head.lower()

        if len(parts) == 2:
            fam, member = parts
            if fam == "Color":
                c = NAMED_COLORS.get(member.lower())
                return c if c else None
            if fam in ("FontWeight", "Align", "VerticalAlign", "Font",
                       "DisplayMode", "SortOrder", "TimeUnit", "BorderStyle",
                       "Layout", "TextMode", "TextPosition", "ImagePosition",
                       "FontStyle", "Overflow", "ScreenTransition", "Direction",
                       "LayoutMode", "LayoutAlignItems", "LayoutJustifyContent"):
                return Enum(fam, member)

        if low == "true":
            return True
        if low == "false":
            return False
        if low == "blank":
            return None
        if low == "self" or low == "parent" or low == "thisitem":
            return None

        self.unresolved.append(".".join(parts))
        return None

    def _invoke(self, name, args):
        if self._call is not None:
            got = self._call(name, args)
            if got is not self.NOTFOUND:
                return got
        return self.builtin(name, args)

    # -- built-in functions ------------------------------------------------

    def builtin(self, name, args):
        low = name.lower()
        vals = [a.value for a in args]

        def num(v):
            return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None

        if low == "rgba":
            if len(vals) >= 4 and all(num(v) is not None for v in vals[:4]):
                return Color(vals[0], vals[1], vals[2], vals[3])
            return None
        if low == "colorvalue":
            if vals and isinstance(vals[0], str):
                return parse_hex(vals[0])
            return None
        if low == "colorfade":
            base, amount = (vals + [None, None])[:2]
            if isinstance(base, Color) and num(amount) is not None:
                return color_fade(base, amount)
            return None
        if low == "if":
            # Pairs of (condition, result), optional trailing else.
            i = 0
            while i + 1 < len(vals):
                cond = vals[i]
                if cond is True:
                    return vals[i + 1]
                if cond is None:
                    # Unknown condition: the true branch is the honest guess -
                    # it is the state the author wrote first.
                    return vals[i + 1]
                i += 2
            return vals[-1] if len(vals) % 2 == 1 else None
        if low == "switch":
            if len(vals) < 3:
                return None
            subject = vals[0]
            default = vals[-1] if len(vals) % 2 == 0 else None
            i = 1
            while i + 1 < len(vals):
                if subject is not None and subject == vals[i]:
                    return vals[i + 1]
                i += 2
            if subject is None:
                # Unknown subject: prefer the declared default, else first arm.
                return default if default is not None else vals[2]
            return default
        if low == "coalesce":
            for v in vals:
                if v is not None and v != "":
                    return v
            return None
        if low == "isblank" or low == "isempty":
            v = vals[0] if vals else None
            if isinstance(v, list):
                return len(v) == 0
            return v is None or v == ""
        if low == "not":
            return None if not vals or vals[0] is None else (not vals[0])
        if low in ("min", "max"):
            ns = [num(v) for v in vals]
            ns = [v for v in ns if v is not None]
            if not ns:
                return None
            return min(ns) if low == "min" else max(ns)
        if low in ("round", "roundup", "rounddown", "int", "trunc"):
            n = num(vals[0]) if vals else None
            if n is None:
                return None
            import math

            digits = int(num(vals[1]) or 0) if len(vals) > 1 else 0
            f = 10 ** digits
            if low == "roundup":
                return math.ceil(n * f) / f
            if low in ("rounddown", "int", "trunc"):
                return math.floor(n * f) / f
            return round(n * f) / f
        if low == "abs":
            n = num(vals[0]) if vals else None
            return None if n is None else abs(n)
        if low == "sqrt":
            n = num(vals[0]) if vals else None
            return None if n is None or n < 0 else n ** 0.5
        if low == "mod":
            a, b = (num(vals[0]) if vals else None), (num(vals[1]) if len(vals) > 1 else None)
            return None if a is None or not b else a % b
        if low in ("upper", "lower", "trim", "proper"):
            v = vals[0] if vals else None
            if not isinstance(v, str):
                return None
            return {"upper": v.upper, "lower": v.lower, "trim": v.strip,
                    "proper": v.title}[low]()
        if low == "len":
            v = vals[0] if vals else None
            return len(v) if isinstance(v, str) else None
        if low == "left":
            v, n = (vals + [None, None])[:2]
            return v[: int(n)] if isinstance(v, str) and num(n) is not None else None
        if low == "concatenate":
            out = []
            for v in vals:
                if v is None:
                    return None
                out.append(as_text(v))
            return "".join(out)
        if low == "substitute":
            v, old, new = (vals + [None, None, None])[:3]
            if all(isinstance(x, str) for x in (v, old, new)):
                return v.replace(old, new)
            return None
        if low == "text":
            v = vals[0] if vals else None
            if v is None:
                return None
            fmt = vals[1] if len(vals) > 1 and isinstance(vals[1], str) else None
            d = as_date(v)
            if d is not None and fmt:
                return format_date(d, fmt)
            if fmt and isinstance(v, (int, float)) and not isinstance(v, bool):
                return format_number(v, fmt)
            return as_text(v)
        if low == "value":
            v = vals[0] if vals else None
            try:
                return float(v)
            except Exception:
                return None
        if low == "countrows":
            v = vals[0] if vals else None
            return len(v) if isinstance(v, list) else None
        if low == "table":
            return [v for v in vals if isinstance(v, dict)]
        if low == "first":
            v = vals[0] if vals else None
            return v[0] if isinstance(v, list) and v else None
        if low == "last":
            v = vals[0] if vals else None
            return v[-1] if isinstance(v, list) and v else None
        if low == "firstn":
            v = vals[0] if vals else None
            n = num(vals[1]) if len(vals) > 1 else 1
            return v[: int(n)] if isinstance(v, list) else None
        # Table shaping: return the source rows untouched. The row *set* is
        # wrong (no filtering) but the row *shape* is right, which is what a
        # gallery template needs to render realistic text.
        if low in ("filter", "search", "sort", "sortbycolumns", "showcolumns",
                   "addcolumns", "dropcolumns", "renamecolumns", "distinct",
                   "groupby", "ungroup", "shuffle", "forall"):
            for v in vals:
                if isinstance(v, list):
                    return v
            return None
        if low == "with":
            # With({...}, body): the body is the last argument and was already
            # evaluated - without the scope, but a best effort.
            return vals[-1] if vals else None
        if low in ("lookup",):
            for v in vals:
                if isinstance(v, list) and v:
                    return v[0]
            return None
        if low in ("sum", "average", "counta", "countif"):
            return None
        if low == "encodeurl":
            # Every icon in this app is an inline SVG built as
            # "data:image/svg+xml;utf8, " & EncodeUrl("<svg .../>"), so
            # resolving this is what lets the renderer draw real icons
            # instead of an empty placeholder box.
            v = vals[0] if vals else None
            if not isinstance(v, str):
                return None
            import urllib.parse

            return urllib.parse.quote(v, safe="")
        if low == "char":
            n = num(vals[0]) if vals else None
            return None if n is None else chr(int(n))
        if low == "concat":
            # Concat(table, expr [, sep]) - the row expression is out of scope,
            # so this can only be honest about not knowing.
            return None
        if low in ("startswith", "endswith"):
            v, p = (vals + [None, None])[:2]
            if isinstance(v, str) and isinstance(p, str):
                return v.lower().startswith(p.lower()) if low == "startswith" \
                    else v.lower().endswith(p.lower())
            return None
        if low == "mid":
            v, s, c = (vals + [None, None, None])[:3]
            if isinstance(v, str) and num(s) is not None:
                start = int(s) - 1
                return v[start:start + int(c)] if num(c) is not None else v[start:]
            return None
        if low == "find":
            needle, hay = (vals + [None, None])[:2]
            if isinstance(needle, str) and isinstance(hay, str):
                i = hay.find(needle)
                return None if i < 0 else i + 1
            return None
        if low == "sequence":
            n = num(vals[0]) if vals else None
            if n is None:
                return None
            start = num(vals[1]) if len(vals) > 1 else 1
            step = num(vals[2]) if len(vals) > 2 else 1
            start = 1 if start is None else start
            step = 1 if step is None else step
            return [{"Value": start + i * step} for i in range(int(n))]

        # -- dates ---------------------------------------------------------
        if low == "today":
            return TODAY
        if low == "now":
            return _dt.datetime.combine(TODAY, _dt.time(9, 0))
        if low == "date":
            if len(vals) >= 3 and all(num(v) is not None for v in vals[:3]):
                try:
                    return _dt.date(int(vals[0]), int(vals[1]), int(vals[2]))
                except ValueError:
                    return None
            return None
        if low == "datevalue":
            v = vals[0] if vals else None
            if isinstance(v, _dt.date):
                return v
            if isinstance(v, str):
                for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%b %d, %Y"):
                    try:
                        return _dt.datetime.strptime(v.strip(), fmt).date()
                    except ValueError:
                        pass
            return None
        if low == "dateadd":
            base = as_date(vals[0]) if vals else None
            n = num(vals[1]) if len(vals) > 1 else 0
            unit = vals[2] if len(vals) > 2 else None
            if base is None or n is None:
                return None
            return date_add(base, int(n),
                            unit.member if isinstance(unit, Enum) else "Days")
        if low == "datediff":
            a = as_date(vals[0]) if vals else None
            b = as_date(vals[1]) if len(vals) > 1 else None
            if a is None or b is None:
                return None
            unit = vals[2] if len(vals) > 2 else None
            uname = unit.member if isinstance(unit, Enum) else "Days"
            days = (b - a).days
            if uname == "Days":
                return days
            if uname == "Months":
                return (b.year - a.year) * 12 + (b.month - a.month)
            if uname == "Years":
                return b.year - a.year
            return days
        if low in ("year", "month", "day", "weekday", "hour", "minute"):
            d = as_date(vals[0]) if vals else None
            if d is None:
                return 0 if low in ("hour", "minute") else None
            return {"year": d.year, "month": d.month, "day": d.day,
                    "weekday": d.isoweekday() % 7 + 1, "hour": 0,
                    "minute": 0}[low]

        self.unresolved.append(f"{name}()")
        return None

    # -- string interpolation ---------------------------------------------

    def _interpolate(self, body: str) -> str | None:
        """Resolve $"text {expr} text". Any unresolved hole poisons the whole
        string - a label reading 'Showing  of ' would be a lie about layout."""
        out, i, n = [], 0, len(body)
        while i < n:
            ch = body[i]
            if ch == "{":
                if i + 1 < n and body[i + 1] == "{":
                    out.append("{")
                    i += 2
                    continue
                depth, j = 1, i + 1
                while j < n and depth:
                    if body[j] == "{":
                        depth += 1
                    elif body[j] == "}":
                        depth -= 1
                        if depth == 0:
                            break
                    j += 1
                inner = body[i + 1:j]
                sub = Evaluator(self._ident, self._call)
                v = sub.eval("=" + inner)
                self.unresolved.extend(sub.unresolved)
                if v is None:
                    return None
                out.append(as_text(v))
                i = j + 1
            else:
                out.append(ch)
                i += 1
        return "".join(out)


class Arg:
    """An evaluated argument that remembers its own source tokens."""

    __slots__ = ("value", "span")

    def __init__(self, value, span):
        self.value, self.span = value, span

    def text(self) -> str:
        return " ".join(t for _, t in self.span)

    def names(self) -> list[str]:
        return [t for k, t in self.span if k == "name"]


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def parse_hex(text: str):
    t = text.strip().lstrip("#")
    if len(t) == 3:
        t = "".join(c * 2 for c in t)
    if len(t) == 6:
        try:
            return Color(int(t[0:2], 16), int(t[2:4], 16), int(t[4:6], 16))
        except ValueError:
            return None
    if len(t) == 8:
        try:
            return Color(int(t[0:2], 16), int(t[2:4], 16), int(t[4:6], 16),
                         int(t[6:8], 16) / 255.0)
        except ValueError:
            return None
    return None


def color_fade(c: Color, amount: float) -> Color:
    """Power Fx ColorFade: positive fades toward white, negative toward black."""
    amount = max(-1.0, min(1.0, float(amount)))
    if amount >= 0:
        return Color(
            c.r + (255 - c.r) * amount,
            c.g + (255 - c.g) * amount,
            c.b + (255 - c.b) * amount,
            c.a,
        )
    f = 1 + amount
    return Color(c.r * f, c.g * f, c.b * f, c.a)


def as_date(v):
    """Coerce to a date, or None. datetime is narrowed to its date part."""
    if isinstance(v, _dt.datetime):
        return v.date()
    if isinstance(v, _dt.date):
        return v
    return None


def date_add(base: _dt.date, n: int, unit: str) -> _dt.date:
    if unit == "Days":
        return base + _dt.timedelta(days=n)
    if unit == "Hours":
        return base + _dt.timedelta(hours=n)
    if unit == "Minutes":
        return base + _dt.timedelta(minutes=n)
    if unit == "Years":
        unit, n = "Months", n * 12
    if unit == "Months":
        total = base.month - 1 + n
        year = base.year + total // 12
        month = total % 12 + 1
        day = min(base.day, [31, 29 if year % 4 == 0 and (year % 100 != 0 or
                                                          year % 400 == 0)
                             else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30,
                             31][month - 1])
        return _dt.date(year, month, day)
    return base + _dt.timedelta(days=n)


MONTHS = ["January", "February", "March", "April", "May", "June", "July",
          "August", "September", "October", "November", "December"]
DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
        "Sunday"]


def format_date(d: _dt.date, fmt: str) -> str:
    """Power Fx date format tokens. Longest token first so mmmm beats mmm."""
    out, i, n = [], 0, len(fmt)
    tokens = [
        ("dddd", lambda: DAYS[d.weekday()]),
        ("ddd", lambda: DAYS[d.weekday()][:3]),
        ("dd", lambda: f"{d.day:02d}"),
        ("d", lambda: str(d.day)),
        ("mmmm", lambda: MONTHS[d.month - 1]),
        ("mmm", lambda: MONTHS[d.month - 1][:3]),
        ("mm", lambda: f"{d.month:02d}"),
        ("m", lambda: str(d.month)),
        ("yyyy", lambda: f"{d.year:04d}"),
        ("yy", lambda: f"{d.year % 100:02d}"),
    ]
    while i < n:
        for tok, fn in tokens:
            if fmt.startswith(tok, i):
                out.append(fn())
                i += len(tok)
                break
        else:
            out.append(fmt[i])
            i += 1
    return "".join(out)


def format_number(v, fmt: str) -> str:
    """Enough of Power Fx's numeric formats for the labels this app has."""
    if "%" in fmt:
        digits = len(fmt.split(".")[1].rstrip("%")) if "." in fmt else 0
        return f"{v * 100:.{digits}f}%"
    if "," in fmt:
        digits = len(fmt.split(".")[1]) if "." in fmt else 0
        return f"{v:,.{digits}f}"
    if "." in fmt:
        digits = len(fmt.split(".")[1])
        return f"{v:.{digits}f}"
    if fmt.strip("0") == "" and fmt:
        return f"{int(round(v)):0{len(fmt)}d}"
    return as_text(v)


def as_text(v) -> str:
    if v is None:
        return ""
    if v is True:
        return "true"
    if v is False:
        return "false"
    if isinstance(v, _dt.datetime):
        return format_date(v.date(), "m/d/yyyy")
    if isinstance(v, _dt.date):
        return format_date(v, "m/d/yyyy")
    if isinstance(v, float):
        return f"{v:g}"
    if isinstance(v, Color):
        return v.hex()
    if isinstance(v, Enum):
        return v.member
    if isinstance(v, list):
        return f"[{len(v)} rows]"
    if isinstance(v, dict):
        return "{record}"
    return str(v)


def contrast_ratio(a: Color, b: Color) -> float:
    la, lb = a.luminance(), b.luminance()
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)
