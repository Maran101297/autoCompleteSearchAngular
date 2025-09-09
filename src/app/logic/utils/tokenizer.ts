// Robust tokenizer: keeps quoted strings intact and recognizes multi-char operators
import { GrammarData, TokType } from '../dto/types';

export function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  const s = input || '';

  while (i < s.length) {
    const ch = s[i];

    // whitespace
    if (/\s/.test(ch)) { i++; continue; }

    // parentheses
    if (ch === '(' || ch === ')') {
      tokens.push(ch);
      i++;
      continue;
    }

    // quoted string (supports no-escape simple quotes)
    if (ch === '"') {
      let j = i + 1;
      while (j < s.length && s[j] !== '"') j++;
      if (j >= s.length) {
        // unterminated quoted token — include rest as partial quoted token
        tokens.push(s.slice(i));
        i = s.length;
      } else {
        tokens.push(s.slice(i, j + 1)); // include both quotes
        i = j + 1;
      }
      continue;
    }

    // multi-char operators
    const two = s.slice(i, i + 2);
    if (two === '==' || two === '!=' || two === '>=' || two === '<=') {
      tokens.push(two);
      i += 2;
      continue;
    }

    // single-char operators
    if (ch === '>' || ch === '<' || ch === '=' ) { // '=' single rarely used but handle
      tokens.push(ch);
      i++;
      continue;
    }

    // identifier / word (variables, logicals, values without quotes)
    if (/[A-Za-z0-9_\-.:]/.test(ch)) {
      let j = i + 1;
      while (j < s.length && /[A-Za-z0-9_\-.:]/.test(s[j])) j++;
      tokens.push(s.slice(i, j));
      i = j;
      continue;
    }

    // unknown single char — push it
    tokens.push(ch);
    i++;
  }

  return tokens;
}

/** classify a raw token string into a TokType using grammar data */
export function classifyToken(tok: string, data: GrammarData): TokType {
  if (!tok) return 'UNKNOWN';
  if (tok === '(') return 'LPAREN';
  if (tok === ')') return 'RPAREN';
  if (data.variables.includes(tok)) return 'VAR';
  if (data.operators.includes(tok)) return 'OP';
  if (data.logicals.includes(tok))  return 'LOGICAL';
  if (tok.startsWith('"') && tok.endsWith('"') && tok.length >= 2) return 'VALUE';
  if (tok.startsWith('"') && !tok.endsWith('"')) return 'VALUE_PARTIAL';

  // if token matches any known value across variables (unquoted)
  const flat = Object.values(data.valuesMap || {}).flat().map(v => v.toLowerCase());
  if (flat.includes(tok.toLowerCase())) return 'VALUE';

  return 'UNKNOWN';
}

export function countOpenParens(tokens: string[]): number {
  let bal = 0;
  for (const t of tokens) {
    if (t === '(') bal++;
    else if (t === ')') bal--;
  }
  return bal;
}
