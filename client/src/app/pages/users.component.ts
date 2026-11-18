import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { ButtonComponent } from '../shared/button.component';

interface ManagedUser {
  id: string;
  email: string;
  display_name: string;
  role: 'superuser' | 'admin' | 'user' | 'encuestador';
  activo: boolean;
  created_at: string;
}

interface Estudio {
  id: string;
  titulo: string;
}

interface ActiveSurvey {
  id: string;
  title: string;
  status?: string;
}

interface RespondentGroup {
  value: string;
  label: string;
}

const PAGE_SIZE = 10;

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonComponent],
  template: `
    <header class="page-head">
      <div>
        <p class="eyebrow">Administración</p>
        <h1>Usuarios</h1>
        <p class="muted">Administra el acceso al sistema según el rol asignado.</p>
      </div>
    </header>

    <!-- Crear usuario -->
    <section class="panel">
      <div class="panel-head">
        <h2>Crear cuenta</h2>
        <button class="toggle-btn" (click)="showCreate = !showCreate" type="button">
          {{ showCreate ? '▲ Ocultar' : '▼ Nueva cuenta' }}
        </button>
      </div>
      @if (showCreate) {
        <form (ngSubmit)="createUser()" class="create-form">
          <label>Nombre
            <input name="displayName" [(ngModel)]="displayName" maxlength="120" required>
          </label>
          <label>Correo electrónico
            <input name="email" type="email" [(ngModel)]="email" maxlength="254" required>
          </label>
          <label>Contraseña temporal <span class="hint">(mín. 12 caracteres)</span>
            <input name="password" type="password" [(ngModel)]="password" minlength="12" required>
          </label>
          <label>Rol
            <select name="role" [(ngModel)]="role" (ngModelChange)="onRoleChange()">
              <option value="user">Usuario</option>
              <option value="encuestador">Encuestador</option>
              @if (auth.user()?.role === 'superuser') {
                <option value="admin">Administrador</option>
                <option value="superuser">Superusuario</option>
              }
            </select>
          </label>
          @if (role === 'encuestador') {
            <label>Feria
              <select name="feriaId" [(ngModel)]="feriaId" (ngModelChange)="onFeriaChange()" required>
                <option value="">— Selecciona una feria —</option>
                @for (e of estudios; track e.id) {
                  <option [value]="e.id">{{ e.titulo }}</option>
                }
              </select>
              @if (loadingEstudios) { <span class="hint">Cargando…</span> }
            </label>
            <label>Encuesta asignada
              <select name="surveyId" [(ngModel)]="surveyId" [disabled]="!feriaId || loadingSurveys" required>
                <option value="">— Selecciona una encuesta —</option>
                @for (s of surveysForFeria; track s.id) {
                  <option [value]="s.id">{{ s.title }}</option>
                }
              </select>
              @if (loadingSurveys) { <span class="hint">Cargando…</span> }
            </label>
            <label>Tipo de grupo
              <select name="grupoEncuestado" [(ngModel)]="grupoEncuestado" required>
                <option value="">— Selecciona el tipo —</option>
                @for (g of respondentGroups; track g.value) {
                  <option [value]="g.value">{{ g.label }}</option>
                }
              </select>
            </label>
          }
          @if (createError) { <p class="form-msg form-msg--error" role="alert">{{ createError }}</p> }
          @if (createSuccess) { <p class="form-msg form-msg--ok" role="status">{{ createSuccess }}</p> }
          <app-button type="submit" [disabled]="busy || !canSubmit">{{ busy ? 'Creando…' : 'Crear usuario' }}</app-button>
        </form>
      }
    </section>

    <!-- Tabla de usuarios -->
    <section class="panel">
      <div class="panel-head">
        <h2>Cuentas existentes <span class="count-badge">{{ filtered.length }}</span></h2>
        <input class="search-input" type="search" placeholder="Buscar…" [(ngModel)]="search" (ngModelChange)="onSearch()" maxlength="100">
      </div>

      @if (loadingUsers) {
        <p class="muted">Cargando…</p>
      } @else if (!filtered.length) {
        <p class="muted">No hay usuarios para mostrar.</p>
      } @else {
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Correo</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Creado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (u of page; track u.id) {
                @if (editId === u.id) {
                  <tr class="edit-row">
                    <td>
                      <input class="cell-input" [(ngModel)]="editName" maxlength="120" required>
                    </td>
                    <td class="email-cell">{{ u.email }}</td>
                    <td>
                      <select class="cell-select" [(ngModel)]="editRole">
                        <option value="user">Usuario</option>
                        <option value="encuestador">Encuestador</option>
                        @if (auth.user()?.role === 'superuser') {
                          <option value="admin">Administrador</option>
                          <option value="superuser">Superusuario</option>
                        }
                      </select>
                    </td>
                    <td></td>
                    <td>{{ u.created_at | date:'mediumDate' }}</td>
                    <td class="actions">
                      <button class="btn-save" (click)="saveEdit(u)" [disabled]="savingEdit" title="Guardar">
                        {{ savingEdit ? '…' : '✓' }}
                      </button>
                      <button class="btn-cancel" (click)="cancelEdit()" title="Cancelar">✕</button>
                    </td>
                  </tr>
                  @if (editError) {
                    <tr class="edit-error-row"><td colspan="6"><span class="form-msg form-msg--error">{{ editError }}</span></td></tr>
                  }
                } @else {
                  <tr [class.row-inactive]="u.activo === false">
                    <td>{{ u.display_name }}</td>
                    <td class="email-cell">{{ u.email }}</td>
                    <td><span class="role-chip role-chip--{{ u.role }}">{{ roleLabel(u.role) }}</span></td>
                    <td>
                      @if (u.activo !== false) {
                        <span class="status-chip status-chip--on">Activo</span>
                      } @else {
                        <span class="status-chip status-chip--off">Baja</span>
                      }
                    </td>
                    <td>{{ u.created_at | date:'mediumDate' }}</td>
                    <td class="actions">
                      <button class="btn-edit" (click)="startEdit(u)" title="Editar" [disabled]="u.activo === false">✎</button>
                      @if (u.activo !== false) {
                        <button class="btn-baja" (click)="toggleActivo(u, false)"
                          [disabled]="togglingId === u.id || u.id === auth.user()?.id"
                          title="Dar de baja">
                          {{ togglingId === u.id ? '…' : '⊘' }}
                        </button>
                      } @else {
                        <button class="btn-reactivar" (click)="toggleActivo(u, true)"
                          [disabled]="togglingId === u.id"
                          title="Reactivar">
                          {{ togglingId === u.id ? '…' : '↺' }}
                        </button>
                      }
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>

        <!-- Paginador -->
        @if (totalPages > 1) {
          <div class="paginator">
            <button class="page-btn" [disabled]="currentPage === 0" (click)="goTo(0)">«</button>
            <button class="page-btn" [disabled]="currentPage === 0" (click)="goTo(currentPage - 1)">‹</button>
            @for (p of pageNumbers; track p) {
              <button class="page-btn" [class.page-btn--active]="p === currentPage" (click)="goTo(p)">{{ p + 1 }}</button>
            }
            <button class="page-btn" [disabled]="currentPage === totalPages - 1" (click)="goTo(currentPage + 1)">›</button>
            <button class="page-btn" [disabled]="currentPage === totalPages - 1" (click)="goTo(totalPages - 1)">»</button>
            <span class="page-info">{{ currentPage * pageSize + 1 }}–{{ pageEnd }} de {{ filtered.length }}</span>
          </div>
        }
      }
    </section>
  `,
  styles: [`
    .page-head { margin:1.5rem 0 2rem; }
    h1 { margin:.25rem 0; font-size:clamp(1.5rem,4vw,2rem); }
    h2 { margin:0; font-size:1.1rem; display:flex; align-items:center; gap:.5rem; }
    .eyebrow { color:#8dcab8; font-size:.75rem; font-weight:800; letter-spacing:.12em; text-transform:uppercase; }
    .muted { color:#64748b; }
    .panel { margin:1rem 0; padding:1.25rem; border:1px solid #e2e8f0; border-radius:14px; background:white; }
    .panel-head { display:flex; align-items:center; justify-content:space-between; gap:1rem; margin-bottom:1rem; flex-wrap:wrap; }

    /* create form */
    .toggle-btn { background:none; border:1px solid #cbd5e1; border-radius:8px; padding:.3rem .75rem; font-size:.8rem; color:#64748b; cursor:pointer; white-space:nowrap; &:hover { background:#f1f5f9; } }
    .create-form { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:1rem; margin-top:.25rem; }
    label { display:grid; gap:.4rem; color:#334155; font-size:.86rem; font-weight:700; }
    .full-row { grid-column:1/-1; }
    input,select { width:100%; padding:.7rem; border:1px solid #cbd5e1; border-radius:8px; font:inherit; }
    .hint { font-size:.78rem; font-weight:400; color:#64748b; }
    app-button { grid-column:1/-1; justify-self:start; }
    .form-msg { font-size:.85rem; grid-column:1/-1; }
    .form-msg--error { color:#b42318; }
    .form-msg--ok { color:#166534; }

    /* search */
    .search-input { padding:.45rem .75rem; border:1px solid #cbd5e1; border-radius:8px; font:inherit; font-size:.86rem; width:220px; }

    /* count badge */
    .count-badge { background:#f1f5f9; color:#64748b; font-size:.72rem; font-weight:700; padding:.15rem .5rem; border-radius:999px; }

    /* table */
    .table-wrap { overflow-x:auto; margin-top:.25rem; }
    table { width:100%; border-collapse:collapse; text-align:left; font-size:.88rem; }
    thead { background:#f8fafc; border-bottom:1px solid #e2e8f0; }
    th { padding:.65rem 1rem; color:#64748b; font-size:.72rem; font-weight:700; text-transform:uppercase; letter-spacing:.06em; white-space:nowrap; }
    td { padding:.65rem 1rem; border-bottom:1px solid #f1f5f9; color:#334155; }
    tbody tr:last-child td { border-bottom:0; }
    tbody tr:hover td { background:#f8faff; }
    .email-cell { color:#64748b; font-size:.83rem; }

    /* role chips */
    .role-chip { display:inline-block; font-size:.72rem; font-weight:700; padding:.2rem .55rem; border-radius:6px; text-transform:uppercase; letter-spacing:.05em; }
    .role-chip--superuser { background:#fef3c7; color:#92400e; }
    .role-chip--admin { background:#dbeafe; color:#1e40af; }
    .role-chip--user { background:#f1f5f9; color:#475569; }
    .role-chip--encuestador { background:#d1fae5; color:#065f46; }

    /* edit row */
    .edit-row td { background:#f0f8f4; }
    .cell-input { padding:.4rem .6rem; border:1px solid #8dcab8; border-radius:6px; font:inherit; font-size:.88rem; width:100%; }
    .cell-select { padding:.4rem .6rem; border:1px solid #8dcab8; border-radius:6px; font:inherit; font-size:.88rem; width:100%; }
    .edit-error-row td { padding:.25rem 1rem; background:#fff5f5; }

    /* status chip */
    .status-chip { display:inline-block; font-size:.72rem; font-weight:700; padding:.2rem .55rem; border-radius:6px; text-transform:uppercase; letter-spacing:.05em; }
    .status-chip--on { background:#d1fae5; color:#065f46; }
    .status-chip--off { background:#fee2e2; color:#991b1b; }

    /* inactive row */
    .row-inactive td { opacity:.55; }

    /* action buttons */
    .actions { text-align:right; white-space:nowrap; }
    .btn-edit { background:none; border:1px solid #e2e8f0; border-radius:6px; padding:.3rem .55rem; color:#64748b; cursor:pointer; font-size:.9rem; &:hover:not(:disabled) { background:#f1f5f9; color:#334155; } &:disabled { opacity:.35; cursor:default; } }
    .btn-save { background:#8dcab8; border:none; border-radius:6px; padding:.3rem .6rem; color:#0d2b24; font-weight:700; cursor:pointer; font-size:.9rem; &:hover { background:#6baa96; } &:disabled { opacity:.5; cursor:default; } }
    .btn-cancel { background:none; border:1px solid #fca5a5; border-radius:6px; padding:.3rem .55rem; color:#b42318; cursor:pointer; font-size:.9rem; margin-left:.35rem; &:hover { background:#fff5f5; } }
    .btn-baja { background:none; border:1px solid #fca5a5; border-radius:6px; padding:.3rem .55rem; color:#b42318; cursor:pointer; font-size:.9rem; margin-left:.35rem; &:hover:not(:disabled) { background:#fff5f5; } &:disabled { opacity:.35; cursor:default; } }
    .btn-reactivar { background:none; border:1px solid #8dcab8; border-radius:6px; padding:.3rem .55rem; color:#065f46; cursor:pointer; font-size:.9rem; margin-left:.35rem; &:hover:not(:disabled) { background:#d1fae5; } &:disabled { opacity:.35; cursor:default; } }

    /* paginator */
    .paginator { display:flex; align-items:center; gap:.35rem; margin-top:1rem; flex-wrap:wrap; }
    .page-btn { background:none; border:1px solid #e2e8f0; border-radius:6px; min-width:2rem; padding:.3rem .5rem; font-size:.82rem; color:#64748b; cursor:pointer; &:hover:not(:disabled) { background:#f1f5f9; color:#334155; } &:disabled { opacity:.35; cursor:default; } }
    .page-btn--active { background:#8dcab8; border-color:#8dcab8; color:#0d2b24; font-weight:700; }
    .page-info { margin-left:.5rem; font-size:.8rem; color:#94a3b8; }

    @media(max-width:650px) {
      .create-form { grid-template-columns:1fr; }
      .full-row { grid-column:1; }
      .table-wrap { overflow-x:auto; -webkit-overflow-scrolling:touch; }
      table { min-width:520px; }
      .panel { padding:.875rem .75rem; }
      h1 { font-size:1.4rem; }
      .search-input { width:100%; }
      .panel-head { flex-direction:column; align-items:flex-start; }
    }
  `],
})
export class UsersComponent implements OnInit {
  users: ManagedUser[] = [];
  filtered: ManagedUser[] = [];
  page: ManagedUser[] = [];
  estudios: Estudio[] = [];
  surveysForFeria: ActiveSurvey[] = [];
  respondentGroups: RespondentGroup[] = [];

  // create form
  showCreate = false;
  displayName = '';
  email = '';
  password = '';
  role: ManagedUser['role'] = 'user';
  feriaId = '';
  surveyId = '';
  grupoEncuestado = '';
  createError = '';
  createSuccess = '';
  busy = false;
  loadingEstudios = false;
  loadingSurveys = false;
  loadingUsers = false;

  // edit
  editId: string | null = null;
  editName = '';
  editRole: ManagedUser['role'] = 'user';
  editError = '';
  savingEdit = false;

  // dar de baja / reactivar
  togglingId: string | null = null;

  // search & pagination
  search = '';
  currentPage = 0;
  readonly pageSize = PAGE_SIZE;

  get totalPages(): number {
    return Math.ceil(this.filtered.length / this.pageSize);
  }

  get pageNumbers(): number[] {
    const total = this.totalPages;
    const cur = this.currentPage;
    const start = Math.max(0, Math.min(cur - 2, total - 5));
    const end = Math.min(total, start + 5);
    return Array.from({ length: end - start }, (_, i) => start + i);
  }

  get pageEnd(): number {
    return Math.min((this.currentPage + 1) * this.pageSize, this.filtered.length);
  }

  get canSubmit(): boolean {
    if (this.role === 'encuestador') return !!this.feriaId && !!this.surveyId && !!this.grupoEncuestado;
    return true;
  }

  constructor(
    readonly auth: AuthService,
    private readonly http: HttpClient,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    void this.loadUsers();
    void this.loadRespondentGroups();
    void this.loadEstudios();
  }

  onRoleChange(): void {
    this.feriaId = '';
    this.surveyId = '';
    this.surveysForFeria = [];
    this.grupoEncuestado = '';
  }

  onFeriaChange(): void {
    this.surveyId = '';
    this.surveysForFeria = [];
    if (!this.feriaId) return;
    void this.loadSurveysForFeria();
  }

  onSearch(): void {
    this.currentPage = 0;
    this.applyFilter();
  }

  goTo(page: number): void {
    this.currentPage = page;
    this.updatePage();
  }

  startEdit(u: ManagedUser): void {
    this.editId = u.id;
    this.editName = u.display_name;
    this.editRole = u.role;
    this.editError = '';
  }

  cancelEdit(): void {
    this.editId = null;
    this.editError = '';
  }

  async saveEdit(u: ManagedUser): Promise<void> {
    this.editError = '';
    this.savingEdit = true;
    try {
      const updated = await firstValueFrom(
        this.http.put<ManagedUser>(`/api/users/${u.id}`, {
          displayName: this.editName,
          role: this.editRole,
        }),
      );
      const idx = this.users.findIndex((x) => x.id === u.id);
      if (idx !== -1) this.users[idx] = updated;
      this.applyFilter();
      this.editId = null;
    } catch (err: any) {
      this.editError = err?.error?.error ?? 'No se pudo guardar el cambio.';
    } finally {
      this.savingEdit = false;
      this.cdr.markForCheck();
    }
  }

  async loadUsers(): Promise<void> {
    this.loadingUsers = true;
    this.cdr.markForCheck();
    try {
      this.users = await firstValueFrom(this.http.get<ManagedUser[]>('/api/users'));
      this.applyFilter();
    } catch {
      this.createError = 'No se pudo cargar la lista de usuarios.';
    } finally {
      this.loadingUsers = false;
      this.cdr.markForCheck();
    }
  }

  async loadEstudios(): Promise<void> {
    this.loadingEstudios = true;
    this.cdr.markForCheck();
    try {
      this.estudios = await firstValueFrom(this.http.get<Estudio[]>('/api/estudios'));
    } catch {
      this.estudios = [];
    } finally {
      this.loadingEstudios = false;
      this.cdr.markForCheck();
    }
  }

  async loadSurveysForFeria(): Promise<void> {
    if (!this.feriaId) return;
    this.loadingSurveys = true;
    this.surveysForFeria = [];
    this.cdr.markForCheck();
    try {
      const detail = await firstValueFrom(
        this.http.get<{ surveys: ActiveSurvey[] }>(`/api/estudios/${this.feriaId}`),
      );
      this.surveysForFeria = (detail.surveys ?? []).filter((s) => s.status === 'active');
    } catch {
      this.surveysForFeria = [];
    } finally {
      this.loadingSurveys = false;
      this.cdr.markForCheck();
    }
  }

  async loadRespondentGroups(): Promise<void> {
    try {
      this.respondentGroups = await firstValueFrom(
        this.http.get<RespondentGroup[]>('/api/respondent-groups'),
      );
    } catch {
      this.respondentGroups = [];
    } finally {
      this.cdr.markForCheck();
    }
  }

  async createUser(): Promise<void> {
    this.createError = '';
    this.createSuccess = '';
    this.busy = true;
    try {
      const created = await firstValueFrom(this.http.post<{ id: string }>('/api/users', {
        displayName: this.displayName,
        email: this.email,
        password: this.password,
        role: this.role,
      }));
      if (this.role === 'encuestador' && this.surveyId && this.grupoEncuestado) {
        await firstValueFrom(
          this.http.post(`/api/surveys/${this.surveyId}/asignaciones`, {
            usuarioId: created.id,
            grupoEncuestado: this.grupoEncuestado,
          }),
        );
      }
      this.displayName = '';
      this.email = '';
      this.password = '';
      this.role = 'user';
      this.feriaId = '';
      this.surveyId = '';
      this.surveysForFeria = [];
      this.grupoEncuestado = '';
      this.createSuccess = 'La cuenta fue creada.';
      await this.loadUsers();
    } catch (err: any) {
      const msg: string = err?.error?.error ?? '';
      this.createError = msg || 'No se pudo crear la cuenta. Verifica los datos y que el correo no esté registrado.';
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }

  async toggleActivo(u: ManagedUser, activo: boolean): Promise<void> {
    this.togglingId = u.id;
    this.cdr.markForCheck();
    try {
      const updated = await firstValueFrom(
        this.http.patch<ManagedUser>(`/api/users/${u.id}/activo`, { activo }),
      );
      const idx = this.users.findIndex((x) => x.id === u.id);
      if (idx !== -1) this.users[idx] = updated;
      this.applyFilter();
    } catch (err: any) {
      alert(err?.error?.error ?? 'No se pudo cambiar el estado del usuario.');
    } finally {
      this.togglingId = null;
      this.cdr.markForCheck();
    }
  }

  roleLabel(role: ManagedUser['role']): string {
    const labels: Record<ManagedUser['role'], string> = {
      superuser: 'Superusuario',
      admin: 'Administrador',
      user: 'Usuario',
      encuestador: 'Encuestador',
    };
    return labels[role] ?? role;
  }

  private applyFilter(): void {
    const q = this.search.toLowerCase().trim();
    this.filtered = q
      ? this.users.filter(
          (u) => u.display_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
        )
      : [...this.users];
    this.currentPage = Math.min(this.currentPage, Math.max(0, this.totalPages - 1));
    this.updatePage();
    this.cdr.markForCheck();
  }

  private updatePage(): void {
    const start = this.currentPage * this.pageSize;
    this.page = this.filtered.slice(start, start + this.pageSize);
    this.cdr.markForCheck();
  }
}
