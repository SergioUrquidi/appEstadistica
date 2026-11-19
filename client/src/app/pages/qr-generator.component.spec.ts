import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { QrGeneratorComponent } from './qr-generator.component';

describe('QrGeneratorComponent', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    const params = convertToParamMap({ groupId: 'group-id' });
    await TestBed.configureTestingModule({
      imports: [QrGeneratorComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { paramMap: of(params), snapshot: { paramMap: params } } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the selected database group and filters its surveys before generating QR invitations', async () => {
    const fixture = TestBed.createComponent(QrGeneratorComponent);
    fixture.detectChanges();

    http.expectOne('/api/grupos').flush([
      { id: 'group-id', nombre: 'jurados', etiqueta: 'Jurados', icono: '⚖', orden: 1, activo: true },
    ]);
    http.expectOne('/api/respondent-groups/con-encuesta-activa').flush([
      { value: 'jurados', label: 'jurados' },
      { value: 'expositores', label: 'expositores' },
    ]);
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const surveysRequest = http.expectOne((request) =>
      request.url === '/api/surveys' && request.params.get('groupId') === 'group-id');
    surveysRequest.flush([
      { id: 'active-survey', title: 'Encuesta activa', status: 'active' },
      { id: 'draft-survey', title: 'Encuesta borrador', status: 'draft' },
    ]);
    await fixture.whenStable();

    expect(fixture.componentInstance.surveys.map((survey) => survey.id)).toEqual(['active-survey']);
    expect(fixture.componentInstance.count).toBeNull();
    fixture.componentInstance.count = 2;
    fixture.componentInstance.respondentGroup = 'jurados';
    const generating = fixture.componentInstance.generateInvitations();
    const request = http.expectOne({
      method: 'POST',
      url: '/api/surveys/active-survey/codes',
    });
    expect(request.request.body).toEqual({
      surveyGroupId: 'group-id',
      respondentGroup: 'jurados',
      count: 2,
    });
    request.flush({
      invitations: [
        { respondentGroup: 'jurados', url: '/respond/one', qrCode: 'data:image/png;base64,one' },
        { respondentGroup: 'jurados', url: '/respond/two', qrCode: 'data:image/png;base64,two' },
      ],
    });
    await generating;
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.invitation').length).toBe(2);
    expect(fixture.componentInstance.busy).toBe(false);
  });
});
