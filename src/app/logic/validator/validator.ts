import { GrammarData, TokType } from "../dto/types";
// import { classifyToken, openParensUpTo } from "../utils/utils";


import { tokenize, classifyToken } from '../utils/tokenizer';

/**
 * Recursive-descent parser validating grammar:
 *
 * Expr := Term (LOGICAL Term)*
 * Term := Comparison | Variable | '(' Expr ')'
 * Comparison := VAR OP VALUE
 *
 * This function returns '' for success else an error message.
 *
 * allowPartial=true -> tolerant while typing: allows operator at end (VAR OP EOF) or partial quoted value
 * strict=true -> strict final validation (don't allow incomplete operator/value)
 */
export function validateFormula(text: string, data: GrammarData, allowPartial = true): string {
  const tokens = tokenize(text);
  if (tokens.length === 0) return '';

  let i = 0;
  function peek() { return tokens[i]; }
  function next() { return tokens[i++]; }
  function eof() { return i >= tokens.length; }

  function expect(tok: string) {
    if (peek() === tok) { next(); return true; }
    return false;
  }

  function isLogical(tok: string | undefined) {
    return typeof tok === 'string' && data.logicals.includes(tok);
  }
  function isOperator(tok: string | undefined) {
    return typeof tok === 'string' && data.operators.includes(tok);
  }
  function isVariable(tok: string | undefined) {
    return typeof tok === 'string' && data.variables.includes(tok);
  }
  function isValueToken(tok: string | undefined) {
    if (!tok) return false;
    if (tok.startsWith('"')) return true;
    // token is considered a value if it's not a variable/operator/logical/paren
    if (data.variables.includes(tok)) return false;
    if (data.operators.includes(tok)) return false;
    if (data.logicals.includes(tok)) return false;
    if (tok === '(' || tok === ')') return false;
    return true;
  }

  // parseTerm returns '' on success, or an error message.
  function parseTerm(): string {
    const t = peek();
    if (!t) return 'Unexpected end of input (expected a TERM).';

    // parenthesized
    if (t === '(') {
      next(); // consume '('
      const err = parseExpr();
      if (err) return err;
      if (!expect(')')) return "Error: missing closing ')'.";
      return '';
    }

    // variable or comparison
    if (isVariable(t)) {
      const varTok = next(); // consume variable
      const after = peek();

      // Comparison: VAR OP VALUE
      if (isOperator(after)) {
        // consume OP
        next();
        const valTok = peek();
        if (!valTok) {
          // allow partial while typing
          if (allowPartial) return '';
          return 'Error: operator must be followed by a value.';
        }
        // value partial (starting with quote but not closed)
        if (valTok.startsWith('"') && !valTok.endsWith('"')) {
          if (allowPartial) { next(); return ''; } // accept partial
          return 'Error: unterminated quoted value.';
        }
        // accept if token qualifies as value and not a variable
        if (!isValueToken(valTok)) {
          return 'Error: operator must be between VARIABLE and VALUE.';
        }
        next(); // consume value
        return '';
      }

      // Not a comparison -> plain variable term (allowed)
      return '';
    }

    // otherwise error
    return `Error: unexpected token '${t}' where a variable or '(' was expected.`;
  }

  function parseExpr(): string {
    // must start with a Term
    let err = parseTerm();
    if (err) return err;

    // while next token is a logical operator, consume it and another term
    while (!eof() && isLogical(peek())) {
      next(); // consume logical
      // after logical, expect a term (variable or '(' or comparison)
      const err2 = parseTerm();
      if (err2) return err2;
    }
    return '';
  }

  const finalErr = parseExpr();
  if (finalErr) return finalErr;

  if (!eof()) {
    return `Error: unexpected token '${peek()}' after end of expression.`;
  }

  return '';
}
