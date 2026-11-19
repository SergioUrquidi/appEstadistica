import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { StudyDetail } from './models';

@Injectable({ providedIn: 'root' })
export class EstudioService {
  private http = inject(HttpClient);

  getEstudio(id: string): Observable<StudyDetail> {
    return this.http.get<StudyDetail>(`/api/estudios/${id}`);
  }
}
