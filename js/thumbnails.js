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
  // Base archetypes
  'womens_dress': 'women_dress.jpg',
  'abaya': 'women_abaya.jpg',
  'mens_shirt': 'men_shirt.jpg',
  'thobe': 'men_thobe.jpg',
  'girls_dress': 'girls_dress.jpg',
  'boys_trousers': 'boys_trousers.jpg',

  // Women's unique per-pattern lookbook photos
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

  // Men's unique per-pattern lookbook photos
  'm01': 'm01.jpg',
  'm02': 'm02.jpg',
  'm03': 'm03.jpg',
  'm04': 'm04.jpg',
  'm05': 'm05.jpg',
  'm06': 'm06.jpg',
  'm07': 'm07.jpg',
  'm22': 'men_shorts.jpg',

  // Boys
  'b03': 'boys_trousers.jpg',
  'b07': 'boys_trousers.jpg',
  'b13': 'boys_trousers.jpg',
  'b21': 'boys_trousers.jpg',
};

/**
 * Resolves the appropriate high-res human model thumbnail image URL
 * for any pattern entry in the BerryStudio library.
 *
 * @param {Object} item Library item descriptor { id, cat, tag, type, thumb? }
 * @param {Object} [pattern] The PATTERNS[item.id] object if available
 * @returns {string} Relative URL to the high-res thumbnail image
 */
export function getPatternThumbnail(item, pattern) {
  if (!item) return THUMBNAIL_BASE + ARCHETYPE_IMAGES['women_dress'];
  if (item.thumb) return item.thumb;

  if (PATTERN_SPECIFIC_THUMBS[item.id]) {
    return THUMBNAIL_BASE + PATTERN_SPECIFIC_THUMBS[item.id];
  }

  const cat = item.cat || (pattern && pattern.category) || 'women';
  const type = item.type || 'dress';
  const nameEn = (pattern && pattern.name && (pattern.name.en || pattern.name)) || '';
  const tagEn = (item.tag && (item.tag.en || item.tag)) || '';
  const isShorts = /short/i.test(nameEn) || /short/i.test(tagEn);

  let filename = '';

  if (cat === 'women') {
    switch (type) {
      case 'dress': filename = 'women_dress.jpg'; break;
      case 'robe': filename = 'women_abaya.jpg'; break;
      case 'gown': filename = 'women_gown.jpg'; break;
      case 'top': filename = 'women_top.jpg'; break;
      case 'skirt': filename = 'women_skirt.jpg'; break;
      case 'trousers': filename = 'women_trousers.jpg'; break;
      case 'suit': filename = 'women_suit.jpg'; break;
      case 'coat': filename = 'women_coat.jpg'; break;
      case 'jacket': filename = 'women_jacket.jpg'; break;
      case 'underwear': filename = 'women_underwear.jpg'; break;
      case 'bra': filename = 'women_bra.jpg'; break;
      default: filename = 'women_dress.jpg';
    }
  } else if (cat === 'men') {
    switch (type) {
      case 'shirt': filename = 'men_shirt.jpg'; break;
      case 'robe': filename = 'men_thobe.jpg'; break;
      case 'trousers': filename = isShorts ? 'men_shorts.jpg' : 'men_trousers.jpg'; break;
      case 'top': filename = 'men_top.jpg'; break;
      case 'jacket': filename = 'men_jacket.jpg'; break;
      case 'coat': filename = 'men_coat.jpg'; break;
      case 'suit': filename = 'men_suit.jpg'; break;
      case 'underwear': filename = 'men_underwear.jpg'; break;
      default: filename = 'men_shirt.jpg';
    }
  } else if (cat === 'girls') {
    switch (type) {
      case 'dress': filename = 'girls_dress.jpg'; break;
      case 'gown': filename = 'girls_gown.jpg'; break;
      case 'skirt': filename = 'girls_skirt.jpg'; break;
      case 'top': filename = 'girls_top.jpg'; break;
      case 'trousers': filename = 'girls_trousers.jpg'; break;
      case 'coat': filename = 'girls_coat.jpg'; break;
      case 'leotard': filename = 'girls_leotard.jpg'; break;
      case 'underwear':
      case 'bra': filename = 'girls_underwear.jpg'; break;
      case 'suit': filename = 'girls_dress.jpg'; break;
      default: filename = 'girls_dress.jpg';
    }
  } else if (cat === 'boys') {
    switch (type) {
      case 'shirt': filename = 'boys_shirt.jpg'; break;
      case 'top': filename = 'boys_top.jpg'; break;
      case 'trousers': filename = 'boys_trousers.jpg'; break;
      case 'robe': filename = 'boys_thobe.jpg'; break;
      case 'jacket': filename = 'boys_jacket.jpg'; break;
      case 'coat': filename = 'boys_coat.jpg'; break;
      case 'suit': filename = 'boys_suit.jpg'; break;
      case 'underwear': filename = 'boys_underwear.jpg'; break;
      default: filename = 'boys_top.jpg';
    }
  } else {
    filename = 'women_dress.jpg';
  }

  return THUMBNAIL_BASE + filename;
}

if (typeof window !== 'undefined') {
  window.THUMBNAIL_BASE = THUMBNAIL_BASE;
  window.ARCHETYPE_IMAGES = ARCHETYPE_IMAGES;
  window.PATTERN_SPECIFIC_THUMBS = PATTERN_SPECIFIC_THUMBS;
  window.getPatternThumbnail = getPatternThumbnail;
}
