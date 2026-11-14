import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { Question } from '../core/models';

interface PublicSurvey {
  surveyId: string;
  title: string;
  description: string;
  questions: Question[];
}

@Component({
  selector: 'app-respond',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="response-card">
      @if (submitted) {
        <div class="success-mark">✓</div><h1>¡Respuesta recibida!</h1>
        <p>Gracias por participar. Este código ya no puede volver a utilizarse.</p>
      } @else if (survey) {
        <p class="eyebrow">Encuesta cuantitativa</p><h1>{{ survey.title }}</h1>
        @if (survey.description) { <p class="muted">{{ survey.description }}</p> }
        <form (ngSubmit)="submit()">
          @for (question of survey.questions; track question.id) {
            <label class="question">{{ question.position }}. {{ question.prompt }}
              <span class="bounds">
                {{ question.min_value !== null ? 'Mínimo: ' + question.min_value : 'Valor numérico' }}
                {{ question.max_value !== null ? ' · Máximo: ' + question.max_value : '' }}
              </span>
              <input type="number" step="any" [name]="question.id" [(ngModel)]="answers[question.id]"
                [min]="question.min_value" [max]="question.max_value" required>
            </label>
          }
          @if (error) { <p class="error" role="alert">{{ error }}</p> }
          <button class="primary" [disabled]="busy">{{ busy ? 'Enviando…' : 'Enviar respuesta' }}</button>
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
    .bounds { font-size:.78rem; font-weight:400; }
    input { width:100%; padding:.8rem; border:1px solid #cbd5e1; border-radius:9px; font:inherit; }
    button { padding:.85rem 1rem; border:0; border-radius:9px; color:white; background:#185adb; font:inherit; font-weight:700; cursor:pointer; }
    button:disabled { opacity:.65; }
    .error { color:#b42318; }
    .success-mark { display:grid; place-items:center; width:3rem; height:3rem; border-radius:50%; color:#166534; background:#dcfce7; font-size:1.5rem; }
  `],
})
export class RespondComponent implements OnInit {
  survey: PublicSurvey | null = null;
  answers: Record<string, number | null> = {};
  error = '';
  busy = false;
  submitted = false;
  private token = '';

  constructor(
    private readonly route: ActivatedRoute,
    private readonly http: HttpClient,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  async ngOnInit(): Promise<void> {
    this.token = this.route.snapshot.paramMap.get('token') ?? '';
    try {
      this.survey = await firstValueFrom(this.http.get<PublicSurvey>(`/api/respond/${this.token}`));
      for (const question of this.survey.questions) this.answers[question.id] = null;
    } catch {
      this.error = 'El enlace no es válido, venció o ya fue utilizado.';
    } finally {
      this.cdr.markForCheck();
    }
  }

  async submit(): Promise<void> {
    if (!this.survey || Object.values(this.answers).some((value) => value === null || value === undefined)) {
      this.error = 'Responde todas las preguntas antes de enviar.';
      return;
    }
    this.busy = true;
    this.error = '';
    try {
      await firstValueFrom(this.http.post(`/api/respond/${this.token}`, {
        answers: Object.entries(this.answers).map(([questionId, value]) => ({ questionId, value })),
      }));
      this.submitted = true;
    } catch {
      this.error = 'No se pudo registrar la respuesta. Verifica los valores o solicita una nueva invitación.';
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }
}
