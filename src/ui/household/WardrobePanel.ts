import { OUTFITS, outfitById, type OutfitFacts, type OutfitId } from '@/household/outfits';
import { CardPanel } from '../panel/CardPanel';
import { attr, html, paint, raw, type Html } from '../panel/html';
import './household.css';

interface WardrobeDeps {
  /** What the unlocks are judged on, now. */
  facts(): OutfitFacts;
  worn(): OutfitId;
  wear(id: OutfitId): void;
}

/** The hanger every garment hangs from, drawn over it (viewBox 0 0 120 160). */
const HANGER = '<path class="wardrobe__hanger" d="M60 26 V20 C60 15 67 13 67 8 C67 2 58 1 55 6 M60 26 L17 42 Q13 44 17 45 H103 Q107 44 103 42 Z"/>';

/** Each outfit drawn on its hanger: the cloth's colours are the item's slot variables (household.css). */
const GARMENTS: Record<OutfitId, string> = {
  everyday: `
    <path class="wardrobe__cloth" d="M42 38 Q60 48 78 38 L100 46 Q108 50 109 60 L114 124 Q114 128 110 128 H102 Q99 128 99 124 L94 74 V136 Q94 140 90 140 H30 Q26 140 26 136 V74 L21 124 Q21 128 18 128 H10 Q6 128 6 124 L11 60 Q12 50 20 46 Z"/>
    <path class="wardrobe__shade" d="M26 130 H94 V136 Q94 140 90 140 H30 Q26 140 26 136 Z M7 118 H20.5 L21 124 Q21 128 18 128 H10 Q6 128 6 124 Z M99.5 118 H113 L114 124 Q114 128 110 128 H102 Q99 128 99 124 Z"/>
    <path class="wardrobe__rib" d="M34 131 V139 M42 131 V139 M50 131 V139 M58 131 V139 M66 131 V139 M74 131 V139 M82 131 V139 M90 131 V139"/>
    <path class="wardrobe__seam" d="M42 38 Q60 51 78 38"/>
    <path class="wardrobe__fold" d="M26 74 Q32 100 30 128 M94 74 Q88 100 90 128"/>`,
  arcadeTee: `
    <path class="wardrobe__cloth" d="M42 38 Q60 48 78 38 L100 46 L113 68 L97 76 L94 72 V136 Q94 140 90 140 H30 Q26 140 26 136 V72 L23 76 L7 68 L20 46 Z"/>
    <path class="wardrobe__seam" d="M42 38 Q60 51 78 38 M100 46 L94 72 M20 46 L26 72"/>
    <text class="wardrobe__print" x="60" y="84" text-anchor="middle">INSERT</text>
    <text class="wardrobe__print" x="60" y="98" text-anchor="middle">COIN</text>
    <path class="wardrobe__trim" d="M52 106 h4 v4 h-4 Z M58 106 h4 v4 h-4 Z M64 106 h4 v4 h-4 Z"/>`,
  hunterJacket: `
    <path class="wardrobe__cloth" d="M42 38 Q60 46 78 38 L100 46 Q108 50 109 60 L114 126 Q114 130 110 130 H102 Q99 130 99 126 L95 74 V134 Q95 138 91 138 H29 Q25 138 25 134 V74 L21 126 Q21 130 18 130 H10 Q6 130 6 126 L11 60 Q12 50 20 46 Z"/>
    <path class="wardrobe__shade" d="M7 120 H20.6 L21 126 Q21 130 18 130 H10 Q6 130 6 126 Z M99.4 120 H113 L114 126 Q114 130 110 130 H102 Q99 130 99 126 Z"/>
    <path class="wardrobe__pocket" d="M31 62 h20 v16 h-20 Z M69 62 h20 v16 h-20 Z M29 98 h24 v24 h-24 Z M67 98 h24 v24 h-24 Z"/>
    <path class="wardrobe__shade" d="M30 61 h22 v6 h-22 Z M68 61 h22 v6 h-22 Z M28 97 h26 v7 h-26 Z M66 97 h26 v7 h-26 Z"/>
    <path class="wardrobe__trim" d="M42 38 L49 58 L60 46 L71 58 L78 38 Q60 47 42 38 Z"/>
    <path class="wardrobe__zip" d="M60 46 V138"/>`,
  sundayBest: `
    <path class="wardrobe__cloth" d="M42 38 Q60 46 78 38 L100 46 Q108 50 109 60 L113 136 Q113 140 109 140 H101 Q98 140 98 136 L96 76 V150 Q96 154 92 154 H28 Q24 154 24 150 V76 L22 136 Q22 140 19 140 H11 Q7 140 7 136 L11 60 Q12 50 20 46 Z"/>
    <path class="wardrobe__shade" d="M42 38 L52 62 L46 66 L60 96 L74 66 L68 62 L78 38 Q60 46 42 38 Z"/>
    <path class="wardrobe__shirt" d="M50 40 L60 96 L70 40 Q60 45 50 40 Z"/>
    <path class="wardrobe__seam" d="M42 38 L52 62 L46 66 L60 96 L74 66 L68 62 L78 38 M60 96 V154"/>
    <path class="wardrobe__trim" d="M74 70 l6 -3 l2 5 Z"/>
    <circle class="wardrobe__button" cx="54" cy="106" r="2.2"/><circle class="wardrobe__button" cx="66" cy="106" r="2.2"/>
    <circle class="wardrobe__button" cx="54" cy="122" r="2.2"/><circle class="wardrobe__button" cx="66" cy="122" r="2.2"/>
    <path class="wardrobe__fold" d="M30 118 h16 M74 118 h16"/>`,
  memeScarf: `
    <path class="wardrobe__cloth" d="M30 40 Q60 52 90 40 L94 48 Q86 54 80 56 L84 140 H62 L60 58 L58 140 H36 L40 56 Q34 54 26 48 Z"/>
    <path class="wardrobe__shade" d="M36 128 H58 V140 H36 Z M62 128 H84 V140 H62 Z"/>
    <path class="wardrobe__rib" d="M42 64 V124 M48 64 V124 M54 64 V124 M66 64 V124 M72 64 V124 M78 64 V124"/>
    <path class="wardrobe__trim" d="M36 92 H58 V98 H36 Z M62 92 H84 V98 H62 Z"/>
    <path class="wardrobe__fringe" d="M38 140 v8 M42 140 v9 M46 140 v8 M50 140 v9 M54 140 v8 M64 140 v8 M68 140 v9 M72 140 v8 M76 140 v9 M80 140 v8"/>`,
};

/** A garment not earned yet hangs zipped in its bag, a paper tag on the hanger's neck. */
const BAG = `
  <path class="wardrobe__bag" d="M60 30 L20 44 Q14 46 14 54 V146 Q14 154 22 154 H98 Q106 154 106 146 V54 Q106 46 100 44 Z"/>
  <path class="wardrobe__zip wardrobe__zip--bag" d="M60 34 V150"/>
  <path class="wardrobe__fold" d="M30 60 Q34 100 28 146 M90 60 Q86 100 92 146"/>
  <path class="wardrobe__string" d="M60 28 Q72 40 80 56"/>
  <path class="wardrobe__tag" d="M74 56 L86 56 L90 62 V80 H70 V62 Z"/>
  <circle class="wardrobe__tag-hole" cx="80" cy="61" r="1.6"/>`;

function garmentSvg(id: OutfitId, open: boolean): Html {
  const body = open ? GARMENTS[id] : BAG;
  return raw(`<svg class="wardrobe__garment" viewBox="0 0 120 160" aria-hidden="true">${body}${HANGER}</svg>`);
}

/**
 * The wardrobe opened: the outfits hang on a rail, drawn, the one worn lifted forward; a click on one puts it on and
 * it stays on (saved) until changed. Pointing at one, or focusing it, shows it below the rail: its name, its look,
 * what it does in the world's words. One not earned yet hangs zipped in its bag with only the note on its tag. A
 * `ModalLike` opened from inside the wardrobe.
 */
export class WardrobePanel extends CardPanel {
  /** The outfit shown below the rail: the one pointed at or focused, else the one worn. */
  private shown: OutfitId | null = null;
  /** The one just put on, which swings once on the repaint. */
  private justWorn: OutfitId | null = null;

  constructor(container: HTMLElement, private readonly deps: WardrobeDeps) {
    super(container, { className: 'household-panel wardrobe-panel', cardClass: 'household-panel__card wardrobe-panel__card ui-card', title: 'The wardrobe', dismiss: 'Close the doors' });
    const preview = (e: Event): void => {
      const item = (e.target as HTMLElement).closest<HTMLElement>('.wardrobe__item');
      const id = item?.dataset.id as OutfitId | undefined;
      if (id && id !== this.shown) this.show(id);
    };
    this.listen(this.body, 'pointerover', preview);
    this.listen(this.body, 'focusin', preview);
    this.listen(this.body, 'pointerleave', () => this.show(null));
  }

  protected override onOpened(): void {
    this.shown = null;
    this.justWorn = null;
    super.onOpened();
  }

  protected render(): Html {
    const facts = this.deps.facts();
    const worn = this.deps.worn();
    const items = OUTFITS.map((outfit) => {
      const open = outfit.unlocked(facts);
      const isWorn = open && outfit.id === worn;
      const classes = ['wardrobe__item', isWorn && 'wardrobe__item--worn', !open && 'wardrobe__item--bagged', outfit.id === this.justWorn && 'wardrobe__item--swing'].filter(Boolean).join(' ');
      return html`<li><button type="button" class="${classes}" data-id="${outfit.id}"${open ? html` data-action="wear"` : ''}${attr('data-autofocus', isWorn)}
        aria-pressed="${isWorn ? 'true' : 'false'}"${attr('aria-disabled', !open)} aria-label="${open ? outfit.name : 'A garment bag, zipped'}">
        ${garmentSvg(outfit.id, open)}
        <span class="wardrobe__label">${open ? outfit.name : 'In its bag'}</span>
        <span class="wardrobe__worn ui-chip ui-chip--accent">Wearing</span>
      </button></li>`;
    });
    this.justWorn = null;
    return html`<p class="household-panel__dim">Whatever you put on goes out with you.</p>
      <div class="wardrobe__closet"><ul class="wardrobe__rail">${items}</ul></div>
      <section class="wardrobe__detail">${this.detailHtml()}</section>`;
  }

  /** The outfit below the rail; one in its bag shows only its tag's note, in the hand that wrote it. */
  private detailHtml(): Html {
    const worn = this.deps.worn();
    const outfit = outfitById(this.shown ?? worn);
    if (!outfit.unlocked(this.deps.facts())) {
      return html`<h3 class="wardrobe__name">Still in its bag</h3>
        <p class="wardrobe__note">${outfit.earn}</p>`;
    }
    return html`<h3 class="wardrobe__name">${outfit.name}${outfit.id === worn ? html` <span class="wardrobe__on">on you</span>` : ''}</h3>
      <p class="wardrobe__look">${outfit.look}</p>
      <p class="wardrobe__perk">${outfit.perk}</p>`;
  }

  private show(id: OutfitId | null): void {
    this.shown = id;
    const detail = this.body.querySelector<HTMLElement>('.wardrobe__detail');
    if (detail) paint(detail, this.detailHtml());
  }

  protected override onAction(action: string, el: HTMLElement): void {
    const id = el.dataset.id as OutfitId | undefined;
    if (action !== 'wear' || !id || id === this.deps.worn()) return;
    this.deps.wear(id);
    this.justWorn = id;
    this.refresh();
  }
}
