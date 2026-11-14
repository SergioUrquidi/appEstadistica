import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ButtonComponent } from '../shared/button.component';

interface Grupo {
  id: string;
  nombre: string;
  etiqueta: string;
  icono: string;
  orden: number;
  activo: boolean;
  creado_en: string;
}

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonComponent],
  template: `
    <div class="max-w-4xl mx-auto px-4 py-8">

      <!-- Header -->
      <div class="mb-8">
        <p class="text-xs font-extrabold tracking-widest uppercase text-blue-600 mb-1">Panel de administración</p>
        <h1 class="text-3xl font-bold text-slate-900">Configuración</h1>
        <p class="text-slate-500 text-sm mt-1">Gestiona grupos, encuestas y configuración del sistema.</p>
      </div>

      <!-- Tabs -->
      <div class="flex gap-1 mb-6 border-b border-slate-200">
        <app-button
          *ngFor="let tab of tabs"
          [variant]="activeTab === tab.id ? 'tab-active' : 'tab'"
          (click)="activeTab = tab.id"
        >
          {{ tab.label }}
        </app-button>
      </div>

      <!-- TAB: Grupos -->
      <div *ngIf="activeTab === 'grupos'">

        <!-- Toolbar -->
        <div class="flex items-center justify-between mb-5">
          <h2 class="text-base font-semibold text-slate-700">Grupos de encuesta</h2>
          <app-button
            (click)="openCreate()"
          >
            <span class="text-lg leading-none">+</span> Nuevo grupo
          </app-button>
        </div>

        <!-- Error banner -->
        <div *ngIf="tableError" class="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {{ tableError }}
        </div>

        <!-- Loading -->
        <div *ngIf="loading" class="text-center py-12 text-slate-400 text-sm">Cargando grupos…</div>

        <!-- Table -->
        <div *ngIf="!loading" class="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <table class="w-full text-sm">
            <thead class="bg-slate-50 border-b border-slate-200">
              <tr>
                <th class="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-10">#</th>
                <th class="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Icono</th>
                <th class="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Nombre</th>
                <th class="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Etiqueta</th>
                <th class="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Estado</th>
                <th class="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr *ngIf="grupos.length === 0">
                <td colspan="6" class="text-center py-10 text-slate-400">No hay grupos registrados.</td>
              </tr>
              <tr *ngFor="let g of grupos" class="hover:bg-slate-50 transition-colors">
                <td class="px-4 py-3 text-slate-400 font-mono text-xs">{{ g.orden }}</td>
                <td class="px-4 py-3 text-xl">{{ g.icono }}</td>
                <td class="px-4 py-3 font-medium text-slate-800">{{ g.nombre }}</td>
                <td class="px-4 py-3 text-slate-600">{{ g.etiqueta }}</td>
                <td class="px-4 py-3">
                  <span
                    [class]="g.activo
                      ? 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700'
                      : 'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500'"
                  >
                    {{ g.activo ? 'Activo' : 'Inactivo' }}
                  </span>
                </td>
                <td class="px-4 py-3 text-right">
                  <div class="flex items-center justify-end gap-2">
                    <app-button
                      (click)="openEdit(g)"
                      variant="secondary"
                    >Editar</app-button>
                    <app-button
                      (click)="confirmDelete(g)"
                      variant="danger"
                    >Eliminar</app-button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </div>

    <!-- MODAL: Crear / Editar grupo -->
    <div
      *ngIf="modal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      (click)="closeModal()"
    >
      <div
        class="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
        (click)="$event.stopPropagation()"
      >
        <div class="flex items-center justify-between mb-5">
          <h3 class="text-lg font-bold text-slate-900">{{ modal === 'create' ? 'Nuevo grupo' : 'Editar grupo' }}</h3>
          <app-button (click)="closeModal()" variant="quiet">Cerrar</app-button>
        </div>

        <form (ngSubmit)="submitForm()" class="space-y-4">

          <div *ngIf="modal === 'create'">
            <label class="block text-xs font-semibold text-slate-600 mb-1">Nombre interno <span class="text-red-500">*</span></label>
            <input
              name="nombre"
              [(ngModel)]="form.nombre"
              required
              maxlength="50"
              placeholder="ej. docentes"
              class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
            <p class="text-xs text-slate-400 mt-1">Solo letras minúsculas, sin espacios. No se puede cambiar después.</p>
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-600 mb-1">Etiqueta visible <span class="text-red-500">*</span></label>
            <input
              name="etiqueta"
              [(ngModel)]="form.etiqueta"
              required
              maxlength="100"
              placeholder="ej. Docentes"
              class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Icono (emoji)</label>
              <input
                name="icono"
                [(ngModel)]="form.icono"
                maxlength="10"
                placeholder="📊"
                class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-center text-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Orden</label>
              <input
                name="orden"
                type="number"
                [(ngModel)]="form.orden"
                min="0"
                max="99"
                class="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
            </div>
          </div>

          <div *ngIf="modal === 'edit'" class="flex items-center gap-3 p-3 rounded-lg bg-slate-50">
            <label class="relative inline-flex cursor-pointer">
              <input type="checkbox" name="activo" [(ngModel)]="form.activo" class="sr-only peer">
              <div class="w-10 h-5 bg-slate-200 peer-checked:bg-blue-600 rounded-full transition-colors peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:w-4 after:h-4 after:transition-all"></div>
            </label>
            <span class="text-sm font-medium text-slate-700">{{ form.activo ? 'Activo' : 'Inactivo' }}</span>
          </div>

          <div *ngIf="formError" class="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-xs text-red-700">
            {{ formError }}
          </div>

          <div class="flex gap-3 pt-2">
            <app-button
              variant="secondary"
              type="button"
              (click)="closeModal()"
              class="flex-1"
            >Cancelar</app-button>
            <app-button
              variant="primary"
              type="submit"
              [disabled]="busy"
              class="flex-1"
            >{{ busy ? 'Guardando…' : (modal === 'create' ? 'Crear grupo' : 'Guardar cambios') }}</app-button>
          </div>
        </form>
      </div>
    </div>

    <!-- MODAL: Confirmar eliminación -->
    <div
      *ngIf="deleteTarget"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      (click)="deleteTarget = null"
    >
      <div
        class="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center"
        (click)="$event.stopPropagation()"
      >
        <div class="text-4xl mb-3">⚠️</div>
        <h3 class="text-lg font-bold text-slate-900 mb-2">¿Eliminar grupo?</h3>
        <p class="text-sm text-slate-500 mb-6">
          Se eliminará <strong>{{ deleteTarget.etiqueta }}</strong> permanentemente.
          No podrá hacerse si tiene encuestas activas.
        </p>
        <div class="flex gap-3">
          <app-button
            variant="secondary"
            (click)="deleteTarget = null"
            class="flex-1"
          >Cancelar</app-button>
          <app-button
            variant="danger"
            (click)="doDelete()"
            [disabled]="busy"
            class="flex-1"
          >{{ busy ? 'Eliminando…' : 'Sí, eliminar' }}</app-button>
        </div>
      </div>
    </div>
  `,
})
export class AdminComponent implements OnInit {
  activeTab = 'grupos';
  tabs = [{ id: 'grupos', label: 'Grupos' }];

  grupos: Grupo[] = [];
  loading = true;
  tableError = '';

  modal: 'create' | 'edit' | null = null;
  editId = '';
  form = { nombre: '', etiqueta: '', icono: '📊', orden: 0, activo: true };
  formError = '';
  busy = false;

  deleteTarget: Grupo | null = null;

  constructor(
    private readonly http: HttpClient,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  async ngOnInit(): Promise<void> {
    await this.loadGrupos();
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
