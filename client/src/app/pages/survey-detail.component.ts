import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { Question, SurveyDetail, SurveyReport } from '../core/models';
import { SocketService } from '../core/socket.service';

interface Invitation {
  group: string;
  url: string;
  qrCode: string;
}

@Component({
  selector: 'app-survey-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    @if (survey) {
      <a class="back-link" routerLink="/encuestas">← Todas las encuestas</a>
      <header class="page-head">
        <div><p class="eyebrow">{{ statusLabel(survey.status) }}</p><h1>{{ survey.title }}</h1><p class="muted">{{ survey.description || 'Estudio cuantitativo' }}</p></div>
        @if (survey.status === 'draft') {
          <button class="primary" (click)="activate()" [disabled]="busy || !survey.questions.length">Activar encuesta</button>
        }
      </header>

      @if (survey.status === 'draft') {
        <section class="panel">
          <div class="section-title"><div><h2>Preguntas</h2><p class="muted">Por ahora se admiten preguntas con respuesta numérica.</p></div></div>
          <ol class="question-list">
            @for (question of survey.questions; track question.id) {
              <li><span class="number">{{ question.position }}</span><div><strong>{{ question.prompt }}</strong><small>{{ rangeLabel(question) }}</small></div></li>
            }
          </ol>
          <form class="question-form" (ngSubmit)="addQuestion()">
            <label class="wide">Pregunta
              <input name="prompt" [(ngModel)]="prompt" maxlength="1000" placeholder="Ej. ¿Cuántas horas estudió esta semana?" required>
            </label>
            <label>Valor mínimo (opcional)
              <input name="minValue" type="number" step="any" [(ngModel)]="minValue">
            </label>
            <label>Valor máximo (opcional)
              <input name="maxValue" type="number" step="any" [(ngModel)]="maxValue">
            </label>
            @if (error) { <p class="error wide" role="alert">{{ error }}</p> }
            <button class="secondary wide" [disabled]="busy">Agregar pregunta</button>
          </form>
        </section>
      } @else {
        <div class="dashboard-grid">
          <section class="panel metrics">
            <div class="metric"><span>Respuestas</span><strong>{{ report?.summary?.response_count ?? 0 }}</strong><small>Actualización en tiempo real</small></div>
            <div class="metric"><span>Participantes</span><strong>{{ report?.summary?.participants_count ?? 0 }}</strong><small>Respuestas registradas</small></div>
            <div class="metric"><span>Jurados</span><strong>{{ report?.summary?.judges_count ?? 0 }}</strong><small>Respuestas registradas</small></div>
            <div class="metric"><span>Expositores</span><strong>{{ report?.summary?.exhibitors_count ?? 0 }}</strong><small>Respuestas registradas</small></div>
          </section>

          <section class="panel">
            <h2>Invitaciones QR</h2><p class="muted">Cada código admite una sola respuesta y se entrega sin datos personales del encuestado.</p>
            <form class="invite-form" (ngSubmit)="generateInvitations()">
              <label>Grupo
                <select name="group" [(ngModel)]="group">
                  <option value="participants">Participantes</option><option value="judges">Jurados</option><option value="exhibitors">Expositores</option>
                </select>
              </label>
              <label>Cantidad
                <input name="count" type="number" min="1" max="100" [(ngModel)]="inviteCount" required>
              </label>
              <button class="secondary" [disabled]="busy">Generar QR</button>
            </form>
            @if (error) { <p class="error" role="alert">{{ error }}</p> }
            @if (invitations.length) {
              <div class="invitation-list">
                @for (invitation of invitations; track invitation.url) {
                  <article class="invitation">
                    <img [src]="invitation.qrCode" alt="Código QR de acceso único">
                    <div><strong>{{ groupLabel(invitation.group) }}</strong><a [href]="invitation.url" target="_blank" rel="noopener">{{ invitation.url }}</a><small>Guarda o imprime este código; no se volverá a mostrar.</small></div>
                  </article>
                }
              </div>
            }
          </section>
        </div>

        <section class="panel report-panel">
          <div class="section-title"><div><h2>Resultados estadísticos</h2><p class="muted">Cálculos sobre las respuestas recibidas, sin datos de muestra.</p></div>
            <button class="secondary" (click)="downloadPdf()" [disabled]="busy">Descargar PDF</button>
          </div>
          @if (!report?.questions?.length) {
            <p class="empty-note">Aún no hay preguntas o respuestas para mostrar.</p>
          }
          @for (question of report?.questions ?? []; track question.questionId) {
            <article class="result">
              <h3>{{ question.prompt }}</h3>
              <div class="stat-grid">
                <div><small>Universo</small><strong>{{ question.universe }}</strong></div>
                <div><small>Media</small><strong>{{ format(question.mean) }}</strong></div>
                <div><small>Mediana</small><strong>{{ format(question.median) }}</strong></div>
                <div><small>Moda</small><strong>{{ format(question.mode) }}</strong></div>
                <div><small>Rango</small><strong>{{ format(question.value_range) }}</strong></div>
                <div><small>Mínimo</small><strong>{{ format(question.minimum) }}</strong></div>
                <div><small>Máximo</small><strong>{{ format(question.maximum) }}</strong></div>
                <div><small>CV</small><strong>{{ format(question.coefficient_of_variation, '%') }}</strong></div>
                <div><small>Varianza</small><strong>{{ format(question.variance) }}</strong></div>
                <div><small>Desv. estándar</small><strong>{{ format(question.standard_deviation) }}</strong></div>
              </div>
              <h4>Tabla de frecuencias</h4>
              @if (question.frequencies.length) {
                <div class="frequency-list">
                  @for (row of question.frequencies; track row.value) {
                    <div class="frequency-row"><span>{{ row.value }}</span><div class="bar-track"><i [style.width.%]="frequencyWidth(row.frequency, question)"></i></div><strong>{{ row.frequency }}</strong></div>
                  }
                </div>
              } @else { <p class="muted">Sin respuestas todavía.</p> }
            </article>
          }
        </section>

        <section class="panel analysis-panel">
          <div class="section-title"><div><h2>Análisis final — borrador</h2><p class="muted">Edita y guarda tus conclusiones. El contenido se incluye en el PDF.</p></div>
            <span class="version">Versión {{ draftVersion }}</span>
          </div>
          <textarea [(ngModel)]="analysis" rows="8" maxlength="50000" placeholder="Redacta aquí la interpretación de los resultados, conclusiones y recomendaciones…"></textarea>
          <div class="save-row"><span class="muted">{{ savedAt ? 'Guardado: ' + (savedAt | date:'short') : 'Cambios sin guardar' }}</span><button class="primary" (click)="saveAnalysis()" [disabled]="busy">Guardar borrador</button></div>
        </section>
      }
    } @else if (error) { <p class="error" role="alert">{{ error }}</p> } @else { <p>Cargando encuesta…</p> }
  `,
  styles: [`
    .back-link { color:#185adb; text-decoration:none; font-weight:700; font-size:.88rem; }
    .page-head,.section-title,.save-row { display:flex; align-items:center; justify-content:space-between; gap:1rem; }
    .page-head { margin:1.2rem 0 1.5rem; }
    h1 { margin:.25rem 0; font-size:2rem; }
    h2 { margin:.2rem 0 .4rem; font-size:1.2rem; }
    h3 { margin:.2rem 0 1rem; font-size:1.05rem; }
    h4 { margin:1.2rem 0 .65rem; }
    .eyebrow { color:#185adb; font-size:.75rem; font-weight:800; letter-spacing:.12em; text-transform:uppercase; }
    .muted,small { color:#64748b; }
    .muted { margin:.35rem 0; }
    .panel { margin:1rem 0; padding:1.25rem; border:1px solid #e2e8f0; border-radius:14px; background:white; }
    .primary,.secondary { border:0; border-radius:8px; padding:.75rem 1rem; font:inherit; font-weight:700; cursor:pointer; }
    .primary { color:white; background:#185adb; }
    .secondary { color:#194185; background:#e9f0ff; }
    button:disabled { opacity:.55; cursor:wait; }
    .question-list { display:grid; gap:.7rem; padding:0; list-style:none; }
    .question-list li { display:flex; align-items:start; gap:.75rem; padding:.75rem; border:1px solid #edf0f5; border-radius:10px; }
    .question-list small { display:block; margin-top:.25rem; }
    .number { display:grid; place-items:center; min-width:1.6rem; height:1.6rem; border-radius:50%; color:#185adb; background:#e9f0ff; font-weight:800; }
    .question-form,.invite-form { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:.8rem; margin-top:1rem; }
    label { display:grid; gap:.4rem; color:#334155; font-size:.86rem; font-weight:700; }
    input,select,textarea { width:100%; padding:.7rem; border:1px solid #cbd5e1; border-radius:8px; font:inherit; }
    .wide { grid-column:1/-1; }
    .dashboard-grid { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:1rem; }
    .metrics { display:grid; grid-template-columns:repeat(2,1fr); gap:1rem; align-content:center; }
    .metric { padding:.85rem; border-radius:10px; background:#f8fafc; }
    .metric span,.metric small { display:block; color:#64748b; font-size:.78rem; }
    .metric strong { display:block; margin:.2rem 0; font-size:1.8rem; }
    .invite-form { grid-template-columns:1fr 100px auto; align-items:end; }
    .invitation-list { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:.8rem; margin-top:1rem; }
    .invitation { display:flex; align-items:center; gap:.8rem; min-width:0; padding:.75rem; border:1px solid #e2e8f0; border-radius:10px; }
    .invitation img { width:92px; height:92px; }
    .invitation div { display:grid; min-width:0; gap:.35rem; }
    .invitation a { overflow-wrap:anywhere; color:#185adb; font-size:.78rem; }
    .invitation small { font-size:.72rem; }
    .report-panel { margin-top:1rem; }
    .result { margin-top:1.2rem; padding:1rem 0; border-top:1px solid #e2e8f0; }
    .stat-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(105px,1fr)); gap:.6rem; }
    .stat-grid div { padding:.65rem; border-radius:8px; background:#f8fafc; }
    .stat-grid small,.stat-grid strong { display:block; }
    .stat-grid strong { margin-top:.3rem; }
    .frequency-list { display:grid; gap:.45rem; max-width:650px; }
    .frequency-row { display:grid; grid-template-columns:55px 1fr 35px; align-items:center; gap:.6rem; font-size:.83rem; }
    .bar-track { height:10px; overflow:hidden; border-radius:99px; background:#eef2f7; }
    .bar-track i { display:block; height:100%; border-radius:99px; background:#3876e8; }
    .analysis-panel textarea { margin:.6rem 0; resize:vertical; }
    .save-row { justify-content:end; }
    .save-row span { margin-right:auto; font-size:.8rem; }
    .version { color:#64748b; font-size:.8rem; }
    .error { color:#b42318; }
    .empty-note { padding:1rem; color:#64748b; background:#f8fafc; border-radius:9px; }
    @media(max-width:760px) { .dashboard-grid { grid-template-columns:1fr; } }
    @media(max-width:560px) { .question-form,.invite-form { grid-template-columns:1fr; } .page-head { align-items:start; flex-direction:column; } .page-head button { width:100%; } .save-row { align-items:end; flex-wrap:wrap; } }
  `],
})
export class SurveyDetailComponent implements OnInit, OnDestroy {
  survey: SurveyDetail | null = null;
  report: SurveyReport | null = null;
  prompt = '';
  minValue: number | null = null;
  maxValue: number | null = null;
  group = 'participants';
  inviteCount = 1;
  invitations: Invitation[] = [];
  analysis = '';
  draftVersion = 0;
  savedAt: string | null = null;
  error = '';
  busy = false;
  private surveyId = '';
  private stopWatching: (() => void) | null = null;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly http: HttpClient,
    private readonly sockets: SocketService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  async ngOnInit(): Promise<void> {
    this.surveyId = this.route.snapshot.paramMap.get('id') ?? '';
    try {
      this.survey = await firstValueFrom(this.http.get<SurveyDetail>(`/api/surveys/${this.surveyId}`));
      if (this.survey.status === 'active') {
        await Promise.all([this.loadReport(), this.loadAnalysis()]);
        this.stopWatching = this.sockets.watchSurvey(this.surveyId, () => void this.loadReport());
      }
    } catch {
      this.error = 'No se pudo cargar la encuesta o no tienes permiso para verla.';
    } finally {
      this.cdr.markForCheck();
    }
  }

  ngOnDestroy(): void {
    this.stopWatching?.();
  }

  async addQuestion(): Promise<void> {
    if (!this.survey || !this.prompt.trim()) return;
    this.busy = true;
    this.error = '';
    try {
      const question = await firstValueFrom(this.http.post<Question>(
        `/api/surveys/${this.surveyId}/questions`,
        { prompt: this.prompt.trim(), minValue: this.minValue, maxValue: this.maxValue },
      ));
      this.survey.questions = [...this.survey.questions, question];
      this.prompt = '';
      this.minValue = null;
      this.maxValue = null;
    } catch {
      this.error = 'No se pudo agregar la pregunta. Comprueba los límites numéricos.';
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }

  async activate(): Promise<void> {
    this.busy = true;
    this.error = '';
    try {
      await firstValueFrom(this.http.post(`/api/surveys/${this.surveyId}/activate`, {}));
      if (this.survey) this.survey.status = 'active';
      await Promise.all([this.loadReport(), this.loadAnalysis()]);
      this.stopWatching = this.sockets.watchSurvey(this.surveyId, () => void this.loadReport());
    } catch {
      this.error = 'No se pudo activar la encuesta.';
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }

  async generateInvitations(): Promise<void> {
    this.busy = true;
    this.error = '';
    this.invitations = [];
    try {
      const result = await firstValueFrom(this.http.post<{ invitations: Invitation[] }>(
        `/api/surveys/${this.surveyId}/codes`,
        { group: this.group, count: this.inviteCount },
      ));
      this.invitations = result.invitations;
    } catch {
      this.error = 'No se pudieron generar los códigos QR.';
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }

  async loadReport(): Promise<void> {
    try {
      this.report = await firstValueFrom(this.http.get<SurveyReport>(`/api/surveys/${this.surveyId}/report`));
    } catch {
      this.error = 'No se pudo actualizar el reporte.';
    } finally {
      this.cdr.markForCheck();
    }
  }

  async loadAnalysis(): Promise<void> {
    try {
      const draft = await firstValueFrom(this.http.get<{ body: string; version: number; updated_at: string | null }>(
        `/api/surveys/${this.surveyId}/analysis`,
      ));
      this.analysis = draft.body;
      this.draftVersion = draft.version;
      this.savedAt = draft.updated_at;
    } catch {
      this.error = 'No se pudo cargar el borrador del análisis.';
    } finally {
      this.cdr.markForCheck();
    }
  }

  async saveAnalysis(): Promise<void> {
    this.busy = true;
    this.error = '';
    try {
      const draft = await firstValueFrom(this.http.put<{ body: string; version: number; updated_at: string }>(
        `/api/surveys/${this.surveyId}/analysis`,
        { body: this.analysis },
      ));
      this.draftVersion = draft.version;
      this.savedAt = draft.updated_at;
    } catch {
      this.error = 'No se pudo guardar el análisis.';
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }

  async downloadPdf(): Promise<void> {
    this.busy = true;
    this.error = '';
    try {
      const blob = await firstValueFrom(this.http.get(
        `/api/surveys/${this.surveyId}/report.pdf`,
        { responseType: 'blob' },
      ));
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `reporte-${this.surveyId}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      this.error = 'No se pudo descargar el PDF.';
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }

  statusLabel(status: SurveyDetail['status']): string {
    return status === 'active' ? 'Encuesta activa' : status === 'closed' ? 'Encuesta cerrada' : 'Borrador';
  }

  rangeLabel(question: Question): string {
    if (question.min_value === null && question.max_value === null) return 'Respuesta numérica';
    return `Rango: ${question.min_value ?? 'sin mínimo'} a ${question.max_value ?? 'sin máximo'}`;
  }

  groupLabel(group: string): string {
    return group === 'judges' ? 'Jurados' : group === 'exhibitors' ? 'Expositores' : 'Participantes';
  }

  format(value: number | null, suffix = ''): string {
    return value === null ? 'N/D' : `${Number(value.toFixed(3))}${suffix}`;
  }

  frequencyWidth(frequency: number, question: { frequencies: { frequency: number }[] }): number {
    const maximum = Math.max(...question.frequencies.map((row) => row.frequency), 1);
    return (frequency / maximum) * 100;
  }
}
