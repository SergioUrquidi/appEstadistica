import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { InvitationUsedComponent } from './invitation-used.component';
import { RespondComponent } from './respond.component';

describe('RespondComponent', () => {
  let http: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RespondComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: '', component: InvitationUsedComponent },
          { path: 'encuesta-respondida', component: InvitationUsedComponent },
        ]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ token: 'used-token' }) } },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => http.verify());

  it('redirects a previously used invitation to its confirmation page', async () => {
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(RespondComponent);
    fixture.detectChanges();

    http.expectOne('/api/respond/used-token').flush(
      { code: 'INVITATION_ALREADY_USED' },
      { status: 410, statusText: 'Gone' },
    );
    await fixture.whenStable();

    expect(navigate).toHaveBeenCalledWith('/encuesta-respondida', { replaceUrl: true });
  });

  it('thanks the respondent after a successful submission', async () => {
    const fixture = TestBed.createComponent(RespondComponent);
    fixture.detectChanges();
    http.expectOne('/api/respond/used-token').flush({
      surveyId: 'survey-1',
      title: 'Encuesta',
      description: '',
      mode_label: null,
      grades_answers: false,
      questions: [],
    });
    await fixture.whenStable();

    const submitting = fixture.componentInstance.submit();
    http.expectOne({ method: 'POST', url: '/api/respond/used-token' }).flush({
      submitted: true,
      result: null,
    });
    await submitting;
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('¡Gracias por su colaboración!');
  });
});
