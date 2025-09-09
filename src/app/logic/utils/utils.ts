import { GrammarData, TokType } from '../dto/types';


export function stripQuotes(s: string): string {
  if (!s) return s;
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
  if (s.startsWith('"') && !s.endsWith('"')) return s.slice(1);
  return s;
}

export function isKnownValue(token: string, data: GrammarData): boolean {
  if (!token) return false;
  const flat = Object.values(data.valuesMap || {}).flat().map(v => v.toLowerCase());
  const naked = stripQuotes(token).toLowerCase();
  return flat.includes(naked);
}

/** Classify token using current grammar data (valuesMap helps detect VALUE) */
export function classifyToken(tok: string, data: GrammarData): TokType {
  if (!tok) return 'UNKNOWN';
  if (tok === '(') return 'LPAREN';
  if (tok === ')') return 'RPAREN';
  if (data.variables.includes(tok)) return 'VAR';
  if (data.operators.includes(tok)) return 'OP';
  if (data.logicals.includes(tok))  return 'LOGICAL';
  if (tok.startsWith('"') && tok.endsWith('"') && tok.length >= 2) return 'VALUE';
  if (tok.startsWith('"') && !tok.endsWith('"')) return 'VALUE_PARTIAL';
  if (isKnownValue(tok, data)) return 'VALUE';
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

export function openParensUpTo(tokens: string[], idx: number): number {
  let bal = 0;
  for (let k = 0; k <= idx; k++) {
    if (tokens[k] === '(') bal++;
    else if (tokens[k] === ')') bal--;
  }
  return bal;
}
