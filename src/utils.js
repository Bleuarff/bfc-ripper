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
}
