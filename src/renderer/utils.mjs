import { undiacritics } from "./undiacritics.mjs"

// converts a duration in ms into a string with minutes and seconds
export function parseTime(val){
  val /= 1000 // convert to seconds
  const min = Math.floor(val / 60),
        sec = Math.floor(val - min*60).toString().padStart(2, '0')
  return `${min}m ${sec}s`
}

// remove accented and common special chars
export function normalize(input){
  // https://en.wikipedia.org/wiki/Unicode_equivalence#Normalization
  // http://www.unicode.org/reports/tr15/

  // normalize codepoints (split diacritics) and remove diacritics
  let value = input.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
                  // remove/replace some special chars, just to be sure
                  .replace(/['"!?]/g, '')
                  .replace(/[/\\]/g, '-')
  // replace a lot of special chars. Redondant with line above, but also handles non-diacritics special chars (e.g. ligatures)
  return undiacritics.removeAll(value)
}


// returns unique CD identifier based on content
export async function getCDFingerprint(tracks) {
  const hash = tracks?.map((trk, i) => `${i.toString()}_${trk.start}_${trk.length}`)
    .join('/')

  return hash || null
}