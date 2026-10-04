import { ModalPanel } from '../ModalPanel';
import { attr, html, paint, type Html } from './html';

/** A footer button: `data-action` and its label; a primary one sits last, a danger one is red, `data` adds `data-*` attributes. */
export interface PanelAction {
  action: string;
  /** The words, or markup when the button carries a key cap (`html\`Back <kbd>⌫</kbd>\``). */
  label: string | Html;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  autofocus?: boolean;
  data?: Record<string, string | number>;
  /** Extra classes (a panel's own look). */
  className?: string;
}

interface CardPanelOptions {
  /** The root's own classes after the layer's (`storage-panel`): the panel's CSS hangs on them. */
  className: string;
  /** The card's own classes after `ui-card ui-panel__card` (`storage-panel__card`). Default: `ui-card`. */
  cardClass?: string;
  /** The heading, and the dialog's label unless `label` says otherwise. */
  title: string;
  label?: string;
  /** The dismiss button's words, the flavour of leaving ("Put it back", "Close the doors"). Default "Close". */
  dismiss?: string;
  /** The dismiss is where the focus lands on opening (a paper that is only read). */
  dismissAutofocus?: boolean;
  /** A press and its release on the backdrop close the card. Default true. */
  backdropCloses?: boolean;
  /** The footer buttons' class. Default `ui-btn`; a paper's own buttons pass ''. */
  buttonClass?: string;
  /** The frame draws `<header><h2>`: default true; a paper that paints its own masthead in `render` says false. */
  header?: boolean;
}

/**
 * A card in the middle of the view (`ui-modal--centre`): one `<article>` dialog with the kit's skeleton, a header
 * with the title, a `role="status"` line, the body `render()` paints and a footer of buttons (`actions()`, the
 * dismiss among them: secondary buttons first, then the dismiss, then the primary one, so the committing press is
 * always last). The base's policies apply: backdrop, focus, Enter, back, sounds, `refresh()`.
 *
 * A panel implements `render()` (the body's markup through the `html` tag) and, when it has buttons besides the
 * dismiss, `actions()`; both are read again on `refresh()`. State an open passes in is set in `onOpened(...args)`
 * before `super.onOpened()` paints.
 */
export abstract class CardPanel<OpenArgs extends unknown[] = []> extends ModalPanel<OpenArgs> {
  protected readonly card: HTMLElement;
  protected readonly body: HTMLElement;
  private readonly footerEl: HTMLElement;
  private readonly titleEl: HTMLElement | null;
  private readonly dismiss: string;
  private readonly dismissAutofocus: boolean;
  private readonly buttonClass: string;

  constructor(container: HTMLElement, options: CardPanelOptions) {
    super(container, { className: `ui-modal--centre ui-panel ui-panel--card ${options.className}`, backdropCloses: options.backdropCloses ?? true });
    this.dismiss = options.dismiss ?? 'Close';
    this.dismissAutofocus = options.dismissAutofocus ?? false;
    this.buttonClass = options.buttonClass ?? 'ui-btn';
    const withHeader = options.header ?? true;
    paint(
      this.root,
      html`<article class="${options.cardClass ?? 'ui-card'} ui-panel__card" role="dialog" aria-modal="true" aria-label="${options.label ?? options.title}">
        ${withHeader ? html`<header class="ui-panel__header"><h2>${options.title}</h2></header>` : ''}
        <div class="ui-panel__status" role="status" aria-live="polite"></div>
        <div class="ui-panel__body"></div>
        <footer class="ui-panel__footer"></footer>
      </article>`,
    );
    this.card = this.root.querySelector('.ui-panel__card')!;
    this.titleEl = this.card.querySelector('h2');
    this.statusEl = this.card.querySelector('.ui-panel__status')!;
    this.body = this.card.querySelector('.ui-panel__body')!;
    this.footerEl = this.card.querySelector('.ui-panel__footer')!;
  }

  /** The body's markup, from the panel's state. */
  protected abstract render(): Html;

  /** The footer's buttons besides the dismiss (none by default). */
  protected actions(): PanelAction[] {
    return [];
  }

  protected override onOpened(..._args: OpenArgs): void {
    this.setStatus('');
    this.repaint();
  }

  protected override repaint(): void {
    paint(this.body, this.render());
    paint(this.footerEl, this.footerHtml());
  }

  protected setTitle(title: string): void {
    if (this.titleEl) this.titleEl.textContent = title;
    this.card.setAttribute('aria-label', title);
  }

  /** The dismiss button's words now (the option's by default; a panel whose leaving changes meaning, "Put it down" then "Done", overrides). */
  protected dismissLabel(): string {
    return this.dismiss;
  }

  /** Whether the dismiss is where the focus lands (the option's by default). */
  protected dismissFocused(): boolean {
    return this.dismissAutofocus;
  }

  /** Secondary buttons, the dismiss, then the primary ones: the committing press last. */
  private footerHtml(): Html {
    const actions = this.actions();
    const secondary = actions.filter((a) => !a.primary);
    const primary = actions.filter((a) => a.primary);
    const dismiss: PanelAction = { action: 'close', label: this.dismissLabel(), autofocus: this.dismissFocused() };
    return html`${[...secondary, dismiss, ...primary].map((a) => buttonHtml(a, this.buttonClass))}`;
  }
}

/** One footer button. The dismiss carries its words as its `aria-label` too, so a reader hears the flavour. */
export function buttonHtml(a: PanelAction, buttonClass = 'ui-btn'): Html {
  const classes = [buttonClass, a.primary && 'ui-btn--primary', a.danger && 'ui-btn--danger', a.className].filter(Boolean).join(' ');
  const data = Object.entries(a.data ?? {}).map(([k, v]) => html` data-${k}="${v}"`);
  return html`<button type="button" class="${classes}" data-action="${a.action}"${data}${attr('disabled', !!a.disabled)}${attr('data-autofocus', !!a.autofocus)}${a.action === 'close' && typeof a.label === 'string' ? html` aria-label="${a.label}"` : ''}>${a.label}</button>`;
}
