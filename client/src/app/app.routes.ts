import { Routes } from '@angular/router';
import { authGuard, roleGuard } from './core/auth.guard';
import { AdminComponent } from './pages/admin.component';
import { LoginComponent } from './pages/login.component';
import { RespondComponent } from './pages/respond.component';
import { InvitationUsedComponent } from './pages/invitation-used.component';
import { SurveyDetailComponent } from './pages/survey-detail.component';
import { SurveysComponent } from './pages/surveys.component';
import { UsersComponent } from './pages/users.component';

export const routes: Routes = [
  { path: 'iniciar-sesion', component: LoginComponent },
  { path: 'responder/:token', component: RespondComponent },
  { path: 'encuesta-respondida', component: InvitationUsedComponent },
  { path: 'generador-qr', loadComponent: () => import('./pages/qr-generator.component').then((module) => module.QrGeneratorComponent), canActivate: [roleGuard('superuser', 'admin', 'encuestador')] },
  { path: 'generador-qr/:groupId', loadComponent: () => import('./pages/qr-generator.component').then((module) => module.QrGeneratorComponent), canActivate: [roleGuard('superuser', 'admin', 'encuestador')] },
  { path: 'estudios', loadComponent: () => import('./pages/estudios.component').then((module) => module.EstudiosComponent), canActivate: [roleGuard('superuser', 'admin')] },
  { path: 'estudios/:id', loadComponent: () => import('./pages/estudio-detail.component').then((module) => module.EstudioDetailComponent), canActivate: [roleGuard('superuser', 'admin')] },
  { path: 'dashboard', loadComponent: () => import('./pages/feria-dashboard.component').then((module) => module.FeriaDashboardComponent) },
  { path: 'encuestas', component: SurveysComponent, canActivate: [roleGuard('superuser', 'admin')] },
  { path: 'encuestas/:id', component: SurveyDetailComponent, canActivate: [roleGuard('superuser', 'admin')] },
  { path: 'usuarios', component: UsersComponent, canActivate: [roleGuard('superuser', 'admin')] },
  { path: 'admin', component: AdminComponent, canActivate: [roleGuard('superuser', 'admin')] },
  { path: 'resultados', loadComponent: () => import('./pages/resultados.component').then((m) => m.ResultadosComponent), canActivate: [roleGuard('superuser')] },
  { path: 'login', redirectTo: 'iniciar-sesion', pathMatch: 'full' },
  { path: 'respond/:token', redirectTo: 'responder/:token', pathMatch: 'full' },
  { path: 'surveys', redirectTo: 'encuestas', pathMatch: 'full' },
  { path: 'surveys/:id', redirectTo: 'encuestas/:id', pathMatch: 'full' },
  { path: 'users', redirectTo: 'usuarios', pathMatch: 'full' },
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: '**', redirectTo: 'dashboard' },
];
