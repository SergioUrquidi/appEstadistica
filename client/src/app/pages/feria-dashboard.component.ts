import { CommonModule, DecimalPipe } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  QueryList,
  ViewChildren,
  inject,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  Chart,
  ArcElement,
  BarElement,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  PieController,
  BarController,
  LineController,
  Title,
  Filler,
} from 'chart.js';

Chart.register(
  ArcElement, BarElement, LineElement, PointElement,
  CategoryScale, LinearScale,
  Tooltip, Legend, PieController, BarController, LineController,
  Title, Filler,
);

interface FeriaItem {
  id: string;
  titulo: string;
  turno: string;
  fecha: string | null;
}

interface FreqItem {
  valor: string;
  fi: number;
  hi: number;
  pct: number;
  Fi: number;
  Hi: number;
}

interface DashboardPregunta {
  pregunta_texto: string;
  posicion: number;
  tipo_label: string;
  es_numerica: boolean;
  n_respuestas: number;
  // Tendencia central
  media: number | null;
  mediana: number | null;
  moda_valor: string | null;
  moda_frecuencia: number | null;
  // Dispersión
  varianza: number | null;
  desv_estandar: number | null;
  desv_media: number | null;
  coef_variacion: number | null;
  rango: number | null;
  minimo: number | null;
  maximo: number | null;
  // Cuartiles
  q1: number | null;
  q3: number | null;
  iqr: number | null;
  // Forma
  sesgo: number | null;
  curtosis: number | null;
  // Estimación de parámetros
  error_estandar: number | null;
  ic_inf_95: number | null;
  ic_sup_95: number | null;
  frecuencias: FreqItem[];
}

interface GrupoConteo { grupo: string; conteo: number; }

interface DashboardData {
  titulo: string;
  turno: string;
  fecha: string | null;
  total_respuestas: number;
  total_encuestas: number;
  respuestas_por_grupo: GrupoConteo[];
  preguntas: DashboardPregunta[];
}

@Component({
  selector: 'app-feria-dashboard',
  standalone: true,
  imports: [CommonModule, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Pestañas de ferias -->
    @if (ferias.length) {
      <nav class="ferias-tabs" role="tablist" aria-label="Seleccionar feria">
        @for (f of ferias; track f.id) {
          <button
            role="tab"
            class="tab-btn"
            [class.tab-active]="f.id === feriaActivaId"
            (click)="selectFeria(f.id)"
            [attr.aria-selected]="f.id === feriaActivaId">
            <span class="tab-titulo">{{ f.titulo }}</span>
            <span class="tab-meta">{{ f.turno }}</span>
          </button>
        }
      </nav>
    }

    @if (loading) {
      <div class="loading-state"><p>Cargando estadísticas…</p></div>
    } @else if (error) {
      <div class="error-state"><p>{{ error }}</p></div>
    } @else if (data) {

      <!-- Encabezado -->
      <header class="dash-head">
        <div>
          <p class="eyebrow">Dashboard estadístico — Estadística I</p>
          <h1>{{ data.titulo }}</h1>
          <div class="head-meta">
            <span class="shift-badge" [class.shift-noche]="data.turno === 'noche'">
              {{ data.turno === 'mañana' ? '☀ Mañana' : '☾ Noche' }}
            </span>
            @if (data.fecha) {
              <span class="meta-date">{{ data.fecha | date:'dd/MM/yyyy' }}</span>
            }
          </div>
        </div>
        <div class="kpi-row">
          <div class="kpi">
            <strong>{{ data.total_respuestas }}</strong>
            <span>respuestas (n)</span>
          </div>
          <div class="kpi">
            <strong>{{ data.total_encuestas }}</strong>
            <span>encuestas</span>
          </div>
        </div>
      </header>

      <!-- Distribución por grupo (torta) -->
      @if (data.respuestas_por_grupo.length) {
        <section class="panel chart-panel">
          <h2>Distribución de respuestas por grupo</h2>
          <div class="pie-wrap">
            <canvas #pieCanvas></canvas>
          </div>
          <div class="grupo-legend">
            @for (g of data.respuestas_por_grupo; track g.grupo) {
              <span class="legend-item">
                <span class="legend-dot" [style.background]="grupoColor($index)"></span>
                {{ g.grupo }}: <strong>{{ g.conteo }}</strong>
              </span>
            }
          </div>
        </section>
      }

      <!-- Una sección por pregunta -->
      @for (p of data.preguntas; track p.posicion) {
        <section class="panel pregunta-panel">
          <div class="pregunta-header">
            <span class="posicion-badge">P{{ p.posicion }}</span>
            <div>
              <h2>{{ p.pregunta_texto }}</h2>
              <span class="tipo-badge">{{ p.tipo_label }}</span>
            </div>
          </div>

          <p class="muestra">n = {{ p.n_respuestas }} respuestas — tamaño de muestra (encuestas respondidas)</p>

          @if (p.es_numerica && p.media !== null) {

            <!-- ── Unidad 3: Medidas de Tendencia Central ── -->
            <div class="section-title">Medidas de Tendencia Central</div>
            <div class="stats-grid">
              <div class="stat-tile highlight-blue">
                <span class="stat-label">Media aritmética (μ)</span>
                <strong>{{ p.media | number:'1.4-4' }}</strong>
              </div>
              <div class="stat-tile highlight-blue">
                <span class="stat-label">Mediana</span>
                <strong>{{ p.mediana | number:'1.4-4' }}</strong>
              </div>
              <div class="stat-tile highlight-blue">
                <span class="stat-label">Moda</span>
                <strong>{{ p.moda_valor ?? '—' }}</strong>
                @if (p.moda_frecuencia) {
                  <small>(f = {{ p.moda_frecuencia }})</small>
                }
              </div>
            </div>

            <!-- ── Unidad 3: Medidas de Dispersión ── -->
            <div class="section-title">Medidas de Dispersión (Muestrales — ÷ n−1)</div>
            <div class="stats-grid">
              <div class="stat-tile">
                <span class="stat-label">Varianza muestral (s²)</span>
                <strong>{{ p.varianza | number:'1.4-4' }}</strong>
              </div>
              <div class="stat-tile">
                <span class="stat-label">Desv. estándar (s)</span>
                <strong>{{ p.desv_estandar | number:'1.4-4' }}</strong>
              </div>
              <div class="stat-tile">
                <span class="stat-label">Desviación media</span>
                <strong>{{ p.desv_media | number:'1.4-4' }}</strong>
              </div>
              <div class="stat-tile">
                <span class="stat-label">Rango</span>
                <strong>{{ p.rango | number:'1.4-4' }}</strong>
              </div>
              <div class="stat-tile">
                <span class="stat-label">Mínimo</span>
                <strong>{{ p.minimo | number:'1.4-4' }}</strong>
              </div>
              <div class="stat-tile">
                <span class="stat-label">Máximo</span>
                <strong>{{ p.maximo | number:'1.4-4' }}</strong>
              </div>
              @if (p.coef_variacion !== null) {
                <div class="stat-tile">
                  <span class="stat-label">CV (%)</span>
                  <strong>{{ p.coef_variacion | number:'1.2-2' }}%</strong>
                </div>
              }
            </div>

            <!-- ── Cuartiles e IQR ── -->
            <div class="section-title">Cuartiles y Rango Intercuartílico</div>
            <div class="stats-grid">
              <div class="stat-tile highlight-gold">
                <span class="stat-label">Q1 (Percentil 25)</span>
                <strong>{{ p.q1 | number:'1.4-4' }}</strong>
              </div>
              <div class="stat-tile highlight-gold">
                <span class="stat-label">Q2 = Mediana</span>
                <strong>{{ p.mediana | number:'1.4-4' }}</strong>
              </div>
              <div class="stat-tile highlight-gold">
                <span class="stat-label">Q3 (Percentil 75)</span>
                <strong>{{ p.q3 | number:'1.4-4' }}</strong>
              </div>
              <div class="stat-tile highlight-gold">
                <span class="stat-label">IQR = Q3 − Q1</span>
                <strong>{{ p.iqr | number:'1.4-4' }}</strong>
              </div>
            </div>

            <!-- ── Unidad 6: Forma de la distribución ── -->
            <div class="section-title">Forma de la Distribución (Fórmulas Muestrales)</div>
            <div class="stats-grid">
              <div class="stat-tile" [class.sesgo-pos]="(p.sesgo ?? 0) > 0.5" [class.sesgo-neg]="(p.sesgo ?? 0) < -0.5">
                <span class="stat-label">Asimetría / Sesgo (g₁)</span>
                <strong>{{ p.sesgo | number:'1.4-4' }}</strong>
                <small>{{ sesgLabel(p.sesgo) }}</small>
              </div>
              <div class="stat-tile" [class.kurt-lepto]="(p.curtosis ?? 0) > 0.5" [class.kurt-plati]="(p.curtosis ?? 0) < -0.5">
                <span class="stat-label">Curtosis exceso (γ₂)</span>
                <strong>{{ p.curtosis | number:'1.4-4' }}</strong>
                <small>{{ kurtLabel(p.curtosis) }}</small>
              </div>
            </div>

            <!-- Etiqueta de forma -->
            <div class="dist-label" [class]="distClass(p)">{{ distLabel(p) }}</div>

            <!-- ── Unidad 8: Estimación de parámetros ── -->
            <div class="section-title">Estimación de Parámetros (IC 95% — Muestra)</div>
            <div class="stats-grid">
              <div class="stat-tile highlight-green">
                <span class="stat-label">Error estándar (s/√n)</span>
                <strong>{{ p.error_estandar | number:'1.4-4' }}</strong>
              </div>
              <div class="stat-tile highlight-green">
                <span class="stat-label">IC 95% — Límite inferior</span>
                <strong>{{ p.ic_inf_95 | number:'1.4-4' }}</strong>
              </div>
              <div class="stat-tile highlight-green">
                <span class="stat-label">IC 95% — Límite superior</span>
                <strong>{{ p.ic_sup_95 | number:'1.4-4' }}</strong>
              </div>
            </div>
            <div class="ic-bar">
              <span>IC 95%: [ {{ p.ic_inf_95 | number:'1.4-4' }} , {{ p.ic_sup_95 | number:'1.4-4' }} ]</span>
              <small>x̄ = {{ p.media | number:'1.4-4' }} ± 1.96 × (s/√n) = ± {{ p.error_estandar | number:'1.4-4' }}</small>
            </div>
          }

          @if (!p.es_numerica && p.moda_valor) {
            <div class="stats-grid">
              <div class="stat-tile highlight-blue">
                <span class="stat-label">Moda</span>
                <strong>{{ p.moda_valor }}</strong>
                @if (p.moda_frecuencia) {
                  <small>(f = {{ p.moda_frecuencia }})</small>
                }
              </div>
            </div>
          }

          <!-- ── Unidad 2: Tabla de distribución de frecuencias ── -->
          @if (p.frecuencias.length) {
            <div class="section-title">Distribución de Frecuencias (Unidad 2)</div>
            <div class="table-wrap">
              <table class="freq-table">
                <thead>
                  <tr>
                    <th>Valor</th>
                    <th title="Frecuencia absoluta">fi</th>
                    <th title="Frecuencia relativa">hi</th>
                    <th title="Frecuencia relativa porcentual">%</th>
                    <th title="Frecuencia acumulada absoluta">Fi</th>
                    <th title="Frecuencia acumulada relativa">Hi</th>
                  </tr>
                </thead>
                <tbody>
                  @for (f of p.frecuencias; track f.valor) {
                    <tr>
                      <td>{{ f.valor }}</td>
                      <td>{{ f.fi }}</td>
                      <td>{{ f.hi | number:'1.4-4' }}</td>
                      <td>{{ f.pct | number:'1.2-2' }}%</td>
                      <td>{{ f.Fi }}</td>
                      <td>{{ f.Hi | number:'1.4-4' }}</td>
                    </tr>
                  }
                  <tr class="totals-row">
                    <td><strong>Total</strong></td>
                    <td><strong>{{ p.n_respuestas }}</strong></td>
                    <td><strong>1.0000</strong></td>
                    <td><strong>100%</strong></td>
                    <td><strong>{{ p.n_respuestas }}</strong></td>
                    <td><strong>1.0000</strong></td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Histograma / Barras de frecuencias -->
            <div class="chart-title">Histograma de frecuencias absolutas (fi)</div>
            <div class="bar-wrap">
              <canvas [attr.data-pos]="p.posicion" [attr.data-chart]="'bar'"></canvas>
            </div>

            <!-- Ojiva (frecuencias acumuladas) — solo para numéricas -->
            @if (p.es_numerica) {
              <div class="chart-title">Ojiva — Frecuencias acumuladas relativas (Hi)</div>
              <div class="bar-wrap">
                <canvas [attr.data-pos]="p.posicion" [attr.data-chart]="'ojiva'"></canvas>
              </div>
            }
          }

        </section>
      }
    }
  `,
  styles: [`
    :host { display:block; }
    .loading-state, .error-state { text-align:center; padding:4rem 1rem; color:#64748b; }

    /* Pestañas */
    .ferias-tabs { display:flex; gap:.4rem; overflow-x:auto; padding:.75rem 0 .9rem; margin-bottom:1.25rem; border-bottom:2px solid #e2e8f0; scrollbar-width:none; }
    .ferias-tabs::-webkit-scrollbar { display:none; }
    .tab-btn { display:flex; flex-direction:column; align-items:flex-start; gap:.1rem; padding:.45rem .9rem; border:1px solid #e2e8f0; border-radius:10px; background:#f8fafc; cursor:pointer; white-space:nowrap; transition:background .15s,border-color .15s; }
    .tab-btn:hover { background:var(--color-action-soft); border-color:var(--color-action); }
    .tab-btn.tab-active { background:#0d2b24; border-color:#0d2b24; }
    .tab-titulo { font-size:.8rem; font-weight:700; color:#334155; }
    .tab-btn.tab-active .tab-titulo { color:#fff; }
    .tab-meta { font-size:.65rem; color:#94a3b8; text-transform:capitalize; }
    .tab-btn.tab-active .tab-meta { color:#94a3b8; }

    .dash-head { display:flex; align-items:flex-start; justify-content:space-between; gap:1.5rem; flex-wrap:wrap; margin-bottom:2rem; }
    .eyebrow { color:#8dcab8; font-size:.72rem; font-weight:800; letter-spacing:.12em; text-transform:uppercase; margin:0 0 .2rem; }
    h1 { margin:.25rem 0 .5rem; font-size:clamp(1.4rem,4vw,2rem); }
    .head-meta { display:flex; gap:.5rem; align-items:center; flex-wrap:wrap; margin-top:.4rem; }
    .meta-date { color:#64748b; font-size:.82rem; }
    .shift-badge { display:inline-block; padding:.25rem .65rem; border-radius:99px; font-size:.7rem; font-weight:700; background:var(--color-action-soft); color:var(--color-action-text); }
    .shift-badge.shift-noche { background:#0d2b24; color:#8dcab8; }

    .kpi-row { display:flex; gap:1rem; flex-wrap:wrap; }
    .kpi { display:flex; flex-direction:column; align-items:center; background:#0d2b24; color:#fff; border-radius:14px; padding:.9rem 1.4rem; min-width:100px; }
    .kpi strong { font-size:2rem; line-height:1; }
    .kpi span { font-size:.7rem; color:#94a3b8; margin-top:.2rem; }

    .panel { background:#fff; border:1px solid #e2e8f0; border-radius:14px; padding:1.4rem; margin-bottom:1.25rem; }
    .chart-panel h2, .pregunta-panel h2 { margin:0 0 1rem; font-size:1rem; color:#0d2b24; }

    .pie-wrap { max-width:280px; margin:0 auto 1rem; }
    .grupo-legend { display:flex; flex-wrap:wrap; gap:.5rem; justify-content:center; }
    .legend-item { display:flex; align-items:center; gap:.3rem; font-size:.8rem; color:#475569; }
    .legend-dot { width:10px; height:10px; border-radius:50%; flex-shrink:0; }

    .pregunta-header { display:flex; gap:.85rem; align-items:flex-start; margin-bottom:.5rem; }
    .posicion-badge { display:inline-flex; align-items:center; justify-content:center; min-width:32px; height:32px; padding:0 .4rem; background:#8dcab8; color:#333333; border-radius:8px; font-size:.78rem; font-weight:800; flex-shrink:0; }
    .tipo-badge { display:inline-block; background:#f1f5f9; color:#475569; font-size:.7rem; padding:.2rem .55rem; border-radius:99px; font-weight:600; margin-top:.25rem; }
    .muestra { color:#64748b; font-size:.8rem; margin:.25rem 0 1rem; font-style:italic; }

    .section-title { font-size:.72rem; font-weight:800; letter-spacing:.1em; text-transform:uppercase; color:#94a3b8; margin:1.1rem 0 .55rem; padding-bottom:.25rem; border-bottom:1px solid #f1f5f9; }

    .stats-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); gap:.6rem; margin-bottom:.5rem; }
    .stat-tile { background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:.7rem .85rem; display:flex; flex-direction:column; gap:.15rem; }
    .stat-tile.sesgo-pos { border-color:#fbbf24; background:#fffbeb; }
    .stat-tile.sesgo-neg { border-color:var(--color-accent); background:#fdf8ed; }
    .stat-tile.kurt-lepto { border-color:#34d399; background:#ecfdf5; }
    .stat-tile.kurt-plati { border-color:#f87171; background:#fff1f2; }
    .stat-tile.highlight-blue { border-color:var(--color-action); background:var(--color-action-soft); }
    .stat-tile.highlight-gold { border-color:var(--color-accent); background:#fdf8ed; }
    .stat-tile.highlight-green { border-color:#86efac; background:#f0fdf4; }
    .stat-label { font-size:.65rem; color:#64748b; font-weight:700; text-transform:uppercase; letter-spacing:.04em; }
    .stat-tile strong { font-size:1.05rem; color:#0d2b24; font-weight:700; }
    .stat-tile small { font-size:.67rem; color:#94a3b8; }

    .dist-label { display:inline-block; padding:.35rem .85rem; border-radius:99px; font-size:.75rem; font-weight:700; margin:.4rem 0 .8rem; background:#f1f5f9; color:#475569; }
    .dist-label.unimodal { background:#dcfce7; color:#166534; }
    .dist-label.bimodal { background:var(--color-action-soft); color:var(--color-action-text); }
    .dist-label.sesgo-derecha { background:#fef3c7; color:#92400e; }
    .dist-label.sesgo-izquierda { background:#fdf8ed; color:#92670a; }

    .ic-bar { background:#f0fdf4; border:1px solid #86efac; border-radius:9px; padding:.6rem 1rem; font-size:.82rem; font-weight:600; color:#166534; display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:.4rem; margin-top:.3rem; margin-bottom:.5rem; }
    .ic-bar small { color:#4ade80; font-weight:400; font-size:.75rem; }

    /* Tabla de frecuencias */
    .table-wrap { overflow-x:auto; margin-bottom:.75rem; }
    .freq-table { width:100%; border-collapse:collapse; font-size:.82rem; }
    .freq-table th { background:#0d2b24; color:#8abfb5; font-size:.67rem; font-weight:700; letter-spacing:.06em; text-transform:uppercase; padding:.5rem .75rem; text-align:right; white-space:nowrap; }
    .freq-table th:first-child { text-align:left; }
    .freq-table td { padding:.45rem .75rem; border-bottom:1px solid #f1f5f9; color:#334155; text-align:right; }
    .freq-table td:first-child { text-align:left; font-weight:600; }
    .freq-table tbody tr:hover td { background:#f8fafc; }
    .freq-table .totals-row td { background:#f1f5f9; color:#0d2b24; border-top:2px solid #e2e8f0; }

    /* Gráficos */
    .chart-title { font-size:.72rem; font-weight:700; color:#94a3b8; text-transform:uppercase; letter-spacing:.08em; margin:.9rem 0 .4rem; }
    .bar-wrap { margin-bottom:1.2rem; height:220px; }
    .bar-wrap canvas { width:100% !important; height:100% !important; }

    @media(max-width:640px) {
      .dash-head { flex-direction:column; }
      .stats-grid { grid-template-columns:repeat(2,1fr); }
      .bar-wrap { height:180px; }
    }
  `],
})
export class FeriaDashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);

  @ViewChildren('pieCanvas') pieCanvases!: QueryList<ElementRef<HTMLCanvasElement>>;

  ferias: FeriaItem[] = [];
  feriaActivaId: string | null = null;
  loading = true;
  error = '';
  data: DashboardData | null = null;

  private charts: Chart[] = [];
  private chartsCreated = false;

  readonly GRUPO_COLORS = [
    '#8dcab8', '#22c55e', '#f59e0b', '#ef4444', '#d4b46a',
    '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#2d7d6a',
  ];

  async ngOnInit(): Promise<void> {
    try {
      this.ferias = await firstValueFrom(
        this.http.get<FeriaItem[]>('/api/dashboard/ferias'),
      );
      if (this.ferias.length) {
        await this.selectFeria(this.ferias[0].id);
        return;
      }
      this.loading = false;
    } catch {
      this.error = 'No se pudo cargar la lista de ferias.';
      this.loading = false;
    }
    this.cdr.detectChanges();
  }

  async selectFeria(id: string): Promise<void> {
    this.feriaActivaId = id;
    this.loading = true;
    this.error = '';
    this.data = null;
    this.destroyCharts();
    this.cdr.detectChanges();
    try {
      this.data = await firstValueFrom(
        this.http.get<DashboardData>(`/api/estudios/${id}/dashboard`),
      );
    } catch {
      this.error = 'No se pudo cargar el dashboard de esta feria.';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
      setTimeout(() => this.createCharts(), 0);
    }
  }

  ngAfterViewInit(): void {
    if (!this.chartsCreated && this.data) {
      setTimeout(() => this.createCharts(), 0);
    }
  }

  ngOnDestroy(): void {
    this.destroyCharts();
  }

  private destroyCharts(): void {
    this.charts.forEach((c) => c.destroy());
    this.charts = [];
    this.chartsCreated = false;
  }

  private createCharts(): void {
    if (!this.data || this.chartsCreated) return;
    this.chartsCreated = true;
    this.destroyCharts();
    this.chartsCreated = true;

    // Pie chart — distribución por grupo
    const pieEl = this.pieCanvases.first?.nativeElement;
    if (pieEl && this.data.respuestas_por_grupo.length) {
      const grupos = this.data.respuestas_por_grupo;
      this.charts.push(new Chart(pieEl, {
        type: 'pie',
        data: {
          labels: grupos.map((g) => g.grupo),
          datasets: [{
            data: grupos.map((g) => g.conteo),
            backgroundColor: grupos.map((_, i) => this.GRUPO_COLORS[i % this.GRUPO_COLORS.length]),
            borderWidth: 2,
            borderColor: '#fff',
          }],
        },
        options: {
          responsive: true,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.parsed} respuestas` } },
          },
        },
      }));
    }

    // Bar + ojiva por pregunta
    const barCanvases = document.querySelectorAll<HTMLCanvasElement>('[data-pos][data-chart]');
    barCanvases.forEach((canvas) => {
      const pos = Number(canvas.getAttribute('data-pos'));
      const chartType = canvas.getAttribute('data-chart');
      const pregunta = this.data!.preguntas.find((p) => p.posicion === pos);
      if (!pregunta || !pregunta.frecuencias.length) return;

      const frecuencias = pregunta.frecuencias;
      const labels = frecuencias.map((f) => f.valor);

      if (chartType === 'bar') {
        const values = frecuencias.map((f) => f.fi);
        const maxVal = Math.max(...values);
        const bgColors = values.map((v) => v === maxVal ? '#8dcab8' : '#94a3b8');

        this.charts.push(new Chart(canvas, {
          type: 'bar',
          data: {
            labels,
            datasets: [{
              label: 'fi',
              data: values,
              backgroundColor: bgColors,
              borderRadius: 4,
            }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (ctx) => {
                    const idx = ctx.dataIndex;
                    const f = frecuencias[idx];
                    return ` fi=${f.fi}  hi=${f.hi.toFixed(4)}  (${f.pct.toFixed(2)}%)`;
                  },
                },
              },
            },
            scales: {
              x: { grid: { display: false }, ticks: { font: { size: 11 } } },
              y: {
                beginAtZero: true,
                ticks: { stepSize: 1, precision: 0, font: { size: 11 } },
                grid: { color: '#f1f5f9' },
                title: { display: true, text: 'fi', font: { size: 10 }, color: '#94a3b8' },
              },
            },
          },
        }));
      }

      if (chartType === 'ojiva' && pregunta.es_numerica) {
        const hiValues = frecuencias.map((f) => f.Hi);

        this.charts.push(new Chart(canvas, {
          type: 'line',
          data: {
            labels,
            datasets: [{
              label: 'Hi (acumulada relativa)',
              data: hiValues,
              borderColor: '#8dcab8',
              backgroundColor: 'rgba(141,202,184,0.08)',
              borderWidth: 2,
              pointRadius: 5,
              pointBackgroundColor: '#8dcab8',
              tension: 0,
              fill: true,
            }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (ctx) => {
                    const idx = ctx.dataIndex;
                    const f = frecuencias[idx];
                    return ` Fi=${f.Fi}  Hi=${f.Hi.toFixed(4)}`;
                  },
                },
              },
            },
            scales: {
              x: { grid: { display: false }, ticks: { font: { size: 11 } } },
              y: {
                beginAtZero: true,
                max: 1,
                ticks: { stepSize: 0.1, font: { size: 11 }, callback: (v) => Number(v).toFixed(1) },
                grid: { color: '#f1f5f9' },
                title: { display: true, text: 'Hi', font: { size: 10 }, color: '#94a3b8' },
              },
            },
          },
        }));
      }
    });
  }

  grupoColor(index: number): string {
    return this.GRUPO_COLORS[index % this.GRUPO_COLORS.length];
  }

  sesgLabel(sesgo: number | null): string {
    if (sesgo === null) return '';
    if (sesgo > 1) return 'Muy sesgado derecha';
    if (sesgo > 0.5) return 'Sesgado derecha';
    if (sesgo < -1) return 'Muy sesgado izquierda';
    if (sesgo < -0.5) return 'Sesgado izquierda';
    return 'Aproximadamente simétrico';
  }

  kurtLabel(kurt: number | null): string {
    if (kurt === null) return '';
    if (kurt > 0.5) return 'Leptokúrtica (cola pesada)';
    if (kurt < -0.5) return 'Platikúrtica (cola ligera)';
    return 'Mesokúrtica (normal)';
  }

  distLabel(p: DashboardPregunta): string {
    if (!p.frecuencias.length) return '';
    const peaks = this.countPeaks(p.frecuencias.map((f) => f.fi));
    if (peaks >= 2) return '▲▲ Distribución bimodal';
    if ((p.sesgo ?? 0) > 0.5) return '▶ Sesgada a la derecha';
    if ((p.sesgo ?? 0) < -0.5) return '◀ Sesgada a la izquierda';
    return '▲ Distribución unimodal (aproximadamente simétrica)';
  }

  distClass(p: DashboardPregunta): string {
    if (!p.frecuencias.length) return '';
    const peaks = this.countPeaks(p.frecuencias.map((f) => f.fi));
    if (peaks >= 2) return 'bimodal';
    if ((p.sesgo ?? 0) > 0.5) return 'sesgo-derecha';
    if ((p.sesgo ?? 0) < -0.5) return 'sesgo-izquierda';
    return 'unimodal';
  }

  private countPeaks(values: number[]): number {
    if (values.length < 3) return 1;
    let peaks = 0;
    for (let i = 1; i < values.length - 1; i++) {
      if (values[i] > values[i - 1] && values[i] > values[i + 1]) peaks++;
    }
    return peaks || 1;
  }
}
