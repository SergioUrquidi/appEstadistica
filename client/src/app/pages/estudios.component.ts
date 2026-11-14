import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../core/auth.service';
import { Group, Study, SurveyMode } from '../core/models';
import { ButtonComponent } from '../shared/button.component';

@Component({
  selector: 'app-estudios',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ButtonComponent],
  template: `
    <header class="page-head">
      <div>
        <p class="eyebrow">Sistema de evaluación</p>
        <h1>Ferias por turno</h1>
        @if (loading) {
          <p class="muted">Cargando grupos…</p>
        } @else if (groups.length > 0) {
          <p class="muted">Grupos disponibles: {{ groupSummary }}</p>
        }
      </div>
      @if (canCreate) {
        <app-button (click)="showForm = !showForm" variant="secondary">
          {{ showForm ? 'Cancelar' : '+ Nueva feria' }}
        </app-button>
      }
    </header>

    @if (showForm) {
      <section class="panel form-panel">
        <h2>Crear feria</h2>
        <form class="study-form" (ngSubmit)="createStudy()">
          <label class="wide">Título de la feria
            <input name="title" [(ngModel)]="form.title" maxlength="200" placeholder="Ej. Feria de Fin de Módulo 1" required>
          </label>
          <label>Turno
            <select name="shift" [(ngModel)]="form.shift" required>
              <option value="mañana">Mañana (8:30 – 12:00)</option>
              <option value="noche">Noche (19:00 – 22:00)</option>
            </select>
          </label>
          <label>Enfoque de las encuestas
            <select name="modeCode" [(ngModel)]="form.modeCode" required>
              <option value="" disabled>Selecciona el enfoque</option>
              @for (mode of modes; track mode.code) {
                <option [value]="mode.code">{{ mode.label }}</option>
              }
            </select>
          </label>
          <label>Fecha (opcional)
            <input name="date" type="date" [(ngModel)]="form.date">
          </label>
          @if (selectedMode) { <p class="muted wide">{{ selectedMode.description }}</p> }
          <label class="wide">Descripción (opcional)
            <textarea name="description" [(ngModel)]="form.description" rows="2" maxlength="5000"></textarea>
          </label>
          <div class="wide groups-select">
            <span class="groups-label">Grupos a encuestar</span>
            <div class="groups-checks">
              @for (group of groups; track group.id) {
                <label class="check-item">
                  <input type="checkbox"
                    [checked]="isGroupSelected(group.nombre)"
                    (change)="toggleGroup(group.nombre)">
                  <span>{{ group.icono }} {{ group.etiqueta }}</span>
                </label>
              }
            </div>
          </div>
          @if (formError) { <p class="error wide" role="alert">{{ formError }}</p> }
          <app-button type="submit" class="wide" [disabled]="busy || !form.modeCode || selectedGroupNames.size === 0">
            {{ busy ? 'Creando…' : 'Crear feria y ' + selectedGroupNames.size + ' encuesta' + (selectedGroupNames.size !== 1 ? 's' : '') }}
          </app-button>
        </form>
      </section>
    }

    @if (studies.length === 0 && !loading) {
      <div class="empty-state">
        <p>No hay ferias registradas aún.</p>
        @if (canCreate) { <p class="muted">Creá la primera con el botón "Nueva feria".</p> }
      </div>
    }

    <div class="study-grid">
      @for (study of studies; track study.id) {
        <a class="study-card" [routerLink]="['/estudios', study.id]">
          <div class="study-card-top">
            <span class="shift-badge" [class.shift-noche]="study.shift === 'noche'">
              {{ study.shift === 'mañana' ? '☀ Mañana' : '☾ Noche' }}
            </span>
            <span class="status-badge" [class.status-activo]="study.status === 'activo'" [class.status-cerrado]="study.status === 'cerrado'">
              {{ statusLabel(study.status) }}
            </span>
          </div>
          <h3>{{ study.title }}</h3>
          @if (study.date) { <p class="study-date">{{ study.date | date:'dd/MM/yyyy' }}</p> }
          <div class="study-meta">
            <span>{{ study.response_count ?? 0 }} respuestas</span>
          </div>
        </a>
      }
    </div>
  `,
  styles: [`
    .page-head { display:flex; align-items:flex-start; justify-content:space-between; gap:1rem; margin-bottom:1.75rem; flex-wrap:wrap; }
    h1 { margin:.25rem 0 .5rem; font-size:clamp(1.5rem,4vw,2rem); }
    .eyebrow { color:#185adb; font-size:.72rem; font-weight:800; letter-spacing:.12em; text-transform:uppercase; margin:0 0 .2rem; }
    .muted { color:#64748b; margin:0; font-size:.88rem; }

    .form-panel { background:#fff; border:1px solid #e2e8f0; border-radius:14px; padding:1.5rem; margin-bottom:1.5rem; }
    .form-panel h2 { margin:0 0 1.2rem; font-size:1.1rem; }
    .study-form { display:grid; grid-template-columns:1fr 1fr; gap:1rem; }
    .study-form label { display:grid; gap:.45rem; font-size:.85rem; font-weight:600; color:#334155; }
    .study-form .wide { grid-column:1/-1; }
    .study-form input, .study-form select, .study-form textarea {
      padding:.7rem .9rem; border:1px solid #cbd5e1; border-radius:8px; font:inherit; resize:vertical;
    }
    .error { color:#b42318; font-size:.82rem; }

    .groups-select { display:flex; flex-direction:column; gap:.5rem; }
    .groups-label { font-size:.85rem; font-weight:600; color:#334155; }
    .groups-checks { display:flex; flex-wrap:wrap; gap:.5rem; }
    .check-item { display:flex; align-items:center; gap:.4rem; font-size:.85rem; font-weight:500; color:#334155;
      background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:.4rem .75rem; cursor:pointer; }
    .check-item input { accent-color:#185adb; cursor:pointer; }

    .empty-state { text-align:center; padding:3rem 1rem; color:#64748b; }

    .study-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:1.1rem; }
    .study-card {
      display:block; background:#fff; border:1px solid #e2e8f0; border-radius:14px;
      padding:1.25rem; text-decoration:none; color:inherit;
      transition:box-shadow .15s, border-color .15s;
    }
    .study-card:hover { box-shadow:0 4px 20px rgba(0,0,0,.08); border-color:#94a3b8; }
    .study-card-top { display:flex; gap:.5rem; margin-bottom:.75rem; flex-wrap:wrap; }
    .study-card h3 { margin:0 0 .4rem; font-size:1rem; color:#0f172a; }
    .study-date { margin:0 0 .75rem; color:#64748b; font-size:.8rem; }
    .study-meta { color:#64748b; font-size:.8rem; }

    .shift-badge, .status-badge {
      display:inline-block; padding:.25rem .65rem; border-radius:99px;
      font-size:.7rem; font-weight:700; letter-spacing:.04em;
    }
    .shift-badge { background:#eff6ff; color:#1d4ed8; }
    .shift-badge.shift-noche { background:#1e1b4b; color:#a5b4fc; }
    .status-badge { background:#f1f5f9; color:#475569; }
    .status-badge.status-activo { background:#dcfce7; color:#166534; }
    .status-badge.status-cerrado { background:#f1f5f9; color:#94a3b8; }

    @media(max-width:640px) { .study-form { grid-template-columns:1fr; } .study-form .wide { grid-column:1; } }
  `],
})
export class EstudiosComponent implements OnInit {
  studies: Study[] = [];
  groups: Group[] = [];
  modes: SurveyMode[] = [];
  selectedGroupNames = new Set<string>();
  loading = true;
  busy = false;
  showForm = false;
  formError = '';
  form = { title: '', description: '', shift: 'mañana', date: '', modeCode: '' };

  get groupSummary(): string {
    return this.groups.map((g) => g.etiqueta).join(' · ');
  }

  constructor(
    private readonly http: HttpClient,
    readonly auth: AuthService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  get canCreate(): boolean {
    const user = this.auth.user();
    return user?.role === 'admin' || user?.role === 'superuser';
  }

  async ngOnInit(): Promise<void> {
    try {
      [this.studies, this.groups, this.modes] = await Promise.all([
        firstValueFrom(this.http.get<Study[]>('/api/estudios')),
        firstValueFrom(this.http.get<Group[]>('/api/grupos')),
        firstValueFrom(this.http.get<SurveyMode[]>('/api/survey-modes')),
      ]);
      this.selectedGroupNames = new Set(this.groups.map((g) => g.nombre));
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  toggleGroup(nombre: string): void {
    if (this.selectedGroupNames.has(nombre)) {
      this.selectedGroupNames.delete(nombre);
    } else {
      this.selectedGroupNames.add(nombre);
    }
    this.selectedGroupNames = new Set(this.selectedGroupNames);
  }

  isGroupSelected(nombre: string): boolean {
    return this.selectedGroupNames.has(nombre);
  }

  async createStudy(): Promise<void> {
    if (!this.form.title.trim() || !this.form.shift || !this.form.modeCode || this.selectedGroupNames.size === 0) return;
    this.busy = true;
    this.formError = '';
    try {
      const created = await firstValueFrom(this.http.post<Study>('/api/estudios', {
        title: this.form.title.trim(),
        description: this.form.description.trim(),
        shift: this.form.shift,
        modeCode: this.form.modeCode,
        date: this.form.date || undefined,
        groups: Array.from(this.selectedGroupNames),
      }));
      this.studies = [created, ...this.studies];
      this.showForm = false;
      this.form = { title: '', description: '', shift: 'mañana', date: '', modeCode: '' };
      this.selectedGroupNames = new Set(this.groups.map((g) => g.nombre));
    } catch {
      this.formError = 'No se pudo crear la feria. Verificá los datos e intentá nuevamente.';
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }

  statusLabel(status: string): string {
    return status === 'activo' ? 'Activo' : status === 'cerrado' ? 'Cerrado' : 'Borrador';
  }

  get selectedMode(): SurveyMode | null {
    return this.modes.find((mode) => mode.code === this.form.modeCode) ?? null;
  }
}
