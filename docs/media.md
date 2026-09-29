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

Each console in `world/props/consoleStyles` has a `MediaSlot`: the slot's mouth, the way in, how
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

## Sources

ConsoleMods "Dimensions for Game Cartridges" and "Cart Labels"; NESdev "NES cartridge dimensions";
Wikipedia (SNES / N64 Game Pak, Game Boy, PlayStation models); Player Clothing / RetroShell dimension
videos (NES, SNES, SFC, Famicom, Mega Drive boxes and carts); box-protector sellers (RetroProtection,
Display Geek, RetroGameCity) for the outer sizes; cdrom2go (jewel cases); dimensions.com (consoles,
pads). Label positions were checked against LaunchBox's cartridge photos.
