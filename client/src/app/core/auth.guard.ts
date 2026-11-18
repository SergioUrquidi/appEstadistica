import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  return auth.token ? true : inject(Router).createUrlTree(['/iniciar-sesion'], {
    queryParams: { returnUrl: state.url },
  });
};

export function roleGuard(...roles: string[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const user = auth.user();
    if (!auth.token) return inject(Router).createUrlTree(['/iniciar-sesion']);
    if (!user || !roles.includes(user.role)) return inject(Router).createUrlTree(['/dashboard']);
    return true;
  };
}
