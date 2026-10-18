// The panel kit (src/ui/panel/, docs/consistency-audit.md §3.2): a panel renders through the kit's `html` tag and
// `paint()`, takes its keys, its focus, its status line and its "press twice" from the base, and never writes raw
// markup or a tooltip. Loaded by ../check-conventions.mjs; see there for a rule's shape.
//
// The surfaces outside the kit (the game panel's review card: the audit's F11) are excepted by name until they join
// it; a new file is not. (The dream card joined it, `paint` since 2026-10-18.)
const OUTSIDE_THE_KIT = [
  'ui/GamePanel.ts',
];

export const rules = [
  {
    name: 'innerHTML',
    // The panels write markup through `paint(el, html\`...\`)`: every interpolation escaped, `raw()` says otherwise.
    test: (line) => /\.innerHTML\s*=/.test(line),
    within: ['ui/'],
    except: ['ui/panel/', ...OUTSIDE_THE_KIT],
    hint: 'render with paint(el, html`...`) from ui/panel/html (raw() for markup a helper made)',
  },
  {
    name: 'escapeHtml by hand',
    // Inside the kit the `html` tag escapes; a call by hand means a string template is being built beside it.
    test: (line) => /\bescapeHtml\(/.test(line),
    within: ['ui/'],
    except: ['ui/html.ts', 'ui/panel/html.ts', 'ui/keys.ts', 'ui/fuzzy.ts', 'ui/coverPlaceholder.ts', 'ui/repair/RepairPanel.ts', ...OUTSIDE_THE_KIT],
    hint: 'interpolate into the html`` tag (ui/panel/html): it escapes; SVG built as text goes through raw()',
  },
  {
    name: 'reduced-motion media query',
    // Code reads the game's setting (`reduceMotion()` from settings/motion), which maps the system's query itself.
    test: (line) => /prefers-reduced-motion/.test(line),
    except: ['settings/motion.ts'],
    hint: 'read reduceMotion() from @/settings/motion (Settings > Display, or the system when left to it)',
  },
  {
    name: 'raw keydown listener',
    // The base takes the keys (onKey, onEnter, onBack); a listener of its own fights the Tab trap and the Esc policy.
    test: (line) => /addEventListener\(\s*['"]keydown['"]/.test(line),
    within: ['ui/'],
    except: ['ui/ModalPanel.ts', 'ui/panel/', ...OUTSIDE_THE_KIT],
    hint: 'override onKey / onEnter / onBack on the panel (ui/ModalPanel)',
  },
  {
    name: 'tooltip',
    // A `title` attribute is a mouse-only hint: say it in the text or an aria-label (the iframe's title is its name).
    test: (line) => /(^|[^-\w])title="/.test(line) && !/<iframe/.test(line),
    within: ['ui/'],
    except: ['ui/coverPlaceholder.ts', 'ui/social/meters.ts', ...OUTSIDE_THE_KIT],
    hint: 'put the words in the control or an aria-label; no title= tooltips in the panels',
  },
  {
    name: 'hand-made status line',
    // The frame has one (`setStatus`, role="status"); a second live region is another thing to announce.
    test: (line) => /aria-live=|role="(status|alert)"/.test(line),
    within: ['ui/'],
    except: ['ui/panel/', 'ui/PrizePanel.ts', 'ui/ArcadeScreenPanel.ts', ...OUTSIDE_THE_KIT],
    hint: 'use setStatus(text, tone) on the panel (ui/ModalPanel): the frame owns the status line',
  },
  {
    name: 'press twice by hand',
    // A row armed with its own timer: `confirmTwice`'s Arming expires, repaints and words it the same everywhere.
    test: (line) => /until:\s*(now|performance\.now\(\))\s*\+/.test(line) || /dataset\.armed\b/.test(line),
    within: ['ui/'],
    except: ['ui/confirmTwice.ts'],
    hint: 'arm with new Arming(() => this.refresh()) and arming.press(key) (ui/confirmTwice)',
  },
  {
    name: 'second search debounce',
    test: (line) => /const SEARCH_DEBOUNCE/.test(line),
    except: ['ui/panel/SheetPanel.ts'],
    hint: 'the sheet has a search field (SheetPanelOptions.search) and the one debounce (ui/panel/SheetPanel)',
  },
  {
    name: 'bare price',
    // An amount printed as a bare figure ("Sell · 45", "bought for 12"): the player reads coins as "45 coins" everywhere.
    // Caught: an interpolation that is only a name ending in price / cost / paid / fee / deposit, outside an attribute
    // value; a line drawing the coin itself (`__coin`, `ui-coin`) names the unit by picture. A variable holding the
    // finished markup or words takes a name that says so (`priceTag`, `amount`).
    test: (line) => /(?<![=:"'\w-])\$\{\s*(?:[\w$]+(?:\?\.|!?\.))*[\w$]*?(?:price|cost|paid|fee|deposit)\s*\}/i.test(line) && !/__coin\b|\bui-coin\b/.test(line),
    within: ['ui/', 'notices/'],
    hint: 'formatCoins(n) from @/text/money in words, priceHtml(n) from ui/panel/widgets for a price column',
  },
];
