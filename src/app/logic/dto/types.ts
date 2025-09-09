export type TokType =
  | 'VAR' | 'OP' | 'LOGICAL' | 'LPAREN' | 'RPAREN'
  | 'VALUE' | 'VALUE_PARTIAL' | 'UNKNOWN';

export interface GrammarData {
  variables: string[];
  operators: string[];
  logicals: string[]; 
  valuesMap: Record<string, string[]>;
}
