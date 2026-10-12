// Public API of the characters area (GAME_DESIGN §19.2 characters row). Import from 'src/characters/index.js' only.
export { buildKitten, Kitten, BONE_NAMES, ARM, TAIL_CURVE, EMOTE_DUR, EMOTE_RELEASE } from './KittenBuilder.js';
export { POSES, POSE_NAMES, EXTRA_POSE_NAMES, SWORD_PTS, solveTwoBone, swordMatrix } from './Poses.js';
export {
  CATS, SWORDCAT, swordcatConfig, villagerConfig, lostKittenConfig, squireConfig, spoonBrigadeConfig, catConfig, eyeSet,
  LOST_KITTENS, KITTEN_IDS, SQUIRE_IDS, OLD_KNIGHT_IDS, hubKittenConfig, HUB_ACTIVITY,
} from './configs.js';
export { PAL, CAPES, SIGNATURE, VILLAGER_COATS } from './palette.js';
export {
  FUR_QUALITY, setFurQuality, getFurQuality, shellsFor, FUR_WIND, FUR_TIME, makeStrandTexture, makeFurMaterial, coatColor, headFurMask, FurPart, MAX_SHELLS,
} from './Fur.js';
export { makeEyeTexture, eyeGeometry, eyeMaterial, EyePair, EXPRESSIONS } from './Eyes.js';
export { buildBow, bowGeometry, bowMaterial } from './Bow.js';
export { HeroCape, ClothSim, buildSwayCape, capeMaterial, capeGeometry, CAPE_DEFAULTS, CAPE_TIME, CAPE_WIND } from './Cape.js';
export { buildSword, mountModel, makeStreak, SWORD, SWORD_SKINS, DAWN_SPARKLES, makeBladeSparkles, restyleClaymore, guardHeight } from './Sword.js';
export { makePlateTexture, buildPlate, attachPlate, ensurePlateFont, pickPlateWord, PLATE_WORDS } from './Plate.js';
export { buildBeastHead, attachBeastHead, BEAST_PRESETS, KAYKIT_HEADS } from './BeastHead.js';
export { addPlateArmour, addGauntlet } from './Armour.js';
export { ACCESSORIES } from './Accessories.js';
export { buildProp, buildCage, PROP_NAMES, PROP_MOUNTS } from './Props/ProcProps.js';
export { CHEESE, M2_BUILDERS, M2_MOUNTS } from './Props/M2Props.js';
export { registerMaterialPatcher, makeKitMaterial, kitMaterial, RM, HOLY_COLOR, setCharacterEnvMap, getCharacterEnvMap } from './materials.js';
export { assetUrl, setAssetResolver, mulberry32, hashString, setCharDetail, charDetail } from './util.js';
// ---- in-game glue (M1)
export { KittenView, MEME_CAPE, POSE_BLEND } from './KittenView.js';
export { initCharacters, disposeCharacters, characterFrame, visualDt, furShellsForPreset, WIND } from './runtime.js';
export { dressBeast, BEAST_LOOKS, holdOnBone, silhouette } from './BeastDress.js';
export { cagedKitten } from './Cages.js';
export { noteRender, envTick, envColorsFromLights, characterEnvColors, resetCharacterEnv, CHAR_ENV } from './runtime.js';
export { STRANDS, FUR_RENDER_ORDER } from './Fur.js';
export { CAPE_FRONT, CAPE_NECK, capeFold, capeHem, capeShade, capeFoldPhase, drapePoint } from './Cape.js';
export { BOW_SELF_LIGHT } from './Bow.js';
// ---- readability from the iso camera (research/CONTROLS_SPEC.md §3, §7.4, §12 characters)
export {
  getSilhouetteProxy, setHighlight, setXray, ringAnchor, topTint, topTintMaterial, highlightObject, buildSilhouetteProxy,
  silhouetteParts, xrayMaterial, setProxyXray, updateReadability, topViewFactor, resolveTarget, XRAY, HIGHLIGHT, TOP_TINT,
} from './Readability.js';
export { READABILITY, TOP_VIEW } from './materials.js';
export { FUR_LOD_ISO, FUR_VIEW, furLodShells } from './Fur.js';

// ---- test / debug handle: the library reachable from any built kitten (`root.userData.kitten.constructor.lib`), so
// smoke tests driving the BUNDLED game (no /src imports there) can build props, cages and cats next to the player.
import { Kitten as _Kitten, buildKitten as _buildKitten } from './KittenBuilder.js';
import { buildProp as _buildProp, buildCage as _buildCage, PROP_NAMES as _PROP_NAMES } from './Props/ProcProps.js';
import { buildBeastHead as _buildBeastHead, BEAST_PRESETS as _BEAST_PRESETS } from './BeastHead.js';
import { buildPlate as _buildPlate } from './Plate.js';
import { CATS as _CATS, catConfig as _catConfig, SQUIRE_IDS as _SQUIRE_IDS, KITTEN_IDS as _KITTEN_IDS, HUB_ACTIVITY as _HUB } from './configs.js';
import { SWORD_SKINS as _SWORD_SKINS } from './Sword.js';
import { CAPES as _CAPES } from './palette.js';
import { FUR_LOD as _FUR_LOD } from './Fur.js';
import { cagedKitten as _cagedKitten } from './Cages.js';
import { characterEnvColors as _characterEnvColors } from './runtime.js';
import { getCharacterEnvMap as _getCharacterEnvMap } from './materials.js';
import { getSilhouetteProxy as _gsp, setHighlight as _shl, setXray as _sx, ringAnchor as _ra, topTint as _tt } from './Readability.js';
import { FUR_LOD_ISO as _FLI, FUR_VIEW as _FV } from './Fur.js';
import { TOP_VIEW as _TV, READABILITY as _RD } from './materials.js';
_Kitten.lib = Object.freeze({
  buildKitten: _buildKitten, buildProp: _buildProp, buildCage: _buildCage, PROP_NAMES: _PROP_NAMES, buildBeastHead: _buildBeastHead,
  BEAST_PRESETS: _BEAST_PRESETS, buildPlate: _buildPlate, CATS: _CATS, catConfig: _catConfig, SQUIRE_IDS: _SQUIRE_IDS,
  cagedKitten: _cagedKitten, characterEnvColors: _characterEnvColors, getCharacterEnvMap: _getCharacterEnvMap,
  KITTEN_IDS: _KITTEN_IDS, HUB_ACTIVITY: _HUB, SWORD_SKINS: _SWORD_SKINS, CAPES: _CAPES, FUR_LOD: _FUR_LOD,
  getSilhouetteProxy: _gsp, setHighlight: _shl, setXray: _sx, ringAnchor: _ra, topTint: _tt, FUR_LOD_ISO: _FLI, FUR_VIEW: _FV,
  TOP_VIEW: _TV, READABILITY: _RD,
});
