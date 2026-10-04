/*
 * THE CO-OWNERSHIP MEETING (l'assemblée générale): what can be put to the vote, who votes and how
 * they lean, when it sits. Data only; `coproMeeting.ts` runs it, `coproState.ts` keeps what it
 * decided, the stairwell shows it (`stairwell/coproLook.ts`).
 */

/** Everything a meeting can decide. */
export type ResolutionId = 'runner' | 'paint' | 'plants' | 'bikes' | 'lift' | 'fibre' | 'doormat' | 'mirror';

export interface ResolutionOption {
  id: string;
  label: string;
}

export interface Resolution {
  id: ResolutionId;
  /** The agenda's wording. */
  title: string;
  /** A line under it in the ballot: what it would change. */
  detail: string;
  options: ResolutionOption[];
  /** How the building stands before any meeting decided it (and what a tie keeps). */
  initial: string;
}

export const RESOLUTIONS: readonly Resolution[] = [
  {
    id: 'runner',
    title: 'The stair carpet',
    detail: 'The runner up the flights, held by brass rods. Wear and tear, say some; noise, say others.',
    options: [
      { id: 'red', label: 'Keep the red runner' },
      { id: 'green', label: 'A new green runner' },
      { id: 'none', label: 'Take it up: bare stone' },
    ],
    initial: 'red',
  },
  {
    id: 'paint',
    title: 'Repainting the stairwell',
    detail: 'The walls of every landing, the dado below and the plaster above.',
    options: [
      { id: 'cream', label: 'Cream and brown, as ever' },
      { id: 'sage', label: 'Sage green' },
      { id: 'ochre', label: 'Warm ochre' },
    ],
    initial: 'cream',
  },
  {
    id: 'plants',
    title: 'Plants on the half landings',
    detail: 'A potted plant under every courtyard window, watered by the concierge.',
    options: [
      { id: 'yes', label: 'Yes, a plant on each' },
      { id: 'no', label: 'No: they will die' },
    ],
    initial: 'no',
  },
  {
    id: 'bikes',
    title: 'Bicycles in the entrance hall',
    detail: 'Letting the residents leave their bikes along the hall wall.',
    options: [
      { id: 'yes', label: 'Allow them' },
      { id: 'no', label: 'Forbid them' },
    ],
    initial: 'no',
  },
  {
    id: 'lift',
    title: 'Overhauling the lift',
    detail: 'New cables and motor, a faster car. The cage and its gates stay.',
    options: [
      { id: 'keep', label: 'Leave it as it is' },
      { id: 'overhaul', label: 'Overhaul it' },
    ],
    initial: 'keep',
  },
  {
    id: 'fibre',
    title: 'Fibre to every flat',
    detail: 'A junction box in the hall, a cable up the shaft. More channels on the television.',
    options: [
      { id: 'yes', label: 'Bring the fibre in' },
      { id: 'no', label: 'Not needed' },
    ],
    initial: 'no',
  },
  {
    id: 'doormat',
    title: 'A doormat at the street door',
    detail: 'A coir mat at the sas\u2019s glass door, for the muddy days.',
    options: [
      { id: 'yes', label: 'Buy one' },
      { id: 'no', label: 'Not worth it' },
    ],
    initial: 'no',
  },
  {
    id: 'mirror',
    title: 'A mirror in the entrance hall',
    detail: 'A tall gilt mirror on the hall wall, by the street door.',
    options: [
      { id: 'yes', label: 'Hang a mirror' },
      { id: 'no', label: 'Leave the wall bare' },
    ],
    initial: 'no',
  },
];

/** Someone with a vote: a flat on the stairs (by name, as `STAIRWELL_PLAN`), or the rear building's owners. */
interface Voter {
  who: string;
  /** How they vote on a resolution whatever happens (their nature); the rest is drawn per meeting. */
  leans: Partial<Record<ResolutionId, string>>;
  /** A line of theirs heard about the vote, for the minutes. */
  aside?: string;
}

export const COPRO_PLAN = {
  /** A meeting every this many game days (the first on that day). */
  every: 14,
  /** The ballot opens this many days before (the agenda pinned on the board) and closes at the end of the meeting's day. */
  openDays: 3,
  /** Resolutions on each agenda. */
  perAgenda: 3,
  /** The minutes stay on the board this many days after. */
  minutesDays: 4,
  /** The meeting's hour, said on the agenda (game hours). */
  hour: 19,
  /** The syndic, who chairs it and stands in the hall on the meeting's day from `syndicHours`. */
  syndic: 'M. Bertin',
  syndicHours: [17, 22] as [number, number],
  syndicSeed: 131,
  syndicLines: [
    'The meeting is tonight at seven. Postal votes in the box, please.',
    'Every flat has one vote. Some think theirs counts double.',
    'Mrs Roux has opinions on the carpet. Strong ones.',
    'Do vote. Last time three people decided for nine flats.',
  ],
  /** Coins that buy one more vote: the player paying towards the works. */
  contribution: 25,
  /** At most this many bought votes on one resolution. */
  maxBought: 3,
  voters: [
    { who: 'Mrs Roux', leans: { runner: 'red', paint: 'cream', plants: 'yes', bikes: 'no', lift: 'overhaul', fibre: 'no' }, aside: 'Mrs Roux said the red runner was there before the war and would be after.' },
    { who: 'Mr & Mrs Moreau', leans: { lift: 'overhaul', bikes: 'no', mirror: 'yes' }, aside: 'The Moreaus asked whether the lift could go faster. It could not, until now.' },
    { who: 'A. Leclerc', leans: { fibre: 'yes', bikes: 'yes' } },
    { who: 'The Nguyens', leans: { fibre: 'yes', bikes: 'yes', plants: 'yes' }, aside: 'The Nguyens’ son asked whether fibre meant faster games. It does.' },
    { who: 'P. Girard', leans: { runner: 'none', paint: 'sage' } },
    { who: 'R. Haddad', leans: { paint: 'ochre', doormat: 'yes' } },
    { who: 'Mrs Dubois', leans: { plants: 'yes', runner: 'green', mirror: 'yes' }, aside: 'Mrs Dubois offered cuttings from her own plants.' },
    { who: 'J.-P. Martin', leans: { fibre: 'no', lift: 'keep' }, aside: 'M. Martin voted against everything, on principle.' },
    { who: 'S. Rossi', leans: { bikes: 'yes', doormat: 'yes' } },
    { who: 'The rear building', leans: { lift: 'keep' }, aside: 'The rear building, which has no lift, voted against paying for ours.' },
  ] as Voter[],
};
