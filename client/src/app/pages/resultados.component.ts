import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DecimalPipe, DatePipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { Study } from '../core/models';

interface EstudioReporteGrupo {
  survey: { id: string; title: string; group: string; group_id: string; status: string };
  summary: {
    response_count: number;
    participants_count: number;
    judges_count: number;
    exhibitors_count: number;
  };
  questions: {
    questionId: string;
    prompt: string;
    questionTypeLabel: string;
    isNumeric: boolean;
    universe: number;
    mean: number | null;
    median: number | null;
    mode: number | null;
    value_range: number | null;
    maximum: number | null;
    minimum: number | null;
    coefficient_of_variation: number | null;
    variance: number | null;
    standard_deviation: number | null;
    frequencies: { value: string; frequency: number }[];
  }[];
  group: string;
  group_id: string;
}

interface EstudioReporte {
  study: Study;
  surveys: EstudioReporteGrupo[];
  respondentTargets: { grupo_encuestado: string; target_count: number }[];
}

@Component({
  selector: 'app-resultados',
  standalone: true,
  imports: [DecimalPipe, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="resultados-page">
      <div class="page-header">
        <h1 class="page-title">Resultados</h1>
        <p class="page-subtitle">Informes estadísticos por feria · Solo superusuario</p>
      </div>

      @if (loading) {
        <div class="loading-state">Cargando ferias…</div>
      } @else if (error) {
        <div class="error-state" role="alert">{{ error }}</div>
      } @else {
        <nav class="tab-nav" role="tablist">
          <button role="tab" class="tab-btn" [class.tab-active]="activeTab === 'activo'"
                  (click)="activeTab = 'activo'" [attr.aria-selected]="activeTab === 'activo'">
            Activas <span class="tab-count">{{ feriasPorTab('activo').length }}</span>
          </button>
          <button role="tab" class="tab-btn" [class.tab-active]="activeTab === 'cerrado'"
                  (click)="activeTab = 'cerrado'" [attr.aria-selected]="activeTab === 'cerrado'">
            Cerradas <span class="tab-count">{{ feriasPorTab('cerrado').length }}</span>
          </button>
        </nav>
        <div class="ferias-grid">
          @for (feria of feriasPorTab(activeTab); track feria.id) {
            <div class="feria-card" [class.feria-card--selected]="selectedId === feria.id">
              <div class="feria-card__header">
                <span class="feria-status" [class.feria-status--activo]="feria.status === 'activo'"
                      [class.feria-status--cerrado]="feria.status === 'cerrado'">
                  {{ feria.status === 'activo' ? 'Activa' : feria.status === 'cerrado' ? 'Cerrada' : 'Borrador' }}
                </span>
                <span class="feria-turno">{{ feria.shift === 'mañana' ? '☀' : '🌙' }} {{ feria.shift }}</span>
              </div>
              <h2 class="feria-title">{{ feria.title }}</h2>
              @if (feria.date) {
                <p class="feria-date">{{ feria.date | date: 'dd/MM/yyyy' }}</p>
              }
              <div class="feria-actions">
                <button class="btn-ver" (click)="cargarReporte(feria.id)"
                        [disabled]="loadingReport === feria.id">
                  {{ loadingReport === feria.id ? 'Cargando…' : 'Ver reporte' }}
                </button>
                <a class="btn-pdf" [href]="'/api/estudios/' + feria.id + '/reporte-estadistico.pdf'"
                   target="_blank">
                  Descargar PDF
                </a>
              </div>
            </div>
          }
          @if (feriasPorTab(activeTab).length === 0) {
            <p class="empty-tab">No hay ferias {{ activeTab === 'activo' ? 'activas' : 'cerradas' }}.</p>
          }
        </div>
      }

      @if (reporte) {
        <div class="reporte-panel">
          <div class="reporte-header">
            <div>
              <h2 class="reporte-title">{{ reporte.study.title }}</h2>
              <p class="reporte-meta">
                {{ reporte.study.date | date: 'dd/MM/yyyy' }} · Turno {{ reporte.study.shift }}
                · {{ totalRespuestas(reporte) }} respuestas totales
              </p>
            </div>
            <a class="btn-pdf btn-pdf--lg"
               [href]="'/api/estudios/' + reporte.study.id + '/reporte-estadistico.pdf'"
               target="_blank">
              Descargar PDF completo
            </a>
          </div>

          <!-- Resumen por grupos -->
          <div class="grupos-tabs">
            @for (grupo of reporte.surveys; track grupo.group_id) {
              <button class="grupo-tab" [class.grupo-tab--active]="activeGroup === grupo.group_id"
                      (click)="activeGroup = grupo.group_id">
                {{ grupo.group }}
              </button>
            }
          </div>

          @for (grupo of reporte.surveys; track grupo.group_id) {
            @if (activeGroup === grupo.group_id) {
              <div class="grupo-panel">
                <div class="grupo-summary">
                  <div class="summary-chip">Respuestas: <strong>{{ grupo.summary.response_count }}</strong></div>
                  <div class="summary-chip">Participantes: <strong>{{ grupo.summary.participants_count }}</strong></div>
                  <div class="summary-chip">Jurados: <strong>{{ grupo.summary.judges_count }}</strong></div>
                  <div class="summary-chip">Expositores: <strong>{{ grupo.summary.exhibitors_count }}</strong></div>
                </div>

                @for (q of grupo.questions; track q.questionId) {
                  <div class="question-block">
                    <h4 class="question-prompt">{{ q.prompt }}</h4>
                    <p class="question-meta">{{ q.questionTypeLabel }} · N = {{ q.universe }}</p>

                    @if (q.isNumeric && q.universe > 0) {
                      <div class="stats-grid">
                        <div class="stat-cell"><span class="stat-label">Media (x̄)</span><span class="stat-value">{{ q.mean | number: '1.4-4' }}</span></div>
                        <div class="stat-cell"><span class="stat-label">Mediana</span><span class="stat-value">{{ q.median | number: '1.4-4' }}</span></div>
                        <div class="stat-cell"><span class="stat-label">Moda</span><span class="stat-value">{{ q.mode | number: '1.4-4' }}</span></div>
                        <div class="stat-cell"><span class="stat-label">Rango</span><span class="stat-value">{{ q.value_range | number: '1.4-4' }}</span></div>
                        <div class="stat-cell"><span class="stat-label">Mínimo</span><span class="stat-value">{{ q.minimum | number: '1.4-4' }}</span></div>
                        <div class="stat-cell"><span class="stat-label">Máximo</span><span class="stat-value">{{ q.maximum | number: '1.4-4' }}</span></div>
                        <div class="stat-cell"><span class="stat-label">Varianza (S²)</span><span class="stat-value">{{ q.variance | number: '1.4-4' }}</span></div>
                        <div class="stat-cell"><span class="stat-label">Desv. estándar (S)</span><span class="stat-value">{{ q.standard_deviation | number: '1.4-4' }}</span></div>
                        <div class="stat-cell"><span class="stat-label">CV (%)</span><span class="stat-value">{{ q.coefficient_of_variation | number: '1.2-2' }}%</span></div>
                      </div>
                    }

                    @if (q.frequencies.length > 0) {
                      <div class="freq-table-wrap">
                        <table class="freq-table">
                          <thead>
                            <tr>
                              <th>Valor / Categoría</th>
                              <th>Frecuencia (fi)</th>
                              <th>Freq. rel. (%)</th>
                            </tr>
                          </thead>
                          <tbody>
                            @for (f of q.frequencies; track f.value) {
                              <tr>
                                <td>{{ f.value }}</td>
                                <td>{{ f.frequency }}</td>
                                <td>{{ freqPct(f.frequency, q.frequencies) }}%</td>
                              </tr>
                            }
                          </tbody>
                        </table>
                      </div>
                    }
                  </div>
                }
              </div>
            }
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .resultados-page { padding: 24px; max-width: 1200px; margin: 0 auto; }
    .page-header { margin-bottom: 24px; }
    .page-title { font-size: 1.75rem; font-weight: 700; color: #0d2b24; margin: 0 0 4px; }
    .page-subtitle { font-size: 0.875rem; color: #6b7280; margin: 0; }
    .loading-state, .error-state { padding: 32px; text-align: center; color: #6b7280; }
    .error-state { color: #dc2626; }

    .tab-nav { display: flex; gap: 8px; margin-bottom: 20px; border-bottom: 2px solid #e5e7eb; padding-bottom: 0; }
    .tab-btn { background: transparent; border: none; border-bottom: 3px solid transparent; padding: 8px 16px; font-size: 0.9rem; font-weight: 600; color: #6b7280; cursor: pointer; margin-bottom: -2px; transition: color .15s, border-color .15s; }
    .tab-btn:hover { color: #0d2b24; }
    .tab-active { color: #0d2b24; border-bottom-color: #0d2b24; }
    .tab-count { display: inline-flex; align-items: center; justify-content: center; background: #e5e7eb; color: #374151; border-radius: 999px; font-size: 0.75rem; min-width: 20px; height: 20px; padding: 0 6px; margin-left: 6px; }
    .tab-active .tab-count { background: #0d2b24; color: #8dcab8; }
    .empty-tab { color: #9ca3af; font-size: 0.875rem; padding: 16px 0; }
    .ferias-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; margin-bottom: 32px; }
    .feria-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; transition: box-shadow .15s; }
    .feria-card:hover { box-shadow: 0 4px 16px rgba(13,43,36,.1); }
    .feria-card--selected { border-color: #0d2b24; box-shadow: 0 0 0 2px rgba(13,43,36,.15); }
    .feria-card__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .feria-status { font-size: 0.75rem; padding: 2px 8px; border-radius: 999px; background: #f3f4f6; color: #374151; font-weight: 600; }
    .feria-status--activo { background: #dcfce7; color: #166534; }
    .feria-status--cerrado { background: #f3f4f6; color: #6b7280; }
    .feria-turno { font-size: 0.75rem; color: #9ca3af; }
    .feria-title { font-size: 1rem; font-weight: 600; color: #111827; margin: 0 0 4px; }
    .feria-date { font-size: 0.8125rem; color: #6b7280; margin: 0 0 12px; }
    .feria-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .btn-ver { background: #0d2b24; color: #8dcab8; border: none; border-radius: 8px; padding: 7px 14px; font-size: 0.8125rem; font-weight: 600; cursor: pointer; transition: opacity .15s; }
    .btn-ver:hover:not(:disabled) { opacity: .85; }
    .btn-ver:disabled { opacity: .5; cursor: not-allowed; }
    .btn-pdf { background: transparent; color: #0d2b24; border: 1px solid #0d2b24; border-radius: 8px; padding: 7px 14px; font-size: 0.8125rem; font-weight: 600; text-decoration: none; cursor: pointer; transition: background .15s; }
    .btn-pdf:hover { background: #f0f7f4; }
    .btn-pdf--lg { padding: 10px 20px; font-size: 0.875rem; white-space: nowrap; align-self: flex-start; }

    .reporte-panel { background: #fff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 24px; }
    .reporte-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
    .reporte-title { font-size: 1.375rem; font-weight: 700; color: #0d2b24; margin: 0 0 4px; }
    .reporte-meta { font-size: 0.875rem; color: #6b7280; margin: 0; }

    .grupos-tabs { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 20px; border-bottom: 2px solid #e5e7eb; padding-bottom: 12px; }
    .grupo-tab { background: transparent; border: 1px solid #e5e7eb; border-radius: 8px; padding: 6px 14px; font-size: 0.875rem; color: #374151; cursor: pointer; transition: all .15s; }
    .grupo-tab:hover { background: #f0f7f4; border-color: #0d2b24; }
    .grupo-tab--active { background: #0d2b24; color: #8dcab8; border-color: #0d2b24; font-weight: 600; }

    .grupo-summary { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 20px; }
    .summary-chip { background: #f0f7f4; border: 1px solid #c8e6d8; border-radius: 8px; padding: 6px 12px; font-size: 0.8125rem; color: #374151; }
    .summary-chip strong { color: #0d2b24; }

    .question-block { border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
    .question-prompt { font-size: 1rem; font-weight: 600; color: #111827; margin: 0 0 4px; }
    .question-meta { font-size: 0.8125rem; color: #6b7280; margin: 0 0 12px; }

    .stats-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px; margin-bottom: 16px; }
    .stat-cell { background: #f9fdfc; border: 1px solid #c8e6d8; border-radius: 8px; padding: 8px 10px; }
    .stat-label { display: block; font-size: 0.6875rem; color: #1a4a3a; font-weight: 600; text-transform: uppercase; letter-spacing: .03em; margin-bottom: 2px; }
    .stat-value { display: block; font-size: 1rem; font-weight: 700; color: #0d2b24; font-variant-numeric: tabular-nums; }

    .freq-table-wrap { overflow-x: auto; }
    .freq-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    .freq-table th { background: #0d2b24; color: #8dcab8; padding: 8px 12px; text-align: left; font-size: 0.75rem; text-transform: uppercase; letter-spacing: .04em; }
    .freq-table td { padding: 7px 12px; border-bottom: 1px solid #f0f4f2; color: #374151; }
    .freq-table tr:nth-child(even) td { background: #f9fdfc; }
    .freq-table tr:last-child td { border-bottom: none; }

    @media (max-width: 600px) {
      .resultados-page { padding: 16px; }
      .ferias-grid { grid-template-columns: 1fr; }
      .reporte-header { flex-direction: column; }
      .stats-grid { grid-template-columns: repeat(2, 1fr); }
    }
  `],
})
export class ResultadosComponent implements OnInit {
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);

  ferias: Study[] = [];
  loading = true;
  error = '';
  reporte: EstudioReporte | null = null;
  loadingReport: string | null = null;
  selectedId: string | null = null;
  activeGroup = '';
  activeTab: 'activo' | 'cerrado' = 'activo';

  feriasPorTab(tab: 'activo' | 'cerrado'): Study[] {
    if (tab === 'activo') return this.ferias.filter((f) => f.status === 'activo');
    return this.ferias.filter((f) => f.status !== 'activo');
  }

  async ngOnInit(): Promise<void> {
    try {
      const all = await firstValueFrom(this.http.get<Study[]>('/api/estudios'));
      this.ferias = all;
    } catch {
      this.error = 'No se pudieron cargar las ferias.';
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  async cargarReporte(feriaId: string): Promise<void> {
    this.loadingReport = feriaId;
    this.selectedId = feriaId;
    this.reporte = null;
    this.cdr.markForCheck();
    try {
      const r = await firstValueFrom(this.http.get<EstudioReporte>(`/api/estudios/${feriaId}/reporte-estadistico`));
      this.reporte = r;
      this.activeGroup = r.surveys[0]?.group_id ?? '';
    } catch {
      this.error = 'No se pudo cargar el reporte.';
    } finally {
      this.loadingReport = null;
      this.cdr.markForCheck();
    }
  }

  totalRespuestas(r: EstudioReporte): number {
    return r.surveys.reduce((s, g) => s + (g.summary.response_count ?? 0), 0);
  }

  freqPct(freq: number, all: { value: string; frequency: number }[]): string {
    const total = all.reduce((s, f) => s + f.frequency, 0);
    if (!total) return '0.0';
    return ((freq / total) * 100).toFixed(1);
  }
}
