# Boxes, cartridges, discs and consoles

Everything physical about a game copy is data in `src/catalog/media.ts`, by platform and **region**
(`regionOf`: the No-Intro name's region, a dump sold in several markets counts as the American copy,
then the European one). Code never reads `platform.boxDimensions` for a copy: `boxDimensionsOf(game)`.

## Cases (outer mm, W x H x D facing the cover)

| Platform | North America | Europe | Japan | Kind |
| --- | --- | --- | --- | --- |
| NES | 128 x 179 x 24 | = NA | Famicom 98 x 142 x 22 | cardboard |
| SNES | **179 x 128 x 31, landscape** | 128 x 179 x 31 | Super Famicom 107 x 190 x 31 | cardboard |
| N64 | 180 x 128 x 32, landscape | = NA | 135 x 188 x 29 | cardboard |
| Game Boy | 125 x 125 x 23 | = NA | 95 x 120 x 20 | cardboard |
| Mega Drive / Genesis | 129 x 177 x 26 (no hang tab) | = NA | = NA | clamshell |
| PlayStation | 142 x 125 x 10.4 | = NA | = NA | jewel case |

How they open (`world/box/shellLayout`): a portrait cardboard box by its top tuck flap (hinged on
the back edge, tongue inside the front), its cartridge and manual sliding up out of it; a landscape
one (`isLandscape`) by its right end flap, the contents sliding out right, its spine printed along
its top and bottom (the atlas's `top` column); a clamshell like a book, the cartridge in the tray,
the manual under the lid's tabs; a jewel case like a book, the disc on its hub, the booklet being
the front. A cartridge too wide to stand in its box lies on its side (`sideways`: Famicom, Super
Famicom, PAL SNES). Inside: raw grey card, black plastic, the black PS1 tray.

How handled a box looks is painted into its closed atlas (`BoxAtlas.paintWear`): a cardboard box's edges whiten
and its corners scuff with its state (none sealed, a little complete, more without its manual, most worn), a worn
one gets a crease or two; a plastic case's sleeve gets a thin light rim (the case's rounded edge). A third of the
boxes, by the game, have a film of dust on their tops (`dust`, seen on a high shelf). The shelf's atlas keeps the
front at 512 px (about 1.5 MB of GPU memory a box, mipmaps included; a spine's column is as tall as the front, already
more pixels than a spine covers on screen from the bookcase view). A generated spine's title fills the spine's
thickness and is condensed to fit its length (down to 62 % of the face's width) before it is set smaller
(`SpineTexture`), as the real logos are: the letters' height is what reads along a row.

The box in hand is read held up to the eye, a face filling the view: it asks the proxies for its front, scanned back,
cartridge and disc at `?size=xl` (2048 px, the cartridge and disc 1024: `server/artCache` fronts, `server/scanCache`,
stored apart; LaunchBox's back chosen from 2100 px up, `server/launchbox`), and draws its generated back at 2048 px on its
long side, its booklet cover, label and disc print at 1024 (`layoutCanvas`: the layout keeps its units, the pixels
follow). All of it is the box in hand's only: put down, the textures leave the GPU and the large images are let go
(`GameBox.dropDetails`, `BoxArtLoader.forgetDetails`), asked again (from the browser's cache) the next time; one box's
worth at most, some 40 MB of GPU memory with its mipmaps at worst. The baked files (`public/boxart`) stay at 1024.

Examined (`Inspector.examining`), the box reads as if held under a lamp (`world/box/ReadingLight`): its printed faces
light their own print, warm, by 1.4 x the scene luminance the eye reads as middle grey (`graphics/framing` `frameKey`:
the same soft lift at night as at noon), and the room round it goes into shade (docs/graphics.md "The frame"). Nothing
is added to the scene.

## Media (mm)

| Shell | W x H x D | Label (centre x, y; W x H) | Notes |
| --- | --- | --- | --- |
| NES | 120 x 134 x 17 | 16, 19; 56 x 91, 7 mm fold over the top | grooves down the front's left; swallowed whole by the NES, then pressed down 12 mm |
| Famicom | 108 x 70.5 x 17 | 0, 2; 92 x 48 | |
| SNES (NA) | 136 x 88 x 20 | 0, 23; 82.5 x 38, 7 mm fold | grooves down both ends |
| Super Famicom / PAL SNES | 129 x 87 x 20 | 0, 10; 104 x 36 | domed top |
| N64 | 116 x 76.6 x 18.5 | 0, 1; 54.5 x 62.5 | 325 mm arc across the top |
| Game Boy | 57 x 65 x 7.8 | 1.5, -8; 42 x 38 | notched top right; about 12 mm shows out of the handheld |
| Genesis / PAL Mega Drive | 109 x 70 x 17 | -3, -1.5; 99 x 58, 7 mm fold | 95 mm foot into the slot |
| Mega Drive (JP) | 93 x 67 x 17 | 0, 3; 72 x 50 | |
| CD | 120 across, 1.2 thick, 15 mm hole | | black read side |

`insert` is how deep a cartridge goes into a top slot (what sticks out shows). The drawn label is a
fallback: when LaunchBox has a photo of the real cartridge (or a disc scan), `setPhoto` lays it over
the whole face (refused when its proportions are more than 18 % off the shell's).

## Consoles and putting a game in

Each console in `world/props/consoleStyles` is moulded where the real one is round (the SNES's and the N64's shells,
`moulded`) and printed where it is lettered (`lettering`: the NES's logo and POWER / RESET, the SNES's and N64's
logos, alpha-tested prints on `WALL.print`); the NES's top has its ribs. Each has a `MediaSlot`: the slot's mouth, the way in, how
the media is turned once in, an optional `press` (NES) and `door` (the NES's flap, the PS1's lid),
`lineUp` when a shelf is too close above, `swallows` for the NES bay. `Console` (a `MediaDeck`):

- a box of its platform in hand: `GameBox.takeMedia()` (a copy posed where the one in the box is),
  the box goes back, the media flies to the slot (`media/insertion`, a `Timeline`), goes in, the door
  shuts, then the TV plays it. The box opens empty meanwhile (`setMediaOut`), its label says where it is;
- the same game in hand: plays it again; another platform's: refused;
- empty-handed, loaded: ejects it (the screen stops if it was playing it), it flies back into its box;
- the TV with a box in hand asks its `MediaDecks` for the console; empty-handed and off, it switches on
  with the last game put in. Bedroom and kitchen sets have no consoles: they play the box directly.

Sizes checked (all fit their boxes, entry poses clear the stand's shelf above, 197 mm).

A Japanese copy is refused by a console, a direct-play TV and the projector until its converter is bought
(`regionLock`, set by the room builders: docs/economy.md "Copies"). A copy's variant shows on its box
(`box/copyLook`): a sealed one under its shrink-wrap (its own clearcoat turned up, no new map or program; `unseal`
takes it off), a crushed one with a top front corner pushed in (the closed box's and the shell's own geometry, dented
alike at the closed pose before the manual rides on the lid, and never further than the cartridge and booklet inside
allow: `dentRoom`, or the media would show through the card once open).

## Longplays and the box in hand

- A longplay plays on from where its game was last switched off (`game/longplayPlaces`, `KEYS.longplayPlaces`: the
  video and the second, per game; a fresh one, a different video or a spot near an edge starts at a random point past
  the intro). The remote (`VideoScreen.remote`, `VideoSurface`'s `LongplayRemote`, routed by `game/ScreenRemote`):
  Space holds and runs it on, the arrows a minute back or on, Backspace another video of the game (the search is told
  not to offer that one again); its keys show on the prompt line a few seconds when one comes on and after a press.
- The projector off, empty hands: on again with the game it last showed, as the TV does with the last one put in.
- The card beside the box in hand (`ui/GamePanel`) is an index card: the console, year and region on one line, the
  copy's state as stamps, the facts, what was found in it, the receipt in pen with the day in words
  (`time/dayWords`), a few lines of blurb (R turns the box over: the whole blurb, `setBackShown`); the press's clipping
  has its place kept from the start, so nothing above moves when it lands.
- The box open: V takes its booklet and papers out to read (below, "The papers in the box"). Handling sounds follow the case: a plastic case clacks and snaps, a card box
  pats and its flap knocks softly (`playBoxClack`'s `cardboard`); a seal torn crackles (`playWrapTear`) and the film
  swings off the front and fades, a crumpled scrap of it left in the box (`box/FilmPeel`, shown with the contents).
- The box open: T lifts its cartridge (or disc) out towards the eye, tipped to show its label, and brings the box close
  (`GameBox.liftMedia`, `Hands`); again, back in its tray. The way out (`liftOffset`) goes on out of the opening until
  clear of the box, then forward, then up and tipped: never through a wall. Shut, or the media in a console, a word says so.
  Lifted, the mouse turns it rather than the box (`Carriable.turnLifted`, a trackball about the view's axes, applied in
  the box's frame on top of its lifted pose), the arrows a quarter at a time and Backspace its label back to the eye
  (`squareLifted`); it squares up again on its way back in. A cartridge's back carries a sticker in the widest band its
  grip ribs leave (`CartridgeModel.setBackPrint`, `covers/generated/CartridgeBack`: where it was made, the product
  code of `catalog/productCode`, a serial, the patents; drawn with the box's details, freed with them); a disc shows its
  dark read side.
- Closer to read: the wheel, the right trigger held at home (`Inspector.holdClose`), two fingers pinched (`TouchControls.onPinch`,
  `Inspector.pinch`: a full spread goes from the hand into the loupe, as the trigger's full travel does). On a controller
  the d-pad turns the box looked at a face at a time (the walk lets go of it meanwhile, `GamepadInput`'s `dpadWalks`).
- A second box beside it to compare (C), more boxes in the arms (Y), held while seated: docs/furnishing.md.
  One `closeness` runs 0 (the hand, low left, the right button held turns it, tipped no further than 80°) → 1 *looked
  at* (`Inspector.examining`, `onExamineChange`, `examine(on)`; the box in the middle of the view, the whole of it in
  view, never nearer than 26 cm) → 2 the loupe (`magnifying`, `loupe`). The first wheel notch from the hand goes straight
  to looked at and the rest of that roll stops there (one roll is the events less than 250 ms apart); back out, a roll
  stops there too before the hand. Looked at, the view holds still (`onLookEnabledChange`, as for the right button) and
  plain mouse movement turns the box as a trackball (about the view's vertical and horizontal, never inverted); the
  stick and a finger feed the same deltas (`SyntheticMouse`), so the pad and the touchscreen need nothing of their own.
  ←/→ turn it a quarter about the vertical, ↑/↓ its top or bottom to the eye, R the half turn, Backspace its front
  upright (`turnFace`, `squareUp`; eased, these keys are the box's only while it is looked at, the longplay remote's
  otherwise). Left still 0.25 s within 10° of a face square to the eye, it settles onto it (one of the 24 square
  turns). Past 1.4 the face squared to the eye fills the view (the near plane permitting), then the camera's own zoom
  magnifies it up to 3× (restored exactly when it lets go); the mouse then looks across the face as far as its edges
  instead of turning it. A step (a movement key) puts it back low in the hand and walks on; E puts it back on its shelf.
  The card shows the whole blurb while the back faces the eye (`facingBack`). The prompt line follows: closer, open,
  put back in the hand; closer, the faces, put back looked at (`Hands.keysLine`); a right-click tap shelves nothing then.
- A cart that would not boot leaves snow and a word ("a blow on the contacts"), never a dark set (`ProgramRunner`'s
  `failed`). The pad picked up, the view turns to the set and draws in a little (`player/closeUp`), letting go when
  the player looks away; the console's own pad (`consoleStyles` names it, `Console.padModel`, the TV's `deckFor`) rises
  off the stand into the lower view, its cable hidden, until the pad goes down (`player/padInView`).

## The papers in the box (`world/box/papers/`)

- What a box holds besides its media (`paperContents.papersOf`, drawn from the game id: the same copy, the same
  papers): the booklet (8 pages: cover, the health notice, getting started, the controls with the pad drawn, the story,
  hints, the lined notes page with a previous owner's pencil when the copy has some, the back cover with its code and
  barcode) and, for a copy that kept it, maybe a registration card (filled in by a child's hand one time in three), a
  leaflet (the publisher's other games of the platform from `SEED_GAMES`, adverts) and a folded poster or map. A copy
  without its booklet (`noManual`, `worn`) lost the lot. In the box they stand behind the booklet as thin slabs
  (`paperStack`, taking at most 40 % of the booklet's room, which is that much thinner), their tops showing over it in
  a card box that opens at the top.
- V with the box open: the booklet flies from where it lies to the middle of the view (`PaperReader`, eased between
  the booklet's pose in the box and the reading pose each frame), opens at its first spread; the box goes down low in
  the hand (`Inspector.setAside`: the view held still, the mouse, the wheel, the trigger and the pinch handed to the
  reader as an `AsideReader`; `examining` stays true, so the lamp and the dim of `box/ReadingLight` follow the paper).
  ←/→ turn a page (a card or a poster turned over), ↑/↓ the other papers (the one held drops out of the view and the
  next comes up), a click turns on (the right button back; neither goes on to the room), a quick sweep of the mouse,
  the stick or a finger turns too; the wheel, the trigger or a pinch is the loupe (the camera's zoom up to 3.5x, the
  mouse looking across the page, clamped at its edges). V or E puts it back in the box (shut on the way), a step puts
  it back and walks on, O shuts the box on it; the box put back, sold or rebuilt takes it back at once (`closeNow`).
- The model (`PaperModel`): a bound paper lies open at a spread, each side the thickness of its leaves, a page turning
  over the spine as a strip of 20 columns that curls behind its free edge; a sheet turns over about its middle, a
  folded one opens out across then down. Every face keeps a map (a white pixel tinted by the stock until its page is
  drawn: no second program), with the print glow the reading lamp lights. Pages (`pageArt`) are canvases 1536 px on
  their long side (a sheet 2048), drawn one a frame as they come into reach (the spread shown and the next either way),
  freed when they go out of it and when the paper goes back; the cover is the booklet's own (`ManualCover`).
- Sounds (`audio/paperSounds`): a page's swish and soft landing, a sheet's flick, a paper sliding out or back in.

## Programs on the screen (`src/onscreen/`)

A game can run on a screen of the flat instead of its longplay: `game/Screens.playOn` asks `programFor(game)`
(`onscreen/programs`, the providers `registerProgram` added at start-up) before searching; one that answers is run by
the `ProgramRunner` (made in `bootstrap/session`, ticked by the engine, `SessionParts.programs`):

- a `ScreenProgram` draws on a canvas of its own size (`width` x `height`), reads two `Pad`s a frame (d-pad, A, B,
  Start, Select), makes its own sound into `ProgramContext.audio.out` and ends itself with `over`. No DOM, no keys of its own;
- the picture goes on the glass through `VideoScreen.showFeed(texture)` (Television, Projector: `VideoSurface` lights the
  texture as `playing`, untinted, no iframe); the handle (`ScreenFeed`) gives the set's level and pan where the listener
  stands, which the runner puts on the program's sound (the `screens` bus); the set switched off (its button, an eject,
  another game, a travel) switches the program off;
- the player picks the pad up when it comes on (`game/ProgramPlay`, a route right after the arcade's) where they are
  (the armchair, or standing: the walk and the crosshair frozen, `setFrozen`); every key is the program's (the arcade stick's keys are the d-pad, A
  `K` / Space, B `J` / Shift, Start Enter, Select `H` / Backspace, `input/actions` padA..padSelect; a controller's d-pad and
  stick, bottom button B, right button A, Y Start, LB Select, since its own Start pauses the room and X walks away);
  walk-away twice puts the pad down and switches it off; the pointer unlocked holds it still (PAUSED blinks over the
  frozen frame, CLICK TO PLAY ON under it, the cabinets' look), a dormant zone too; on a touchscreen the left half's
  stick is the d-pad and A, B, Start, Select come on the glass bottom right (`TouchControls`, while
  `ProgramRunner.isHolding`; at an arcade cabinet, a Fire button);
- while it loads (the emulator's chunk, the ROM) the set warms up instead of staying black: the beam opening, then the
  title and LOADING on a faint raster (`onscreen/programOsd`);
- pad two is a second connected controller (`ProgramRunner.readPad(1)`); a CPU opponent is the game's own
  (`Duel.setOpponent(name, skill)`);
- an arcade game on the TV (PADDLE WARS, STARFALL, the home cabinet's games) runs through `onscreen/ArcadeProgram`: the
  arcade's fixed step, `padToControls` for the stick and fire with the press edge (`input/GameInput`), the chip sounds
  into the set's own output, no tickets shown.

## Homebrew carts (`src/emulator/`)

The NES really plays: `NesProgram` is the jsnes emulator (npm `jsnes`, Apache-2.0) as a `ScreenProgram`, stepped at
60.1 Hz from the frame clock (at most three frames caught up a tick), its APU through a short ring into the set. Only
freely licensed homebrew runs, never a commercial ROM: `HOMEBREW_CARTS` (`emulator/homebrew`) lists them as NES games
by "Homebrew" (generated covers, carts like any), their unmodified release ROMs in `public/roms/` with the licence next
to each (`<file>.LICENSE.txt`: author, release, source, licence). One is on the NES stall some market days
(`HOMEBREW` in pricing: odds, a flat price; `economy/MarketStock`); `?debug` owns them all. Put in the NES (or played
on a set without a console) it boots instead of a longplay (`registerHomebrew`, from `bootstrap/session`). Putting the
pad down keeps where the cart was (`NesProgram`'s `resumeAt`, jsnes `toJSON` / `fromJSON`, for the page's life: a whole
machine state is too big for the save), and picking it up again carries on from there. A cart with a battery (its
header's flag: Nova) keeps its 8 KB of save RAM in the save file (`emulator/nesBattery`, `KEYS.nesBattery`), written
when the pad goes down after the cart wrote to it, put back after the ROM loads; once the game has run a few seconds, a
burst of writes followed by a quiet quarter second shows "SAVED" in the picture's corner (`programOsd.paintSavedMark`). Homebrew and bootleg boxes have a front
of their own when no scan exists (`covers/PlaceholderCover`: plain card, a pixel motif from the name, the title on label
tape, the maker, a stamp), and a homebrew game knows its players (`Game.players`, on the back). The emulator's sound
still goes through a `ScriptProcessorNode`: an `AudioWorklet` needs its own module, and a secure context (https or
localhost) the self-hosted server on plain http does not give, so the old node would stay as the fallback anyway. The pad's controls line names
the keys next to the buttons ("A [K] jumps", `ProgramPlay`'s `padHint`, rebound keys included).

Credits (each checked against its repository's licence, 2026-10-01):
- **Thwaite** v0.04, Damian Yerrick: GPL-3.0-or-later (source github.com/pinobatch/thwaite-nes). 1-2 players.
- **Concentration Room** v0.02a, Damian Yerrick: GPL-3.0-or-later, with the author's exception allowing exact copies of
  the ROM without source (github.com/pinobatch/croom-nes). 1-2 players.
- **robotfindskitten** v0.10, NES port by Damian Yerrick of Leonard Richardson's game: zlib (github.com/pinobatch/rfk-nes). 2 players.
- **Nova the Squirrel** v1.0.6a, NovaSquirrel: code GPL-3.0-or-later, assets CC BY-NC-SA 4.0 (non-commercial: this
  project is; github.com/NovaSquirrel/NovaTheSquirrel).

A new cart: its ROM and licence file in `public/roms/`, a `cart(...)` line in `HOMEBREW_CARTS` (mapper 0, 1, 2, 3, 4, 7
and a few more run in jsnes: check the iNES header). Other programs (a canvas game for two, a prototype's demo) register
their own provider the same way.

## Sources

ConsoleMods "Dimensions for Game Cartridges" and "Cart Labels"; NESdev "NES cartridge dimensions";
Wikipedia (SNES / N64 Game Pak, Game Boy, PlayStation models); Player Clothing / RetroShell dimension
videos (NES, SNES, SFC, Famicom, Mega Drive boxes and carts); box-protector sellers (RetroProtection,
Display Geek, RetroGameCity) for the outer sizes; cdrom2go (jewel cases); dimensions.com (consoles,
pads). Label positions were checked against LaunchBox's cartridge photos.
