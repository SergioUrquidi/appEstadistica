import { ChangeDetectorRef, Component, effect, OnInit } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './core/auth.service';
import { Group } from './core/models';
import { ButtonComponent } from './shared/button.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ButtonComponent],
  template: `
    @if (auth.user(); as user) {
      <aside class="sidebar">
        <a class="sidebar-brand" routerLink="/estudios">
          <span class="brand-mark">Σ</span>
          <span class="brand-text">Estadística<small>Encuestas y análisis</small></span>
        </a>
        <nav class="sidebar-nav">
          <a routerLink="/estudios" routerLinkActive="active-link">
            <span class="nav-icon">⬡</span><span class="nav-label">Ferias</span>
          </a>
          <div class="nav-group">
            <a routerLink="/generador-qr" routerLinkActive="active-link">
              <span class="nav-icon">▦</span><span class="nav-label">Generador QR</span>
            </a>
            <div class="nav-submenu">
              @for (group of groups; track group.id) {
                <a class="nav-submenu-link" [routerLink]="['/generador-qr', group.id]" routerLinkActive="active-link">
                  <span class="nav-submenu-icon" aria-hidden="true">{{ group.icono }}</span><span>{{ group.etiqueta }}</span>
                </a>
              }
              @if (groupsError) { <span class="nav-error" role="alert">{{ groupsError }}</span> }
            </div>
          </div>

          @if (user.role === 'admin' || user.role === 'superuser') {
            <a routerLink="/usuarios" routerLinkActive="active-link">
              <span class="nav-icon">⊹</span><span class="nav-label">Usuarios</span>
            </a>
            <a routerLink="/admin" routerLinkActive="active-link">
              <span class="nav-icon">⚙</span><span class="nav-label">Admin</span>
            </a>
          }
        </nav>
        <div class="sidebar-footer">
          <div class="user-avatar">{{ user.display_name[0] }}</div>
          <div class="user-info"><strong>{{ user.display_name }}</strong><small>{{ roleLabel(user.role) }}</small></div>
          <app-button variant="quiet" class="logout-btn" (click)="logout()">Salir</app-button>
        </div>
      </aside>
      <div class="app-body">
        <main><router-outlet /></main>
        <footer>Estadística · Captura confiable y análisis cuantitativo</footer>
      </div>
    } @else {
      <div class="app-body app-body--full">
        <main><router-outlet /></main>
      </div>
    }
  `,
  styleUrl: './app.scss',
})
export class App implements OnInit {
  groups: Group[] = [];
  groupsError = '';
  private groupsUserId: string | null = null;

  constructor(
    readonly auth: AuthService,
    private readonly router: Router,
    private readonly http: HttpClient,
    private readonly cdr: ChangeDetectorRef,
  ) {
    effect(() => {
      const user = this.auth.user();
      if (!user) {
        this.groupsUserId = null;
        this.groups = [];
        this.groupsError = '';
        return;
      }
      if (this.groupsUserId === user.id) return;
      this.groupsUserId = user.id;
      void this.loadGroups();
    });
  }

  async ngOnInit(): Promise<void> {
    await this.auth.initialize();
  }

  private async loadGroups(): Promise<void> {
    this.groupsError = '';
    try {
      this.groups = await firstValueFrom(this.http.get<Group[]>('/api/grupos'));
    } catch {
      this.groupsError = 'No se cargaron los grupos.';
    } finally {
      this.cdr.markForCheck();
    }
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/iniciar-sesion']);
  }

  roleLabel(role: string): string {
    return role === 'superuser' ? 'Superusuario' : role === 'admin' ? 'Administrador' : 'Usuario';
  }
}
