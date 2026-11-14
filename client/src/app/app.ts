import { Component, OnInit } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';
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
  constructor(readonly auth: AuthService, private readonly router: Router) {}

  ngOnInit(): void {
    void this.auth.initialize();
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/iniciar-sesion']);
  }

  roleLabel(role: string): string {
    return role === 'superuser' ? 'Superusuario' : role === 'admin' ? 'Administrador' : 'Usuario';
  }
}
