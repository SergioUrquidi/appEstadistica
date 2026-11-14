import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  return auth.token ? true : inject(Router).createUrlTree(['/iniciar-sesion'], {
    queryParams: { returnUrl: state.url },
  });
};
