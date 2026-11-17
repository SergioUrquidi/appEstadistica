import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Question, SubmissionResult } from '../core/models';
import { ButtonComponent } from '../shared/button.component';

interface PublicSurvey {
  surveyId: string;
  title: string;
  description: string;
  mode_label: string | null;
  grades_answers: boolean;
  questions: Question[];
}

@Component({
  selector: 'app-respond',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonComponent],
  template: `
    <section class="response-card">
      @if (submitted) {
        <div class="success-mark">✓</div><h1>¡Gracias por su colaboración!</h1>
        <p>Su respuesta fue recibida correctamente.</p>
        @if (result; as submissionResult) {
          @if (!submissionResult.grades_answers) {
            <p class="muted">
              {{ submissionResult.mode_label
                ? 'Esta encuesta recoge la opinión del participante; no asigna respuestas correctas ni puntaje.'
                : 'Este formulario anterior no tiene un enfoque definido y no genera puntaje.' }}
            </p>
          } @else if (submissionResult.show_result) {
            <section class="result-panel">
              <h2>Tu resultado</h2>
              @if (submissionResult.score_percent !== null) {
                <p class="score">{{ submissionResult.score_percent | number:'1.0-2' }}%</p>
                <p class="muted">Promedio de {{ submissionResult.graded_questions }} pregunta(s) calificable(s).</p>
              } @else {
                <p class="muted">No hay preguntas con clave de respuesta configurada para calificar esta encuesta.</p>
              }
              @if (submissionResult.reveal_correct_answers) {
                @for (questionResult of submissionResult.questions; track questionResult.questionId) {
                  <article class="result-question">
                    <strong>{{ questionResult.prompt }}</strong>
                    @if (questionResult.scorePercent === null) {
                      <span class="muted">Sin clave de respuesta</span>
                    } @else {
                      <span>{{ questionResult.scorePercent | number:'1.0-2' }}%</span>
                    }
                    @if (questionResult.correctAnswer !== null) {
                      <small>Respuesta correcta: {{ displayCorrectAnswer(questionResult.correctAnswer) }}</small>
                    }
                  </article>
                }
              }
            </section>
          } @else {
            <p class="muted">La respuesta se guardó; la revisión del resultado no está habilitada para esta prueba.</p>
          }
        }
      } @else if (survey) {
        <p class="eyebrow">{{ survey.mode_label || 'Encuesta anterior sin enfoque definido' }}</p><h1>{{ survey.title }}</h1>
        @if (survey.description) { <p class="muted">{{ survey.description }}</p> }
        <form (ngSubmit)="submit()">
          @for (question of survey.questions; track question.id) {
            <section class="question">
              <h2>{{ question.position }}. {{ question.prompt }}</h2>
              @if (question.is_numeric) {
                <span class="bounds">
                  {{ question.min_value !== null ? 'Mínimo: ' + question.min_value : '' }}
                  {{ question.max_value !== null ? ' · Máximo: ' + question.max_value : '' }}
                </span>
                <input type="number" step="any" [name]="question.id" [(ngModel)]="answers[question.id]"
                  [min]="question.min_value" [max]="question.max_value" required>
              } @else if (question.allows_multiple) {
                <fieldset>
                  @for (option of question.options; track option.id) {
                    <label class="choice">
                      <input type="checkbox" [checked]="selectedOptions(question.id).includes(option.id)"
                        (change)="toggleOption(question.id, option.id, $event)">
                      <span>{{ option.label }}</span>
                    </label>
                  }
                </fieldset>
              } @else {
                <fieldset>
                  @for (option of question.options; track option.id) {
                    <label class="choice">
                      <input type="radio" [name]="question.id" [(ngModel)]="answers[question.id]"
                        [value]="option.id" required>
                      <span>{{ option.label }}</span>
                    </label>
                  }
                </fieldset>
              }
            </section>
          }
          @if (error) { <p class="error" role="alert">{{ error }}</p> }
          <app-button type="submit" [disabled]="busy">{{ busy ? 'Enviando…' : 'Enviar respuesta' }}</app-button>
        </form>
      } @else if (error) {
        <h1>Invitación no disponible</h1><p class="error">{{ error }}</p>
      } @else {
        <p>Cargando encuesta…</p>
      }
    </section>
  `,
  styles: [`
    .response-card { max-width:650px; margin:4vh auto; padding:clamp(1.25rem,4vw,2.5rem); background:white; border:1px solid #e2e8f0; border-radius:18px; }
    h1 { margin:.3rem 0 1rem; font-size:clamp(1.6rem,4vw,2.2rem); }
    .eyebrow { color:#185adb; font-size:.75rem; font-weight:800; letter-spacing:.12em; text-transform:uppercase; }
    .muted,.bounds { color:#64748b; }
    form { display:grid; gap:1.3rem; margin-top:1.6rem; }
    .question { display:grid; gap:.55rem; font-weight:700; }
    .question h2 { margin:0; font-size:1rem; }
    .bounds { font-size:.78rem; font-weight:400; }
    input { width:100%; padding:.8rem; border:1px solid #cbd5e1; border-radius:9px; font:inherit; }
    fieldset { display:grid; gap:.6rem; padding:0; border:0; }
    .choice { display:flex; align-items:center; gap:.6rem; padding:.7rem; border:1px solid #e2e8f0; border-radius:9px; font-weight:400; }
    .choice input { width:auto; }
    .error { color:#b42318; }
    .success-mark { display:grid; place-items:center; width:3rem; height:3rem; border-radius:50%; color:#166534; background:#dcfce7; font-size:1.5rem; }
    .result-panel { margin-top:1.5rem; padding-top:1rem; border-top:1px solid #e2e8f0; }
    .result-panel h2 { font-size:1.2rem; }
    .score { margin:.3rem 0; color:#185adb; font-size:2rem; font-weight:800; }
    .result-question { display:grid; gap:.35rem; margin-top:.8rem; padding:.75rem; border-radius:9px; background:#f8fafc; }
    .result-question small,.muted { color:#64748b; }
  `],
})
export class RespondComponent implements OnInit {
  survey: PublicSurvey | null = null;
  answers: Record<string, number | string | string[] | null> = {};
  error = '';
  busy = false;
  submitted = false;
  result: SubmissionResult | null = null;
  private token = '';
  private deviceFingerprint: string | null = null;

  private getOrCreateFingerprint(): string | null {
    try {
      const key = 'device_fp';
      let fp = localStorage.getItem(key);
      if (!fp) {
        fp = crypto.randomUUID();
        localStorage.setItem(key, fp);
      }
      return fp;
    } catch {
      return null;
    }
  }

  constructor(
    private readonly route: ActivatedRoute,
    private readonly http: HttpClient,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  async ngOnInit(): Promise<void> {
    this.token = this.route.snapshot.paramMap.get('token') ?? '';
    this.deviceFingerprint = this.getOrCreateFingerprint();
    try {
      this.survey = await firstValueFrom(this.http.get<PublicSurvey>(`/api/respond/${this.token}`));
      for (const question of this.survey.questions) {
        this.answers[question.id] = question.allows_multiple ? [] : null;
      }
    } catch (error: unknown) {
      if (await this.redirectIfAlreadyAnswered(error)) return;
      this.error = 'El enlace no es válido, venció o ya fue utilizado.';
    } finally {
      this.cdr.markForCheck();
    }
  }

  async submit(): Promise<void> {
    if (!this.survey || this.survey.questions.some((question) => !this.hasAnswer(question))) {
      this.error = 'Responde todas las preguntas antes de enviar.';
      return;
    }
    this.busy = true;
    this.error = '';
    try {
      const submission = await firstValueFrom(this.http.post<{ submitted: boolean; result: SubmissionResult | null }>(`/api/respond/${this.token}`, {
        answers: this.survey.questions.map((question) => {
          const value = this.answers[question.id];
          return {
            questionId: question.id,
            value: typeof value === 'number' ? value : null,
            optionIds: Array.isArray(value) ? value : typeof value === 'string' ? [value] : [],
          };
        }),
        deviceFingerprint: this.deviceFingerprint,
      }));
      this.result = submission.result;
      this.submitted = true;
    } catch (error: unknown) {
      if (await this.redirectIfAlreadyAnswered(error)) return;
      this.error = 'No se pudo registrar la respuesta. Verifica los valores o solicita una nueva invitación.';
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }

  private async redirectIfAlreadyAnswered(error: unknown): Promise<boolean> {
    if (!(error instanceof HttpErrorResponse)
        || error.status !== 410
        || error.error?.code !== 'INVITATION_ALREADY_USED') {
      return false;
    }
    await this.router.navigateByUrl('/encuesta-respondida', { replaceUrl: true });
    return true;
  }

  hasAnswer(question: Question): boolean {
    const answer = this.answers[question.id];
    if (question.is_numeric) return typeof answer === 'number' && Number.isFinite(answer);
    if (question.allows_multiple) return Array.isArray(answer) && answer.length > 0;
    return typeof answer === 'string' && answer.length > 0;
  }

  selectedOptions(questionId: string): string[] {
    const answer = this.answers[questionId];
    return Array.isArray(answer) ? answer : [];
  }

  toggleOption(questionId: string, optionId: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const current = this.selectedOptions(questionId);
    this.answers[questionId] = checked
      ? [...new Set([...current, optionId])]
      : current.filter((id) => id !== optionId);
  }

  displayCorrectAnswer(answer: number | string[]): string {
    return Array.isArray(answer) ? answer.join(', ') : String(answer);
  }
}
