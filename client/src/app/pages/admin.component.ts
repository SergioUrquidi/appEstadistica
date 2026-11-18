import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

interface Grupo {
  id: string;
  nombre: string;
  etiqueta: string;
  icono: string;
  orden: number;
  activo: boolean;
  creado_en: string;
}

interface Encuestador {
  id: string;
  email: string;
  nombre_display: string;
}

interface Asignacion {
  asignacion_id: string;
  usuario_id: string;
  nombre: string;
  email: string;
  grupo_encuestado: string;
}

interface Survey {
  id: string;
  titulo: string;
  estado: string;
}

interface RespondentGroup {
  nombre: string;
  etiqueta: string;
}

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  styles: [`
    .page-head { margin:1.5rem 0 2rem; }
    h1 { margin:.25rem 0; font-size:clamp(1.5rem,4vw,2rem); }
    h2 { margin:.2rem 0 .4rem; font-size:1.15rem; }
    h3 { margin:0 0 .2rem; font-size:1.05rem; font-weight:700; color:#0f172a; }
    .eyebrow { color:#185adb; font-size:.75rem; font-weight:800; letter-spacing:.12em; text-transform:uppercase; }
    .muted { color:#64748b; font-size:.88rem; }
    .panel { margin:1rem 0; padding:1.25rem; border:1px solid #e2e8f0; border-radius:14px; background:white; }

    /* ── Tabs ── */
    .tabs { display:flex; gap:.25rem; border-bottom:1px solid #e2e8f0; margin-bottom:2rem; }
    .tab-btn { padding:.6rem 1rem; background:none; border:0; border-bottom:2px solid transparent; color:#94a3b8; font:inherit; font-size:.875rem; font-weight:600; cursor:pointer; margin-bottom:-1px; transition:color .15s, border-color .15s; }
    .tab-btn.active { color:#185adb; border-bottom-color:#185adb; }

    /* ── Toolbar ── */
    .toolbar { display:flex; align-items:center; justify-content:space-between; gap:1rem; margin-bottom:1.25rem; }
    .toolbar-meta small { display:block; color:#94a3b8; font-size:.78rem; margin-top:.15rem; }

    /* ── Btn primario / peligro ── */
    .btn-primary { display:inline-flex; align-items:center; gap:.45rem; padding:.5rem 1rem; background:#185adb; color:#fff; border:0; border-radius:8px; font:inherit; font-size:.875rem; font-weight:700; cursor:pointer; transition:background .15s; }
    .btn-primary:hover { background:#1348b8; }
    .btn-danger-outline { padding:.4rem .75rem; background:transparent; border:0; border-radius:8px; color:#b42318; font:inherit; font-size:.8rem; font-weight:700; cursor:pointer; transition:background .15s; }
    .btn-danger-outline:hover { background:#fef2f2; }
    .btn-action-outline { padding:.4rem .75rem; background:transparent; border:0; border-radius:8px; color:#185adb; font:inherit; font-size:.8rem; font-weight:700; cursor:pointer; transition:background .15s; }
    .btn-action-outline:hover { background:#eff5ff; }

    /* ── Error banner ── */
    .error-banner { display:flex; align-items:flex-start; gap:.75rem; padding:.75rem 1rem; margin-bottom:1.25rem; background:#fef2f2; border:1px solid #fecaca; border-radius:10px; color:#b42318; font-size:.875rem; }

    /* ── Loading ── */
    .loading { text-align:center; padding:4rem 1rem; color:#94a3b8; font-size:.9rem; }
    .spinner { display:inline-block; width:1.5rem; height:1.5rem; border:2px solid #bfdbfe; border-top-color:#3b82f6; border-radius:50%; animation:spin .6s linear infinite; margin-bottom:.6rem; }
    @keyframes spin { to { transform:rotate(360deg); } }

    /* ── Table ── */
    .table-card { border:1px solid #e2e8f0; border-radius:14px; overflow:hidden; box-shadow:0 1px 4px rgba(15,23,42,.06); }
    table { width:100%; border-collapse:collapse; font-size:.875rem; }
    thead { background:#f8fafc; border-bottom:1px solid #e2e8f0; }
    th { padding:.75rem 1rem; text-align:left; font-size:.72rem; font-weight:700; color:#94a3b8; letter-spacing:.08em; text-transform:uppercase; }
    th:first-child { width:48px; }
    th:last-child { text-align:right; }
    td { padding:.85rem 1rem; border-bottom:1px solid #f1f5f9; vertical-align:middle; color:#334155; }
    tbody tr:last-child td { border-bottom:0; }
    tbody tr:hover td { background:#f8faff; }
    td.icon-col { font-size:1.5rem; line-height:1; }
    td.order-col { font-family:monospace; font-size:.8rem; color:#cbd5e1; }
    td.actions { text-align:right; }
    .empty-row td { text-align:center; padding:4rem 1rem; color:#94a3b8; }

    /* ── Status badge ── */
    .badge { display:inline-flex; align-items:center; gap:.35rem; padding:.25rem .6rem; border-radius:99px; font-size:.75rem; font-weight:700; }
    .badge-active { background:#dcfce7; color:#15803d; }
    .badge-inactive { background:#f1f5f9; color:#94a3b8; }
    .badge-dot { width:.45rem; height:.45rem; border-radius:50%; background:currentColor; }
    .badge-active .badge-dot { background:#22c55e; }
    .badge-inactive .badge-dot { background:#cbd5e1; }

    /* ── Toggle ── */
    .toggle-track { position:relative; display:inline-flex; align-items:center; width:40px; height:22px; border-radius:999px; background:#cbd5e1; cursor:pointer; transition:background .2s; border:0; padding:0; }
    .toggle-track.on { background:#185adb; }
    .toggle-thumb { position:absolute; left:3px; top:3px; width:16px; height:16px; border-radius:50%; background:#fff; transition:transform .2s; box-shadow:0 1px 3px rgba(0,0,0,.2); }
    .toggle-track.on .toggle-thumb { transform:translateX(18px); }

    /* ── Modal backdrop ── */
    .modal-backdrop { position:fixed; inset:0; z-index:50; display:flex; align-items:center; justify-content:center; padding:1rem; background:rgba(15,23,42,.45); backdrop-filter:blur(6px); }
    .modal-card { background:#fff; border-radius:16px; width:100%; max-width:440px; padding:1.75rem; box-shadow:0 24px 64px rgba(15,23,42,.18); }
    .modal-sm { max-width:360px; text-align:center; }
    .modal-header { display:flex; align-items:flex-start; justify-content:space-between; gap:1rem; margin-bottom:1.5rem; }
    .modal-close { background:none; border:0; color:#94a3b8; cursor:pointer; padding:.35rem; border-radius:8px; line-height:1; transition:background .15s; }
    .modal-close:hover { background:#f1f5f9; }

    /* ── Form modal ── */
    .modal-form { display:grid; gap:1rem; }
    .form-group { display:grid; gap:.45rem; }
    .form-row { display:grid; grid-template-columns:1fr 1fr; gap:.75rem; }
    .form-label { font-size:.78rem; font-weight:700; color:#475569; }
    .form-required { color:#b42318; }
    .form-input { width:100%; padding:.6rem .875rem; border:1.5px solid #e2e8f0; border-radius:10px; font:inherit; font-size:.875rem; color:#1e293b; outline:none; transition:border-color .15s, box-shadow .15s; box-sizing:border-box; }
    .form-input:focus { border-color:#185adb; box-shadow:0 0 0 3px rgba(24,90,219,.12); }
    .form-hint { font-size:.74rem; color:#94a3b8; margin-top:.15rem; }
    .toggle-row { display:flex; align-items:center; justify-content:space-between; padding:.75rem 1rem; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; }
    .toggle-label strong { display:block; font-size:.875rem; color:#1e293b; }
    .toggle-label small { font-size:.75rem; color:#94a3b8; }

    /* ── Error form ── */
    .form-error { display:flex; align-items:flex-start; gap:.6rem; padding:.65rem .875rem; background:#fef2f2; border:1px solid #fecaca; border-radius:8px; color:#b42318; font-size:.82rem; }

    /* ── Modal action row ── */
    .modal-actions { display:flex; gap:.75rem; margin-top:.5rem; }
    .btn-cancel { flex:1; padding:.65rem; border:1.5px solid #e2e8f0; border-radius:10px; background:#fff; color:#475569; font:inherit; font-size:.875rem; font-weight:700; cursor:pointer; transition:background .15s; }
    .btn-cancel:hover { background:#f8fafc; }
    .btn-submit { flex:1; padding:.65rem; border:0; border-radius:10px; background:#185adb; color:#fff; font:inherit; font-size:.875rem; font-weight:700; cursor:pointer; transition:background .15s; }
    .btn-submit:hover:not(:disabled) { background:#1348b8; }
    .btn-submit:disabled { background:#94a3b8; cursor:not-allowed; }
    .btn-delete { flex:1; padding:.65rem; border:0; border-radius:10px; background:#b42318; color:#fff; font:inherit; font-size:.875rem; font-weight:700; cursor:pointer; transition:background .15s; }
    .btn-delete:hover:not(:disabled) { background:#991b1b; }
    .btn-delete:disabled { background:#94a3b8; cursor:not-allowed; }

    /* ── Delete modal icon ── */
    .delete-icon { display:grid; place-items:center; width:3.5rem; height:3.5rem; border-radius:14px; background:#fef2f2; margin:0 auto 1rem; }

    @media(max-width:640px) {
      .page-head { flex-direction:column; align-items:flex-start; gap:.75rem; }
      .page-head app-button, .page-head button { width:100%; }
      .table-wrap { overflow-x:auto; -webkit-overflow-scrolling:touch; }
      table { min-width:520px; }
      .panel { padding:.875rem .75rem; }
      h1 { font-size:1.4rem; }
      .modal-card { padding:1.25rem; }
    }
  `],
  template: `
    <header class="page-head">
      <div>
        <p class="eyebrow">Panel de administración</p>
        <h1>Configuración</h1>
        <p class="muted">Gestiona grupos, encuestas y otros recursos del sistema.</p>
      </div>
    </header>

    <!-- Tabs -->
    <div class="tabs">
      @for (tab of tabs; track tab.id) {
        <button class="tab-btn" [class.active]="activeTab === tab.id" (click)="activeTab = tab.id">
          {{ tab.label }}
        </button>
      }
    </div>

    <!-- TAB: Grupos -->
    @if (activeTab === 'grupos') {

      <div class="toolbar">
        <div class="toolbar-meta">
          <h2>Grupos de encuesta</h2>
          <small>{{ grupos.length }} grupo{{ grupos.length !== 1 ? 's' : '' }} registrado{{ grupos.length !== 1 ? 's' : '' }}</small>
        </div>
        <button class="btn-primary" (click)="openCreate()">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
          </svg>
          Nuevo grupo
        </button>
      </div>

      @if (tableError) {
        <div class="error-banner" role="alert">
          <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20" style="flex-shrink:0;margin-top:.1rem">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-5.25a.75.75 0 001.5 0V8a.75.75 0 00-1.5 0v4.75zm.75-7a.75.75 0 100 1.5.75.75 0 000-1.5z" clip-rule="evenodd"/>
          </svg>
          {{ tableError }}
        </div>
      }

      @if (loading) {
        <div class="loading">
          <div class="spinner"></div>
          <p>Cargando grupos…</p>
        </div>
      } @else {
        <div class="table-card">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th style="width:52px">Icono</th>
                <th>Nombre</th>
                <th>Etiqueta</th>
                <th>Estado</th>
                <th style="text-align:right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              @if (grupos.length === 0) {
                <tr class="empty-row">
                  <td colspan="6">
                    <svg width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" style="margin:0 auto .75rem;display:block;opacity:.3">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"/>
                    </svg>
                    No hay grupos registrados.
                  </td>
                </tr>
              }
              @for (g of grupos; track g.id) {
                <tr>
                  <td class="order-col">{{ g.orden }}</td>
                  <td class="icon-col">{{ g.icono }}</td>
                  <td><strong>{{ g.nombre }}</strong></td>
                  <td>{{ g.etiqueta }}</td>
                  <td>
                    <span class="badge" [class.badge-active]="g.activo" [class.badge-inactive]="!g.activo">
                      <span class="badge-dot"></span>
                      {{ g.activo ? 'Activo' : 'Inactivo' }}
                    </span>
                  </td>
                  <td class="actions">
                    <button class="btn-action-outline" (click)="openEdit(g)">Editar</button>
                    <button class="btn-danger-outline" (click)="confirmDelete(g)">Eliminar</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

    }

    <!-- TAB: Asignaciones encuestadores -->
    @if (activeTab === 'asignaciones') {
      <div class="toolbar">
        <div class="toolbar-meta">
          <h2>Asignaciones de encuestadores</h2>
          <small>Asigna encuestadores a encuestas y grupos específicos.</small>
        </div>
      </div>

      <div class="panel" style="margin-bottom:1rem">
        <div class="form-group" style="max-width:420px">
          <label class="form-label">Selecciona una encuesta</label>
          <select class="form-input" [(ngModel)]="selectedSurveyId" (ngModelChange)="onSurveyChange()">
            <option value="">— Elige una encuesta —</option>
            @for (s of surveys; track s.id) {
              <option [value]="s.id">{{ s.titulo }} ({{ s.estado }})</option>
            }
          </select>
        </div>
      </div>

      @if (selectedSurveyId) {
        <div class="toolbar" style="margin-bottom:.75rem">
          <h3 style="margin:0;font-size:1rem;font-weight:700;color:#0f172a">Encuestadores asignados</h3>
          <button class="btn-primary" (click)="showAsignForm = !showAsignForm">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
            Nueva asignación
          </button>
        </div>

        @if (showAsignForm) {
          <div class="panel" style="margin-bottom:1rem">
            <div class="form-row" style="align-items:end;gap:.75rem;margin-bottom:.75rem">
              <div class="form-group">
                <label class="form-label">Encuestador</label>
                <select class="form-input" [(ngModel)]="asignForm.usuarioId">
                  <option value="">— Selecciona —</option>
                  @for (e of encuestadores; track e.id) {
                    <option [value]="e.id">{{ e.nombre_display }} ({{ e.email }})</option>
                  }
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Tipo de encuestado</label>
                <select class="form-input" [(ngModel)]="asignForm.grupoEncuestado">
                  <option value="">— Selecciona —</option>
                  @for (g of respondentGroups; track g.nombre) {
                    <option [value]="g.nombre">{{ g.etiqueta }}</option>
                  }
                </select>
              </div>
            </div>
            @if (asignFormError) { <p class="form-error">{{ asignFormError }}</p> }
            <div style="display:flex;gap:.5rem">
              <button class="btn-submit" style="flex:0 0 auto;padding:.5rem 1.25rem" (click)="addAsignacion()" [disabled]="asignBusy || !asignForm.usuarioId || !asignForm.grupoEncuestado">
                {{ asignBusy ? 'Asignando…' : 'Asignar' }}
              </button>
              <button class="btn-cancel" style="flex:0 0 auto;padding:.5rem 1rem" (click)="showAsignForm = false">Cancelar</button>
            </div>
          </div>
        }

        @if (asignError) { <div class="error-banner" role="alert">{{ asignError }}</div> }

        @if (asignLoading) {
          <div class="loading"><div class="spinner"></div><p>Cargando…</p></div>
        } @else {
          <div class="table-card">
            <table>
              <thead><tr><th>Encuestador</th><th>Correo</th><th>Tipo de encuestado</th><th style="text-align:right">Acciones</th></tr></thead>
              <tbody>
                @if (asignaciones.length === 0) {
                  <tr class="empty-row"><td colspan="4">Sin asignaciones para esta encuesta.</td></tr>
                }
                @for (a of asignaciones; track a.asignacion_id) {
                  <tr>
                    <td><strong>{{ a.nombre }}</strong></td>
                    <td>{{ a.email }}</td>
                    <td>{{ a.grupo_encuestado }}</td>
                    <td class="actions"><button class="btn-danger-outline" (click)="removeAsignacion(a.asignacion_id)">Quitar</button></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      }
    }

    <!-- MODAL crear / editar -->
    @if (modal) {
      <div class="modal-backdrop" (click)="closeModal()">
        <div class="modal-card" (click)="$event.stopPropagation()">

          <div class="modal-header">
            <div>
              <h3>{{ modal === 'create' ? 'Nuevo grupo' : 'Editar grupo' }}</h3>
              <p class="muted">{{ modal === 'create' ? 'Completá los campos para crear un grupo.' : 'Modificá los campos que necesitás.' }}</p>
            </div>
            <button class="modal-close" (click)="closeModal()" aria-label="Cerrar">
              <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <form class="modal-form" (ngSubmit)="submitForm()">

            @if (modal === 'create') {
              <div class="form-group">
                <label class="form-label">Nombre interno <span class="form-required">*</span></label>
                <input class="form-input" name="nombre" [(ngModel)]="form.nombre" required maxlength="50" placeholder="ej. docentes">
                <p class="form-hint">Solo minúsculas y guiones bajos. No se puede cambiar.</p>
              </div>
            }

            <div class="form-group">
              <label class="form-label">Etiqueta visible <span class="form-required">*</span></label>
              <input class="form-input" name="etiqueta" [(ngModel)]="form.etiqueta" required maxlength="100" placeholder="ej. Docentes">
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Icono (emoji)</label>
                <input class="form-input" name="icono" [(ngModel)]="form.icono" maxlength="10" placeholder="📊" style="font-size:1.25rem;text-align:center">
              </div>
              <div class="form-group">
                <label class="form-label">Orden</label>
                <input class="form-input" name="orden" type="number" [(ngModel)]="form.orden" min="0" max="99">
              </div>
            </div>

            @if (modal === 'edit') {
              <div class="toggle-row">
                <div class="toggle-label">
                  <strong>Estado del grupo</strong>
                  <small>{{ form.activo ? 'Visible para los usuarios' : 'Oculto del sistema' }}</small>
                </div>
                <button type="button" class="toggle-track" [class.on]="form.activo" (click)="form.activo = !form.activo">
                  <span class="toggle-thumb"></span>
                </button>
              </div>
            }

            @if (formError) {
              <div class="form-error" role="alert">
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20" style="flex-shrink:0;margin-top:.1rem">
                  <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-5.25a.75.75 0 001.5 0V8a.75.75 0 00-1.5 0v4.75zm.75-7a.75.75 0 100 1.5.75.75 0 000-1.5z" clip-rule="evenodd"/>
                </svg>
                {{ formError }}
              </div>
            }

            <div class="modal-actions">
              <button type="button" class="btn-cancel" (click)="closeModal()">Cancelar</button>
              <button type="submit" class="btn-submit" [disabled]="busy">
                {{ busy ? 'Guardando…' : (modal === 'create' ? 'Crear grupo' : 'Guardar cambios') }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }

    <!-- MODAL confirmar eliminación -->
    @if (deleteTarget) {
      <div class="modal-backdrop" (click)="deleteTarget = null">
        <div class="modal-card modal-sm" (click)="$event.stopPropagation()">
          <div class="delete-icon">
            <svg width="28" height="28" fill="none" stroke="#b42318" stroke-width="1.75" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
            </svg>
          </div>
          <h3>¿Eliminar grupo?</h3>
          <p class="muted" style="margin:.4rem 0 1.5rem">
            Se eliminará <strong>{{ deleteTarget.etiqueta }}</strong> permanentemente.
            <small style="display:block;margin-top:.35rem">No es posible si tiene encuestas activas.</small>
          </p>
          <div class="modal-actions">
            <button class="btn-cancel" (click)="deleteTarget = null">Cancelar</button>
            <button class="btn-delete" (click)="doDelete()" [disabled]="busy">
              {{ busy ? 'Eliminando…' : 'Sí, eliminar' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class AdminComponent implements OnInit {
  activeTab = 'grupos';
  tabs = [{ id: 'grupos', label: '📋  Grupos' }, { id: 'asignaciones', label: '👤  Encuestadores' }];

  grupos: Grupo[] = [];
  loading = true;
  tableError = '';

  modal: 'create' | 'edit' | null = null;
  editId = '';
  form = { nombre: '', etiqueta: '', icono: '📊', orden: 0, activo: true };
  formError = '';
  busy = false;

  deleteTarget: Grupo | null = null;

  // ── Asignaciones ─────────────────────────────────────────────────────────
  encuestadores: Encuestador[] = [];
  surveys: Survey[] = [];
  respondentGroups: RespondentGroup[] = [];
  selectedSurveyId = '';
  asignaciones: Asignacion[] = [];
  asignLoading = false;
  asignError = '';
  showAsignForm = false;
  asignForm = { usuarioId: '', grupoEncuestado: '' };
  asignBusy = false;
  asignFormError = '';

  constructor(
    private readonly http: HttpClient,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  async ngOnInit(): Promise<void> {
    await Promise.all([
      this.loadGrupos(),
      this.loadEncuestadores(),
      this.loadSurveys(),
      this.loadRespondentGroups(),
    ]);
  }

  async loadGrupos(): Promise<void> {
    this.loading = true;
    this.tableError = '';
    try {
      this.grupos = await firstValueFrom(this.http.get<Grupo[]>('/api/admin/grupos'));
    } catch {
      this.tableError = 'No se pudieron cargar los grupos.';
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  openCreate(): void {
    this.form = { nombre: '', etiqueta: '', icono: '📊', orden: this.grupos.length, activo: true };
    this.formError = '';
    this.modal = 'create';
  }

  openEdit(g: Grupo): void {
    this.editId = g.id;
    this.form = { nombre: g.nombre, etiqueta: g.etiqueta, icono: g.icono, orden: g.orden, activo: g.activo };
    this.formError = '';
    this.modal = 'edit';
  }

  closeModal(): void {
    this.modal = null;
    this.formError = '';
  }

  async submitForm(): Promise<void> {
    if (!this.form.etiqueta.trim()) return;
    this.busy = true;
    this.formError = '';
    try {
      if (this.modal === 'create') {
        await firstValueFrom(this.http.post('/api/admin/grupos', {
          nombre: this.form.nombre.trim().toLowerCase(),
          etiqueta: this.form.etiqueta.trim(),
          icono: this.form.icono.trim() || '📊',
          orden: Number(this.form.orden),
        }));
      } else {
        await firstValueFrom(this.http.put(`/api/admin/grupos/${this.editId}`, {
          etiqueta: this.form.etiqueta.trim(),
          icono: this.form.icono.trim() || '📊',
          orden: Number(this.form.orden),
          activo: this.form.activo,
        }));
      }
      this.modal = null;
      await this.loadGrupos();
    } catch (err: unknown) {
      const msg = (err as { error?: { error?: string } })?.error?.error;
      this.formError = msg ?? 'Error al guardar. Verificá los datos.';
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }

  async loadEncuestadores(): Promise<void> {
    try {
      this.encuestadores = await firstValueFrom(this.http.get<Encuestador[]>('/api/encuestadores'));
    } catch { /* silencioso */ }
  }

  async loadSurveys(): Promise<void> {
    try {
      this.surveys = await firstValueFrom(this.http.get<Survey[]>('/api/surveys'));
    } catch { /* silencioso */ }
  }

  async loadRespondentGroups(): Promise<void> {
    try {
      this.respondentGroups = await firstValueFrom(this.http.get<RespondentGroup[]>('/api/respondent-groups'));
    } catch { /* silencioso */ }
  }

  async onSurveyChange(): Promise<void> {
    if (!this.selectedSurveyId) { this.asignaciones = []; return; }
    this.asignLoading = true;
    this.asignError = '';
    try {
      this.asignaciones = await firstValueFrom(
        this.http.get<Asignacion[]>(`/api/surveys/${this.selectedSurveyId}/asignaciones`),
      );
    } catch {
      this.asignError = 'No se pudieron cargar las asignaciones.';
    } finally {
      this.asignLoading = false;
      this.cdr.markForCheck();
    }
  }

  async addAsignacion(): Promise<void> {
    if (!this.asignForm.usuarioId || !this.asignForm.grupoEncuestado) return;
    this.asignBusy = true;
    this.asignFormError = '';
    try {
      this.asignaciones = await firstValueFrom(
        this.http.post<Asignacion[]>(`/api/surveys/${this.selectedSurveyId}/asignaciones`, {
          usuarioId: this.asignForm.usuarioId,
          grupoEncuestado: this.asignForm.grupoEncuestado,
        }),
      );
      this.asignForm = { usuarioId: '', grupoEncuestado: '' };
      this.showAsignForm = false;
    } catch (err: unknown) {
      const msg = (err as { error?: { error?: string } })?.error?.error;
      this.asignFormError = msg ?? 'Error al asignar.';
    } finally {
      this.asignBusy = false;
      this.cdr.markForCheck();
    }
  }

  async removeAsignacion(id: string): Promise<void> {
    try {
      await firstValueFrom(this.http.delete(`/api/surveys/${this.selectedSurveyId}/asignaciones/${id}`));
      this.asignaciones = this.asignaciones.filter((a) => a.asignacion_id !== id);
      this.cdr.markForCheck();
    } catch {
      this.asignError = 'No se pudo eliminar la asignación.';
      this.cdr.markForCheck();
    }
  }

  confirmDelete(g: Grupo): void {
    this.deleteTarget = g;
  }

  async doDelete(): Promise<void> {
    if (!this.deleteTarget) return;
    this.busy = true;
    try {
      await firstValueFrom(this.http.delete(`/api/admin/grupos/${this.deleteTarget.id}`));
      this.deleteTarget = null;
      await this.loadGrupos();
    } catch (err: unknown) {
      const msg = (err as { error?: { error?: string } })?.error?.error;
      this.tableError = msg ?? 'No se pudo eliminar el grupo.';
      this.deleteTarget = null;
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }
}
