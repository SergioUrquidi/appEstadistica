import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { SocketService } from '../core/socket.service';
import { StudyDetail, StudySurvey } from '../core/models';

@Component({
  selector: 'app-estudio-detail',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    @if (study) {
      <a class="back-link" routerLink="/estudios">← Todas las ferias</a>

      <header class="page-head">
        <div>
          <div class="head-badges">
            <span class="shift-badge" [class.shift-noche]="study.shift === 'noche'">
              {{ study.shift === 'mañana' ? '☀ Turno Mañana' : '☾ Turno Noche' }}
            </span>
            <span class="status-badge" [class.status-activo]="study.status === 'activo'">
              {{ statusLabel(study.status) }}
            </span>
          </div>
          <h1>{{ study.title }}</h1>
          @if (study.date) { <p class="muted">{{ study.date | date:'dd/MM/yyyy' }}</p> }
        </div>
        <div class="total-badge">
          <strong>{{ totalResponses }}</strong>
          <span>respuestas totales</span>
          <small class="live-dot">● en vivo</small>
        </div>
        <a class="btn-dashboard" [routerLink]="['/estudios', study.id, 'dashboard']">
          Ver dashboard →
        </a>
      </header>

      <div class="groups-grid">
        @for (survey of study.surveys; track survey.id) {
          <section class="group-card">
            <div class="group-icon">{{ survey.icono }}</div>
            <div class="group-info">
              <h2>{{ survey.etiqueta }}</h2>
              <div class="response-count">
                {{ responseCount(survey) }}
                @if (survey.target_count !== null) { / {{ survey.target_count }} }
              </div>
              <p class="count-label">
                @if (survey.target_count !== null) { respuestas de la cantidad objetivo }
                @else { respuestas recibidas }
              </p>
            </div>
            <div class="group-actions">
              <span class="survey-status" [class.active]="survey.status === 'active'">
                {{ surveyStatusLabel(survey.status) }}
              </span>
              <small class="survey-mode">{{ survey.mode_label || 'Modo pendiente' }}</small>
              <a class="btn-survey" [routerLink]="['/encuestas', survey.id]">
                Ver encuesta →
              </a>
            </div>
          </section>
        }
      </div>

      @if (study.respondentTargets.length) {
        <section class="panel target-section">
          <h2>Metas por tipo de encuestado</h2>
          <div class="target-list">
            @for (target of study.respondentTargets; track target.value) {
              <div class="target-item">
                <strong>{{ target.label | titlecase }}</strong>
                <span>{{ target.target_count }} personas</span>
              </div>
            }
          </div>
        </section>
      }

      <section class="panel progress-section">
        <h2>Progreso general</h2>
        <div class="bars">
          @for (survey of study.surveys; track survey.id) {
            <div class="bar-row">
              <span class="bar-label">{{ survey.etiqueta }}</span>
              <div class="bar-track">
                <div class="bar-fill" [style.width]="barWidth(survey) + '%'"></div>
              </div>
              <span class="bar-count">{{ countsMap[survey.group] ?? 0 }}</span>
            </div>
          }
        </div>
      </section>

    } @else if (error) {
      <p class="error">{{ error }}</p>
    } @else {
      <p class="muted">Cargando feria…</p>
    }
  `,
  styles: [`
    .back-link { display:inline-block; color:#8dcab8; font-size:.85rem; font-weight:600; text-decoration:none; margin-bottom:1.25rem; }
    .back-link:hover { text-decoration:underline; }

    .page-head { display:flex; align-items:flex-start; justify-content:space-between; gap:1.5rem; flex-wrap:wrap; margin-bottom:2rem; }
    .head-badges { display:flex; gap:.5rem; flex-wrap:wrap; margin-bottom:.6rem; }
    h1 { margin:0 0 .4rem; font-size:clamp(1.5rem,4vw,2rem); }
    .muted { color:#64748b; margin:0; font-size:.88rem; }

    .shift-badge, .status-badge {
      display:inline-block; padding:.25rem .65rem; border-radius:99px;
      font-size:.7rem; font-weight:700; letter-spacing:.04em;
    }
    .shift-badge { background:var(--color-action-soft); color:var(--color-action-text); }
    .shift-badge.shift-noche { background:#0d2b24; color:#8dcab8; }
    .status-badge { background:#f1f5f9; color:#475569; }
    .status-badge.status-activo { background:#dcfce7; color:#166534; }

    .btn-dashboard {
      display:inline-flex; align-items:center; gap:.4rem; padding:.65rem 1.1rem;
      background:var(--color-action); color:#333333; border-radius:10px; font-size:.85rem; font-weight:700;
      text-decoration:none; transition:background .15s; white-space:nowrap; align-self:flex-start;
    }
    .btn-dashboard:hover { background:var(--color-action-hover); }

    .total-badge {
      display:flex; flex-direction:column; align-items:center; justify-content:center;
      background:#0d2b24; color:#fff; border-radius:16px; padding:1rem 1.5rem; min-width:120px;
    }
    .total-badge strong { font-size:2.5rem; line-height:1; }
    .total-badge span { font-size:.75rem; color:#94a3b8; margin-top:.2rem; }
    .live-dot { color:#22c55e; font-size:.65rem; animation:pulse 2s infinite; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }

    .groups-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:1rem; margin-bottom:1.5rem; }

    .group-card {
      background:#fff; border:1px solid #e2e8f0; border-radius:14px; padding:1.4rem;
      display:flex; flex-direction:column; gap:.75rem;
      transition:box-shadow .15s;
    }
    .group-card:hover { box-shadow:0 4px 16px rgba(0,0,0,.08); }
    .group-icon { font-size:1.75rem; line-height:1; }
    .group-info h2 { margin:0 0 .4rem; font-size:1rem; color:#0d2b24; }
    .response-count { font-size:2.8rem; font-weight:800; color:#8dcab8; line-height:1; }
    .count-label { margin:0; color:#64748b; font-size:.78rem; }

    .group-actions { display:flex; align-items:center; justify-content:space-between; gap:.5rem; margin-top:auto; }
    .survey-status { font-size:.7rem; font-weight:700; color:#94a3b8; }
    .survey-status.active { color:#16a34a; }
    .survey-mode { color:#64748b; font-size:.7rem; }
    .btn-survey {
      font-size:.78rem; font-weight:700; color:var(--color-action); text-decoration:none;
      padding:.35rem .75rem; border:1px solid #a8d9c8; border-radius:8px;
      transition:background .15s;
    }
    .btn-survey:hover { background:var(--color-action-soft); }

    .panel { background:#fff; border:1px solid #e2e8f0; border-radius:14px; padding:1.5rem; }
    .target-section { margin-bottom:1.5rem; }
    .target-section h2 { margin:0 0 1rem; font-size:1rem; }
    .target-list { display:flex; flex-wrap:wrap; gap:.75rem; }
    .target-item { display:grid; gap:.2rem; min-width:140px; padding:.7rem .85rem; border:1px solid #e2e8f0; border-radius:9px; }
    .target-item strong { color:#334155; font-size:.82rem; }
    .target-item span { color:#64748b; font-size:.75rem; }
    .progress-section h2 { margin:0 0 1.2rem; font-size:1rem; }
    .bars { display:grid; gap:.85rem; }
    .bar-row { display:grid; grid-template-columns:110px 1fr 40px; align-items:center; gap:.75rem; }
    .bar-label { font-size:.82rem; font-weight:600; color:#334155; }
    .bar-track { height:10px; background:#f1f5f9; border-radius:99px; overflow:hidden; }
    .bar-fill { height:100%; background:var(--color-action); border-radius:99px; transition:width .4s ease; }
    .bar-count { font-size:.82rem; font-weight:700; color:#334155; text-align:right; }

    .error { color:#b42318; }
  `],
})
export class EstudioDetailComponent implements OnInit, OnDestroy {
  study: StudyDetail | null = null;
  error = '';
  countsMap: Partial<Record<string, number>> = {};
  totalResponses = 0;

  private disconnectSocket?: () => void;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly http: HttpClient,
    private readonly socket: SocketService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  async ngOnInit(): Promise<void> {
    const studyId = this.route.snapshot.paramMap.get('id') ?? '';
    try {
      this.study = await firstValueFrom(this.http.get<StudyDetail>(`/api/estudios/${studyId}`));
      this.countsMap = Object.fromEntries(
        (this.study.surveys as StudySurvey[]).map((s) => [s.group, s.response_count]),
      );
      this.totalResponses = this.study.totalResponses;
      this.disconnectSocket = this.socket.watchStudy(studyId, (data) => {
        this.countsMap = { ...this.countsMap, ...data.byGroup };
        this.totalResponses = data.total;
        this.cdr.markForCheck();
      });
    } catch {
      this.error = 'No se pudo cargar la feria.';
    }
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.disconnectSocket?.();
  }

  surveyStatusLabel(status: string): string {
    return status === 'active' ? 'Activa' : status === 'closed' ? 'Cerrada' : 'Borrador';
  }

  statusLabel(status: string): string {
    return status === 'activo' ? 'Activo' : status === 'cerrado' ? 'Cerrado' : 'Borrador';
  }

  responseCount(survey: StudySurvey): number {
    return this.countsMap[survey.group] ?? 0;
  }

  barWidth(survey: StudySurvey): number {
    const count = this.responseCount(survey);
    if (survey.target_count !== null) {
      if (survey.target_count === 0) return count > 0 ? 100 : 0;
      return Math.min(100, Math.round((count / survey.target_count) * 100));
    }
    const max = Math.max(...Object.values(this.countsMap).map((v) => v ?? 0), 1);
    return Math.round((count / max) * 100);
  }
}
