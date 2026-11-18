import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
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
  { path: 'generador-qr', loadComponent: () => import('./pages/qr-generator.component').then((module) => module.QrGeneratorComponent), canActivate: [authGuard] },
  { path: 'generador-qr/:groupId', loadComponent: () => import('./pages/qr-generator.component').then((module) => module.QrGeneratorComponent), canActivate: [authGuard] },
  { path: 'estudios', loadComponent: () => import('./pages/estudios.component').then((module) => module.EstudiosComponent), canActivate: [authGuard] },
  { path: 'estudios/:id', loadComponent: () => import('./pages/estudio-detail.component').then((module) => module.EstudioDetailComponent), canActivate: [authGuard] },
  { path: 'dashboard', loadComponent: () => import('./pages/feria-dashboard.component').then((module) => module.FeriaDashboardComponent) },
  { path: 'encuestas', component: SurveysComponent, canActivate: [authGuard] },
  { path: 'encuestas/:id', component: SurveyDetailComponent, canActivate: [authGuard] },
  { path: 'usuarios', component: UsersComponent, canActivate: [authGuard] },
  { path: 'admin', component: AdminComponent, canActivate: [authGuard] },
  { path: 'login', redirectTo: 'iniciar-sesion', pathMatch: 'full' },
  { path: 'respond/:token', redirectTo: 'responder/:token', pathMatch: 'full' },
  { path: 'surveys', redirectTo: 'encuestas', pathMatch: 'full' },
  { path: 'surveys/:id', redirectTo: 'encuestas/:id', pathMatch: 'full' },
  { path: 'users', redirectTo: 'usuarios', pathMatch: 'full' },
  { path: '', pathMatch: 'full', redirectTo: 'estudios' },
  { path: '**', redirectTo: 'estudios' },
];
