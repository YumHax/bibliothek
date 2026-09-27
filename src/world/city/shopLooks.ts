import type { ShopKind } from '../street/streetPlan';

/**
 * How a kind of shop looks from the pavement, the same in both pictures of the street (the window
 * view's painted fronts, `props/outdoors/Shopfront.ts`, and the walkable street's facades): the
 * word on its fascia, the joinery, the fascia board and its lettering, the awning's stripes (colour,
 * then the one between) or none, the colours filling its window, and whether it keeps going into
 * the small hours. How it lights up is each picture's own.
 */
export interface ShopColours {
  name: string;
  front: string;
  fascia: string;
  letters: string;
  awning: [string, string] | null;
  goods: string[];
  late: boolean;
}

export const SHOP_LOOKS: Record<Exclude<ShopKind, 'shut'>, ShopColours> = {
  cafe: { name: 'CAFE', front: '#2f4a3a', fascia: '#2f4a3a', letters: '#e9dcb5', awning: ['#2f5a44', '#efe6d2'], goods: ['#6a4a32', '#d9c9a8', '#3a2a22'], late: false },
  bakery: { name: 'BAKERY', front: '#6b4a2a', fascia: '#5a3a22', letters: '#f1d890', awning: ['#b8862f', '#f3ead6'], goods: ['#d9a05a', '#b8763a', '#e8c890', '#8a5a2a'], late: false },
  pharmacy: { name: 'PHARMACY', front: '#d8d8d2', fascia: '#2f7a4a', letters: '#f4f4ee', awning: null, goods: ['#f0f0f0', '#6fb0d0', '#e0e8e0', '#8fc0a0'], late: false },
  books: { name: 'BOOKSHOP', front: '#2a3550', fascia: '#2a3550', letters: '#e0c878', awning: ['#2f4f6a', '#e8e0cc'], goods: ['#8a2a2a', '#2f4f6a', '#d9c9a0', '#3f6b4f', '#b8862f', '#e8e2d2'], late: false },
  grocer: { name: 'GREENGROCER', front: '#3f5a2a', fascia: '#3f5a2a', letters: '#f0e8c8', awning: ['#3f6b4f', '#f0ead8'], goods: ['#d9383a', '#f09a3a', '#6fa35e', '#e8d040'], late: false },
  florist: { name: 'FLOWERS', front: '#4a3a5a', fascia: '#e8e0d4', letters: '#5a3f6a', awning: ['#5a3f6a', '#e8e0d4'], goods: ['#e0567a', '#f0f0e8', '#b04ac0', '#4d7a3a', '#f09a3a'], late: false },
  tabac: { name: 'NEWSAGENT', front: '#3a3634', fascia: '#8a2a2a', letters: '#f0e8d8', awning: null, goods: ['#c9c9c9', '#d94f3a', '#3b6fb3'], late: true },
  bar: { name: 'BAR', front: '#241c1a', fascia: '#241c1a', letters: '#f0c060', awning: ['#7a2f2f', '#2a2020'], goods: ['#c9a050', '#6a8a5a', '#a03a2a', '#3a2a22'], late: true },
  butcher: { name: 'BUTCHER', front: '#7a2a2a', fascia: '#7a2a2a', letters: '#f0e8d8', awning: ['#8a2a2a', '#f0ead8'], goods: ['#c9544a', '#e8d8c8', '#a83a30'], late: false },
  furniture: { name: 'FURNITURE', front: '#5a4632', fascia: '#e6dcc6', letters: '#5a4632', awning: ['#7a5a3a', '#efe6d2'], goods: ['#8a6a4a', '#c9a26a', '#6e7b8c', '#b84a3a', '#e8e0cc'], late: false },
  electronics: { name: 'TV REPAIR', front: '#23303a', fascia: '#1e2a33', letters: '#8fe6ff', awning: null, goods: ['#2a2a2e', '#4a4a52', '#9ab8c8', '#6fa0c8'], late: false },
  pets: { name: 'PET SHOP', front: '#2f6a6a', fascia: '#f0ead8', letters: '#2f6a6a', awning: ['#2f6a6a', '#f0ead8'], goods: ['#e0a040', '#6fa35e', '#3b6fb3', '#d9c9a8', '#c9544a'], late: false },
  laundry: { name: 'LAUNDERETTE', front: '#3a6a8a', fascia: '#f0f0ea', letters: '#3a6a8a', awning: null, goods: ['#e8e8e8', '#c9c9c9', '#3a6a8a'], late: true },
  // Their names are neon signs over the fascia in the walkable street (`NeonSign`).
  retro: { name: 'RETRO GAMES', front: '#1c1a2a', fascia: '#2a1f4a', letters: '#8fe6ff', awning: null, goods: ['#d94f3a', '#3b6fb3', '#f0c94a', '#e8e8e8', '#6fa35e', '#8c4f9e'], late: false },
  arcade: { name: 'ARCADE', front: '#120c18', fascia: '#1a1024', letters: '#ff2fa0', awning: null, goods: ['#ff2fa0', '#5fe6ff', '#ffd23a', '#7a5cff', '#3aff8a'], late: true },
};
