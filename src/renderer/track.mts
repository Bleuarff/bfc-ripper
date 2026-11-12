import { normalize } from "./utils.mjs"
 
export const IN_PROGRESS = 2222

interface StatusGroup {
  rip: number
  flac: number
  mp3: number
}

export class Track{
  id: string
  start: string
  length: string
  artist: string
  title: string
  albumTitle: string
  year: string
  genre: string
  _discNumber: string
  trackCount: number
  singleTrack: boolean
  status: StatusGroup
  flacProcId: number
  lameProcId: number

  constructor(data: Record<string, any>, singleTrack = false){
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

    // ids of processes that encode that track
    this.flacProcId = -1
    this.lameProcId = -1
  }

  get filename(){
    const year = this.year ? ` (${this.year})` : ''
    let name = `${this.artist} - ${this.albumTitle}${year}`
    if (!this.singleTrack)
      name += ` - ${this.id.toString().padStart(2, '0')} - ${this.title}`
    return normalize(name)
  }

  get sourcename(): string {
    let prefix = ''
    if (!this.singleTrack)
      prefix = `track${this.id.toString().padStart(2, '0')}.`
    return `${prefix}cdda.wav`
  }

  get pos(): string {
    return `${this.id.toString().padStart(2, '0')}/${this.trackCount.toString().padStart(2, '0')}`
  }

  get success(): boolean {
    return this.status.flac == 0 && this.status.mp3 == 0
  }

  get discNumber(): string {
    return this._discNumber
  }
  set discNumber(val) {
    this._discNumber = val.padStart(2, '0')
  }
}
