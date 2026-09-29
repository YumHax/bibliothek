import type { MediaSpec } from '@/catalog/media';
import { CartridgeModel } from './CartridgeModel';
import { DiscModel } from './DiscModel';
import type { MediaModel } from './MediaModel';

/** The model for a game's media: a disc, or the cartridge shell its spec names. */
export function createMediaModel(spec: MediaSpec): MediaModel {
  return spec.shape === 'disc' ? new DiscModel(spec) : new CartridgeModel(spec);
}
