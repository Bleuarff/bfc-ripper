'use strict'

class Tracks{
  static getInfo(){
    const {exec} = require('child_process')
    return new Promise((resolve, reject) => {
      exec('cdparanoia -Q', (err, stdout, stderr) => {
        const raw = stderr,
              toc = Tracks.parseTOC(raw)
        resolve(toc)
      })
    })
  }

  static parseTOC(data){
    // debugger
    const toc = []
    const rx = /(?<tn>\d+)\.\s*\d+\s*\[(?<length>[\d:\.]+)\]\s*\d+\s*\[(?<start>[\d:\.]+)\]/ig

    let match = rx.exec(data)
    while(match){
      toc.push({
        tn: parseInt(match.groups.tn, 10),
        start: match.groups.start,
        length: match.groups.length
      })

      match = rx.exec(data)
    }
    return toc
  }
}
