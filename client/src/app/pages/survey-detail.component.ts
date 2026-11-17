import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { Question, QuestionType, SurveyDetail, SurveyMode, SurveyReport } from '../core/models';
import { SocketService } from '../core/socket.service';
import { ButtonComponent } from '../shared/button.component';

interface OptionDraft {
  label: string;
  isCorrect: boolean;
}

@Component({
  selector: 'app-survey-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ButtonComponent],
  template: `
    @if (survey) {
      <a class="back-link" routerLink="/encuestas">← Todas las encuestas</a>
      <header class="page-head">
        <div><p class="eyebrow">{{ statusLabel(survey.status) }} · {{ survey.mode_label || 'Modo pendiente' }}</p><h1>{{ survey.title }}</h1><p class="muted">{{ survey.description || survey.mode_description || 'Formulario de encuesta' }}</p></div>
        @if (survey.status === 'draft') {
          <app-button (click)="activate()" [disabled]="busy || !canActivate">Activar encuesta</app-button>
        }
      </header>

      @if (survey.status === 'draft') {
        @if (!survey.mode_code) {
          <section class="panel">
            <h2>Define el enfoque de esta encuesta</h2>
            <p class="muted">Las encuestas anteriores no se clasifican automáticamente. Elige un solo camino antes de continuar.</p>
            <form class="mode-form" (ngSubmit)="defineSurveyMode()">
              <label>Enfoque
                <select name="legacyModeCode" [(ngModel)]="modeCodeDraft" required>
                  <option value="" disabled>Selecciona el enfoque</option>
                  @for (mode of surveyModes; track mode.code) {
                    <option [value]="mode.code">{{ mode.label }}</option>
                  }
                </select>
              </label>
              @if (selectedSurveyMode) { <p class="muted wide">{{ selectedSurveyMode.description }}</p> }
              @if (error) { <p class="error wide" role="alert">{{ error }}</p> }
              <app-button type="submit" variant="secondary" [disabled]="busy || !modeCodeDraft">Confirmar enfoque</app-button>
            </form>
          </section>
        } @else {
          <section class="panel">
            <div class="section-title"><div><h2>Preguntas</h2><p class="muted">{{ survey.mode_description }}</p></div></div>
            <ol class="question-list">
              @for (question of survey.questions; track question.id) {
                <li>
                  <span class="number">{{ question.position }}</span>
                  <div class="question-content">
                    <strong>{{ question.prompt }}</strong><small>{{ questionSummary(question) }}</small>
                    @if (survey.requires_correct_answer) {
                      <form class="key-form" (ngSubmit)="saveQuestionKey(question)">
                        @if (question.is_numeric) {
                          <label>Respuesta correcta exacta
                            <input [name]="'key-' + question.id" type="number" step="any" [(ngModel)]="question.correct_value" required>
                          </label>
                        } @else {
                          <fieldset>
                            <legend>Marca la clave correcta</legend>
                            @for (option of question.options; track option.id; let i = $index) {
                              <label class="correct-option">
                                <input
                                  [type]="question.allows_multiple ? 'checkbox' : 'radio'"
                                  [name]="'key-option-' + question.id"
                                  [checked]="option.is_correct"
                                  (change)="setExistingOptionCorrect(question, i, $event)">
                                <span>{{ option.label }}</span>
                              </label>
                            }
                          </fieldset>
                        }
                        <app-button type="submit" variant="secondary" [disabled]="busy">Guardar clave</app-button>
                      </form>
                    }
                  </div>
                </li>
              }
            </ol>
            <form class="question-form" (ngSubmit)="addQuestion()">
            <label class="wide">Pregunta
              <input name="prompt" [(ngModel)]="prompt" maxlength="1000" placeholder="Ej. ¿Cuántas horas estudió esta semana?" required>
            </label>
            <label class="wide">Tipo de respuesta
              <select name="questionType" [(ngModel)]="questionType" (ngModelChange)="onQuestionTypeChange()" required>
                @for (type of questionTypes; track type.code) {
                  <option [value]="type.code">{{ type.label }}</option>
                }
              </select>
            </label>
            @if (selectedQuestionType?.is_numeric) {
              <label>Valor mínimo (opcional)
                <input name="minValue" type="number" step="any" [(ngModel)]="minValue">
              </label>
              <label>Valor máximo (opcional)
                <input name="maxValue" type="number" step="any" [(ngModel)]="maxValue">
              </label>
              @if (survey.requires_correct_answer) {
                <label class="wide">Respuesta correcta (valor exacto)
                  <input name="correctValue" type="number" step="any" [(ngModel)]="correctValue" required>
                </label>
              }
            } @else if (selectedQuestionType && selectedQuestionType.min_options > 0) {
              <div class="wide option-editor">
                <strong>{{ survey.requires_correct_answer ? 'Alternativas y clave de respuesta' : 'Alternativas' }}</strong>
                @for (option of optionDrafts; track $index; let i = $index) {
                  <div class="option-field">
                    <label [for]="'option-' + i">Alternativa {{ i + 1 }}</label>
                    <div class="option-row">
                      <input [id]="'option-' + i" [name]="'option-' + i" [(ngModel)]="option.label" maxlength="300" required>
                      @if (survey.requires_correct_answer) {
                        <label class="correct-option">
                          <input
                            [type]="selectedQuestionType.allows_multiple ? 'checkbox' : 'radio'"
                            [name]="'correct-option-' + questionType"
                            [checked]="option.isCorrect"
                            (change)="setOptionCorrect(i, $event)">
                          <span>Correcta</span>
                        </label>
                      }
                      @if (optionDrafts.length > selectedQuestionType.min_options) {
                        <button type="button" class="remove-option" (click)="removeOption(i)">Quitar</button>
                      }
                    </div>
                  </div>
                }
                <button type="button" class="add-option" (click)="addOption()">Agregar alternativa</button>
                <small>El participante podrá {{ selectedQuestionType.allows_multiple ? 'marcar varias' : 'elegir una' }}.</small>
              </div>
            }
            @if (error) { <p class="error wide" role="alert">{{ error }}</p> }
            <app-button type="submit" variant="secondary" class="wide" [disabled]="busy || !selectedQuestionType">Agregar pregunta</app-button>
          </form>
        </section>
        }
      } @else {
        <section class="panel metrics">
          <div class="metric"><span>Respuestas</span><strong>{{ report?.summary?.response_count ?? 0 }}</strong><small>Actualización en tiempo real</small></div>
          <div class="metric"><span>Participantes</span><strong>{{ report?.summary?.participants_count ?? 0 }}</strong><small>Respuestas registradas</small></div>
          <div class="metric"><span>Jurados</span><strong>{{ report?.summary?.judges_count ?? 0 }}</strong><small>Respuestas registradas</small></div>
          <div class="metric"><span>Expositores</span><strong>{{ report?.summary?.exhibitors_count ?? 0 }}</strong><small>Respuestas registradas</small></div>
        </section>

        <section class="panel report-panel">
          <div class="section-title"><div><h2>Resultados estadísticos</h2><p class="muted">Cálculos sobre las respuestas recibidas, sin datos de muestra.</p></div>
            <app-button variant="secondary" (click)="downloadPdf()" [disabled]="busy">Descargar PDF</app-button>
          </div>
          @if (!report?.questions?.length) {
            <p class="empty-note">Aún no hay preguntas o respuestas para mostrar.</p>
          }
          @for (question of report?.questions ?? []; track question.questionId) {
            <article class="result">
              <h3>{{ question.prompt }}</h3>
              @if (question.isNumeric) {
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
              } @else {
                <p class="muted">{{ question.questionTypeLabel }} · {{ question.universe }} respuestas</p>
              }
              <h4>Tabla de frecuencias</h4>
              @if (question.frequencies.length) {
                <svg class="freq-chart" [attr.viewBox]="'0 0 480 ' + chartHeight(question)" width="100%" [attr.height]="chartHeight(question)" role="img" aria-label="Distribución de frecuencias">
                  @for (row of question.frequencies; track row.value; let i = $index) {
                    <g [attr.transform]="'translate(0,' + (i * 32) + ')'">
                      <text x="52" y="20" text-anchor="end" font-size="12" fill="#475569">{{ row.value }}</text>
                      <rect x="58" y="6" [attr.width]="barWidth(row.frequency, question)" height="18" fill="#3876e8" rx="3"/>
                      <text [attr.x]="barWidth(row.frequency, question) + 64" y="20" font-size="12" fill="#334155" font-weight="700">{{ row.frequency }}</text>
                    </g>
                  }
                </svg>
              } @else { <p class="muted">Sin respuestas todavía.</p> }
            </article>
          }
        </section>

        <section class="panel analysis-panel">
          <div class="section-title"><div><h2>Análisis final — borrador</h2><p class="muted">Edita y guarda tus conclusiones. El contenido se incluye en el PDF.</p></div>
            <span class="version">Versión {{ draftVersion }}</span>
          </div>
          <textarea [(ngModel)]="analysis" rows="8" maxlength="50000" placeholder="Redacta aquí la interpretación de los resultados, conclusiones y recomendaciones…"></textarea>
          <div class="save-row"><span class="muted">{{ savedAt ? 'Guardado: ' + (savedAt | date:'short') : 'Cambios sin guardar' }}</span><app-button (click)="saveAnalysis()" [disabled]="busy">Guardar borrador</app-button></div>
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
    .question-list { display:grid; gap:.7rem; padding:0; list-style:none; }
    .question-list li { display:flex; align-items:start; gap:.75rem; padding:.75rem; border:1px solid #edf0f5; border-radius:10px; }
    .question-list small { display:block; margin-top:.25rem; }
    .question-content { display:grid; gap:.3rem; min-width:0; }
    .mode-form { display:grid; grid-template-columns:minmax(220px,1fr) auto; gap:.8rem; align-items:end; }
    .mode-form .wide { grid-column:1/-1; }
    .key-form { display:grid; gap:.55rem; margin:.6rem 0 1rem; padding:.75rem; background:#f8fafc; border-radius:9px; }
    .key-form fieldset { display:grid; gap:.45rem; border:0; padding:0; }
    .key-form legend { margin-bottom:.35rem; font-size:.85rem; font-weight:700; }
    .option-editor { display:grid; gap:.65rem; }
    .option-row { display:flex; gap:.5rem; }
    .option-field { display:grid; gap:.4rem; }
    .correct-option { display:flex; align-items:center; gap:.35rem; white-space:nowrap; }
    .correct-option input { width:auto; }
    .remove-option,.add-option { padding:.55rem .75rem; border:1px solid #cbd5e1; border-radius:8px; background:#fff; color:#334155; font:inherit; cursor:pointer; }
    .add-option { justify-self:start; }
    .number { display:grid; place-items:center; min-width:1.6rem; height:1.6rem; border-radius:50%; color:#185adb; background:#e9f0ff; font-weight:800; }
    .question-form { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:.8rem; margin-top:1rem; }
    label { display:grid; gap:.4rem; color:#334155; font-size:.86rem; font-weight:700; }
    input,select,textarea { width:100%; padding:.7rem; border:1px solid #cbd5e1; border-radius:8px; font:inherit; }
    .wide { grid-column:1/-1; }
    .metrics { display:grid; grid-template-columns:repeat(2,1fr); gap:1rem; align-content:center; }
    .metric { padding:.85rem; border-radius:10px; background:#f8fafc; }
    .metric span,.metric small { display:block; color:#64748b; font-size:.78rem; }
    .metric strong { display:block; margin:.2rem 0; font-size:1.8rem; }
    .report-panel { margin-top:1rem; }
    .result { margin-top:1.2rem; padding:1rem 0; border-top:1px solid #e2e8f0; }
    .stat-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(105px,1fr)); gap:.6rem; }
    .stat-grid div { padding:.65rem; border-radius:8px; background:#f8fafc; }
    .stat-grid small,.stat-grid strong { display:block; }
    .stat-grid strong { margin-top:.3rem; }
    .freq-chart { display:block; max-width:650px; overflow:visible; }
    .analysis-panel textarea { margin:.6rem 0; resize:vertical; }
    .save-row { justify-content:end; }
    .save-row span { margin-right:auto; font-size:.8rem; }
    .version { color:#64748b; font-size:.8rem; }
    .error { color:#b42318; }
    .empty-note { padding:1rem; color:#64748b; background:#f8fafc; border-radius:9px; }
    @media(max-width:560px) { .question-form,.mode-form { grid-template-columns:1fr; } .page-head { align-items:start; flex-direction:column; } .page-head app-button { width:100%; } .save-row { align-items:end; flex-wrap:wrap; } }
  `],
})
export class SurveyDetailComponent implements OnInit, OnDestroy {
  survey: SurveyDetail | null = null;
  report: SurveyReport | null = null;
  questionTypes: QuestionType[] = [];
  surveyModes: SurveyMode[] = [];
  modeCodeDraft = '';
  prompt = '';
  questionType = '';
  optionDrafts: OptionDraft[] = [];
  minValue: number | null = null;
  maxValue: number | null = null;
  correctValue: number | null = null;
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
      if (this.survey.status === 'draft') {
        [this.questionTypes, this.surveyModes] = await Promise.all([
          firstValueFrom(this.http.get<QuestionType[]>('/api/question-types')),
          firstValueFrom(this.http.get<SurveyMode[]>('/api/survey-modes')),
        ]);
        this.modeCodeDraft = this.survey.mode_code ?? '';
        this.questionType = this.questionTypes[0]?.code ?? '';
        this.onQuestionTypeChange();
      }
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

  async defineSurveyMode(): Promise<void> {
    if (!this.modeCodeDraft || !this.survey || this.survey.mode_code) return;
    this.busy = true;
    this.error = '';
    try {
      const mode = await firstValueFrom(this.http.put<SurveyMode & { code: string }>(
        `/api/surveys/${this.surveyId}/mode`,
        { modeCode: this.modeCodeDraft },
      ));
      this.survey.mode_code = mode.code;
      this.survey.mode_label = mode.label;
      this.survey.mode_description = mode.description;
      this.survey.requires_correct_answer = mode.requires_correct_answer;
      this.survey.grades_answers = mode.grades_answers;
    } catch {
      this.error = 'No se pudo definir el enfoque. Revisa si la encuesta ya tiene claves configuradas.';
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }

  async saveQuestionKey(question: Question): Promise<void> {
    if (!this.survey?.requires_correct_answer) return;
    const optionIds = question.options.filter((option) => option.is_correct).map((option) => option.id);
    if (question.is_numeric && (question.correct_value === null || question.correct_value === undefined)) {
      this.error = 'Indica la respuesta numérica correcta.';
      return;
    }
    if (!question.is_numeric
        && (optionIds.length === 0 || (!question.allows_multiple && optionIds.length !== 1))) {
      this.error = question.allows_multiple
        ? 'Marca al menos una alternativa correcta.'
        : 'Marca exactamente una alternativa correcta.';
      return;
    }
    this.busy = true;
    this.error = '';
    try {
      const updated = await firstValueFrom(this.http.put<Question>(
        `/api/surveys/${this.surveyId}/questions/${question.id}/answer-key`,
        {
          correctValue: question.is_numeric ? question.correct_value : null,
          optionIds,
        },
      ));
      this.survey.questions = this.survey.questions.map((item) => item.id === updated.id ? updated : item);
    } catch {
      this.error = 'No se pudo guardar la clave de esta pregunta.';
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }

  ngOnDestroy(): void {
    this.stopWatching?.();
  }

  async addQuestion(): Promise<void> {
    if (!this.survey || !this.prompt.trim()) return;
    const type = this.selectedQuestionType;
    if (!type) {
      this.error = 'No hay tipos de pregunta disponibles en la base de datos.';
      return;
    }
    if (this.survey.requires_correct_answer && type.is_numeric
        && (this.correctValue === null || !Number.isFinite(this.correctValue))) {
      this.error = 'Indica el valor numérico correcto.';
      return;
    }
    if (this.survey.requires_correct_answer && type.is_numeric
        && ((this.minValue !== null && this.correctValue! < this.minValue)
          || (this.maxValue !== null && this.correctValue! > this.maxValue))) {
      this.error = 'La respuesta correcta debe estar dentro de los límites de la pregunta.';
      return;
    }
    const options = type.min_options > 0
      ? this.optionDrafts.map(({ label, isCorrect }) => ({
        label: label.trim(),
        is_correct: isCorrect,
      })).filter((option) => option.label)
      : [];
    if (options.length < type.min_options) {
      this.error = `Agrega al menos ${type.min_options} alternativas.`;
      return;
    }
    const correctOptions = options.filter((option) => option.is_correct).length;
    if (this.survey.requires_correct_answer && type.min_options > 0
        && (correctOptions === 0 || (!type.allows_multiple && correctOptions !== 1))) {
      this.error = type.allows_multiple
        ? 'Marca al menos una alternativa correcta.'
        : 'Marca exactamente una alternativa correcta.';
      return;
    }
    this.busy = true;
    this.error = '';
    try {
      const question = await firstValueFrom(this.http.post<Question>(
        `/api/surveys/${this.surveyId}/questions`,
        {
          prompt: this.prompt.trim(),
          questionType: type.code,
          options: options.map((option) => ({
            ...option,
            is_correct: this.survey?.requires_correct_answer ? option.is_correct : false,
          })),
          minValue: type.is_numeric ? this.minValue : null,
          maxValue: type.is_numeric ? this.maxValue : null,
          correctValue: this.survey.requires_correct_answer && type.is_numeric ? this.correctValue : null,
        },
      ));
      this.survey.questions = [...this.survey.questions, question];
      this.prompt = '';
      this.minValue = null;
      this.maxValue = null;
      this.correctValue = null;
      this.optionDrafts = Array.from({ length: type.min_options }, () => ({ label: '', isCorrect: false }));
    } catch {
      this.error = 'No se pudo agregar la pregunta. Revisa el tipo y sus alternativas.';
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

  get canActivate(): boolean {
    if (!this.survey?.mode_code || !this.survey.questions.length) return false;
    if (!this.survey.requires_correct_answer) return true;
    return this.survey.questions.every((question) => question.is_numeric
      ? question.correct_value !== null && question.correct_value !== undefined
      : question.options.some((option) => option.is_correct));
  }

  get selectedSurveyMode(): SurveyMode | null {
    return this.surveyModes.find((mode) => mode.code === this.modeCodeDraft) ?? null;
  }

  get selectedQuestionType(): QuestionType | null {
    return this.questionTypes.find((type) => type.code === this.questionType) ?? null;
  }

  onQuestionTypeChange(): void {
    const type = this.selectedQuestionType;
    if (!type?.is_numeric) {
      this.minValue = null;
      this.maxValue = null;
    }
    if (type && !type.allows_multiple) {
      let foundCorrect = false;
      this.optionDrafts = this.optionDrafts.map((option) => {
        const keepCorrect = option.isCorrect && !foundCorrect;
        if (keepCorrect) foundCorrect = true;
        return { ...option, isCorrect: keepCorrect };
      });
    }
    while (type && this.optionDrafts.length < type.min_options) {
      this.optionDrafts.push({ label: '', isCorrect: false });
    }
  }

  addOption(): void {
    this.optionDrafts = [...this.optionDrafts, { label: '', isCorrect: false }];
  }

  removeOption(index: number): void {
    this.optionDrafts = this.optionDrafts.filter((_, optionIndex) => optionIndex !== index);
  }

  setOptionCorrect(index: number, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.optionDrafts = this.optionDrafts.map((option, optionIndex) => ({
      ...option,
      isCorrect: optionIndex === index
        ? checked
        : this.selectedQuestionType?.allows_multiple ? option.isCorrect : false,
    }));
  }

  setExistingOptionCorrect(question: Question, index: number, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    question.options = question.options.map((option, optionIndex) => ({
      ...option,
      is_correct: optionIndex === index
        ? checked
        : question.allows_multiple ? option.is_correct : false,
    }));
  }

  questionSummary(question: Question): string {
    if (question.is_numeric) {
      if (!this.survey?.requires_correct_answer) return question.question_type_label;
      const bounds = question.min_value === null && question.max_value === null
        ? ''
        : `; rango ${question.min_value ?? 'sin mínimo'} a ${question.max_value ?? 'sin máximo'}`;
      const key = question.correct_value === null || question.correct_value === undefined
        ? 'sin clave de respuesta'
        : `respuesta correcta: ${question.correct_value}`;
      return `${question.question_type_label}; ${key}${bounds}`;
    }
    if (!this.survey?.requires_correct_answer) {
      return `${question.question_type_label}: ${question.options.map((option) => option.label).join(', ')}`;
    }
    const options = question.options.map((option) =>
      `${option.label}${option.is_correct ? ' (correcta)' : ''}`).join(', ');
    const hasKey = question.options.some((option) => option.is_correct);
    return `${question.question_type_label}; ${hasKey ? options : `sin clave de respuesta: ${options}`}`;
  }

  format(value: number | null, suffix = ''): string {
    return value === null ? 'N/D' : `${Number(value.toFixed(3))}${suffix}`;
  }

  chartHeight(question: { frequencies: { frequency: number }[] }): number {
    return Math.max(question.frequencies.length * 32 + 8, 40);
  }

  barWidth(frequency: number, question: { frequencies: { frequency: number }[] }): number {
    const max = Math.max(...question.frequencies.map((r) => r.frequency), 1);
    return Math.round((frequency / max) * 380);
  }
}
