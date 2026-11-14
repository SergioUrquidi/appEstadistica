import { Injectable } from '@angular/core';
import { io } from 'socket.io-client';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class SocketService {
  constructor(private readonly auth: AuthService) {}

  watchStudy(studyId: string, onUpdate: (data: { byGroup: Record<string, number>; total: number }) => void): () => void {
    const socket = io({ auth: { token: this.auth.token } });
    socket.on('connect', () => {
      socket.emit('estudio:join', studyId, (result: { error?: string }) => {
        if (result?.error) console.error(result.error);
      });
    });
    socket.on('estudio:respuesta', (event: { studyId: string; byGroup: Record<string, number>; total: number }) => {
      if (event.studyId === studyId) onUpdate(event);
    });
    socket.on('connect_error', (error) => console.error('Realtime connection failed:', error.message));
    return () => socket.disconnect();
  }

  watchSurvey(surveyId: string, onUpdate: () => void): () => void {
    const socket = io({
      auth: { token: this.auth.token },
    });
    socket.on('connect', () => {
      socket.emit('survey:join', surveyId, (result: { error?: string }) => {
        if (result?.error) console.error(result.error);
      });
    });
    socket.on('response:created', (event: { surveyId: string }) => {
      if (event.surveyId === surveyId) onUpdate();
    });
    socket.on('connect_error', (error) => console.error('Realtime connection failed:', error.message));
    return () => socket.disconnect();
  }
}
