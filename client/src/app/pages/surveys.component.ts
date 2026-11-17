import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Survey, SurveyMode } from '../core/models';
import { HttpClient } from '@angular/common/http';
import { ButtonComponent } from '../shared/button.component';

@Component({
  selector: 'app-surveys',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ButtonComponent],
  template: `
    <header class="page-head">
      <div><p class="eyebrow">Panel de trabajo</p><h1>Encuestas</h1><p class="muted">Crea y administra formularios con tipos de pregunta configurables.</p></div>
      <form class="create-form" (ngSubmit)="createSurvey()">
        <input name="title" [(ngModel)]="title" placeholder="Nombre de la nueva encuesta" maxlength="200" required>
        <select name="modeCode" [(ngModel)]="modeCode" required>
          <option value="" disabled>Selecciona el enfoque</option>
          @for (mode of modes; track mode.code) {
            <option [value]="mode.code">{{ mode.label }}</option>
          }
        </select>
        <app-button type="submit" [disabled]="busy || !modeCode">Crear encuesta</app-button>
      </form>
    </header>
    @if (selectedMode) { <p class="mode-description">{{ selectedMode.description }}</p> }
    @if (error) { <p class="error" role="alert">{{ error }}</p> }
    @if (!surveys.length && !error) {
      <div class="empty"><strong>Aún no hay encuestas</strong><p>Crea una para comenzar a agregar preguntas.</p></div>
    } @else {
      <div class="survey-grid">
        @for (survey of surveys; track survey.id) {
          <a class="survey-card" [routerLink]="['/encuestas', survey.id]">
            <div class="card-top"><span class="status" [class.active]="survey.status === 'active'">{{ statusLabel(survey.status) }}</span><span class="mode-label">{{ survey.mode_label || 'Modo pendiente' }}</span><span class="arrow">↗</span></div>
            <h2>{{ survey.title }}</h2>
            <p class="description">{{ survey.description || 'Sin descripción' }}</p>
            <div class="card-bottom"><span>{{ survey.response_count || 0 }} respuestas</span><span>{{ survey.created_at | date:'mediumDate' }}</span></div>
          </a>
        }
      </div>
    }
  `,
  styles: [`
    .page-head { display:flex; align-items:end; justify-content:space-between; gap:1.5rem; flex-wrap:wrap; margin:1.5rem 0 2rem; }
    h1 { margin:.25rem 0; font-size:clamp(1.5rem,4vw,2rem); }
    .eyebrow { color:#185adb; font-size:.75rem; font-weight:800; letter-spacing:.12em; text-transform:uppercase; }
    .muted,.description { color:#64748b; }
    .create-form { display:grid; grid-template-columns:minmax(200px,1fr) minmax(190px,auto) auto; gap:.6rem; }
    input,select { width:100%; padding:.75rem; border:1px solid #cbd5e1; border-radius:9px; font:inherit; }
    .mode-description { margin:-1rem 0 1.5rem; color:#64748b; font-size:.9rem; }
    .survey-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:1rem; }
    .survey-card { min-height:175px; padding:1.25rem; border:1px solid #e2e8f0; border-radius:14px; background:white; color:inherit; text-decoration:none; transition:transform .15s,box-shadow .15s; }
    .survey-card:hover { transform:translateY(-2px); box-shadow:0 12px 30px #102a4310; }
    .card-top,.card-bottom { display:flex; justify-content:space-between; align-items:center; }
    .card-bottom { margin-top:1.8rem; color:#64748b; font-size:.82rem; }
    .status { padding:.28rem .55rem; border-radius:99px; background:#f1f5f9; color:#475569; font-size:.75rem; font-weight:700; }
    .status.active { background:#dcfce7; color:#166534; }
    .mode-label { color:#475569; font-size:.78rem; font-weight:700; }
    h2 { margin:1rem 0 .4rem; font-size:1.15rem; }
    .description { min-height:1.2rem; font-size:.9rem; }
    .arrow { color:#64748b; }
    .empty { margin-top:2rem; padding:3rem 1rem; text-align:center; border:1px dashed #cbd5e1; border-radius:16px; background:#fff; }
    .error { color:#b42318; }
    @media(max-width:600px) { .create-form { width:100%; grid-template-columns:1fr; } }
  `],
})
export class SurveysComponent implements OnInit {
  surveys: Survey[] = [];
  modes: SurveyMode[] = [];
  title = '';
  modeCode = '';
  error = '';
  busy = false;

  constructor(
    private readonly http: HttpClient,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    void this.loadSurveys();
    void this.loadModes();
  }

  async loadModes(): Promise<void> {
    try {
      this.modes = await firstValueFrom(this.http.get<SurveyMode[]>('/api/survey-modes'));
    } catch {
      this.error = 'No se pudieron cargar los modos de encuesta.';
    } finally {
      this.cdr.markForCheck();
    }
  }

  async loadSurveys(): Promise<void> {
    try {
      this.surveys = await firstValueFrom(this.http.get<Survey[]>('/api/surveys'));
    } catch {
      this.error = 'No se pudieron cargar las encuestas.';
    } finally {
      this.cdr.markForCheck();
    }
  }

  async createSurvey(): Promise<void> {
    if (!this.title.trim() || !this.modeCode) return;
    this.busy = true;
    this.error = '';
    try {
      const survey = await firstValueFrom(this.http.post<Survey>('/api/surveys', {
        title: this.title.trim(),
        modeCode: this.modeCode,
      }));
      this.title = '';
      this.modeCode = '';
      this.surveys = [survey, ...this.surveys];
    } catch {
      this.error = 'No se pudo crear la encuesta.';
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }

  statusLabel(status: Survey['status']): string {
    return status === 'active' ? 'Activa' : status === 'closed' ? 'Cerrada' : 'Borrador';
  }

  get selectedMode(): SurveyMode | null {
    return this.modes.find((mode) => mode.code === this.modeCode) ?? null;
  }
}
