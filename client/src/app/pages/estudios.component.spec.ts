import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../core/auth.service';
import { EstudiosComponent } from './estudios.component';

describe('EstudiosComponent group targets', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EstudiosComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { user: signal({ role: 'admin' }) } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('requires an explicitly entered target for every selected database group', async () => {
    const fixture = TestBed.createComponent(EstudiosComponent);
    fixture.detectChanges();

    http.expectOne('/api/estudios').flush([]);
    http.expectOne('/api/grupos').flush([
      { id: 'group-id', nombre: 'estudiantes', etiqueta: 'Estudiantes', icono: '🎓', orden: 1, activo: true },
    ]);
    http.expectOne('/api/survey-modes').flush([
      { code: 'opinion', label: 'Opinión', description: '', requires_correct_answer: false, grades_answers: false },
    ]);
    http.expectOne('/api/respondent-groups').flush([
      { value: 'participantes', label: 'participantes' },
      { value: 'jurados', label: 'jurados' },
    ]);
    await fixture.whenStable();

    const component = fixture.componentInstance;
    component.form.title = 'Feria de prueba';
    component.form.modeCode = 'opinion';
    expect(component.targetCounts['estudiantes']).toBeUndefined();
    expect(component.respondentTargetCounts['participantes']).toBeUndefined();
    expect(component.validGroupTargets).toBe(false);

    await component.createStudy();
    expect(component.formError).toContain('cantidad objetivo');
    http.expectNone({ method: 'POST', url: '/api/estudios' });

    component.targetCounts['estudiantes'] = 23;
    component.toggleRespondentGroup('participantes');
    component.respondentTargetCounts['participantes'] = 12;
    expect(component.validGroupTargets).toBe(true);
    const creating = component.createStudy();
    const request = http.expectOne({ method: 'POST', url: '/api/estudios' });
    expect(request.request.body.groupTargets).toEqual([
      { group: 'estudiantes', targetCount: 23 },
    ]);
    expect(request.request.body.respondentTargets).toEqual([
      { respondentGroup: 'participantes', targetCount: 12 },
    ]);
    request.flush({ id: 'study-id', title: 'Feria de prueba' });
    await creating;
  });
});
