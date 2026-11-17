import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom, Subscription } from 'rxjs';
import { Group, RespondentGroup, Survey } from '../core/models';
import { ButtonComponent } from '../shared/button.component';
import { AuthService } from '../core/auth.service';
import { SocketService } from '../core/socket.service';

interface Invitation {
  respondentGroup: string;
  url: string;
  qrCode: string;
}

interface CupoGrupo {
  grupoEncuestado: string;
  cupo: number;
  cupoCompletados: number;
  cupoDisponible: number;
}

interface PendingCode {
  id: string;
  grupoEncuestado: string;
  url: string;
  qrCode: string;
  creadoEn: string;
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
            <h2>Cupos por tipo de encuestado</h2>
            <p class="muted cupo-hint">Define el límite de QR para cada tipo. Los cambios aplican de inmediato.</p>
            <div class="cupo-table-wrap">
              <table class="cupo-table">
                <thead><tr><th>Tipo</th><th>Cupo asignado</th><th>Completados</th><th>Disponibles</th><th></th></tr></thead>
                <tbody>
                  @for (rg of respondentGroups; track rg.value) {
                    <tr>
                      <td class="grupo-name">{{ rg.label | titlecase }}</td>
                      <td>
                        <input class="cupo-input" type="number" min="0" max="10000" step="1"
                          [(ngModel)]="cupoEdits[rg.value]"
                          [placeholder]="getCupoPlaceholder(rg.value)">
                      </td>
                      <td class="num">{{ getCupoGrupo(rg.value)?.cupoCompletados ?? '—' }}</td>
                      <td class="num" [class.agotado]="getCupoGrupo(rg.value)?.cupoDisponible === 0">
                        {{ getCupoGrupo(rg.value)?.cupoDisponible ?? '—' }}
                      </td>
                      <td>
                        <button class="btn-save" (click)="saveCupo(rg.value)" [disabled]="busyCupo[rg.value]">
                          {{ busyCupo[rg.value] ? '…' : 'Guardar' }}
                        </button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
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
            <select name="respondentGroup" [(ngModel)]="respondentGroup" (ngModelChange)="onRespondentGroupChange()" required>
              <option value="" disabled>Selecciona el tipo</option>
              @for (group of respondentGroups; track group.value) {
                <option [value]="group.value">{{ group.label | titlecase }}</option>
              }
            </select>
          </label>
          @if (isSuperuser) {
            <label>Cantidad
              <input name="count" type="number" min="1" max="100" step="1" [(ngModel)]="count" required>
            </label>
          }
          <div class="submit-wrap">
            <app-button type="submit" [disabled]="busy || !canGenerate">
              {{ busy ? 'Generando…' : 'Generar QR' }}
            </app-button>
            @if (selectedCupo && selectedCupo.cupoDisponible === 0) {
              <span class="cupo-warning">Cupo agotado</span>
            } @else if (selectedCupo && selectedCupo.cupoDisponible > 0) {
              <span class="cupo-badge">{{ selectedCupo.cupoDisponible }} disponibles</span>
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

    @if (surveyId && respondentGroup) {
      <section class="panel pending-panel">
        <div class="pending-head">
          <div>
            <h2>QRs pendientes · <span class="grupo-badge">{{ respondentGroup | titlecase }}</span></h2>
            <p class="muted">QRs generados que aún no han sido respondidos. Desaparecen automáticamente cuando se completa la encuesta.</p>
          </div>
          <button class="btn-refresh" (click)="refreshPending()" [disabled]="loadingPending" title="Actualizar lista">
            {{ loadingPending ? '…' : '↻' }}
          </button>
        </div>
        @if (loadingPending) {
          <p class="muted">Cargando…</p>
        } @else if (!pendingCodes.length) {
          <p class="muted empty-pending">No hay QRs pendientes para este grupo en esta encuesta.</p>
        } @else {
          <div class="table-wrap">
            <table>
              <thead><tr><th>#</th><th>Enlace de acceso</th><th>Generado</th><th class="th-qr">QR</th></tr></thead>
              <tbody>
                @for (code of pendingCodes; track code.id; let i = $index) {
                  <tr class="pending-row" (click)="expandedPendingId = expandedPendingId === code.id ? null : code.id">
                    <td class="idx">{{ i + 1 }}</td>
                    <td class="url-cell"><a [href]="code.url" target="_blank" rel="noopener" (click)="$event.stopPropagation()">{{ code.url }}</a></td>
                    <td class="date-cell">{{ code.creadoEn | date:'dd/MM/yyyy HH:mm' }}</td>
                    <td class="qr-toggle">{{ expandedPendingId === code.id ? '▲' : '▼' }}</td>
                  </tr>
                  @if (expandedPendingId === code.id) {
                    <tr class="qr-expand-row">
                      <td colspan="4">
                        <div class="qr-expand-content">
                          <img [src]="code.qrCode" [alt]="'QR ' + (i+1)" class="qr-expand-img">
                          <div class="qr-expand-info">
                            <p class="qr-expand-label">Código QR #{{ i + 1 }}</p>
                            <a [href]="code.url" target="_blank" rel="noopener" class="qr-expand-url">{{ code.url }}</a>
                            <a [href]="code.qrCode" [download]="'pendiente-' + (i+1) + '.png'" class="qr-expand-dl">Descargar QR</a>
                          </div>
                        </div>
                      </td>
                    </tr>
                  }
                }
              </tbody>
            </table>
          </div>
          <p class="pending-count">{{ pendingCodes.length }} pendiente{{ pendingCodes.length !== 1 ? 's' : '' }}</p>
        }
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
    .cupo-table-wrap { overflow-x:auto; }
    .cupo-table { width:100%; border-collapse:collapse; font-size:.88rem; }
    .cupo-table thead { background:#f8fafc; border-bottom:1px solid #e2e8f0; }
    .cupo-table th { padding:.6rem .75rem; color:#64748b; font-size:.75rem; font-weight:700; text-transform:uppercase; letter-spacing:.06em; white-space:nowrap; text-align:left; }
    .cupo-table td { padding:.55rem .75rem; border-bottom:1px solid #f1f5f9; color:#334155; vertical-align:middle; }
    .cupo-table tbody tr:last-child td { border-bottom:0; }
    .grupo-name { font-weight:600; }
    .num { text-align:center; font-variant-numeric:tabular-nums; }
    .num.agotado { color:#dc2626; font-weight:700; }
    .cupo-input { width:90px; padding:.45rem .6rem; border:1px solid #cbd5e1; border-radius:7px; font:inherit; font-size:.88rem; }
    .btn-save { padding:.4rem .8rem; border:1px solid #185adb; border-radius:7px; background:white; color:#185adb; font:inherit; font-size:.82rem; font-weight:700; cursor:pointer; }
    .btn-save:hover:not(:disabled) { background:#185adb; color:white; }
    .btn-save:disabled { opacity:.5; cursor:not-allowed; }
    .generator-form { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr) 130px auto; gap:.8rem; align-items:end; margin-top:1rem; }
    label { display:grid; gap:.4rem; color:#334155; font-size:.86rem; font-weight:700; }
    input,select { width:100%; padding:.7rem; border:1px solid #cbd5e1; border-radius:8px; font:inherit; }
    .submit-wrap { display:flex; flex-direction:column; gap:.4rem; align-items:flex-start; }
    .cupo-warning { font-size:.78rem; font-weight:700; color:#dc2626; }
    .cupo-badge { font-size:.78rem; font-weight:700; color:#059669; }
    .error { color:#b42318; }
    .results { margin-top:1.2rem; }
    .invitation-list { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:.8rem; margin-top:1rem; }
    .invitation { display:flex; align-items:center; gap:.8rem; min-width:0; padding:.75rem; border:1px solid #e2e8f0; border-radius:10px; }
    .invitation img { width:92px; height:92px; }
    .invitation div { display:grid; min-width:0; gap:.35rem; }
    .invitation a { overflow-wrap:anywhere; color:#185adb; font-size:.78rem; }
    .download-link { font-weight:700; }
    .pending-panel { margin-top:1.2rem; }
    .pending-head { display:flex; align-items:flex-start; justify-content:space-between; gap:1rem; margin-bottom:.75rem; }
    .pending-head h2 { margin:.2rem 0 .25rem; font-size:1.15rem; }
    .grupo-badge { font-size:.82rem; font-weight:700; color:#185adb; }
    .btn-refresh { padding:.4rem .75rem; border:1px solid #cbd5e1; border-radius:7px; background:white; color:#334155; font:inherit; font-size:1rem; cursor:pointer; flex-shrink:0; }
    .btn-refresh:hover:not(:disabled) { background:#f8fafc; }
    .btn-refresh:disabled { opacity:.5; cursor:not-allowed; }
    .table-wrap { overflow-x:auto; }
    table { width:100%; border-collapse:collapse; text-align:left; font-size:.88rem; }
    thead { background:#f8fafc; border-bottom:1px solid #e2e8f0; }
    th { padding:.6rem .75rem; color:#64748b; font-size:.75rem; font-weight:700; text-transform:uppercase; letter-spacing:.06em; white-space:nowrap; }
    td { padding:.6rem .75rem; border-bottom:1px solid #f1f5f9; color:#334155; }
    tbody tr:last-child td { border-bottom:0; }
    tbody tr:hover td { background:#f8faff; }
    .idx { width:2.5rem; text-align:center; color:#94a3b8; font-weight:700; font-size:.82rem; }
    .url-cell a { color:#185adb; overflow-wrap:anywhere; font-size:.82rem; }
    .date-cell { white-space:nowrap; color:#64748b; font-size:.82rem; }
    .empty-pending { text-align:center; padding:1.5rem 0; }
    .pending-count { margin:.75rem 0 0; font-size:.8rem; color:#64748b; text-align:right; }
    .pending-row { cursor:pointer; }
    .th-qr { width:3rem; text-align:center; }
    .qr-toggle { text-align:center; color:#94a3b8; font-size:.75rem; }
    .qr-expand-row td { padding:0; background:#f8fafc; border-bottom:1px solid #e2e8f0; }
    .qr-expand-row:hover td { background:#f8fafc; }
    .qr-expand-content { display:flex; align-items:center; gap:1.25rem; padding:.75rem 1rem; }
    .qr-expand-img { width:140px; height:140px; border:1px solid #e2e8f0; border-radius:8px; flex-shrink:0; }
    .qr-expand-info { display:flex; flex-direction:column; gap:.5rem; min-width:0; }
    .qr-expand-label { font-weight:700; font-size:.9rem; color:#334155; margin:0; }
    .qr-expand-url { color:#185adb; font-size:.78rem; overflow-wrap:anywhere; }
    .qr-expand-dl { font-weight:700; font-size:.82rem; color:#185adb; }
    @media(max-width:860px) { .generator-form { grid-template-columns:1fr 1fr; } }
    @media(max-width:640px) {
      .generator-form { grid-template-columns:1fr; }
      .submit-wrap { flex-direction:row; align-items:center; }
      .cupo-editor { padding-bottom:1rem; }
      .cupo-table-wrap { overflow-x:auto; -webkit-overflow-scrolling:touch; }
      .cupo-table { min-width:400px; }
      .panel { padding:.875rem .75rem; }
      h1 { font-size:1.4rem; }
      .invitation-list { grid-template-columns:1fr; }
      .table-wrap { overflow-x:auto; -webkit-overflow-scrolling:touch; }
      table { min-width:420px; }
      .pending-head { flex-wrap:wrap; }
      .qr-expand-img { width:120px; height:120px; }
    }
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
  cupos: CupoGrupo[] = [];
  cupoEdits: Record<string, number | null> = {};
  busyCupo: Record<string, boolean> = {};
  invitations: Invitation[] = [];
  pendingCodes: PendingCode[] = [];
  loadingPending = false;
  expandedPendingId: string | null = null;
  loading = true;
  busy = false;
  error = '';

  private groupsLoaded = false;
  private routeSubscription?: Subscription;
  private surveyRequest = 0;
  private stopWatchingSurvey?: () => void;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly http: HttpClient,
    readonly cdr: ChangeDetectorRef,
    readonly auth: AuthService,
    private readonly socket: SocketService,
  ) {}

  get isSuperuser(): boolean {
    return this.auth.user()?.role === 'superuser';
  }

  get selectedGroup(): Group | undefined {
    return this.groups.find((group) => group.id === this.selectedGroupId);
  }

  get selectedCupo(): CupoGrupo | undefined {
    return this.respondentGroup ? this.cupos.find((c) => c.grupoEncuestado === this.respondentGroup) : undefined;
  }

  get canGenerate(): boolean {
    if (!this.surveyId || !this.respondentGroup) return false;
    if (this.isSuperuser && (this.count === null || this.count < 1)) return false;
    if (this.selectedCupo?.cupoDisponible === 0) return false;
    return true;
  }

  getCupoGrupo(grupo: string): CupoGrupo | undefined {
    return this.cupos.find((c) => c.grupoEncuestado === grupo);
  }

  getCupoPlaceholder(grupo: string): string {
    const c = this.getCupoGrupo(grupo);
    return c ? String(c.cupo) : 'Sin límite';
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
    this.stopWatchingSurvey?.();
  }

  private async loadSurveys(routeGroupId: string | null): Promise<void> {
    const group = routeGroupId
      ? this.groups.find((item) => item.id === routeGroupId)
      : this.groups[0];
    if (!group) {
      this.selectedGroupId = '';
      this.surveys = [];
      this.surveyId = '';
      this.cupos = [];
      this.error = routeGroupId ? 'El grupo seleccionado ya no está activo.' : '';
      this.cdr.markForCheck();
      return;
    }

    this.selectedGroupId = group.id;
    this.loading = true;
    this.error = '';
    this.surveys = [];
    this.surveyId = '';
    this.cupos = [];
    this.invitations = [];
    const requestId = ++this.surveyRequest;
    try {
      const params = new HttpParams().set('groupId', group.id);
      const surveys = await firstValueFrom(this.http.get<Survey[]>('/api/surveys', { params }));
      if (requestId !== this.surveyRequest) return;
      this.surveys = surveys.filter((survey) => survey.status === 'active');
      this.surveyId = this.surveys[0]?.id ?? '';
      if (this.surveyId) {
        await this.loadCupos();
        this.watchForResponses();
      }
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
    this.cupos = [];
    this.pendingCodes = [];
    this.expandedPendingId = null;
    this.stopWatchingSurvey?.();
    this.stopWatchingSurvey = undefined;
    if (this.surveyId) {
      await this.loadCupos();
      this.watchForResponses();
    }
    if (this.surveyId && this.respondentGroup) await this.loadPendingCodes();
    this.cdr.markForCheck();
  }

  async onRespondentGroupChange(): Promise<void> {
    this.pendingCodes = [];
    this.expandedPendingId = null;
    if (this.surveyId && this.respondentGroup) await this.loadPendingCodes();
    this.cdr.markForCheck();
  }

  async refreshPending(): Promise<void> {
    if (this.surveyId && this.respondentGroup) await this.loadPendingCodes();
  }

  private async loadPendingCodes(): Promise<void> {
    if (!this.surveyId || !this.respondentGroup) return;
    this.loadingPending = true;
    this.cdr.markForCheck();
    try {
      const params = new HttpParams().set('grupo', this.respondentGroup);
      this.pendingCodes = await firstValueFrom(
        this.http.get<PendingCode[]>(`/api/surveys/${this.surveyId}/codes/pending`, { params }),
      );
    } catch {
      this.pendingCodes = [];
    } finally {
      this.loadingPending = false;
      this.cdr.markForCheck();
    }
  }

  private watchForResponses(): void {
    if (!this.surveyId) return;
    this.stopWatchingSurvey?.();
    this.stopWatchingSurvey = this.socket.watchSurvey(this.surveyId, () => {
      void this.loadPendingCodes();
      void this.loadCupos();
    });
  }

  private async loadCupos(): Promise<void> {
    try {
      this.cupos = await firstValueFrom(this.http.get<CupoGrupo[]>(`/api/surveys/${this.surveyId}/cupos`));
      this.syncCupoEdits();
    } catch {
      this.cupos = [];
    }
  }

  private syncCupoEdits(): void {
    const edits: Record<string, number | null> = {};
    for (const rg of this.respondentGroups) {
      const c = this.getCupoGrupo(rg.value);
      edits[rg.value] = c ? c.cupo : null;
    }
    this.cupoEdits = edits;
  }

  async saveCupo(grupo: string): Promise<void> {
    if (!this.surveyId) return;
    const val = this.cupoEdits[grupo];
    if (val === null || val === undefined) return;
    this.busyCupo = { ...this.busyCupo, [grupo]: true };
    this.error = '';
    try {
      this.cupos = await firstValueFrom(
        this.http.put<CupoGrupo[]>(`/api/surveys/${this.surveyId}/cupos/${encodeURIComponent(grupo)}`, { cupo: val }),
      );
    } catch {
      this.error = `No se pudo guardar el cupo de "${grupo}".`;
    } finally {
      this.busyCupo = { ...this.busyCupo, [grupo]: false };
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
      await this.loadCupos();
      await this.loadPendingCodes();
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
