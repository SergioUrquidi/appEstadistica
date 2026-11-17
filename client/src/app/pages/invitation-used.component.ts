import { Component } from '@angular/core';

@Component({
  selector: 'app-invitation-used',
  standalone: true,
  template: `
    <section class="confirmation-card">
      <div class="success-mark">✓</div>
      <h1>Encuesta ya contestada</h1>
      <p>Esta encuesta ya fue contestada satisfactoriamente.</p>
    </section>
  `,
  styles: [`
    .confirmation-card { max-width:650px; margin:4vh auto; padding:clamp(1.25rem,4vw,2.5rem); background:white; border:1px solid #e2e8f0; border-radius:18px; text-align:center; }
    h1 { margin:.8rem 0 .5rem; font-size:clamp(1.5rem,4vw,2rem); }
    p { color:#64748b; }
    .success-mark { display:grid; place-items:center; width:3rem; height:3rem; margin:auto; border-radius:50%; color:#166534; background:#dcfce7; font-size:1.5rem; }
  `],
})
export class InvitationUsedComponent {}
