import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Group, RespondentGroup, Survey } from './models';

interface Invitation {
  respondentGroup: string;
  url: string;
  qrCode: string;
}

interface CupoGrupo {
  grupoEncuestado: string;
  cupo: number;
  cupoCompletados: number;
  cupoDisponible: number;
}

interface PendingCode {
  id: string;
  grupoEncuestado: string;
  url: string;
  qrCode: string;
  creadoEn: string;
}

@Injectable({ providedIn: 'root' })
export class QrService {
  private http = inject(HttpClient);

  getGruposConEncuestaActiva(): Observable<Group[]> {
    return this.http.get<Group[]>('/api/grupos/con-encuesta-activa');
  }

  getRespondentGroupsConEncuestaActiva(): Observable<RespondentGroup[]> {
    return this.http.get<RespondentGroup[]>('/api/respondent-groups/con-encuesta-activa');
  }

  getSurveysByGroup(groupId: string): Observable<Survey[]> {
    const params = new HttpParams().set('groupId', groupId);
    return this.http.get<Survey[]>('/api/surveys', { params });
  }

  getCupos(surveyId: string): Observable<CupoGrupo[]> {
    return this.http.get<CupoGrupo[]>(`/api/surveys/${surveyId}/cupos`);
  }

  getPendingCodes(surveyId: string, grupo: string): Observable<PendingCode[]> {
    const params = new HttpParams().set('grupo', grupo);
    return this.http.get<PendingCode[]>(`/api/surveys/${surveyId}/codes/pending`, { params });
  }

  generateInvitations(
    surveyId: string,
    surveyGroupId: string,
    respondentGroup: string,
    count: number,
  ): Observable<{ invitations: Invitation[] }> {
    return this.http.post<{ invitations: Invitation[] }>(`/api/surveys/${surveyId}/codes`, {
      surveyGroupId,
      respondentGroup,
      count,
    });
  }
}
