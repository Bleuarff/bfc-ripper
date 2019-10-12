'use strict'

const IN_PROGRESS = 2222

class Track{
  constructor(data, singleTrack = false){
    this.id = data.id
    this.start = data.start
    this.length = data.length

    this.artist = ''
    this.title = ''
    this.albumTitle = ''
    this.year = ''
    this.trackCount = 0
    this.genre = ''
    this._discNumber = '01'
    this.singleTrack = singleTrack

    // -1: initial state,
    // 2222: in progress,
    // otherwise encoding process exit code
    this.status = {
      rip: -1,
      flac: -1,
      mp3: -1
    }
  }

  get filename(){
    const year = this.year ? ` (${this.year})` : ''
    let name = `${this.artist} - ${this.albumTitle}${year}`
    if (!this.singleTrack)
      name += ` - ${this.id.toString().padStart(2, '0')} - ${this.title}`
    return Utils.normalize(name)
  }

  get sourcename(){
    let prefix = ''
    if (!this.singleTrack)
      prefix = `track${this.id.toString().padStart(2, '0')}.`
    return `${prefix}cdda.wav`
  }

  get pos(){
    return `${this.id.toString().padStart(2, '0')}/${this.trackCount.toString().padStart(2, '0')}`
  }

  get success(){
    return this.status.flac == 0 && this.status.mp3 == 0
  }

  get discNumber(){
    return this._discNumber
  }
  set discNumber(val){
    this._discNumber = val.padStart(2, '0')
  }
}
