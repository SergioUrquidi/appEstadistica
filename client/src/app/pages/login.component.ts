import { ChangeDetectorRef, Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { ButtonComponent } from '../shared/button.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, ButtonComponent],
  template: `
    <section class="login-card">
      <h1>Iniciar sesión</h1>
      <p class="muted">Administra encuestas, invitaciones y análisis.</p>
      <form (ngSubmit)="submit()">
        <label>Correo electrónico
          <input type="email" name="email" [(ngModel)]="email" autocomplete="username" required>
        </label>
        <label>Contraseña
          <input type="password" name="password" [(ngModel)]="password" autocomplete="current-password" required>
        </label>
        @if (error) { <p class="error" role="alert">{{ error }}</p> }
        <app-button type="submit" class="wide" [disabled]="busy">
          {{ busy ? 'Ingresando…' : 'Ingresar' }}
        </app-button>
      </form>
    </section>
  `,
  styles: [`
    .login-card { max-width: 430px; margin: 8vh auto; padding: 2rem; background: white; border: 1px solid #e6eaf0; border-radius: 18px; box-shadow: 0 16px 48px #102a4310; }
    h1 { margin: .4rem 0; font-size: 2rem; }
    form { display: grid; gap: 1rem; margin-top: 1.5rem; }
    label { display: grid; gap: .45rem; color: #334155; font-size: .9rem; font-weight: 600; }
    input { width: 100%; padding: .8rem; border: 1px solid #cbd5e1; border-radius: 9px; font: inherit; }
    .error { color: #b42318; }
    .muted { color: #64748b; }
  `],
})
export class LoginComponent {
  email = '';
  password = '';
  error = '';
  busy = false;

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  async submit(): Promise<void> {
    this.error = '';
    this.busy = true;
    try {
      await this.auth.login(this.email, this.password);
      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
      await this.router.navigateByUrl(returnUrl || '/encuestas');
    } catch {
      this.error = 'No se pudo iniciar sesión. Revisa tus credenciales y la conexión.';
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }
}
