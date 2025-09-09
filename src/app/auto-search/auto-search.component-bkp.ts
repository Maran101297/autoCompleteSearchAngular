import { Component, OnInit } from '@angular/core';
import { SuggestionService } from '../services/suggestion.service';

@Component({
  selector: 'app-auto-search',
  templateUrl: './auto-search.component.html',
  styleUrls: ['./auto-search.component.css']
})
export class AutoSearchComponent implements OnInit {
  searchText = '';
  suggestions: string[] = [];
  filteredList: string[] = [];
  visibleCount = 0;
  PAGE_SIZE = 10;

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

  /** -------- Grammar-driven suggestions -------- */
  updateSuggestions(query: string) {
    const tokens = query.split(/\s+/).filter(Boolean);
    const last = tokens[tokens.length - 1] || '';
    const prev = tokens[tokens.length - 2] || '';

    const VARIABLES = this.suggestionService.getVariables();
    const OPERATORS = this.suggestionService.getOperators();
    const LOGICALS  = this.suggestionService.getLogicals();

    const openParens = this.countOpenParens(tokens);

    const lastType = this.classifyToken(last, VARIABLES, OPERATORS, LOGICALS);
    const prevType = this.classifyToken(prev, VARIABLES, OPERATORS, LOGICALS);

    // 1) Start of expression
    if (!last) {
      this.suggestions = ['(', ...VARIABLES];
      return this.page();
    }

    // 2) After "(" → "(" or VAR
    if (lastType === 'LPAREN') {
      this.suggestions = ['(', ...VARIABLES];
      return this.page();
    }

    // 3) After VAR → expect OP
    if (lastType === 'VAR') {
      this.suggestions = OPERATORS;
      return this.page();
    }

    // 4) After OP (or typing a partial VALUE right after OP) → suggest VALUES for that VAR
    //    Patterns:
    //      VAR OP              → lastType === OP and prevType === VAR
    //      VAR OP "partial...  → lastType === VALUE_PARTIAL and prevType === OP
    if (
      (lastType === 'OP' && prevType === 'VAR') ||
      (lastType === 'VALUE_PARTIAL' && prevType === 'OP')
    ) {
      const theVar = (lastType === 'OP')
        ? prev                      // e.g. [VAR][OP]
        : tokens[tokens.length - 3] // e.g. [VAR][OP]["par...
      let values = this.suggestionService.getValuesFor(theVar) || [];

      if (lastType === 'VALUE_PARTIAL') {
        const q = this.stripQuotes(last).toLowerCase();
        values = this.smartFilter(q, values);
      }

      this.suggestions = values.length ? values : VARIABLES;
      return this.page();
    }

    // 5) After VALUE (complete) → condition finished → AND/OR or ')'
    if (lastType === 'VALUE') {
      this.suggestions = [...LOGICALS];
      if (openParens > 0) this.suggestions.push(')');
      return this.page();
    }

    // 6) After ")" → AND/OR or another ")" if still open
    if (lastType === 'RPAREN') {
      this.suggestions = [...LOGICALS];
      if (openParens > 0) this.suggestions.push(')');
      return this.page();
    }

    // 7) After AND/OR → "(" or VAR
    if (lastType === 'LOGICAL') {
      this.suggestions = ['(', ...VARIABLES];
      return this.page();
    }

    // 8) Fallback: partial VAR typing → ranked filter
    if (lastType === 'UNKNOWN') {
      this.suggestions = this.smartFilter(last.toLowerCase(), VARIABLES);
      return this.page();
    }

    // Default safety
    this.suggestions = ['(', ...VARIABLES];
    return this.page();
  }

  /** classify token for grammar */
  private classifyToken(
    tok: string,
    VARIABLES: string[],
    OPERATORS: string[],
    LOGICALS: string[]
  ): 'VAR'|'OP'|'LOGICAL'|'LPAREN'|'RPAREN'|'VALUE'|'VALUE_PARTIAL'|'UNKNOWN' {
    if (!tok) return 'UNKNOWN';
    if (tok === '(') return 'LPAREN';
    if (tok === ')') return 'RPAREN';
    if (VARIABLES.includes(tok)) return 'VAR';
    if (OPERATORS.includes(tok)) return 'OP';
    if (LOGICALS.includes(tok))  return 'LOGICAL';

    // Value detection (quoted complete)
    const isQuoted = tok.startsWith('"') && tok.endsWith('"') && tok.length >= 2;
    if (isQuoted) return 'VALUE';

    // Partial quoted value
    if (tok.startsWith('"') && !tok.endsWith('"')) return 'VALUE_PARTIAL';

    // Unquoted known value
    if (this.isKnownValue(tok)) return 'VALUE';

    return 'UNKNOWN';
  }

  /** is token (quoted or not) one of the known values across variables? */
  private isKnownValue(token: string): boolean {
    const allValsMap = this.suggestionService.getAllValues() || {};
    console.log("allValsMap", allValsMap)
    const flatValues = Object.values(allValsMap).flat().map(v => v.toLowerCase());
    const naked = this.stripQuotes(token).toLowerCase();
    return flatValues.includes(naked);
  }

  /** strip surrounding/opening quote for comparisons */
  private stripQuotes(s: string): string {
    if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
    if (s.startsWith('"') && !s.endsWith('"')) return s.slice(1);
    return s;
  }

  /** pagination helper */
  private page() {
    this.filteredList = this.suggestions.slice(0, this.PAGE_SIZE);
    this.visibleCount = this.filteredList.length;
  }

  /** parentheses balance */
  countOpenParens(tokens: string[]): number {
    let count = 0;
    for (const t of tokens) {
      if (t === '(') count++;
      else if (t === ')') count--;
    }
    return count;
  }

  /** ranked filter: prefix > suffix > middle */
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

  /** replace last token; auto-quote values; don't quote VAR/OP/LOGICAL/() */
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
      OPERATORS.includes(item) ||
      LOGICALS.includes(item) ||
      item === '(' || item === ')'
    ) return item;

    // value → ensure quoted
    if (!item.startsWith('"')) item = `"${item}`;
    if (!item.endsWith('"'))   item = `${item}"`;
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
}
