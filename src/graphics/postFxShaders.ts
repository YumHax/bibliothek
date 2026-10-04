/*
 * GLSL of the `PostFx` passes: the programs are the `postFx*.glsl` files beside this one, made whole by `assemble()`
 * with the chunks below (the depth read, the dither noise, the luminance); the chunks stay template literals here
 * (no backtick in them).
 *
 * Render scale: the targets are allocated at the full drawing-buffer size and, while the adaptive
 * resolution is lowered, only their lower-left part is drawn (the viewport). A pass reads its inputs
 * at st = vUv * uvScale (texture space: the share of the texture that holds the frame) and clamps
 * its taps to uvLimit (half a texel short of the frame's edge), so nothing stale is ever read.
 */
import { HOSKINS_HASH } from './glslNoise';
import QUAD_VERTEX from './postFxQuad.vert.glsl?raw';
import LUMINANCE_FRAGMENT from './postFxLuminance.frag.glsl?raw';
import postFxAoFrag from './postFxAo.frag.glsl?raw';
import postFxAoBlurFrag from './postFxAoBlur.frag.glsl?raw';
import postFxDofFrag from './postFxDof.frag.glsl?raw';
import postFxMeterDownsampleFrag from './postFxMeterDownsample.frag.glsl?raw';
import postFxOutputFrag from './postFxOutput.frag.glsl?raw';
import { assemble } from '@/graphics/glslAssemble';
export { QUAD_VERTEX };
export { LUMINANCE_FRAGMENT };

/** Linear view depth (metres, positive) of the depth buffer at `uv`. */
const LINEAR_DEPTH = /* glsl */ `
#include <packing>
uniform sampler2D tDepth;
uniform float cameraNear;
uniform float cameraFar;
float linearDepth(vec2 uv) {
  return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, cameraNear, cameraFar);
}
`;

/** Per-pixel noise in [0, 1) (Jimenez's interleaved gradient): rotates a spiral of taps per pixel, so fixed patterns turn into fine noise. */
const INTERLEAVED_NOISE = /* glsl */ `
float interleavedNoise(vec2 px) {
  return fract(52.9829189 * fract(dot(px, vec2(0.06711056, 0.00583715))));
}
`;

/** Rec. 709 luminance weights. */
const LUMA = /* glsl */ `
float lumaOf(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}
`;

/**
 * Ambient occlusion from the depth buffer alone, at half resolution. Normals come from the
 * neighbouring depths (the flatter side of each pixel, so edges do not smear); a spiral of taps,
 * rotated per pixel, counts how much of the hemisphere above the surface is closed off within
 * `radius`, fading with distance so a far background never darkens the foreground.
 */
export const AO_FRAGMENT = assemble(postFxAoFrag, { chunks: { interleaved_noise: INTERLEAVED_NOISE } });

/** 4 x 4 blur of the half-resolution occlusion, weighted by depth so it does not bleed across silhouettes. */
export const AO_BLUR_FRAGMENT = assemble(postFxAoBlurFrag, { chunks: { linear_depth: LINEAR_DEPTH } });

/**
 * Copies the resolved scene into the working buffer, darkened by the ambient occlusion (high), so
 * the bloom that follows glows from the occluded colour and no glow is darkened after the fact.
 * The half-resolution occlusion is upsampled from its four nearest texels weighted by how close
 * their depth is to this pixel's (like `AO_BLUR_FRAGMENT`), so a silhouette gets no halo. While a
 * box is held up (`amount` > 0) the background beyond `focus` is gathered over a disc that grows
 * with depth: a spiral of taps rotated per pixel (no ghost copies), more of them for a wide blur
 * (photo mode). Taps closer than the pixel's own blur are weighted down so the sharp box in hand
 * never bleeds into the blur. The occlusion spares what glows (a lamp, a screen: light, not a
 * surface in a crease) and the window panes (`glassMask`: their view is far beyond the frame), and thins out with
 * the haze, as the fog hides the crease it would darken.
 */
export const DOF_FRAGMENT = assemble(postFxDofFrag, { chunks: { luma: LUMA, interleaved_noise: INTERLEAVED_NOISE, linear_depth: LINEAR_DEPTH } });

/**
 * The light meter's area average, in two quarter-size steps (full -> 1/4 -> 1/16, only when the
 * meter reads, every quarter second): each output texel is the mean of the 4 x 4 source texels
 * under it (four bilinear taps, each the mean of 2 x 2). The first step turns colour into
 * (log2 luminance x alpha, alpha), the second averages those, so the cut-out (alpha 0) carries no
 * weight and the average stays a log average.
 */
export const METER_DOWNSAMPLE_FRAGMENT = assemble(postFxMeterDownsampleFrag, { chunks: { luma: LUMA } });

/**
 * To the screen: the white balance (a von Kries matrix from the CPU, in linear light), exposure,
 * ACES filmic (three.js's fit, so the look matches the plain renderer), sRGB, then the grade in
 * display space (lift / gain, contrast S-curve, saturation), the vignette (as a black veil, so it darkens a video cut-out too) and grain (which
 * also dithers the gradients). Output stays premultiplied.
 *
 * `USE_FXAA`: the scene's MSAA resolves in linear HDR, before tone mapping, so an edge against a
 * lamp or the sky still steps. A light FXAA (the classic one: four diagonal neighbours, two or four
 * taps along the edge) runs on the HDR frame compressed by x / (1 + luma) (Karis), averaged there
 * and expanded back, so a bright edge blends like a tone-mapped one; the alpha is blended with the
 * colour, so the cut-out's border is smoothed and stays premultiplied.
 *
 * `sharpen` (`sharpened`, CAS): the frame is drawn below the screen's resolution (the pixel ratio's cap, the
 * adaptive resolution) and stretched back, and FXAA softens texture detail too: a light sharpen brings the lettering
 * and the facades' paint back, stronger the more the frame is stretched.
 */
export const OUTPUT_FRAGMENT = assemble(postFxOutputFrag, { chunks: { hoskins_hash: HOSKINS_HASH, luma: LUMA } });
