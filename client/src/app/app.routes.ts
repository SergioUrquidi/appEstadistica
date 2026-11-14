import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { AdminComponent } from './pages/admin.component';
import { EstudioDetailComponent } from './pages/estudio-detail.component';
import { EstudiosComponent } from './pages/estudios.component';
import { LoginComponent } from './pages/login.component';
import { RespondComponent } from './pages/respond.component';
import { SurveyDetailComponent } from './pages/survey-detail.component';
import { SurveysComponent } from './pages/surveys.component';
import { UsersComponent } from './pages/users.component';

export const routes: Routes = [
  { path: 'iniciar-sesion', component: LoginComponent },
  { path: 'responder/:token', component: RespondComponent },
  { path: 'estudios', component: EstudiosComponent, canActivate: [authGuard] },
  { path: 'estudios/:id', component: EstudioDetailComponent, canActivate: [authGuard] },
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
