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
import { firstValueFrom } from 'rxjs';
import { DashboardService } from '../core/dashboard.service';
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
          <p class="eyebrow">Informe estadístico</p>
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

      <!-- Progreso muestral general -->
      <div class="muestra-progress-panel">
        <div class="mp-header">
          <span class="mp-label">Progreso muestral global</span>
          <span class="mp-meta">n = {{ data.total_respuestas }} / n<sub>mín</sub> = 384 &nbsp;·&nbsp; IC 95% ± 5%</span>
          <span class="mp-pct">{{ muestraPct(data.total_respuestas) | number:'1.1-1' }}%</span>
        </div>
        <div class="mp-track">
          <div class="mp-fill" [style.width.%]="muestraPct(data.total_respuestas)" [class.mp-ok]="data.total_respuestas >= 384"></div>
        </div>
        <p class="mp-hint">
          @if (data.total_respuestas >= 384) {
            ✓ Muestra suficiente para inferencia estadística al 95% con error ±5%
          } @else {
            Faltan {{ 384 - data.total_respuestas }} respuestas para alcanzar la muestra mínima recomendada
          }
        </p>
      </div>

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
            <span class="posicion-badge">V{{ p.posicion }}</span>
            <div>
              <h2 class="var-titulo">Variable {{ p.posicion }}</h2>
              <p class="var-desc">{{ p.pregunta_texto }}</p>
              <span class="tipo-badge">{{ p.tipo_label }}</span>
            </div>
          </div>

          <div class="var-muestra-row">
            <span class="muestra">n = {{ p.n_respuestas }}</span>
            <div class="vmp-wrap">
              <div class="vmp-track">
                <div class="vmp-fill" [style.width.%]="muestraPct(p.n_respuestas)" [class.vmp-ok]="p.n_respuestas >= 384"></div>
              </div>
              <span class="vmp-pct" [class.vmp-ok-txt]="p.n_respuestas >= 384">{{ muestraPct(p.n_respuestas) | number:'1.0-0' }}%</span>
            </div>
          </div>

          @if (p.es_numerica) {

            <div class="section-title">Tendencia Central</div>
            <div class="stats-grid">
              <div class="stat-tile highlight-blue">
                <span class="stat-label">Media aritmética (μ)</span>
                <strong>{{ p.media !== null ? (p.media | number:'1.4-4') : '—' }}</strong>
              </div>
              <div class="stat-tile highlight-blue">
                <span class="stat-label">Mediana</span>
                <strong>{{ p.mediana !== null ? (p.mediana | number:'1.4-4') : '—' }}</strong>
              </div>
              <div class="stat-tile highlight-blue">
                <span class="stat-label">Moda</span>
                <strong>{{ p.moda_valor ?? '—' }}</strong>
                @if (p.moda_frecuencia) {
                  <small>(f = {{ p.moda_frecuencia }})</small>
                }
              </div>
            </div>

            <div class="section-title">Dispersión</div>
            <div class="stats-grid">
              <div class="stat-tile">
                <span class="stat-label">Varianza muestral (s²)</span>
                <strong>{{ p.varianza !== null ? (p.varianza | number:'1.4-4') : '—' }}</strong>
              </div>
              <div class="stat-tile">
                <span class="stat-label">Desv. estándar (s)</span>
                <strong>{{ p.desv_estandar !== null ? (p.desv_estandar | number:'1.4-4') : '—' }}</strong>
              </div>
              <div class="stat-tile">
                <span class="stat-label">Desviación media</span>
                <strong>{{ p.desv_media !== null ? (p.desv_media | number:'1.4-4') : '—' }}</strong>
              </div>
              <div class="stat-tile">
                <span class="stat-label">Rango</span>
                <strong>{{ p.rango !== null ? (p.rango | number:'1.4-4') : '—' }}</strong>
              </div>
              <div class="stat-tile">
                <span class="stat-label">Mínimo</span>
                <strong>{{ p.minimo !== null ? (p.minimo | number:'1.4-4') : '—' }}</strong>
              </div>
              <div class="stat-tile">
                <span class="stat-label">Máximo</span>
                <strong>{{ p.maximo !== null ? (p.maximo | number:'1.4-4') : '—' }}</strong>
              </div>
              <div class="stat-tile">
                <span class="stat-label">CV (%)</span>
                <strong>{{ p.coef_variacion !== null ? (p.coef_variacion | number:'1.2-2') + '%' : '—' }}</strong>
              </div>
            </div>

            <div class="section-title">Cuartiles</div>
            <div class="stats-grid">
              <div class="stat-tile highlight-gold">
                <span class="stat-label">Q1 (Percentil 25)</span>
                <strong>{{ p.q1 !== null ? (p.q1 | number:'1.4-4') : '—' }}</strong>
              </div>
              <div class="stat-tile highlight-gold">
                <span class="stat-label">Q2 = Mediana</span>
                <strong>{{ p.mediana !== null ? (p.mediana | number:'1.4-4') : '—' }}</strong>
              </div>
              <div class="stat-tile highlight-gold">
                <span class="stat-label">Q3 (Percentil 75)</span>
                <strong>{{ p.q3 !== null ? (p.q3 | number:'1.4-4') : '—' }}</strong>
              </div>
              <div class="stat-tile highlight-gold">
                <span class="stat-label">IQR = Q3 − Q1</span>
                <strong>{{ p.iqr !== null ? (p.iqr | number:'1.4-4') : '—' }}</strong>
              </div>
            </div>

            <div class="section-title">Forma de la Distribución</div>
            <div class="stats-grid">
              <div class="stat-tile" [class.sesgo-pos]="(p.sesgo ?? 0) > 0.5" [class.sesgo-neg]="(p.sesgo ?? 0) < -0.5">
                <span class="stat-label">Asimetría / Sesgo (g₁)</span>
                <strong>{{ p.sesgo !== null ? (p.sesgo | number:'1.4-4') : '—' }}</strong>
                <small>{{ sesgLabel(p.sesgo) }}</small>
              </div>
              <div class="stat-tile" [class.kurt-lepto]="(p.curtosis ?? 0) > 0.5" [class.kurt-plati]="(p.curtosis ?? 0) < -0.5">
                <span class="stat-label">Curtosis exceso (γ₂)</span>
                <strong>{{ p.curtosis !== null ? (p.curtosis | number:'1.4-4') : '—' }}</strong>
                <small>{{ kurtLabel(p.curtosis) }}</small>
              </div>
            </div>

            @if (p.media !== null) {
              <div class="dist-label" [class]="distClass(p)">{{ distLabel(p) }}</div>
            }

            <div class="section-title">Intervalo de Confianza 95%</div>
            <div class="stats-grid">
              <div class="stat-tile highlight-green">
                <span class="stat-label">Error estándar (s/√n)</span>
                <strong>{{ p.error_estandar !== null ? (p.error_estandar | number:'1.4-4') : '—' }}</strong>
              </div>
              <div class="stat-tile highlight-green">
                <span class="stat-label">IC 95% — Límite inferior</span>
                <strong>{{ p.ic_inf_95 !== null ? (p.ic_inf_95 | number:'1.4-4') : '—' }}</strong>
              </div>
              <div class="stat-tile highlight-green">
                <span class="stat-label">IC 95% — Límite superior</span>
                <strong>{{ p.ic_sup_95 !== null ? (p.ic_sup_95 | number:'1.4-4') : '—' }}</strong>
              </div>
            </div>
            @if (p.media !== null) {
              <div class="ic-bar">
                <span>IC 95%: [ {{ p.ic_inf_95 | number:'1.4-4' }} , {{ p.ic_sup_95 | number:'1.4-4' }} ]</span>
                <small>x̄ = {{ p.media | number:'1.4-4' }} ± 1.96 × (s/√n) = ± {{ p.error_estandar | number:'1.4-4' }}</small>
              </div>
            }
          }

          @if (!p.es_numerica) {
            <div class="section-title">Tendencia Central</div>
            <div class="stats-grid">
              <div class="stat-tile highlight-blue">
                <span class="stat-label">Moda</span>
                <strong>{{ p.moda_valor ?? '—' }}</strong>
                @if (p.moda_frecuencia) {
                  <small>(f = {{ p.moda_frecuencia }})</small>
                }
              </div>
            </div>
          }

          <div class="section-title">Distribución de Frecuencias</div>
          @if (!p.frecuencias.length) {
            <p class="sin-datos">Sin respuestas aún</p>
          }
          @if (p.frecuencias.length) {
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

            <!-- Histograma 3D — cilindros animados -->
            <div class="chart-title">Histograma de frecuencias absolutas (fi)</div>
            <div class="chart3d-wrap">
              <div class="chart3d-inner">
                @for (f of p.frecuencias; track f.valor) {
                  <div class="cyl-col" [title]="f.valor + ': fi=' + f.fi + '  hi=' + (f.hi | number:'1.4-4') + '  (' + (f.pct | number:'1.2-2') + '%)'">
                    <div class="cyl-container">
                      <div class="cyl-bar"
                           [class.cyl-max]="f.fi === maxFi(p.frecuencias)"
                           [style.height.%]="cylHeight(f.fi, p.frecuencias)">
                        <div class="cyl-liquid"></div>
                        <div class="cyl-shine"></div>
                        <div class="cyl-top"></div>
                        <div class="cyl-top-shine"></div>
                      </div>
                    </div>
                    <div class="cyl-label">{{ f.valor }}</div>
                    <div class="cyl-val">{{ f.fi }}</div>
                  </div>
                }
              </div>
              <!-- Eje Y labels -->
              <div class="chart3d-yaxis">
                <span>{{ maxFi(p.frecuencias) }}</span>
                <span>{{ (maxFi(p.frecuencias) / 2) | number:'1.0-0' }}</span>
                <span>0</span>
              </div>
            </div>

            <!-- Ojiva 3D — línea SVG animada -->
            @if (p.es_numerica) {
              <div class="chart-title">Ojiva — Frecuencias acumuladas relativas (Hi)</div>
              <div class="ojiva-wrap">
                <svg class="ojiva-svg" viewBox="0 0 400 180" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="ojivaGrad{{ p.posicion }}" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stop-color="#8dcab8" stop-opacity="0.35"/>
                      <stop offset="100%" stop-color="#8dcab8" stop-opacity="0.03"/>
                    </linearGradient>
                    <filter id="ojivaGlow{{ p.posicion }}">
                      <feGaussianBlur stdDeviation="2" result="blur"/>
                      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                    </filter>
                  </defs>
                  <!-- Área rellena -->
                  <path class="ojiva-area"
                        [attr.fill]="'url(#ojivaGrad' + p.posicion + ')'"
                        [attr.d]="ojivaAreaPath(p.frecuencias)"/>
                  <!-- Línea principal -->
                  <path class="ojiva-line"
                        [attr.filter]="'url(#ojivaGlow' + p.posicion + ')'"
                        [attr.d]="ojivaLinePath(p.frecuencias)"/>
                  <!-- Puntos -->
                  @for (pt of ojivaPoints(p.frecuencias); track $index) {
                    <circle class="ojiva-dot"
                            [attr.cx]="pt.x" [attr.cy]="pt.y" r="4.5"
                            [attr.style]="'animation-delay:' + ($index * 80) + 'ms'">
                      <title>{{ p.frecuencias[$index].valor }}: Hi={{ p.frecuencias[$index].Hi | number:'1.4-4' }}</title>
                    </circle>
                  }
                  <!-- Grid lines -->
                  <line class="ojiva-grid" x1="0" y1="18" x2="400" y2="18"/>
                  <line class="ojiva-grid" x1="0" y1="90" x2="400" y2="90"/>
                  <line class="ojiva-grid" x1="0" y1="162" x2="400" y2="162"/>
                  <!-- Y labels -->
                  <text class="ojiva-ylabel" x="2" y="21">1.0</text>
                  <text class="ojiva-ylabel" x="2" y="93">0.5</text>
                  <text class="ojiva-ylabel" x="2" y="165">0.0</text>
                </svg>
                <!-- X labels -->
                <div class="ojiva-xlabels">
                  @for (f of p.frecuencias; track f.valor) {
                    <span>{{ f.valor }}</span>
                  }
                </div>
              </div>
            }
          }

        </section>
      }
    }
  `,
  styles: [`
    :host{display:block}
    .loading-state,.error-state{text-align:center;padding:4rem 1rem;color:#64748b}
    .ferias-tabs{display:flex;gap:.4rem;overflow-x:auto;padding:.75rem 0 .9rem;margin-bottom:1.25rem;border-bottom:2px solid #e2e8f0;scrollbar-width:none}
    .ferias-tabs::-webkit-scrollbar{display:none}
    .tab-btn{display:flex;flex-direction:column;align-items:flex-start;gap:.1rem;padding:.45rem .9rem;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;cursor:pointer;white-space:nowrap;transition:background .15s,border-color .15s}
    .tab-btn:hover{background:var(--color-action-soft);border-color:var(--color-action)}
    .tab-btn.tab-active{background:#0d2b24;border-color:#0d2b24}
    .tab-titulo{font-size:.8rem;font-weight:700;color:#334155}
    .tab-btn.tab-active .tab-titulo{color:#fff}
    .tab-meta{font-size:.65rem;color:#94a3b8;text-transform:capitalize}
    .tab-btn.tab-active .tab-meta{color:#94a3b8}
    .dash-head{display:flex;align-items:flex-start;justify-content:space-between;gap:1.5rem;flex-wrap:wrap;margin-bottom:2rem}
    .eyebrow{color:#8dcab8;font-size:.72rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;margin:0 0 .2rem}
    h1{margin:.25rem 0 .5rem;font-size:clamp(1.4rem,4vw,2rem)}
    .head-meta{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;margin-top:.4rem}
    .meta-date{color:#64748b;font-size:.82rem}
    .shift-badge{display:inline-block;padding:.25rem .65rem;border-radius:99px;font-size:.7rem;font-weight:700;background:var(--color-action-soft);color:var(--color-action-text)}
    .shift-badge.shift-noche{background:#0d2b24;color:#8dcab8}
    .kpi-row{display:flex;gap:1rem;flex-wrap:wrap}
    .kpi{display:flex;flex-direction:column;align-items:center;background:#0d2b24;color:#fff;border-radius:14px;padding:.9rem 1.4rem;min-width:100px}
    .kpi strong{font-size:2rem;line-height:1}
    .kpi span{font-size:.7rem;color:#94a3b8;margin-top:.2rem}
    .panel{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:1.4rem;margin-bottom:1.25rem}
    .chart-panel h2,.pregunta-panel h2{margin:0 0 1rem;font-size:1rem;color:#0d2b24}
    .pie-wrap{max-width:280px;margin:0 auto 1rem}
    .grupo-legend{display:flex;flex-wrap:wrap;gap:.5rem;justify-content:center}
    .legend-item{display:flex;align-items:center;gap:.3rem;font-size:.8rem;color:#475569}
    .legend-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
    .pregunta-header{display:flex;gap:.85rem;align-items:flex-start;margin-bottom:.5rem}
    .posicion-badge{display:inline-flex;align-items:center;justify-content:center;min-width:36px;height:36px;padding:0 .5rem;background:#8dcab8;color:#0d2b24;border-radius:10px;font-size:.85rem;font-weight:900;flex-shrink:0}
    .var-titulo{margin:0 0 .15rem;font-size:.95rem;color:#0d2b24;font-weight:800}
    .var-desc{margin:0 0 .3rem;font-size:.78rem;color:#64748b;line-height:1.4;max-width:600px}
    .tipo-badge{display:inline-block;background:#f1f5f9;color:#475569;font-size:.7rem;padding:.2rem .55rem;border-radius:99px;font-weight:600}
    .muestra{color:#94a3b8;font-size:.75rem;margin:.2rem 0 .9rem;font-weight:600}
    .sin-datos{color:#cbd5e1;font-size:.82rem;font-style:italic;margin:.3rem 0 .8rem;padding:.6rem .8rem;background:#f8fafc;border-radius:8px;border:1px dashed #e2e8f0}
    .section-title{font-size:.72rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#94a3b8;margin:1.1rem 0 .55rem;padding-bottom:.25rem;border-bottom:1px solid #f1f5f9}
    .stats-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:.6rem;margin-bottom:.5rem}
    .stat-tile{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:.7rem .85rem;display:flex;flex-direction:column;gap:.15rem}
    .stat-tile.sesgo-pos{border-color:#fbbf24;background:#fffbeb}
    .stat-tile.sesgo-neg{border-color:var(--color-accent);background:#fdf8ed}
    .stat-tile.kurt-lepto{border-color:#34d399;background:#ecfdf5}
    .stat-tile.kurt-plati{border-color:#f87171;background:#fff1f2}
    .stat-tile.highlight-blue{border-color:var(--color-action);background:var(--color-action-soft)}
    .stat-tile.highlight-gold{border-color:var(--color-accent);background:#fdf8ed}
    .stat-tile.highlight-green{border-color:#86efac;background:#f0fdf4}
    .stat-label{font-size:.65rem;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
    .stat-tile strong{font-size:1.05rem;color:#0d2b24;font-weight:700}
    .stat-tile small{font-size:.67rem;color:#94a3b8}
    .dist-label{display:inline-block;padding:.35rem .85rem;border-radius:99px;font-size:.75rem;font-weight:700;margin:.4rem 0 .8rem;background:#f1f5f9;color:#475569}
    .dist-label.unimodal{background:#dcfce7;color:#166534}
    .dist-label.bimodal{background:var(--color-action-soft);color:var(--color-action-text)}
    .dist-label.sesgo-derecha{background:#fef3c7;color:#92400e}
    .dist-label.sesgo-izquierda{background:#fdf8ed;color:#92670a}
    .ic-bar{background:#f0fdf4;border:1px solid #86efac;border-radius:9px;padding:.6rem 1rem;font-size:.82rem;font-weight:600;color:#166534;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:.4rem;margin:.3rem 0 .5rem}
    .ic-bar small{color:#4ade80;font-weight:400;font-size:.75rem}
    .table-wrap{overflow-x:auto;margin-bottom:.75rem}
    .freq-table{width:100%;border-collapse:collapse;font-size:.82rem}
    .freq-table th{background:#0d2b24;color:#8abfb5;font-size:.67rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:.5rem .75rem;text-align:right;white-space:nowrap}
    .freq-table th:first-child{text-align:left}
    .freq-table td{padding:.45rem .75rem;border-bottom:1px solid #f1f5f9;color:#334155;text-align:right}
    .freq-table td:first-child{text-align:left;font-weight:600}
    .freq-table tbody tr:hover td{background:#f8fafc}
    .freq-table .totals-row td{background:#f1f5f9;color:#0d2b24;border-top:2px solid #e2e8f0}
    .chart-title{font-size:.72rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;margin:.9rem 0 .4rem}
    .chart3d-wrap{position:relative;padding-left:2.5rem;margin-bottom:1.4rem}
    .chart3d-inner{display:flex;align-items:flex-end;gap:4px;height:220px}
    .cyl-col{display:flex;flex-direction:column;align-items:center;flex:1;min-width:0;height:100%;justify-content:flex-end}
    .cyl-container{flex:1;width:100%;display:flex;align-items:flex-end;justify-content:center}
    .cyl-bar{position:relative;width:min(52px,calc(100% - 4px));border-radius:4px 4px 0 0;overflow:visible;min-height:6px;background:linear-gradient(135deg,#4aaaa0,#2d7d6a 60%,#1a5248)}
    .cyl-bar.cyl-max{background:linear-gradient(135deg,#8dcab8,#2d7d6a 50%,#0d2b24)}
    .cyl-liquid{position:absolute;inset:0;border-radius:inherit;overflow:hidden}
    .cyl-liquid::before,.cyl-liquid::after{content:'';position:absolute;left:-20%;width:140%;animation:liq-wave 3s ease-in-out infinite}
    .cyl-liquid::before{bottom:-60%;height:120%;background:radial-gradient(ellipse 60% 30% at 50% 100%,rgba(141,202,184,.55),transparent 70%)}
    .cyl-liquid::after{bottom:-50%;height:100%;background:radial-gradient(ellipse 50% 25% at 50% 100%,rgba(255,255,255,.18),transparent 65%);animation-delay:.9s}
    @keyframes liq-wave{0%,100%{transform:translate(0)}33%{transform:translate(-8px,-3px)}66%{transform:translate(8px,-5px)}}
    .cyl-shine{position:absolute;top:0;left:12%;width:22%;height:100%;background:linear-gradient(to right,rgba(255,255,255,.22),rgba(255,255,255,.04));pointer-events:none}
    .cyl-top{position:absolute;top:-7px;left:0;right:0;height:14px;background:radial-gradient(ellipse 100% 55% at 50% 50%,#8dcab8,#2d7d6a 70%,#1a5248);border-radius:50%;z-index:2}
    .cyl-bar.cyl-max .cyl-top{background:radial-gradient(ellipse 100% 55% at 50% 50%,#aeddd1,#4db8a8 60%,#2d7d6a)}
    .cyl-top-shine{position:absolute;top:-5px;left:18%;width:30%;height:8px;background:rgba(255,255,255,.45);border-radius:50%;z-index:3}
    .cyl-label{font-size:.62rem;color:#64748b;margin-top:.3rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;text-align:center}
    .cyl-val{font-size:.7rem;font-weight:700;color:#0d2b24}
    .chart3d-yaxis{position:absolute;left:0;top:0;bottom:1.6rem;width:2.3rem;display:flex;flex-direction:column;justify-content:space-between;align-items:flex-end;padding-right:.3rem}
    .chart3d-yaxis span,.ojiva-ylabel{font-size:.62rem;color:#94a3b8}
    .ojiva-wrap{margin-bottom:1.4rem}
    .ojiva-svg{width:100%;height:180px;overflow:visible}
    .ojiva-line{fill:none;stroke:#8dcab8;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}
    .ojiva-dot{fill:#8dcab8;stroke:#fff;stroke-width:2;animation:dot-pop .4s cubic-bezier(.34,1.56,.64,1) both}
    @keyframes dot-pop{from{r:0;opacity:0}to{r:4.5;opacity:1}}
    .ojiva-grid{stroke:#f1f5f9;stroke-width:1}
    .ojiva-ylabel{font-size:10px;fill:#94a3b8;dominant-baseline:middle}
    .ojiva-xlabels{display:flex;padding:0 0 0 24px;margin-top:.2rem}
    .ojiva-xlabels span{font-size:.6rem;color:#64748b;text-align:center;flex:1}
    /* Progreso muestral general */
    .muestra-progress-panel{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:1rem 1.25rem;margin-bottom:1.25rem}
    .mp-header{display:flex;align-items:baseline;gap:.6rem;flex-wrap:wrap;margin-bottom:.5rem}
    .mp-label{font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#475569}
    .mp-meta{font-size:.75rem;color:#94a3b8;flex:1}
    .mp-pct{font-size:1.1rem;font-weight:800;color:#0d2b24;margin-left:auto}
    .mp-track{height:10px;background:#e2e8f0;border-radius:99px;overflow:hidden}
    .mp-fill{height:100%;background:linear-gradient(90deg,#4aaaa0,#2d7d6a);border-radius:99px;transition:width .6s cubic-bezier(.34,1.1,.64,1)}
    .mp-fill.mp-ok{background:linear-gradient(90deg,#4ade80,#16a34a)}
    .mp-hint{font-size:.75rem;color:#64748b;margin:.4rem 0 0;font-weight:500}
    /* Progreso muestral por variable */
    .var-muestra-row{display:flex;align-items:center;gap:.75rem;margin:.2rem 0 .9rem;flex-wrap:wrap}
    .vmp-wrap{display:flex;align-items:center;gap:.45rem;flex:1;min-width:140px}
    .vmp-track{flex:1;height:7px;background:#e2e8f0;border-radius:99px;overflow:hidden}
    .vmp-fill{height:100%;background:linear-gradient(90deg,#4aaaa0,#2d7d6a);border-radius:99px;transition:width .5s cubic-bezier(.34,1.1,.64,1)}
    .vmp-fill.vmp-ok{background:linear-gradient(90deg,#4ade80,#16a34a)}
    .vmp-pct{font-size:.7rem;font-weight:700;color:#94a3b8;white-space:nowrap}
    .vmp-pct.vmp-ok-txt{color:#16a34a}
    @media(max-width:640px){.dash-head{flex-direction:column}.stats-grid{grid-template-columns:repeat(2,1fr)}.chart3d-inner{height:170px}}
  `],
})
export class FeriaDashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  private dashboardService = inject(DashboardService);
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
      this.ferias = await firstValueFrom(this.dashboardService.getFerias());
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
      this.data = await firstValueFrom(this.dashboardService.getDashboard(id));
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

    // Barras e ojiva ahora son SVG/CSS puro — sin canvas, sin Chart.js
  }

  readonly N_MIN = 384;

  muestraPct(n: number): number {
    return Math.min((n / this.N_MIN) * 100, 100);
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

  // ── Cilindros 3D ──
  maxFi(frecuencias: FreqItem[]): number {
    return Math.max(...frecuencias.map((f) => f.fi), 1);
  }

  cylHeight(fi: number, frecuencias: FreqItem[]): number {
    const max = this.maxFi(frecuencias);
    return Math.max(4, Math.round((fi / max) * 92));
  }

  // ── Ojiva SVG ──
  private readonly OJIVA_PAD = { left: 24, right: 8, top: 18, bottom: 18 };

  ojivaPoints(frecuencias: FreqItem[]): { x: number; y: number }[] {
    const { left, right, top, bottom } = this.OJIVA_PAD;
    const W = 400 - left - right;
    const H = 180 - top - bottom;
    const n = frecuencias.length;
    if (!n) return [];
    return frecuencias.map((f, i) => ({
      x: left + (n === 1 ? W / 2 : (i / (n - 1)) * W),
      y: top + H - f.Hi * H,
    }));
  }

  ojivaLinePath(frecuencias: FreqItem[]): string {
    const pts = this.ojivaPoints(frecuencias);
    if (!pts.length) return '';
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  }

  ojivaAreaPath(frecuencias: FreqItem[]): string {
    const pts = this.ojivaPoints(frecuencias);
    if (!pts.length) return '';
    const { left, right, bottom } = this.OJIVA_PAD;
    const baseY = 180 - bottom;
    const lastX = pts[pts.length - 1].x;
    const firstX = pts[0].x;
    const linePart = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    return `${linePart} L${lastX.toFixed(1)},${baseY} L${firstX.toFixed(1)},${baseY} Z`;
  }
}
