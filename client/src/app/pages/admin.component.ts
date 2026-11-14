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

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  styles: [`
    .tab-btn { transition: color .15s, border-color .15s; }
    .row-hover:hover { background: #f8faff; }
    .btn-icon { line-height: 1; }
    .toggle-track { position: relative; display: inline-flex; align-items: center; width: 40px; height: 22px; border-radius: 999px; background: #cbd5e1; cursor: pointer; transition: background .2s; }
    .toggle-track.on { background: var(--color-action); }
    .toggle-thumb { position: absolute; left: 3px; top: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: transform .2s; box-shadow: 0 1px 3px rgba(0,0,0,.2); }
    .toggle-track.on .toggle-thumb { transform: translateX(18px); }
  `],
  template: `
    <div class="max-w-5xl mx-auto px-6 py-10">

      <!-- Page header -->
      <div class="mb-8">
        <p class="text-xs font-semibold tracking-widest uppercase mb-1" style="color:var(--color-action)">
          Panel de administración
        </p>
        <h1 class="text-3xl font-bold tracking-tight" style="color:#0f172a">Configuración</h1>
        <p class="mt-1 text-sm" style="color:#64748b">
          Gestiona grupos, encuestas y otros recursos del sistema.
        </p>
      </div>

      <!-- Tabs -->
      <div class="flex gap-1 border-b mb-8" style="border-color:#e2e8f0">
        <button
          *ngFor="let tab of tabs"
          (click)="activeTab = tab.id"
          class="tab-btn px-4 py-2.5 text-sm font-medium -mb-px border-b-2"
          [style]="activeTab === tab.id
            ? 'color:var(--color-action);border-color:var(--color-action)'
            : 'color:#94a3b8;border-color:transparent'"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- TAB: Grupos -->
      <div *ngIf="activeTab === 'grupos'">

        <!-- Toolbar -->
        <div class="flex items-center justify-between mb-5">
          <div>
            <h2 class="text-base font-semibold" style="color:#1e293b">Grupos de encuesta</h2>
            <p class="text-xs mt-0.5" style="color:#94a3b8">
              {{ grupos.length }} grupo{{ grupos.length !== 1 ? 's' : '' }} registrado{{ grupos.length !== 1 ? 's' : '' }}
            </p>
          </div>
          <button
            (click)="openCreate()"
            class="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
            style="background:var(--color-action)"
            onmouseenter="this.style.background='var(--color-action-hover)'"
            onmouseleave="this.style.background='var(--color-action)'"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
            </svg>
            Nuevo grupo
          </button>
        </div>

        <!-- Error banner -->
        <div *ngIf="tableError"
          class="mb-5 flex items-start gap-3 rounded-xl px-4 py-3 text-sm"
          style="background:#fef2f2;color:var(--color-danger);border:1px solid #fecaca">
          <svg class="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-5.25a.75.75 0 001.5 0V8a.75.75 0 00-1.5 0v4.75zm.75-7a.75.75 0 100 1.5.75.75 0 000-1.5z" clip-rule="evenodd"/>
          </svg>
          {{ tableError }}
        </div>

        <!-- Loading -->
        <div *ngIf="loading" class="text-center py-16">
          <div class="inline-block w-6 h-6 rounded-full border-2 border-blue-200 border-t-blue-500 animate-spin mb-3"></div>
          <p class="text-sm" style="color:#94a3b8">Cargando grupos…</p>
        </div>

        <!-- Table card -->
        <div *ngIf="!loading" class="rounded-2xl overflow-hidden" style="border:1px solid #e2e8f0;box-shadow:0 1px 4px rgba(15,23,42,.06)">
          <table class="w-full text-sm">
            <thead style="background:#f8fafc;border-bottom:1px solid #e2e8f0">
              <tr>
                <th class="text-left px-5 py-3.5 text-xs font-semibold tracking-wider" style="color:#94a3b8;width:48px">#</th>
                <th class="text-left px-3 py-3.5 text-xs font-semibold tracking-wider" style="color:#94a3b8;width:52px">ICONO</th>
                <th class="text-left px-4 py-3.5 text-xs font-semibold tracking-wider" style="color:#94a3b8">NOMBRE</th>
                <th class="text-left px-4 py-3.5 text-xs font-semibold tracking-wider" style="color:#94a3b8">ETIQUETA</th>
                <th class="text-left px-4 py-3.5 text-xs font-semibold tracking-wider" style="color:#94a3b8">ESTADO</th>
                <th class="text-right px-5 py-3.5 text-xs font-semibold tracking-wider" style="color:#94a3b8">ACCIONES</th>
              </tr>
            </thead>
            <tbody style="background:#fff">
              <tr *ngIf="grupos.length === 0">
                <td colspan="6" class="text-center py-16" style="color:#94a3b8">
                  <svg class="w-10 h-10 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"/>
                  </svg>
                  No hay grupos registrados.
                </td>
              </tr>
              <tr *ngFor="let g of grupos; let last = last" class="row-hover"
                [style]="last ? '' : 'border-bottom:1px solid #f1f5f9'">
                <td class="px-5 py-4 font-mono text-xs" style="color:#cbd5e1">{{ g.orden }}</td>
                <td class="px-3 py-4 text-2xl leading-none">{{ g.icono }}</td>
                <td class="px-4 py-4 font-medium" style="color:#1e293b">{{ g.nombre }}</td>
                <td class="px-4 py-4" style="color:#475569">{{ g.etiqueta }}</td>
                <td class="px-4 py-4">
                  <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                    [style]="g.activo
                      ? 'background:#dcfce7;color:#15803d'
                      : 'background:#f1f5f9;color:#94a3b8'">
                    <span class="w-1.5 h-1.5 rounded-full inline-block"
                      [style]="'background:' + (g.activo ? '#22c55e' : '#cbd5e1')"></span>
                    {{ g.activo ? 'Activo' : 'Inactivo' }}
                  </span>
                </td>
                <td class="px-5 py-4 text-right">
                  <div class="inline-flex items-center gap-1">
                    <button (click)="openEdit(g)"
                      class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                      style="color:var(--color-action)"
                      onmouseenter="this.style.background='var(--color-action-soft)'"
                      onmouseleave="this.style.background='transparent'"
                    >Editar</button>
                    <button (click)="confirmDelete(g)"
                      class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                      style="color:var(--color-danger)"
                      onmouseenter="this.style.background='#fef2f2'"
                      onmouseleave="this.style.background='transparent'"
                    >Eliminar</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

      </div>
    </div>

    <!-- ───── MODAL crear / editar ───── -->
    <div *ngIf="modal"
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
      style="background:rgba(15,23,42,.45);backdrop-filter:blur(6px)"
      (click)="closeModal()">
      <div class="bg-white rounded-2xl w-full max-w-md p-7"
        style="box-shadow:0 24px 64px rgba(15,23,42,.18)"
        (click)="$event.stopPropagation()">

        <!-- Header modal -->
        <div class="flex items-start justify-between mb-6">
          <div>
            <h3 class="text-lg font-bold" style="color:#0f172a">
              {{ modal === 'create' ? 'Nuevo grupo' : 'Editar grupo' }}
            </h3>
            <p class="text-xs mt-0.5" style="color:#94a3b8">
              {{ modal === 'create' ? 'Completá los campos para crear un grupo.' : 'Modificá los campos que necesitás.' }}
            </p>
          </div>
          <button (click)="closeModal()"
            class="rounded-lg p-1.5 transition-colors"
            style="color:#94a3b8"
            onmouseenter="this.style.background='#f1f5f9'"
            onmouseleave="this.style.background='transparent'">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form (ngSubmit)="submitForm()" class="space-y-4">

          <!-- Nombre interno (solo crear) -->
          <div *ngIf="modal === 'create'">
            <label class="block text-xs font-semibold mb-1.5" style="color:#475569">
              Nombre interno <span style="color:var(--color-danger)">*</span>
            </label>
            <input name="nombre" [(ngModel)]="form.nombre" required maxlength="50"
              placeholder="ej. docentes"
              class="w-full rounded-xl px-3.5 py-2.5 text-sm transition-shadow"
              style="border:1.5px solid #e2e8f0;outline:none;color:#1e293b"
              onfocus="this.style.borderColor='var(--color-action)';this.style.boxShadow='0 0 0 3px rgba(24,90,219,.12)'"
              onblur="this.style.borderColor='#e2e8f0';this.style.boxShadow='none'">
            <p class="text-xs mt-1" style="color:#94a3b8">Solo minúsculas y guiones bajos. No se puede cambiar.</p>
          </div>

          <!-- Etiqueta -->
          <div>
            <label class="block text-xs font-semibold mb-1.5" style="color:#475569">
              Etiqueta visible <span style="color:var(--color-danger)">*</span>
            </label>
            <input name="etiqueta" [(ngModel)]="form.etiqueta" required maxlength="100"
              placeholder="ej. Docentes"
              class="w-full rounded-xl px-3.5 py-2.5 text-sm transition-shadow"
              style="border:1.5px solid #e2e8f0;outline:none;color:#1e293b"
              onfocus="this.style.borderColor='var(--color-action)';this.style.boxShadow='0 0 0 3px rgba(24,90,219,.12)'"
              onblur="this.style.borderColor='#e2e8f0';this.style.boxShadow='none'">
          </div>

          <!-- Icono + Orden -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold mb-1.5" style="color:#475569">Icono (emoji)</label>
              <input name="icono" [(ngModel)]="form.icono" maxlength="10"
                placeholder="📊"
                class="w-full rounded-xl px-3.5 py-2.5 text-sm text-center text-2xl transition-shadow"
                style="border:1.5px solid #e2e8f0;outline:none"
                onfocus="this.style.borderColor='var(--color-action)';this.style.boxShadow='0 0 0 3px rgba(24,90,219,.12)'"
                onblur="this.style.borderColor='#e2e8f0';this.style.boxShadow='none'">
            </div>
            <div>
              <label class="block text-xs font-semibold mb-1.5" style="color:#475569">Orden</label>
              <input name="orden" type="number" [(ngModel)]="form.orden" min="0" max="99"
                class="w-full rounded-xl px-3.5 py-2.5 text-sm transition-shadow"
                style="border:1.5px solid #e2e8f0;outline:none;color:#1e293b"
                onfocus="this.style.borderColor='var(--color-action)';this.style.boxShadow='0 0 0 3px rgba(24,90,219,.12)'"
                onblur="this.style.borderColor='#e2e8f0';this.style.boxShadow='none'">
            </div>
          </div>

          <!-- Toggle activo (solo editar) -->
          <div *ngIf="modal === 'edit'"
            class="flex items-center justify-between rounded-xl px-4 py-3"
            style="background:#f8fafc;border:1px solid #e2e8f0">
            <div>
              <p class="text-sm font-medium" style="color:#1e293b">Estado del grupo</p>
              <p class="text-xs mt-0.5" style="color:#94a3b8">{{ form.activo ? 'Visible para los usuarios' : 'Oculto del sistema' }}</p>
            </div>
            <button type="button" (click)="form.activo = !form.activo">
              <span class="toggle-track" [class.on]="form.activo">
                <span class="toggle-thumb"></span>
              </span>
            </button>
          </div>

          <!-- Error form -->
          <div *ngIf="formError"
            class="flex items-start gap-2.5 rounded-xl px-4 py-3 text-xs"
            style="background:#fef2f2;color:var(--color-danger);border:1px solid #fecaca">
            <svg class="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-5.25a.75.75 0 001.5 0V8a.75.75 0 00-1.5 0v4.75zm.75-7a.75.75 0 100 1.5.75.75 0 000-1.5z" clip-rule="evenodd"/>
            </svg>
            {{ formError }}
          </div>

          <!-- Botones -->
          <div class="flex gap-3 pt-2">
            <button type="button" (click)="closeModal()"
              class="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors"
              style="border:1.5px solid #e2e8f0;color:#475569;background:#fff"
              onmouseenter="this.style.background='#f8fafc'"
              onmouseleave="this.style.background='#fff'">
              Cancelar
            </button>
            <button type="submit" [disabled]="busy"
              class="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors"
              [style]="busy ? 'background:#94a3b8;cursor:not-allowed' : 'background:var(--color-action)'"
              (mouseenter)="!busy && $event.target && setStyle($event.target, 'background', 'var(--color-action-hover)')"
              (mouseleave)="!busy && $event.target && setStyle($event.target, 'background', 'var(--color-action)')"
            >
              {{ busy ? 'Guardando…' : (modal === 'create' ? 'Crear grupo' : 'Guardar cambios') }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- ───── MODAL confirmar eliminación ───── -->
    <div *ngIf="deleteTarget"
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
      style="background:rgba(15,23,42,.45);backdrop-filter:blur(6px)"
      (click)="deleteTarget = null">
      <div class="bg-white rounded-2xl w-full max-w-sm p-7 text-center"
        style="box-shadow:0 24px 64px rgba(15,23,42,.18)"
        (click)="$event.stopPropagation()">
        <div class="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style="background:#fef2f2">
          <svg class="w-7 h-7" style="color:var(--color-danger)" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/>
          </svg>
        </div>
        <h3 class="text-lg font-bold mb-1" style="color:#0f172a">¿Eliminar grupo?</h3>
        <p class="text-sm mb-6" style="color:#64748b">
          Se eliminará <strong style="color:#1e293b">{{ deleteTarget.etiqueta }}</strong> permanentemente.<br>
          <span class="text-xs mt-1 block" style="color:#94a3b8">No es posible si tiene encuestas activas.</span>
        </p>
        <div class="flex gap-3">
          <button (click)="deleteTarget = null"
            class="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors"
            style="border:1.5px solid #e2e8f0;color:#475569;background:#fff"
            onmouseenter="this.style.background='#f8fafc'"
            onmouseleave="this.style.background='#fff'">
            Cancelar
          </button>
          <button (click)="doDelete()" [disabled]="busy"
            class="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors"
            [style]="busy ? 'background:#94a3b8' : 'background:var(--color-danger)'"
            onmouseenter="this.style.background='var(--color-danger-hover)'"
            onmouseleave="this.style.background='var(--color-danger)'">
            {{ busy ? 'Eliminando…' : 'Sí, eliminar' }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class AdminComponent implements OnInit {
  activeTab = 'grupos';
  tabs = [{ id: 'grupos', label: '📋  Grupos' }];

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

  setStyle(el: EventTarget, prop: string, value: string): void {
    (el as HTMLElement).style.setProperty(prop, value);
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
