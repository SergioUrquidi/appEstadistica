import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom, Subscription } from 'rxjs';
import { Group, RespondentGroup, Survey } from '../core/models';
import { ButtonComponent } from '../shared/button.component';
import { AuthService } from '../core/auth.service';

interface Invitation {
  respondentGroup: string;
  url: string;
  qrCode: string;
}

interface CupoInfo {
  cupoTotal: number | null;
  cupoGenerados: number;
  cupoDisponible: number | null;
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

        @if (isSuperuser && surveyId) {
          <div class="cupo-editor">
            <h2>Cupo de invitaciones</h2>
            <p class="muted cupo-hint">Establece el límite máximo de QR que se pueden generar para esta encuesta. Deja vacío para sin límite.</p>
            <div class="cupo-form">
              <input type="number" min="1" max="10000" step="1" [(ngModel)]="cupoInput" placeholder="Sin límite">
              <app-button (click)="saveCupo()" [disabled]="busyCupo">{{ busyCupo ? 'Guardando…' : 'Guardar cupo' }}</app-button>
            </div>
          </div>
        }

        @if (surveyId && cupo !== undefined) {
          <div class="cupo-meter" [class.agotado]="cupo.cupoDisponible === 0">
            <span class="cupo-label">Cupo disponible</span>
            @if (cupo.cupoTotal === null) {
              <span class="cupo-value unlimited">Sin límite</span>
            } @else {
              <span class="cupo-value">
                <strong>{{ cupo.cupoDisponible }}</strong> / {{ cupo.cupoTotal }}
              </span>
              <div class="cupo-bar">
                <div class="cupo-fill" [style.width.%]="cupoPercent"></div>
              </div>
            }
          </div>
        }

        <form class="generator-form" (ngSubmit)="generateInvitations()">
          <label>Encuesta
            <select name="surveyId" [(ngModel)]="surveyId" (ngModelChange)="onSurveyChange()" required>
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
          @if (isSuperuser) {
            <label>Cantidad de QR
              <input name="count" type="number" min="1" max="100" step="1" [(ngModel)]="count" required>
            </label>
          }
          <div class="submit-wrap">
            <app-button type="submit" [disabled]="busy || !canGenerate">
              {{ busy ? 'Generando…' : 'Generar QR' }}
            </app-button>
            @if (cupo !== undefined && cupo.cupoDisponible === 0) {
              <span class="cupo-warning">Cupo agotado</span>
            }
          </div>
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
    .cupo-editor { margin-bottom:1.25rem; padding-bottom:1.25rem; border-bottom:1px solid #f1f5f9; }
    .cupo-hint { font-size:.82rem; margin:.25rem 0 .75rem; }
    .cupo-form { display:flex; gap:.6rem; align-items:center; }
    .cupo-form input { width:140px; padding:.7rem; border:1px solid #cbd5e1; border-radius:8px; font:inherit; }
    .cupo-meter { display:flex; flex-wrap:wrap; align-items:center; gap:.5rem 1rem; margin-bottom:1rem; padding:.75rem 1rem; border:1px solid #e2e8f0; border-radius:10px; background:#f8fafc; }
    .cupo-meter.agotado { border-color:#fca5a5; background:#fff5f5; }
    .cupo-label { font-size:.82rem; font-weight:700; color:#334155; }
    .cupo-value { font-size:.9rem; color:#334155; }
    .cupo-value.unlimited { color:#059669; font-weight:700; }
    .cupo-value strong { font-size:1.1rem; color:#185adb; }
    .cupo-meter.agotado .cupo-value strong { color:#dc2626; }
    .cupo-bar { width:100%; height:6px; background:#e2e8f0; border-radius:99px; overflow:hidden; }
    .cupo-fill { height:100%; background:#185adb; border-radius:99px; transition:width .4s ease; }
    .cupo-meter.agotado .cupo-fill { background:#dc2626; }
    .generator-form { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr) 160px auto; gap:.8rem; align-items:end; margin-top:1rem; }
    label { display:grid; gap:.4rem; color:#334155; font-size:.86rem; font-weight:700; }
    input,select { width:100%; padding:.7rem; border:1px solid #cbd5e1; border-radius:8px; font:inherit; }
    .submit-wrap { display:flex; flex-direction:column; gap:.4rem; align-items:flex-start; }
    .cupo-warning { font-size:.78rem; font-weight:700; color:#dc2626; }
    .error { color:#b42318; }
    .results { margin-top:1.2rem; }
    .invitation-list { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:.8rem; margin-top:1rem; }
    .invitation { display:flex; align-items:center; gap:.8rem; min-width:0; padding:.75rem; border:1px solid #e2e8f0; border-radius:10px; }
    .invitation img { width:92px; height:92px; }
    .invitation div { display:grid; min-width:0; gap:.35rem; }
    .invitation a { overflow-wrap:anywhere; color:#185adb; font-size:.78rem; }
    .download-link { font-weight:700; }
    @media(max-width:860px) { .generator-form { grid-template-columns:1fr 1fr; } }
    @media(max-width:640px) { .generator-form { grid-template-columns:1fr; } .cupo-form { flex-wrap:wrap; } }
  `],
})
export class QrGeneratorComponent implements OnInit, OnDestroy {
  groups: Group[] = [];
  respondentGroups: RespondentGroup[] = [];
  selectedGroupId = '';
  surveys: Survey[] = [];
  surveyId = '';
  respondentGroup = '';
  count: number | null = 1;
  cupo?: CupoInfo;
  cupoInput: number | null = null;
  invitations: Invitation[] = [];
  loading = true;
  busy = false;
  busyCupo = false;
  error = '';

  private groupsLoaded = false;
  private routeSubscription?: Subscription;
  private surveyRequest = 0;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly http: HttpClient,
    private readonly cdr: ChangeDetectorRef,
    readonly auth: AuthService,
  ) {}

  get isSuperuser(): boolean {
    return this.auth.user()?.role === 'superuser';
  }

  get selectedGroup(): Group | undefined {
    return this.groups.find((group) => group.id === this.selectedGroupId);
  }

  get validCount(): boolean {
    if (this.isSuperuser) {
      return this.count !== null
        && Number.isInteger(this.count)
        && this.count >= 1
        && this.count <= 100;
    }
    return true;
  }

  get canGenerate(): boolean {
    if (!this.surveyId || !this.respondentGroup) return false;
    if (!this.validCount) return false;
    if (this.cupo !== undefined && this.cupo.cupoDisponible === 0) return false;
    return true;
  }

  get cupoPercent(): number {
    if (!this.cupo?.cupoTotal) return 0;
    return Math.round((this.cupo.cupoDisponible ?? 0) / this.cupo.cupoTotal * 100);
  }

  async ngOnInit(): Promise<void> {
    this.routeSubscription = this.route.paramMap.subscribe((params) => {
      if (!this.groupsLoaded) return;
      void this.loadSurveys(params.get('groupId'));
    });

    try {
      [this.groups, this.respondentGroups] = await Promise.all([
        firstValueFrom(this.http.get<Group[]>('/api/grupos')),
        firstValueFrom(this.http.get<RespondentGroup[]>('/api/respondent-groups/con-encuesta-activa')),
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
      this.cupo = undefined;
      this.error = routeGroupId ? 'El grupo seleccionado ya no está activo.' : '';
      this.cdr.markForCheck();
      return;
    }

    this.selectedGroupId = group.id;
    this.loading = true;
    this.error = '';
    this.surveys = [];
    this.surveyId = '';
    this.cupo = undefined;
    this.invitations = [];
    const requestId = ++this.surveyRequest;
    try {
      const params = new HttpParams().set('groupId', group.id);
      const surveys = await firstValueFrom(this.http.get<Survey[]>('/api/surveys', { params }));
      if (requestId !== this.surveyRequest) return;
      this.surveys = surveys.filter((survey) => survey.status === 'active');
      this.surveyId = this.surveys[0]?.id ?? '';
      if (this.surveyId) await this.loadCupo();
    } catch {
      if (requestId === this.surveyRequest) this.error = 'No se pudieron cargar las encuestas del grupo.';
    } finally {
      if (requestId === this.surveyRequest) {
        this.loading = false;
        this.cdr.markForCheck();
      }
    }
  }

  async onSurveyChange(): Promise<void> {
    this.invitations = [];
    this.cupo = undefined;
    if (this.surveyId) await this.loadCupo();
    this.cdr.markForCheck();
  }

  private async loadCupo(): Promise<void> {
    try {
      this.cupo = await firstValueFrom(this.http.get<CupoInfo>(`/api/surveys/${this.surveyId}/cupo`));
      this.cupoInput = this.cupo.cupoTotal;
    } catch {
      this.cupo = undefined;
    }
  }

  async saveCupo(): Promise<void> {
    if (!this.surveyId) return;
    this.busyCupo = true;
    this.error = '';
    try {
      this.cupo = await firstValueFrom(
        this.http.put<CupoInfo>(`/api/surveys/${this.surveyId}/cupo`, { cupo: this.cupoInput }),
      );
    } catch {
      this.error = 'No se pudo guardar el cupo.';
    } finally {
      this.busyCupo = false;
      this.cdr.markForCheck();
    }
  }

  async generateInvitations(): Promise<void> {
    if (!this.canGenerate) return;
    this.busy = true;
    this.error = '';
    this.invitations = [];
    const count = this.isSuperuser ? (this.count ?? 1) : 1;
    try {
      const result = await firstValueFrom(this.http.post<{ invitations: Invitation[] }>(
        `/api/surveys/${this.surveyId}/codes`,
        {
          surveyGroupId: this.selectedGroupId,
          respondentGroup: this.respondentGroup,
          count,
        },
      ));
      this.invitations = result.invitations;
      await this.loadCupo();
    } catch (err: unknown) {
      const msg = (err as { error?: { error?: string } })?.error?.error;
      this.error = msg ?? 'No se pudieron generar las invitaciones QR.';
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
