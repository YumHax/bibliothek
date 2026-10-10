import { actionKeyLabel } from '@/ui/keys';

/**
 * A machine's how-to-play line with its keys named as the player's keyboard has them: `{left}`,
 * `{right}`, `{up}`, `{down}` and `{fire}` are the stick's and the button's first keys (ZQSD on
 * AZERTY, a rebound key followed), `{leftRight}` is "A / D", `{upDown}` "W / S", `{stick}` the four
 * ("WASD"). Resolved each time it is read, so the hint follows a rebinding; the games keep the
 * template and expose the resolved line as their `hint`.
 */
export function arcadeHint(template: string): string {
  const left = actionKeyLabel('stickLeft');
  const right = actionKeyLabel('stickRight');
  const up = actionKeyLabel('stickUp');
  const down = actionKeyLabel('stickDown');
  const four = [up, left, down, right];
  const stick = four.every((key) => key.length === 1) ? four.join('') : four.join(' / ');
  const tokens: Record<string, string> = { left, right, up, down, fire: actionKeyLabel('fire'), leftRight: `${left} / ${right}`, upDown: `${up} / ${down}`, stick };
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => tokens[name] ?? whole);
}
