import { registerProgram } from '@/onscreen';
import { homebrewCart } from './homebrew';
import { NesProgram } from './NesProgram';

/** The homebrew carts run in the emulator instead of a longplay (`onscreen/programs`); called once from `bootstrap/session`. */
export function registerHomebrew(): () => void {
  return registerProgram((game) => {
    const cart = homebrewCart(game.id);
    if (!cart) return null;
    return () => new NesProgram({ title: cart.game.title, rom: cart.rom, hint: cart.hint, players: cart.players });
  });
}
