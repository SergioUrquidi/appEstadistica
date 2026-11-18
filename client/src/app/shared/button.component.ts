import { Component, Input } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'quiet' | 'tab' | 'tab-active';

@Component({
  selector: 'app-button',
  standalone: true,
  template: `
    <button
      class="action-button"
      [class.button--primary]="variant === 'primary'"
      [class.button--secondary]="variant === 'secondary'"
      [class.button--danger]="variant === 'danger'"
      [class.button--quiet]="variant === 'quiet'"
      [class.button--tab]="variant === 'tab'"
      [class.button--tab-active]="variant === 'tab-active'"
      [type]="type"
      [disabled]="disabled"
    >
      <ng-content />
    </button>
  `,
  styles: [`
    :host {
      display: inline-flex;
      min-width: 0;
    }

    :host(.wide) {
      display: flex;
      width: 100%;
    }

    .action-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: .5rem;
      min-height: 2.65rem;
      padding: .68rem 1rem;
      border: 1px solid transparent;
      border-radius: .6rem;
      font: inherit;
      font-size: .9rem;
      font-weight: 650;
      line-height: 1.25;
      text-align: center;
      text-decoration: none;
      white-space: normal;
      cursor: pointer;
      transition: background-color .16s ease, border-color .16s ease, color .16s ease, box-shadow .16s ease, transform .16s ease;
    }

    :host(.wide) .action-button,
    :host(.flex-1) .action-button {
      width: 100%;
    }

    .action-button:hover:not(:disabled) {
      transform: translateY(-1px);
    }

    .action-button:active:not(:disabled) {
      transform: translateY(0);
    }

    .action-button:focus-visible {
      outline: 3px solid var(--color-focus-ring);
      outline-offset: 2px;
    }

    .action-button:disabled {
      cursor: not-allowed;
      opacity: .58;
    }

    .button--primary {
      color: #333333;
      background: var(--color-action);
    }

    .button--primary:hover:not(:disabled) {
      background: var(--color-action-hover);
      box-shadow: 0 3px 8px #8dcab840;
    }

    .button--secondary {
      color: var(--color-action-text);
      background: var(--color-action-soft);
    }

    .button--secondary:hover:not(:disabled) {
      background: var(--color-action-soft-hover);
    }

    .button--danger {
      color: #fff;
      background: var(--color-danger);
    }

    .button--danger:hover:not(:disabled) {
      background: var(--color-danger-hover);
    }

    .button--quiet {
      color: var(--color-quiet-text);
      background: var(--color-quiet-bg);
    }

    .button--quiet:hover:not(:disabled) {
      background: var(--color-quiet-bg-hover);
    }

    .button--tab,
    .button--tab-active {
      min-height: 2.75rem;
      padding: .55rem 1rem;
      border-radius: .45rem .45rem 0 0;
      background: transparent;
    }

    .button--tab {
      color: #64748b;
      border-bottom-color: transparent;
    }

    .button--tab:hover:not(:disabled) {
      color: #334155;
      background: #f8fafc;
    }

    .button--tab-active {
      color: var(--color-action-text);
      border-bottom-color: var(--color-action);
      background: var(--color-action-soft);
    }

    @media (prefers-reduced-motion: reduce) {
      .action-button {
        transition: none;
      }

      .action-button:hover:not(:disabled),
      .action-button:active:not(:disabled) {
        transform: none;
      }
    }
  `],
})
export class ButtonComponent {
  @Input() variant: ButtonVariant = 'primary';
  @Input() type: 'button' | 'submit' = 'button';
  @Input() disabled = false;
}
