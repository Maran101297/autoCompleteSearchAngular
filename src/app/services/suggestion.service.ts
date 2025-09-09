import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';


type ListKind = 'variables' | 'operators' | 'logicals';
type Kind = ListKind | 'values';

@Injectable({ providedIn: 'root' })
export class SuggestionService {
  private base = 'http://localhost:8080/api/suggestions';

  private variables: string[] = [];
  private operators: string[] = [];
  private logicals: string[] = [];
  private valuesMap: { [varName: string]: string[] } = {};

  private totals: Record<ListKind, number> = { variables: 0, operators: 0, logicals: 0 };
  private offsets: Record<ListKind, number> = { variables: 0, operators: 0, logicals: 0 };
  private valuesMeta: { [v: string]: { total: number, offset: number } } = {};

  readonly PAGE = 10;

  constructor(private http: HttpClient) {}

  async loadInitial(): Promise<void | Error> {
    if (this.variables.length || this.operators.length || this.logicals.length) return;

    try {
      const meta: any = await firstValueFrom(this.http.get(`${this.base}/meta`));
      if (meta) {
        this.totals.variables = meta.variablesCount || 0;
        this.totals.operators = meta.operatorsCount || 0;
        this.totals.logicals  = meta.logicalsCount  || 0;
      }
    } catch (err) { 
         console.error("Error loading meta:", err);
          throw err;  

     }

    await Promise.all([
      this.fetchPage('variables', 0),
      this.fetchPage('operators', 0),
      this.fetchPage('logicals', 0)
    ]);
  }

  private async fetchPage(kind: Kind, offset: number, variable?: string): Promise<void> {
    if (kind === 'values') {
      if (!variable) return;
      const params = new HttpParams().set('variable', variable).set('offset', String(offset)).set('limit', String(this.PAGE));
      const res: any = await firstValueFrom(this.http.get(`${this.base}/values`, { params }));
      const items: string[] = res.items || [];
      if (!this.valuesMap[variable]) this.valuesMap[variable] = [];
      this.valuesMap[variable] = this.valuesMap[variable].concat(items);
      this.valuesMeta[variable] = {
        offset: this.valuesMap[variable].length,
        total: typeof res.total === 'number' ? res.total : (this.valuesMeta[variable]?.total || this.valuesMap[variable].length)
      };
      return;
    }

    const params = new HttpParams().set('offset', String(offset)).set('limit', String(this.PAGE));
    const res: any = await firstValueFrom(this.http.get(`${this.base}/${kind}`, { params }));
    const items: string[] = res.items || [];

    if (kind === 'variables') {
      this.variables = this.variables.concat(items);
      this.offsets.variables = this.variables.length;
      this.totals.variables = typeof res.total === 'number' ? res.total : (this.totals.variables || this.variables.length);
    } else if (kind === 'operators') {
      this.operators = this.operators.concat(items);
      this.offsets.operators = this.operators.length;
      this.totals.operators = typeof res.total === 'number' ? res.total : (this.totals.operators || this.operators.length);
    } else if (kind === 'logicals') {
      this.logicals = this.logicals.concat(items);
      this.offsets.logicals = this.logicals.length;
      this.totals.logicals = typeof res.total === 'number' ? res.total : (this.totals.logicals || this.logicals.length);
    }
  }

  async loadMore(kind: Kind, variable?: string): Promise<boolean> {
    try {
      if (kind === 'values') {
        if (!variable) return false;
        const meta = this.valuesMeta[variable] || { offset: 0, total: 0 };
        if (meta.offset >= (meta.total || 0)) return false;
        await this.fetchPage('values', meta.offset, variable);
        return true;
      } else {
        const offset = this.offsets[kind];
        const total = this.totals[kind] || 0;
        if (offset >= total && total !== 0) return false;
        await this.fetchPage(kind, offset);
        return true;
      }
    } catch (err) {
      console.error('SuggestionService.loadMore error', kind, variable, err);
      return false;
    }
  }

  async ensureValuesFor(variable: string): Promise<void> {
    if (!variable) return;
    if (!this.valuesMap[variable] || this.valuesMap[variable].length === 0) {
      await this.fetchPage('values', 0, variable);
    }
  }

  getVariables(): string[] { return this.variables.slice(); }
  getOperators(): string[] { return this.operators.slice(); }
  getLogicals(): string[]  { return this.logicals.slice(); }
  getValuesFor(variable: string): string[] { return this.valuesMap[variable] ? this.valuesMap[variable].slice() : []; }
  getAllValues(): { [k: string]: string[] } { return { ...this.valuesMap }; }
}
