// import { GrammarData } from "../dto/types";
// import { classifyToken, countOpenParens, stripQuotes } from "../utils/utils";
// import { smartFilter, dedupe } from "../utils/filter";

import { GrammarData } from '../dto/types';

import { tokenize, classifyToken, countOpenParens } from '../utils/tokenizer';
import { smartFilter, dedupe } from '../utils/filter';

/**
 * Grammar-driven suggestions. Uses tokens (robust tokenizer) and grammar data.
 * Returns up to pageSize suggestions.
 */
export function getSuggestions(query: string, data: GrammarData, pageSize = 10): string[] {
  const tokens = tokenize(query);
  const last = tokens[tokens.length - 1] || '';
  const prev = tokens[tokens.length - 2] || '';
  const lastType = classifyToken(last, data);
  const prevType = classifyToken(prev, data);
  const openParens = countOpenParens(tokens);

  // Start of expression
  if (!last) return ['(', ...data.variables].slice(0, pageSize);

  // After '(' -> vars or another '('
  if (lastType === 'LPAREN') return ['(', ...data.variables].slice(0, pageSize);

  // After VAR -> can be operator (comparison) or logical (boolean chain) or closing paren or EOF
  if (lastType === 'VAR') {
    const suggestions = dedupe([...data.operators, ...data.logicals]);
    if (openParens > 0) suggestions.push(')');
    return suggestions.slice(0, pageSize);
  }

  // After OP -> suggest values for the corresponding variable
  // need to find the variable: it's token before the OP (prev)
  if (lastType === 'OP' && prevType === 'VAR') {
    const theVar = prev;
    const vals = data.valuesMap[theVar] || [];
    return vals.slice(0, pageSize);
  }

  // Partial quoted value while typing after OP => filter that variable's values
  if (lastType === 'VALUE_PARTIAL' && prevType === 'OP') {
    const theVar = tokens[tokens.length - 3] || '';
    const vals = (data.valuesMap[theVar] || []).filter(v => v.toLowerCase().includes(last.slice(1).toLowerCase()));
    return vals.slice(0, pageSize);
  }

  // After VALUE -> can be logical, ')' or EOF
  if (lastType === 'VALUE') {
    const suggestions = [...data.logicals];
    if (openParens > 0) suggestions.push(')');
    return suggestions.slice(0, pageSize);
  }

  // After ')' -> logicals or further ')' or EOF
  if (lastType === 'RPAREN') {
    const suggestions = [...data.logicals];
    if (openParens > 0) suggestions.push(')');
    return suggestions.slice(0, pageSize);
  }

  // After LOGICAL -> variable or '(' (we allow boolean chains without parentheses)
  if (lastType === 'LOGICAL') {
    return ['(', ...data.variables].slice(0, pageSize);
  }

  // Unknown partial token -> suggest matching variables (ranked)
  if (lastType === 'UNKNOWN') {
    return smartFilter(last.toLowerCase(), data.variables).slice(0, pageSize);
  }

  // Fallback
  return ['(', ...data.variables].slice(0, pageSize);
}
