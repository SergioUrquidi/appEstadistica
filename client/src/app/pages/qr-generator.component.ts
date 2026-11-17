import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom, Subscription } from 'rxjs';
import { Group, RespondentGroup, Survey } from '../core/models';
import { ButtonComponent } from '../shared/button.component';

interface Invitation {
  respondentGroup: string;
  url: string;
  qrCode: string;
}

@Component({
  selector: 'app-qr-generator',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonComponent],
  template: `
    <header class="page-head">
      <div>
        <p class="eyebrow">Invitaciones de acceso único</p>
        <h1>Generador QR · {{ selectedGroup?.etiqueta || 'Grupos' }}</h1>
        <p class="muted">Selecciona una encuesta del grupo y el tipo de encuestado registrado en la base.</p>
      </div>
    </header>

    @if (error) { <p class="error" role="alert">{{ error }}</p> }

    <section class="panel">
      @if (loading) {
        <p class="muted">Cargando datos…</p>
      } @else if (!groups.length) {
        <p class="muted">No hay grupos activos disponibles.</p>
      } @else if (!respondentGroups.length) {
        <p class="muted">La base no tiene tipos de encuestado disponibles.</p>
      } @else if (!surveys.length) {
        <p class="muted">No hay encuestas activas para este grupo.</p>
      } @else {
        <form class="generator-form" (ngSubmit)="generateInvitations()">
          <label>Encuesta
            <select name="surveyId" [(ngModel)]="surveyId" (ngModelChange)="invitations = []" required>
              <option value="" disabled>Selecciona una encuesta</option>
              @for (survey of surveys; track survey.id) {
                <option [value]="survey.id">{{ survey.title }}</option>
              }
            </select>
          </label>
          <label>Tipo de encuestado
            <select name="respondentGroup" [(ngModel)]="respondentGroup" required>
              <option value="" disabled>Selecciona el tipo</option>
              @for (group of respondentGroups; track group.value) {
                <option [value]="group.value">{{ group.label | titlecase }}</option>
              }
            </select>
          </label>
          <label>Cantidad de QR individuales
            <input name="count" type="number" min="1" max="100" step="1" [(ngModel)]="count" required>
          </label>
          <app-button type="submit" [disabled]="busy || !surveyId || !respondentGroup || !validCount">
            {{ busy ? 'Generando…' : 'Generar QR' }}
          </app-button>
        </form>
      }
    </section>

    @if (invitations.length) {
      <section class="panel results">
        <h2>Invitaciones generadas</h2>
        <p class="muted">Cada QR permite registrar una sola respuesta. Guarda o comparte cada invitación por separado.</p>
        <div class="invitation-list">
          @for (invitation of invitations; track invitation.url; let i = $index) {
            <article class="invitation">
              <img [src]="invitation.qrCode" alt="Código QR de acceso único">
              <div>
                <strong>{{ selectedSurveyTitle }}</strong>
                <a [href]="invitation.url" target="_blank" rel="noopener">{{ invitation.url }}</a>
                <a class="download-link" [href]="invitation.qrCode" [download]="downloadName(i)">Descargar QR</a>
              </div>
            </article>
          }
        </div>
      </section>
    }
  `,
  styles: [`
    .page-head { margin:1.5rem 0 2rem; }
    h1 { margin:.25rem 0; font-size:clamp(1.5rem,4vw,2rem); }
    h2 { margin:.2rem 0 .4rem; font-size:1.15rem; }
    .eyebrow { color:#185adb; font-size:.75rem; font-weight:800; letter-spacing:.12em; text-transform:uppercase; }
    .muted { color:#64748b; }
    .panel { margin:1rem 0; padding:1.25rem; border:1px solid #e2e8f0; border-radius:14px; background:white; }
    .generator-form { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr) 190px auto; gap:.8rem; align-items:end; }
    label { display:grid; gap:.4rem; color:#334155; font-size:.86rem; font-weight:700; }
    input,select { width:100%; padding:.7rem; border:1px solid #cbd5e1; border-radius:8px; font:inherit; }
    .error { color:#b42318; }
    .results { margin-top:1.2rem; }
    .invitation-list { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:.8rem; margin-top:1rem; }
    .invitation { display:flex; align-items:center; gap:.8rem; min-width:0; padding:.75rem; border:1px solid #e2e8f0; border-radius:10px; }
    .invitation img { width:92px; height:92px; }
    .invitation div { display:grid; min-width:0; gap:.35rem; }
    .invitation a { overflow-wrap:anywhere; color:#185adb; font-size:.78rem; }
    .download-link { font-weight:700; }
    @media(max-width:860px) { .generator-form { grid-template-columns:1fr 1fr; } }
    @media(max-width:640px) { .generator-form { grid-template-columns:1fr; } }
  `],
})
export class QrGeneratorComponent implements OnInit, OnDestroy {
  groups: Group[] = [];
  respondentGroups: RespondentGroup[] = [];
  selectedGroupId = '';
  surveys: Survey[] = [];
  surveyId = '';
  respondentGroup = '';
  count: number | null = null;
  invitations: Invitation[] = [];
  loading = true;
  busy = false;
  error = '';

  private groupsLoaded = false;
  private routeSubscription?: Subscription;
  private surveyRequest = 0;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly http: HttpClient,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  get selectedGroup(): Group | undefined {
    return this.groups.find((group) => group.id === this.selectedGroupId);
  }

  get validCount(): boolean {
    return this.count !== null
      && Number.isInteger(this.count)
      && this.count >= 1
      && this.count <= 100;
  }

  async ngOnInit(): Promise<void> {
    this.routeSubscription = this.route.paramMap.subscribe((params) => {
      if (!this.groupsLoaded) return;
      void this.loadSurveys(params.get('groupId'));
    });

    try {
      [this.groups, this.respondentGroups] = await Promise.all([
        firstValueFrom(this.http.get<Group[]>('/api/grupos')),
        firstValueFrom(this.http.get<RespondentGroup[]>('/api/respondent-groups')),
      ]);
      this.groupsLoaded = true;
      await this.loadSurveys(this.route.snapshot.paramMap.get('groupId'));
    } catch {
      this.error = 'No se pudieron cargar los grupos y encuestas.';
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  ngOnDestroy(): void {
    this.routeSubscription?.unsubscribe();
  }

  private async loadSurveys(routeGroupId: string | null): Promise<void> {
    const group = routeGroupId
      ? this.groups.find((item) => item.id === routeGroupId)
      : this.groups[0];
    if (!group) {
      this.selectedGroupId = '';
      this.surveys = [];
      this.surveyId = '';
      this.error = routeGroupId ? 'El grupo seleccionado ya no está activo.' : '';
      this.cdr.markForCheck();
      return;
    }

    this.selectedGroupId = group.id;
    this.loading = true;
    this.error = '';
    this.surveys = [];
    this.surveyId = '';
    this.invitations = [];
    const requestId = ++this.surveyRequest;
    try {
      const params = new HttpParams().set('groupId', group.id);
      const surveys = await firstValueFrom(this.http.get<Survey[]>('/api/surveys', { params }));
      if (requestId !== this.surveyRequest) return;
      this.surveys = surveys.filter((survey) => survey.status === 'active');
      this.surveyId = this.surveys[0]?.id ?? '';
    } catch {
      if (requestId === this.surveyRequest) this.error = 'No se pudieron cargar las encuestas del grupo.';
    } finally {
      if (requestId === this.surveyRequest) {
        this.loading = false;
        this.cdr.markForCheck();
      }
    }
  }

  async generateInvitations(): Promise<void> {
    if (!this.surveyId || !this.respondentGroup || !this.validCount) return;
    this.busy = true;
    this.error = '';
    this.invitations = [];
    try {
      const result = await firstValueFrom(this.http.post<{ invitations: Invitation[] }>(
        `/api/surveys/${this.surveyId}/codes`,
        {
          surveyGroupId: this.selectedGroupId,
          respondentGroup: this.respondentGroup,
          count: this.count,
        },
      ));
      this.invitations = result.invitations;
    } catch {
      this.error = 'No se pudieron generar las invitaciones QR.';
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }

  get selectedSurveyTitle(): string {
    return this.surveys.find((survey) => survey.id === this.surveyId)?.title ?? '';
  }

  downloadName(index: number): string {
    return `invitacion-${this.surveyId}-${this.respondentGroup}-${index + 1}.png`;
  }
}
