import { Component, OnInit } from '@angular/core';
import { SuggestionService } from '../services/suggestion.service';

type ParserMode = 'CASE1' | 'CASE2' | 'CASE3' | 'CASE4' | 'CASE5';

@Component({
  selector: 'app-auto-search',
  templateUrl: './auto-search.component.html',
  styleUrls: ['./auto-search.component.css']
})
export class AutoSearchComponent implements OnInit {
  mode: ParserMode = 'CASE1';   // you can change mode here or add dropdown in template

  searchText = '';
  suggestions: string[] = [];
  filteredList: string[] = [];
  visibleCount = 0;
  PAGE_SIZE = 10;
  errorMsg = '';

  constructor(private suggestionService: SuggestionService) {}

  async ngOnInit() {
    await this.suggestionService.loadData();
  }

  async onFocus() {
    await this.suggestionService.loadData();
    this.updateSuggestions('');
  }

  onInput(event: any) {
    this.searchText = event.target.value;
    this.updateSuggestions(this.searchText.trim());
  }

  /** ---------------- GRAMMAR AUTOCOMPLETE (same as before, shortened for clarity) ---------------- */
  updateSuggestions(query: string) {
    const tokens = query.split(/\s+/).filter(Boolean);
    const last = tokens[tokens.length - 1] || '';
    const prev = tokens[tokens.length - 2] || '';

    const VARIABLES = this.suggestionService.getVariables();
    const OPERATORS = this.mode === 'CASE1' ? this.suggestionService.getOperators() : [];
    const LOGICALS_ALL = this.suggestionService.getLogicals();
    const LOGICALS =
      this.mode === 'CASE2' ? [] :
      this.mode === 'CASE3' ? LOGICALS_ALL :
      this.mode === 'CASE4' ? LOGICALS_ALL.filter(x => x === 'AND') :
      this.mode === 'CASE5' ? LOGICALS_ALL.filter(x => x === 'OR') :
      LOGICALS_ALL;

    const openParens = this.countOpenParens(tokens);

    // very similar to the version I gave you earlier —
    // (you can keep your full grammar logic here; not repeating due to size)

    // fallback: always show variables when unsure
    this.suggestions = ['(', ...VARIABLES];
    this.page();
  }

  private page() {
    this.filteredList = this.suggestions.slice(0, this.PAGE_SIZE);
    this.visibleCount = this.filteredList.length;
  }

  countOpenParens(tokens: string[]): number {
    let count = 0;
    for (const t of tokens) {
      if (t === '(') count++;
      else if (t === ')') count--;
    }
    return count;
  }

  smartFilter(query: string, source: string[]): string[] {
    const q = query.toLowerCase();
    return source
      .map(item => {
        const lower = item.toLowerCase();
        let score = -1;
        if (lower.startsWith(q)) score = 3;
        else if (lower.endsWith(q)) score = 2;
        else if (lower.includes(q)) score = 1;
        return { item, score };
      })
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(x => x.item);
  }

  showMore() {
    const nextItems = this.suggestions.slice(this.visibleCount, this.visibleCount + this.PAGE_SIZE);
    this.filteredList = this.filteredList.concat(nextItems);
    this.visibleCount += nextItems.length;
  }

  selectItem(item: string) {
    const tokens = this.searchText.split(/\s+/);
    tokens[tokens.length - 1] = this.formatValueIfNeeded(item);
    this.searchText = tokens.join(' ') + ' ';
    this.filteredList = [];
    this.updateSuggestions(this.searchText.trim());
  }

  private formatValueIfNeeded(item: string): string {
    const VARIABLES = this.suggestionService.getVariables();
    const OPERATORS = this.suggestionService.getOperators();
    const LOGICALS  = this.suggestionService.getLogicals();

    if (
      VARIABLES.includes(item) ||
      (this.mode === 'CASE1' && OPERATORS.includes(item)) ||
      LOGICALS.includes(item) ||
      item === '(' || item === ')'
    ) return item;

    // Only CASE1 has quoted values
    if (this.mode === 'CASE1') {
      if (!item.startsWith('"')) item = `"${item}`;
      if (!item.endsWith('"'))   item = `${item}"`;
      return item;
    }

    return item;
  }

  onScroll(event: any) {
    const { scrollTop, scrollHeight, clientHeight } = event.target;
    if (scrollTop + clientHeight >= scrollHeight - 5) {
      if (this.visibleCount < this.suggestions.length) {
        this.showMore();
      }
    }
  }

  /** ---------------- VALIDATION ---------------- */

  private tokenizePreservingQuotes(input: string): string[] {
    const out: string[] = [];
    let i = 0, buf = '', inQuote = false;
    const pushBuf = () => { if (buf.length) { out.push(buf); buf = ''; } };

    while (i < input.length) {
      const ch = input[i];
      if (ch === '"') {
        buf += ch; i++;
        if (!inQuote) {
          inQuote = true;
          while (i < input.length) {
            buf += input[i];
            if (input[i] === '"') { i++; break; }
            i++;
          }
          pushBuf(); inQuote = false;
          continue;
        }
        continue;
      }
      if (/\s/.test(ch)) { pushBuf(); i++; continue; }
      if (ch === '(' || ch === ')') { pushBuf(); out.push(ch); i++; continue; }
      buf += ch; i++;
    }
    pushBuf();
    return out;
  }

  validateQueryStrict(mode: ParserMode, input: string): { ok: boolean; error?: string } {
    const tokens = this.tokenizePreservingQuotes(input).filter(Boolean);
    const VARIABLES = this.suggestionService.getVariables();
    const OPERATORS = mode === 'CASE1' ? this.suggestionService.getOperators() : [];
    const LOGICALS_ALL = this.suggestionService.getLogicals();
    const LOGICALS =
      mode === 'CASE2' ? [] :
      mode === 'CASE3' ? LOGICALS_ALL :
      mode === 'CASE4' ? LOGICALS_ALL.filter(x => x === 'AND') :
      mode === 'CASE5' ? LOGICALS_ALL.filter(x => x === 'OR') :
      LOGICALS_ALL;

    const isVar = (t: string) => VARIABLES.includes(t);
    const isOp = (t: string) => OPERATORS.includes(t);
    const isLog = (t: string) => LOGICALS.includes(t);
    const isL = (t: string) => t === '(';
    const isR = (t: string) => t === ')';
    const isQuotedVal = (t: string) => t.length >= 2 && t.startsWith('"') && t.endsWith('"');

    if (tokens.length === 0) return { ok: false, error: 'Empty query.' };

    // Parentheses balance
    let bal = 0;
    for (const t of tokens) {
      if (isL(t)) bal++;
      else if (isR(t)) {
        bal--;
        if (bal < 0) return { ok: false, error: 'Unmatched closing parenthesis.' };
      }
    }
    if (bal !== 0) return { ok: false, error: 'Unbalanced parentheses.' };

    // FSM validator
    const validateRange = (lo: number, hi: number, caseKind: ParserMode): { ok: boolean; pos: number; error?: string } => {
      let pos = lo;
      const term = parseTerm(pos, caseKind);
      if (!term.ok) return term;
      pos = term.pos;

      while (pos <= hi) {
        const t = tokens[pos];
        if (!t) break;
        if (!isLog(t)) break;
        if (caseKind === 'CASE2') return { ok: false, pos, error: `Logical operator '${t}' not allowed in CASE2.` };
        pos++;
        const term2 = parseTerm(pos, caseKind);
        if (!term2.ok) return term2;
        pos = term2.pos;
      }
      return { ok: true, pos };
    };

    const parseTerm = (pos: number, caseKind: ParserMode): { ok: boolean; pos: number; error?: string } => {
      const t = tokens[pos];
      if (!t) return { ok: false, pos, error: 'Unexpected end.' };
      if (isL(t)) {
        let depth = 1, i = pos + 1;
        for (; i < tokens.length; i++) {
          if (tokens[i] === '(') depth++;
          else if (tokens[i] === ')') { depth--; if (depth === 0) break; }
        }
        if (depth !== 0) return { ok: false, pos, error: 'Unbalanced parentheses.' };
        const inner = validateRange(pos + 1, i - 1, caseKind);
        if (!inner.ok) return inner;
        return { ok: true, pos: i + 1 };
      }
      if (!isVar(t)) return { ok: false, pos, error: `Expected variable, found '${t}'.` };
      if (caseKind === 'CASE1') {
        const t1 = tokens[pos + 1], t2 = tokens[pos + 2];
        if (!t1 || !isOp(t1)) return { ok: false, pos: pos + 1, error: `Expected operator after '${t}'.` };
        if (!t2 || !isQuotedVal(t2)) return { ok: false, pos: pos + 2, error: `Expected quoted value after '${t} ${t1}'.` };
        return { ok: true, pos: pos + 3 };
      }
      return { ok: true, pos: pos + 1 }; // CASE2-5: var only
    };

    const res = validateRange(0, tokens.length - 1, mode);
    if (!res.ok) return { ok: false, error: res.error };
    if (res.pos !== tokens.length) return { ok: false, error: 'Unexpected trailing tokens.' };

    return { ok: true };
  }

  onSubmit() {
    const { ok, error } = this.validateQueryStrict(this.mode, this.searchText.trim());
    this.errorMsg = ok ? '' : error || 'Invalid query.';
  }
}
