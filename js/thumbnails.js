/* ============================================================
   BerryStudio — Pattern Library High-Resolution Product Thumbnails
   Photorealistic lookbook imagery of human models wearing the
   finished garments corresponding to each pattern archetype.
   ============================================================ */

export const THUMBNAIL_BASE = './assets/thumbnails/';

export const ARCHETYPE_IMAGES = {
  // Women
  'women_dress': 'women_dress.jpg',
  'women_abaya': 'women_abaya.jpg',
  'women_gown': 'women_gown.jpg',
  'women_top': 'women_top.jpg',
  'women_skirt': 'women_skirt.jpg',
  'women_trousers': 'women_trousers.jpg',
  'women_suit': 'women_suit.jpg',
  'women_coat': 'women_coat.jpg',
  'women_jacket': 'women_jacket.jpg',
  'women_underwear': 'women_underwear.jpg',
  'women_bra': 'women_bra.jpg',

  // Men
  'men_shirt': 'men_shirt.jpg',
  'men_thobe': 'men_thobe.jpg',
  'men_trousers': 'men_trousers.jpg',
  'men_shorts': 'men_shorts.jpg',
  'men_top': 'men_top.jpg',
  'men_jacket': 'men_jacket.jpg',
  'men_coat': 'men_coat.jpg',
  'men_suit': 'men_suit.jpg',
  'men_underwear': 'men_underwear.jpg',

  // Girls
  'girls_dress': 'girls_dress.jpg',
  'girls_gown': 'girls_gown.jpg',
  'girls_skirt': 'girls_skirt.jpg',
  'girls_top': 'girls_top.jpg',
  'girls_trousers': 'girls_trousers.jpg',
  'girls_coat': 'girls_coat.jpg',
  'girls_leotard': 'girls_leotard.jpg',
  'girls_underwear': 'girls_underwear.jpg',

  // Boys
  'boys_shirt': 'boys_shirt.jpg',
  'boys_top': 'boys_top.jpg',
  'boys_trousers': 'boys_trousers.jpg',
  'boys_thobe': 'boys_thobe.jpg',
  'boys_jacket': 'boys_jacket.jpg',
  'boys_coat': 'boys_coat.jpg',
  'boys_suit': 'boys_suit.jpg',
  'boys_underwear': 'boys_underwear.jpg',
};

export const PATTERN_SPECIFIC_THUMBS = {
  // Women — unique finished garment photographs (each seen once)
  'womens_dress': 'women_dress.jpg',
  'abaya': 'women_abaya.jpg',
  'w01': 'w01.jpg',
  'w02': 'w02.jpg',
  'w03': 'w03.jpg',
  'w04': 'w04.jpg',
  'w05': 'w05.jpg',
  'w06': 'w06.jpg',
  'w07': 'w07.jpg',
  'w08': 'w08.jpg',
  'w09': 'w09.jpg',
  'w10': 'w10.jpg',
  'w11': 'w11.jpg',
  'w12': 'w12.jpg',
  'w13': 'w13.jpg',
  'w14': 'w14.jpg',
  'w15': 'w15.jpg',
  'w16': 'w16.jpg',
  'w17': 'w17.jpg',
  'w18': 'w18.jpg',
  'w19': 'w19.jpg',
  'w20': 'w20.jpg',
  'w21': 'w21.jpg',
  'w22': 'w22.jpg',
  'w23': 'w23.jpg',
  'wf01': 'women_gown.jpg',
  'wf06': 'women_top.jpg',
  'wf08': 'women_suit.jpg',
  'wf09': 'women_coat.jpg',
  'wf11': 'women_skirt.jpg',
  'wf12': 'women_jacket.jpg',
  'wf16': 'women_trousers.jpg',
  'wu01': 'women_underwear.jpg',
  'wb01': 'women_bra.jpg',

  // Men — unique finished garment photographs (each seen once)
  'mens_shirt': 'men_shirt.jpg',
  'thobe': 'men_thobe.jpg',
  'm01': 'm01.jpg',
  'm02': 'm02.jpg',
  'm03': 'm03.jpg',
  'm04': 'm04.jpg',
  'm05': 'm05.jpg',
  'm06': 'm06.jpg',
  'm07': 'm07.jpg',
  'm10': 'men_top.jpg',
  'm14': 'men_trousers.jpg',
  'm22': 'men_shorts.jpg',
  'mf01': 'men_suit.jpg',
  'mf02': 'men_coat.jpg',
  'mf03': 'men_jacket.jpg',
  'mu01': 'men_underwear.jpg',

  // Girls — unique finished garment photographs (each seen once)
  'girls_dress': 'girls_dress.jpg',
  'gf01': 'girls_skirt.jpg',
  'gf02': 'girls_gown.jpg',
  'gf06': 'girls_coat.jpg',
  'g02': 'girls_top.jpg',
  'g04': 'girls_trousers.jpg',
  'gy001': 'girls_leotard.jpg',
  'gu01': 'girls_underwear.jpg',

  // Boys — unique finished garment photographs (each seen once)
  'boys_trousers': 'boys_trousers.jpg',
  'b01': 'boys_shirt.jpg',
  'b06': 'boys_top.jpg',
  'b11': 'boys_thobe.jpg',
  'bf01': 'boys_suit.jpg',
  'bf02': 'boys_jacket.jpg',
  'bf03': 'boys_coat.jpg',
  'bu01': 'boys_underwear.jpg',
};

/**
 * Resolves the unique high-res human model thumbnail image URL
 * for a pattern entry. If the pattern does not have an exclusive
 * dedicated photograph, returns null so the pattern renders its
 * own unique technical CAD flat, guaranteeing zero repeated thumbnails.
 *
 * @param {Object} item Library item descriptor { id, cat, tag, type, thumb? }
 * @param {Object} [pattern] The PATTERNS[item.id] object if available
 * @returns {string|null} Relative URL to the photo, or null for flat rendering
 */
export function getPatternThumbnail(item, pattern) {
  if (!item) return null;
  if (item.thumb) return item.thumb;

  if (PATTERN_SPECIFIC_THUMBS[item.id]) {
    return THUMBNAIL_BASE + PATTERN_SPECIFIC_THUMBS[item.id];
  }

  // Never repeat archetype photos — return null so pattern renders its own unique flat!
  return null;
}

if (typeof window !== 'undefined') {
  window.THUMBNAIL_BASE = THUMBNAIL_BASE;
  window.ARCHETYPE_IMAGES = ARCHETYPE_IMAGES;
  window.PATTERN_SPECIFIC_THUMBS = PATTERN_SPECIFIC_THUMBS;
  window.getPatternThumbnail = getPatternThumbnail;
}
