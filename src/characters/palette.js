// Palette tokens for every procedural character (research/art.md §6.2, §7, §11; GAME_DESIGN §3, §13.5, §18.3).
// Pure data: safe to import in node tests.

/** art.md §6.2 game palette (Swordcat + shared). */
export const PAL = Object.freeze({
  // Swordcat
  furGinger: '#D4935A', furGingerLight: '#F0C08F', furGingerDeep: '#A65E2E', furCream: '#EFE3D2', furCreamShade: '#C9B8A3',
  earInner: '#EBB0A6', nose: '#C97F7A', mouth: '#5A3A34', irisInner: '#8DB3C2', irisOuter: '#3F6170', irisRing: '#1B262C',
  pupil: '#0D1114', eyeLine: '#2A1E18',
  bow: '#F2A2B8', bowLight: '#FFD2DE', bowShade: '#C76E8A', bowKnot: '#E88AA6', whisker: '#F5EEE6',
  steel: '#A2A8B1', steelDark: '#737983', mail: '#4E535A', brass: '#D9B26A', brassDeep: '#A87C32',
  leather: '#6B4429', leatherDark: '#4A2E1F', capeRed: '#A3202C', capeLining: '#6B0F1A', capeSheen: '#E0525A',
  capeCream: '#E2D6C0', capeCreamHem: '#CDBB9C', blade: '#B6BCC4',
  holyCore: '#FFF6DA', holy: '#FFE3A3', holyEdge: '#E8A95A', holyRim: '#FFD98A', sparkle: '#FFF1C4', sparkleWarm: '#FFD57A',
  tuftRoot: '#EFE3D2', tuftTip: '#FFF6EA',
  // armour variants
  rust: '#8E5A3A', rustyPlate: '#8C8F93', ironDark: '#2E3036', bloodTrim: '#8E1B22', potMetal: '#8C8F88',
  // misc cloth / wood / food
  wood: '#8A6440', woodDark: '#5A3E2B', straw: '#D9BC6A', milk: '#F7F4EC', paper: '#EFE2C4', paperOld: '#D8C49A',
  waxRed: '#A3202C', tunic: '#9C7B57', linen: '#E9E2D2',
});

/** Cape colours (GAME_DESIGN §13.5; §13.3 shop capes). id → { color, lining, sheen, hem }. */
export const CAPES = Object.freeze({
  cream:     { color: '#CDBB98', lining: '#A08C68', sheen: '#EADCC0', hem: '#B09A72' },   // Marmalade's faded cape
  red:       { color: '#A3202C', lining: '#6B0F1A', sheen: '#E0525A', hem: '#D9B26A' },
  memeWhite: { color: '#F2EFE8', lining: '#CFCAC0', sheen: '#FFFFFF', hem: '#D9B26A' },
  blue:      { color: '#3F6FB5', lining: '#25426E', sheen: '#8DB0E8', hem: '#D9B26A' },
  green:     { color: '#5E7F3E', lining: '#3A4F26', sheen: '#A9C57E', hem: '#D9B26A' },
  midnight:  { color: '#262A44', lining: '#15172A', sheen: '#6C74A8', hem: '#C9CED8' },
  gold:      { color: '#D9B26A', lining: '#A87C32', sheen: '#FFE9B0', hem: '#FFF1C4' },
  pilgrim:   { color: '#E2D6C0', lining: '#C4B497', sheen: '#FFF6E6', hem: '#CDBB9C' },
  black:     { color: '#22242A', lining: '#141519', sheen: '#555A66', hem: '#8E1B22' },
  rust:      { color: '#7A3B22', lining: '#4D2414', sheen: '#B5714E', hem: '#C9A26A' },
});

/** Companion signature colours (GAME_DESIGN §3.3, art.md §13 HUD). */
export const SIGNATURE = Object.freeze({ mochi: '#3F6FB5', sage: '#5E7F3E', clover: '#F6F1E8', earlgrey: '#5C4A9C', pip: '#C2353B' });

/** Villager coat presets (art.md §7: ginger, cream, grey, black, white, brown tabby, tortie, bicolour). */
export const VILLAGER_COATS = Object.freeze({
  ginger:     { pattern: 'mackerel', base: '#D08A4E', deep: '#A65E2E', light: '#F0C08F', cream: '#EFE3D2', stripe: 0.35 },
  cream:      { pattern: 'tabby', base: '#E3C9A2', deep: '#C9A47A', light: '#F6E6CC', cream: '#F4ECE0', stripe: 0.2 },
  grey:       { pattern: 'mackerel', base: '#8D8F93', deep: '#4C4E52', light: '#C3C5C8', cream: '#E4E2DE', stripe: 0.4 },
  black:      { pattern: 'solid', base: '#1E1F24', deep: '#121317', light: '#3A3C44', cream: '#2A2B31', stripe: 0 },
  white:      { pattern: 'solid', base: '#E6E1D8', deep: '#CFC8BC', light: '#F2EEE8', cream: '#EAE6DF', stripe: 0 },
  brownTabby: { pattern: 'mackerel', base: '#8A6A4A', deep: '#3E2C1E', light: '#C4A27E', cream: '#E8DCCB', stripe: 0.5 },
  tortie:     { pattern: 'calico', base: '#3A2C26', deep: '#1E1714', light: '#6B4B3A', cream: '#4A3A30', patches: ['#C9783A', '#E2A060'], white: null, stripe: 0 },
  bicolour:   { pattern: 'tuxedo', base: '#4A4C52', deep: '#2A2B30', light: '#7A7D84', cream: '#E4DFD6', white: '#E4DFD6', stripe: 0 },
});

/** Accessory colour pool for villagers. */
export const VILLAGER_CLOTH = Object.freeze(['#B0503C', '#3F6FB5', '#5E7F3E', '#D9B26A', '#7A5C9C', '#C2353B', '#E9E2D2', '#8C6A4A', '#4E8C8A']);
