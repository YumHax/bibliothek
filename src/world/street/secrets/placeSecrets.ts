import * as THREE from 'three';
import type { BoxArtLoader } from '@/covers/BoxArtLoader';
import type { Game } from '@/catalog/types';
import type { Furniture } from '../../Furniture';
import { groundHeight } from '../relief/ground';
import { SECRETS_PLAN } from './secretsPlan';
import { DustyPane, RailingCarving, chalkSquares } from './StreetSecrets';

/** What the secrets are placed with: the zone, and what a fished-out cartridge needs. */
interface SecretsSite {
  zone: { place<F extends Furniture>(item: F, position: THREE.Vector3, rotationY?: number): F; remove(item: Furniture): void };
  covers: BoxArtLoader;
  wallet: { readonly coins: number; subscribe(cb: () => void): () => void };
  purse?: { earnCoins(coins: number): void };
  randomGames: (seed: string, count: number) => Promise<Game[]>;
  owns: (id: string) => boolean;
  isWanted: (id: string) => boolean;
}

/** Front Street's secrets where `SECRETS_PLAN` puts them (`StreetSecrets`): the dusty pane, the chalk, the carving. */
export function placeSecrets(site: SecretsSite): void {
  const { zone } = site;
  const { dust, dustFind, chalk, carving } = SECRETS_PLAN;
  const findAt = new THREE.Vector3(dustFind.at[0], groundHeight(dustFind.at[0], dustFind.at[1]) + 0.016, dustFind.at[1]);
  zone.place(
    new DustyPane({ host: zone, covers: site.covers, wallet: site.wallet, randomGames: site.randomGames, owns: site.owns, isWanted: site.isWanted, find: { at: findAt, yaw: dustFind.yaw }, size: dust.size, glass: dust.glass }),
    new THREE.Vector3(dust.at[0], dust.y, dust.at[1]),
    dust.yaw,
  );
  const [x0, z0] = chalk.at;
  for (const { square, at } of chalkSquares(new THREE.Vector2(chalk.step[0], chalk.step[1]), chalk.side, site.purse)) {
    const x = x0 + at.x;
    const z = z0 + at.z;
    zone.place(square, new THREE.Vector3(x, groundHeight(x, z), z));
  }
  zone.place(new RailingCarving(), new THREE.Vector3(carving.at[0], carving.y, carving.at[1]), carving.yaw);
}
