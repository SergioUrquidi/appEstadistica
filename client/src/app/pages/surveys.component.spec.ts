import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SurveysComponent } from './surveys.component';

describe('SurveysComponent', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SurveysComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('renders a survey and clears the busy state after creation', async () => {
    const fixture = TestBed.createComponent(SurveysComponent);
    fixture.autoDetectChanges();
    http.expectOne('/api/surveys').flush([]);
    await fixture.whenStable();

    fixture.componentInstance.title = 'Encuesta de prueba';
    const creating = fixture.componentInstance.createSurvey();
    http.expectOne({ method: 'POST', url: '/api/surveys' }).flush({
      id: 'survey-1',
      title: 'Encuesta de prueba',
      description: '',
      status: 'draft',
      created_at: '2026-11-14T00:00:00.000Z',
      response_count: 0,
    });
    await creating;
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.survey-card h2')?.textContent).toContain('Encuesta de prueba');
    expect((element.querySelector('button') as HTMLButtonElement).disabled).toBe(false);
  });
});
