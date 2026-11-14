import { Component, OnInit } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink],
  template: `
    <header class="topbar">
      <a class="brand" routerLink="/encuestas"><span class="brand-mark">Σ</span><span>Estadística<small>Encuestas y análisis</small></span></a>
      @if (auth.user(); as user) {
        <nav><a routerLink="/encuestas">Encuestas</a>
          @if (user.role === 'admin' || user.role === 'superuser') { <a routerLink="/usuarios">Usuarios</a> }
        </nav>
        <div class="account"><span>{{ user.display_name }}</span><button (click)="logout()">Salir</button></div>
      }
    </header>
    <main><router-outlet /></main>
    <footer>Estadística · Captura confiable y análisis cuantitativo</footer>
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
}
