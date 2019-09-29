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
}
