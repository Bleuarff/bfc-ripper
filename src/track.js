'use strict'

class Track{
  constructor(data){
    this.id = data.id
    this.start = data.start
    this.length = data.length

    this.artist = ''
    this.title = 'default #' + this.id
    this.albumTitle = ''
    this.year = ''
    this.trackCount = 0
    this.genre = ''
  }

  get filename(){
    return `${this.artist} - ${this.albumTitle} (${this.year}) - ${this.id.toString().padStart(2, '0')} - ${this.title}`
  }

  get sourcename(){
    return `track${this.id.toString().padStart(2, '0')}.cdda.wav`
  }

  get pos(){
    return `${this.id.toString().padStart(2, '0')}/${this.trackCount.toString().padStart(2, '0')}`
  }


}
