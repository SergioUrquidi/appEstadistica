import { Injectable } from '@angular/core';
import { io } from 'socket.io-client';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class SocketService {
  constructor(private readonly auth: AuthService) {}

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
