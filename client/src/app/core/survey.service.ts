import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Survey, SurveyMode } from './models';

@Injectable({ providedIn: 'root' })
export class SurveyService {
  private http = inject(HttpClient);

  getSurveys(): Observable<Survey[]> {
    return this.http.get<Survey[]>('/api/surveys');
  }

  getSurveyModes(): Observable<SurveyMode[]> {
    return this.http.get<SurveyMode[]>('/api/survey-modes');
  }

  createSurvey(title: string, modeCode: string): Observable<Survey> {
    return this.http.post<Survey>('/api/surveys', { title, modeCode });
  }
}
