import { ChangeDetectorRef, Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="login-card">
      <p class="eyebrow">Sistema de estadística</p>
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
        <button class="primary" type="submit" [disabled]="busy">
          {{ busy ? 'Ingresando…' : 'Ingresar' }}
        </button>
      </form>
    </section>
  `,
  styles: [`
    .login-card { max-width: 430px; margin: 8vh auto; padding: 2rem; background: white; border: 1px solid #e6eaf0; border-radius: 18px; box-shadow: 0 16px 48px #102a4310; }
    h1 { margin: .4rem 0; font-size: 2rem; }
    form { display: grid; gap: 1rem; margin-top: 1.5rem; }
    label { display: grid; gap: .45rem; color: #334155; font-size: .9rem; font-weight: 600; }
    input { width: 100%; padding: .8rem; border: 1px solid #cbd5e1; border-radius: 9px; font: inherit; }
    button { padding: .85rem; border: 0; border-radius: 9px; cursor: pointer; font: inherit; font-weight: 700; }
    .primary { color: white; background: #185adb; }
    .error { color: #b42318; }
    .eyebrow { color: #185adb; font-size: .75rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
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
