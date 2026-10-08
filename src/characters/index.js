// Public API of the characters area (GAME_DESIGN §19.2 characters row). Import from 'src/characters/index.js' only.
export { buildKitten, Kitten, BONE_NAMES, ARM, TAIL_CURVE } from './KittenBuilder.js';
export { POSES, POSE_NAMES, SWORD_PTS, solveTwoBone, swordMatrix } from './Poses.js';
export {
  CATS, SWORDCAT, swordcatConfig, villagerConfig, lostKittenConfig, squireConfig, spoonBrigadeConfig, catConfig, eyeSet,
  LOST_KITTENS, KITTEN_IDS, SQUIRE_IDS, OLD_KNIGHT_IDS,
} from './configs.js';
export { PAL, CAPES, SIGNATURE, VILLAGER_COATS } from './palette.js';
export {
  FUR_QUALITY, setFurQuality, getFurQuality, shellsFor, FUR_WIND, FUR_TIME, makeStrandTexture, makeFurMaterial, coatColor, headFurMask, FurPart,
} from './Fur.js';
export { makeEyeTexture, eyeGeometry, eyeMaterial, EyePair, EXPRESSIONS } from './Eyes.js';
export { buildBow, bowGeometry, bowMaterial } from './Bow.js';
export { HeroCape, ClothSim, buildSwayCape, capeMaterial, capeGeometry, CAPE_DEFAULTS, CAPE_TIME, CAPE_WIND } from './Cape.js';
export { buildSword, mountModel, makeStreak, SWORD, SWORD_SKINS } from './Sword.js';
export { makePlateTexture, buildPlate, attachPlate, ensurePlateFont, pickPlateWord, PLATE_WORDS } from './Plate.js';
export { buildBeastHead, attachBeastHead, BEAST_PRESETS, KAYKIT_HEADS } from './BeastHead.js';
export { addPlateArmour, addGauntlet } from './Armour.js';
export { ACCESSORIES } from './Accessories.js';
export { buildProp, buildCage, PROP_NAMES, PROP_MOUNTS } from './Props/ProcProps.js';
export { registerMaterialPatcher, makeKitMaterial, kitMaterial, RM, HOLY_COLOR, setCharacterEnvMap, getCharacterEnvMap } from './materials.js';
export { assetUrl, setAssetResolver, mulberry32, hashString } from './util.js';
// ---- in-game glue (M1)
export { KittenView, MEME_CAPE, POSE_BLEND } from './KittenView.js';
export { initCharacters, disposeCharacters, characterFrame, visualDt, furShellsForPreset, WIND } from './runtime.js';
export { dressBeast, BEAST_LOOKS, holdOnBone, silhouette } from './BeastDress.js';
export { cagedKitten } from './Cages.js';
