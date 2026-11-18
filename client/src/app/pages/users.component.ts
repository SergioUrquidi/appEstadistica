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
  created_at: string;
}

interface ActiveSurvey {
  id: string;
  title: string;
  group_label: string;
}

interface RespondentGroup {
  value: string;
  label: string;
}

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
    <section class="panel">
      <h2>Crear cuenta</h2>
      <form (ngSubmit)="createUser()">
        <label>Nombre
          <input name="displayName" [(ngModel)]="displayName" maxlength="120" required>
        </label>
        <label>Correo electrónico
          <input name="email" type="email" [(ngModel)]="email" maxlength="254" required>
        </label>
        <label>Contraseña temporal (mínimo 12 caracteres)
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
          <label class="full-row">
            Encuesta asignada
            <select name="surveyId" [(ngModel)]="surveyId" required>
              <option value="">— Selecciona una encuesta —</option>
              @for (s of activeSurveys; track s.id) {
                <option [value]="s.id">{{ s.title }} ({{ s.group_label }})</option>
              }
            </select>
            @if (loadingSurveys) { <span class="hint">Cargando encuestas…</span> }
          </label>
          <label>
            Tipo de encuestado
            <select name="grupoEncuestado" [(ngModel)]="grupoEncuestado" required>
              <option value="">— Selecciona el tipo —</option>
              @for (g of respondentGroups; track g.value) {
                <option [value]="g.value">{{ g.label }}</option>
              }
            </select>
          </label>
        }

        @if (error) { <p class="error" role="alert">{{ error }}</p> }
        @if (success) { <p class="success" role="status">{{ success }}</p> }
        <app-button type="submit" [disabled]="busy || !canSubmit">{{ busy ? 'Creando…' : 'Crear usuario' }}</app-button>
      </form>
    </section>
    <section class="panel">
      <h2>Cuentas existentes</h2>
      @if (users.length) {
        <div class="table-wrap"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Creado</th></tr></thead>
          <tbody>@for (user of users; track user.id) { <tr><td>{{ user.display_name }}</td><td>{{ user.email }}</td><td>{{ roleLabel(user.role) }}</td><td>{{ user.created_at | date:'mediumDate' }}</td></tr> }</tbody>
        </table></div>
      } @else { <p class="muted">No hay usuarios para mostrar.</p> }
    </section>
  `,
  styles: [`
    .page-head { margin:1.5rem 0 2rem; }
    h1 { margin:.25rem 0; font-size:clamp(1.5rem,4vw,2rem); }
    h2 { margin:.2rem 0 1rem; font-size:1.15rem; }
    .eyebrow { color:#8dcab8; font-size:.75rem; font-weight:800; letter-spacing:.12em; text-transform:uppercase; }
    .muted { color:#64748b; }
    .panel { margin:1rem 0; padding:1.25rem; border:1px solid #e2e8f0; border-radius:14px; background:white; }
    form { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:1rem; margin-top:1rem; }
    label { display:grid; gap:.4rem; color:#334155; font-size:.86rem; font-weight:700; }
    .full-row { grid-column:1/-1; }
    input,select { width:100%; padding:.7rem; border:1px solid #cbd5e1; border-radius:8px; font:inherit; }
    .hint { font-size:.78rem; font-weight:400; color:#64748b; }
    app-button { grid-column:1/-1; justify-self:start; }
    .table-wrap { overflow-x:auto; margin-top:.5rem; }
    table { width:100%; border-collapse:collapse; text-align:left; font-size:.9rem; }
    thead { background:#f8fafc; border-bottom:1px solid #e2e8f0; }
    th { padding:.75rem 1rem; color:#64748b; font-size:.75rem; font-weight:700; text-transform:uppercase; letter-spacing:.06em; white-space:nowrap; }
    td { padding:.75rem 1rem; border-bottom:1px solid #f1f5f9; white-space:nowrap; color:#334155; }
    tbody tr:last-child td { border-bottom:0; }
    tbody tr:hover td { background:#f8faff; }
    .error { color:#b42318; grid-column:1/-1; }
    .success { color:#166534; grid-column:1/-1; }
    @media(max-width:650px) {
      form { grid-template-columns:1fr; }
      .full-row { grid-column:1; }
      .table-wrap { overflow-x:auto; -webkit-overflow-scrolling:touch; }
      table { min-width:480px; }
      .panel { padding:.875rem .75rem; }
      h1 { font-size:1.4rem; }
    }
  `],
})
export class UsersComponent implements OnInit {
  users: ManagedUser[] = [];
  activeSurveys: ActiveSurvey[] = [];
  respondentGroups: RespondentGroup[] = [];

  displayName = '';
  email = '';
  password = '';
  role: ManagedUser['role'] = 'user';
  surveyId = '';
  grupoEncuestado = '';

  error = '';
  success = '';
  busy = false;
  loadingSurveys = false;

  get canSubmit(): boolean {
    if (this.role === 'encuestador') {
      return !!this.surveyId && !!this.grupoEncuestado;
    }
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
  }

  onRoleChange(): void {
    this.surveyId = '';
    this.grupoEncuestado = '';
    if (this.role === 'encuestador' && !this.activeSurveys.length) {
      void this.loadActiveSurveys();
    }
  }

  async loadUsers(): Promise<void> {
    try {
      this.users = await firstValueFrom(this.http.get<ManagedUser[]>('/api/users'));
    } catch {
      this.error = 'No se pudo cargar la lista de usuarios.';
    } finally {
      this.cdr.markForCheck();
    }
  }

  async loadActiveSurveys(): Promise<void> {
    this.loadingSurveys = true;
    this.cdr.markForCheck();
    try {
      const all = await firstValueFrom(this.http.get<ActiveSurvey[]>('/api/surveys'));
      this.activeSurveys = all.filter((s: any) => s.status === 'active');
    } catch {
      this.activeSurveys = [];
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
    this.error = '';
    this.success = '';
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
      this.surveyId = '';
      this.grupoEncuestado = '';
      this.success = 'La cuenta fue creada.';
      await this.loadUsers();
    } catch (err: any) {
      const msg: string = err?.error?.error ?? '';
      if (msg) {
        this.error = msg;
      } else {
        this.error = 'No se pudo crear la cuenta. Verifica los datos y que el correo no esté registrado.';
      }
    } finally {
      this.busy = false;
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
}
