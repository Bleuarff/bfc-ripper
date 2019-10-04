'use strict'

class Utils{
  // promise wrapper over mkdirp
  static mkdirp(path){
    const mkdirp = require('mkdirp')
    return new Promise((resolve, reject) => {
      mkdirp(path, (err, made) => {
        if (err) reject(err)
        resolve(made)
      })
    })
  }

  // converts a duration in ms into a string with minutes and seconds
  static parseTime(val){
    val /= 1000 // convert to seconds
    const min = Math.floor(val / 60),
          sec = Math.floor(val - min*60).toString().padStart(2, '0')
    return `${min}m ${sec}s`
  }

  // remove accented and common special chars
  static normalize(input){
    // https://en.wikipedia.org/wiki/Unicode_equivalence#Normalization
    // http://www.unicode.org/reports/tr15/

    // normalize codepoints (split diacritics) and remove diacritics
    let value = input.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    // replace a lot of special chars. Redondant with line above, but also handles non-diacritics special chars (e.g. ligatures)
    return undiacritics.removeAll(value)
  }
}
