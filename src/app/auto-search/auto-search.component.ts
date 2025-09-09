import { Component, OnInit } from '@angular/core';
import { SuggestionService } from '../services/suggestion.service';

// import your existing modules (adjust paths)
import { getSuggestions } from '../logic/helper/grammar.helper';    
import { validateFormula } from '../logic/validator/validator';  
import { GrammarData } from '../logic/dto/types';             
// import { classifyToken } from '../logic/utils/utils';
import { tokenize, classifyToken } from '../logic/utils/tokenizer';

type SourceKind = 'variables' | 'operators' | 'logicals' | 'values' | null;

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

  errorMessage = '';

  currentSourceKind: SourceKind = null;
  currentValueVariable: string | null = null;

  loadingMore = false;

  constructor(private suggestionService: SuggestionService) {}

  async ngOnInit() {
    await this.suggestionService.loadInitial();
    await this.refresh('', true);
  }

  async onFocus() {
    await this.suggestionService.loadInitial();
    await this.refresh('', true);
  }

  onInput(event: any) {
    this.searchText = event.target.value;
    this.refresh(this.searchText.trim(), true);
  }

  private makeData(): GrammarData {
    return {
      variables: this.suggestionService.getVariables(),
      operators: this.suggestionService.getOperators(),
      logicals: this.suggestionService.getLogicals(),
      valuesMap: this.suggestionService.getAllValues()
    };
  }

  /**
   * detect if query implies we need values for a variable (VAR OP ...)
   */
  private detectValueVariableFromQuery(query: string): string | null {
    const data = this.makeData();
    const tokens = tokenize(query);
    if (tokens.length < 2) return null;
    const last = tokens[tokens.length - 1];
    const prev = tokens[tokens.length - 2];
    const prevType = classifyToken(prev, data);
    const lastType = classifyToken(last, data);
    // VAR OP or VAR OP partial-value
    if (prevType === 'VAR' && lastType === 'OP') return prev;
    if (tokens.length >= 3) {
      const prev2 = tokens[tokens.length - 3];
      const prev2Type = classifyToken(prev2, data);
      if (prev2Type === 'VAR' && prevType === 'OP' && lastType === 'VALUE_PARTIAL') return prev2;
    }
    return null;
  }

  async refresh(query: string, validate: boolean) {
    // ensure values if needed before compute suggestions
    const needed = this.detectValueVariableFromQuery(query);
    if (needed) await this.suggestionService.ensureValuesFor(needed);

    const data = this.makeData();
    const sugg = getSuggestions(query, data, this.PAGE_SIZE);

    // determine kind (token-based preferred)
    const varFromTokens = this.detectValueVariableFromQuery(query);
    let kind: SourceKind = null;
    if (varFromTokens) { kind = 'values'; this.currentValueVariable = varFromTokens; }
    else if (sugg.length && data.operators.includes(sugg[0])) kind = 'operators';
    else if (sugg.length && data.logicals.includes(sugg[0])) kind = 'logicals';
    else kind = 'variables';

    this.currentSourceKind = kind;
    if (kind !== 'values') this.currentValueVariable = null;

    this.suggestions = sugg;
    this.filteredList = this.suggestions.slice(0, this.PAGE_SIZE);
    this.visibleCount = this.filteredList.length;

    if (validate) this.errorMessage = validateFormula(this.searchText, data, true); // allowPartial=true while typing
  }

  async onScrollSuggestions(event: any) {
    const { scrollTop, scrollHeight, clientHeight } = event.target;
    if (scrollTop + clientHeight < scrollHeight - 5) return;
    if (this.loadingMore) return;
    const kind = this.currentSourceKind;
    if (!kind) return;

    this.loadingMore = true;
    try {
      const data = this.makeData();

      // for values: try to use cached first, else call API
      if (kind === 'values' && this.currentValueVariable) {
        const cached = data.valuesMap[this.currentValueVariable] || [];
        const cachedNext = cached.slice(this.visibleCount, this.visibleCount + this.PAGE_SIZE);
        if (cachedNext.length > 0) {
          this.filteredList = this.filteredList.concat(cachedNext);
          this.visibleCount = this.filteredList.length;
          return;
        }
        const loaded = await this.suggestionService.loadMore('values', this.currentValueVariable);
        if (!loaded) return;
        const suggAll = getSuggestions(this.searchText.trim(), this.makeData(), 1000);
        this.suggestions = suggAll;
        const nextItems = this.suggestions.slice(this.visibleCount, this.visibleCount + this.PAGE_SIZE);
        this.filteredList = this.filteredList.concat(nextItems);
        this.visibleCount = this.filteredList.length;
        this.errorMessage = validateFormula(this.searchText, this.makeData(), true);
        return;
      }

      // list kinds
      if (kind === 'variables' || kind === 'operators' || kind === 'logicals') {
        const cachedList = kind === 'variables'
          ? data.variables
          : (kind === 'operators' ? data.operators : data.logicals);
        const cachedNext = cachedList.slice(this.visibleCount, this.visibleCount + this.PAGE_SIZE);
        if (cachedNext.length > 0) {
          this.filteredList = this.filteredList.concat(cachedNext);
          this.visibleCount = this.filteredList.length;
          return;
        }
        const loaded = await this.suggestionService.loadMore(kind as any);
        if (!loaded) return;
        const suggAll = getSuggestions(this.searchText.trim(), this.makeData(), 1000);
        this.suggestions = suggAll;
        const nextItems = this.suggestions.slice(this.visibleCount, this.visibleCount + this.PAGE_SIZE);
        this.filteredList = this.filteredList.concat(nextItems);
        this.visibleCount = this.filteredList.length;
        this.errorMessage = validateFormula(this.searchText, this.makeData(), true);
        return;
      }
    } finally {
      this.loadingMore = false;
    }
  }

  selectItem(item: string) {
    // replace last token
    const tokens = (this.searchText || '').split(/\s+/);
    tokens[tokens.length - 1] = this.formatValueIfNeeded(item);
    this.searchText = tokens.join(' ') + ' ';
    this.refresh(this.searchText.trim(), true);
  }

  private formatValueIfNeeded(item: string): string {
    const data = this.makeData();
    if (
      data.variables.includes(item) ||
      data.operators.includes(item) ||
      data.logicals.includes(item) ||
      item === '(' || item === ')'
    ) return item;
    if (!item.startsWith('"')) item = `"${item}`;
    if (!item.endsWith('"')) item = `${item}"`;
    return item;
  }
}
