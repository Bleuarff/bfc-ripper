import { IN_PROGRESS, Track } from './track.mjs'
import BfcStatus from './bfc-status.mjs'
import BfcAlert from './bfc-alert.mjs'
import BfcLog from './bfc-log.mjs'
import { normalize, parseTime, getCDFingerprint } from './utils.mjs'
import { createApp, defineComponent } from 'vue'
import { BfcApi } from '../preload.cjs'

declare global {
  let bfc: BfcApi
}

class ValidationError extends Error {
  fields: string[]

  constructor(fields: string[]){
    super()
    this.message = 'Missing fields'
    this.fields = fields
  }
}

type ProcessType = 'flac'|'mp3'

const appDef = defineComponent({
  data: function(){
    return {
      albumArtist: '',
      albumTitle: '',
      releaseYear: '',
      genre: '',
      tracks: [] as Track[],
      imagePath: '', // cover image filepath
      imageUrl: '', // data url
      imageSize: 0,
      discNumber: '01',
      runtime: '',
      ripping: false, // whether process is running
      drivePresent: false,

      cdparanoiaProc: null,
      tmpdir: '',
      config: {
        flacBasePath: '',
        mp3BasePath: ''
      },
      // rip options
      opts: {
        encodeFlac: true,
        encodeMp3: true,
        singleTrack: false,
        stopOnError: true
      },

      history: [] as string[], // list of cd fingerprints
    }
  },
  components: {
    BfcAlert,
    BfcLog,
    BfcStatus,
  },
  mounted: async function(){
    await this.watchDrive()
    this.loadConfig()

    // check drive state regularly to look for new CDs
    setInterval(this.watchDrive, 5000)

    bfc.onFlacData((_: any, data: Buffer|string) => this.logFlac.push(data))
    bfc.onFlacClose((id: number, code: number) => this.flacComplete(id, code))

    bfc.onLameData((_: any, data: Buffer|string) =>  this.logLame.push(data))
    bfc.onLameClose((id: number, code: number) => this.lameComplete(id, code))

  },
  watch: {
    albumArtist: function(val: string){
      // when album artist is edited, all tracks inherit it
      this.tracks.forEach(x => {x.artist = val})
    },
    // drive state changes: refresh/clear tracklist
    drivePresent: function(val){
      if (val)
        this.refresh()
      else{
        this.tracks = []
        this.runtime = ''
      }
    }
  },
  computed: {
    folderName: function(): string {
      const year = this.releaseYear ? ` (${this.releaseYear})` : ''
      return normalize(`${this.albumArtist} - ${this.albumTitle}${year}`)
    },
    flacOutputDir: async function(): Promise<string> {
      return bfc.resolve(this.config.flacBasePath, this.folderName)
    },
    mp3OutputDir: async function(): Promise<string> {
      return bfc.resolve(this.config.mp3BasePath, this.folderName)
    },

    /**
     * component instances
     **/ 
  
    alert(): InstanceType<typeof BfcAlert> {
      return this.$refs.alert as InstanceType<typeof BfcAlert>
    },
    logParanoia(): InstanceType<typeof BfcLog> {
      return this.$refs['log-paranoia'] as InstanceType<typeof BfcLog>
    },
    logFlac(): InstanceType<typeof BfcLog> {
      return this.$refs['log-flac'] as InstanceType<typeof BfcLog>
    },
    logLame(): InstanceType<typeof BfcLog> {
      return this.$refs['log-lame'] as InstanceType<typeof BfcLog>
    },

  },
  methods: {
    // refresh TOC
    refresh: async function(){
      const toc = await this.getTOC()
      this.tracks = toc.tracks
      this.runtime = toc.runtime
      
      this.clearAllLogs()
  
      // if artist is set before the CD is loaded, the watcher does nothing.
      // So we set artist on all tracks when CD loads.
      // Only on first CD, if you insert a 2nd CD we don't want previous CD's artist to leak.
      if (this.history.length === 1 && this.albumArtist)
        this.tracks.forEach(t => t.artist = this.albumArtist)
    },

    rip: async function(){
      if (!this.opts.encodeFlac && !this.opts.encodeMp3){
        this.alert.show('Select at least one encoding option (FLAC or MP3).')
        return
      }

      /* SETUP */
      this.tracks.forEach(t => {
        t.albumTitle = this.albumTitle
        t.year = this.releaseYear
        t.trackCount = this.tracks.length
        t.genre = this.genre
        t.discNumber = this.discNumber
      })

      try{
        this.validate()
      }
      catch(ex: any){
        this.alert.show(`Missing field${ex.fields.length > 1 ? 's' : ''}:\n${ ex.fields.join('\n')}`, {title: true, list: true})
        return
      }

      this.tmpdir = await bfc.getTmpDir()

      try{
        // create temp directories for wav, and target directories for flac & mp3
        const ps = [ bfc.mkdir(this.tmpdir) ]

        if (this.opts.encodeFlac)
          ps.push(bfc.mkdir(await this.flacOutputDir))

        if (this.opts.encodeMp3)
          ps.push(bfc.mkdir(await this.mp3OutputDir))

        await Promise.all(ps)
      }
      catch(ex){
        console.error(ex)
        this.alert.show('Error creating output directories')
        return
      }

      /* Start ripping process */
      this.ripping = true
      this.clearAllLogs()

      const args = [ // cdparanoia arguments
        '--output-wav',
        '--verbose',
        this.opts.singleTrack ? `"1-${this.tracks.length}"`: '--batch' // test mode: rip first track only
      ]

      const start = Date.now()
      const id = await bfc.spawnRip(args)

      // cdparanoia outputs everything on stderr, no need to listen to stdout
      const offStderr = bfc.onStderr(id, (data: Buffer|string) => {
        if (typeof data !== 'string')
          data = data.toString()

        this.logParanoia.push(data)

        let track: Track|undefined

        // detect a track is done when cdparanoia announces it starts a new track...
        const match = /outputting to (?<nst>track(?<tn>\d+)\.)?cdda\.wav/.exec(data)
        if (match) {
          const tnCapture = match.groups?.tn ?? ''
          const newTrackId: number = parseInt(tnCapture, 10), // get id of track being encoded
                prevTrackId = newTrackId - 1 // and previous track id

          if (newTrackId > 0){
            const newTrack = this.tracks.find(x => x.id === newTrackId)
            if (newTrack)
              newTrack.status.rip = IN_PROGRESS
          }
          else if (this.opts.singleTrack)
            this.tracks[0].status.rip = IN_PROGRESS

          if (prevTrackId > 0)
            track = this.tracks.find(x => x.id === prevTrackId)
        }
        // ...or when it's done.
        else if (data.indexOf('Done.') > -1){
          if (!this.opts.singleTrack)
            track = this.tracks[this.tracks.length - 1]
          else{
            this.tracks[0] = track = new Track({id: 1}, true)
            track.artist = this.albumArtist
            track.title = track.albumTitle = this.albumTitle
            track.year = this.releaseYear
            track.genre = this.genre
            track.trackCount = this.tracks.length
            track.discNumber = this.discNumber
          }
        }

        if (track){
          track.status.rip = 0
          if (this.opts.encodeFlac)
            this.encodeFLAC(track)
          else if (this.opts.encodeMp3)
            this.encodeMP3(track)
        }
      })

      bfc.onError(id, (msg: string) => {
        console.error('ERROR', msg)
      })

      bfc.onClose(id, (code: number) => {
        this.logParanoia.push(`cdparanoia exited with code ${code}`)
        this.logParanoia.push(`\nRip time: ${parseTime(Date.now() - start)}`)
      })
    },

    // checks metadata are there
    validate: function(): void {
      type trackFieldName = 'artist'|'albumTitle'|'title'
      const mandatory = ['artist', 'albumTitle'] as trackFieldName[]

      if (!this.opts.singleTrack) // title field is mandatory if not ripping as single track
        mandatory.push('title')

      const missing = []

      mandatory.forEach(field => {
        if (this.tracks.some(t => !t[field] ))
          missing.push(field)
      })

      if (!this.config.flacBasePath || !this.config.mp3BasePath)
        missing.push('output paths')

      if (missing.length > 0){
        throw new ValidationError(missing)
      }
    },

    encodeFLAC: async function(track: Track){
      if (!track) throw new Error('Track object is null')

      track.status.flac = IN_PROGRESS
      const inputFile = await bfc.resolve(this.tmpdir, track.sourcename),
            outputFile = await bfc.resolve(await this.flacOutputDir, `${track.filename}.flac`)

      const cmdParams = {
        artist: track.artist,
        title: track.title,
        album: track.albumTitle,
        pos: track.pos,
        year: track.year,
        genre: this.genre,
        discNumber: track.discNumber,
        imagePath: this.imagePath || null,
        outputFile,
        inputFile,
      }

      this.logFlac.push(`${inputFile}\n→ ${outputFile}`)

      track.flacProcId = await bfc.spawnFlac(cmdParams)
    },

    flacComplete: function(id: number, code: number) {
      const track = this.tracks.find(t => t.flacProcId === id)

      if (!track)
        throw new Error(`Cannot find track for FLAC process id. [id=${id}]`)

      track.status.flac = code
      this.logFlac.push(`flac exited with code ${code}.`, true)

      if (code != 0 && this.opts.stopOnError){ // stop everything
        this.cancel(true)
        return
      }

      // Don't start a new process if operations have been cancelled.
      // Otherwise mp3-encode a track once it's been encoded to flac
      if (this.ripping && this.opts.encodeMp3)
        this.encodeMP3(track)

      // check if all tracks are encoded
      const trackList = this.opts.singleTrack ? [track] : this.tracks

      if (trackList.every(t => t.status.flac != -1)){
        if (!this.opts.encodeMp3){
          // if no encoding to mp3, notify end process and clean files here
          this.ripping = false
          this.clearTemp()
        }
        const summary = trackList.map(t => `track ${t.id} done with exit code ${t.status.flac}`).join('\n')
        const final = trackList.every(t => t.status.flac == 0) ? '\nSuccess, all tracks OK\n' : ''
        this.logFlac.push('***********************\n' + summary + final, true)
      }
    },

    encodeMP3: async function(track: Track){
      if (!track) throw new Error('Track object is null')

      track.status.mp3 = IN_PROGRESS
      const inputFile = await bfc.resolve(this.tmpdir, track.sourcename),
            outputFile = await bfc.resolve(await this.mp3OutputDir, `${track.filename}.mp3`)

      const cmdParams = {
        title: track.title,
        artist: track.artist,
        album: track.albumTitle,
        year: track.year,
        pos: track.pos,
        genre: track.genre,
        imagePath: this.imagePath || null,
        discNumber: track.discNumber,
        inputFile,
        outputFile,
      }

      this.logLame.push(`${inputFile}\n→ ${outputFile}`)

      track.lameProcId = await bfc.spawnLame(cmdParams)
    },

    lameComplete: function(id: number, code: number) {
      const track = this.tracks.find(t => t.lameProcId === id)

      if (!track)
        throw new Error(`Cannot find track for Lame process id. [id=${id}]`)

      track.status.mp3 = code
      this.logLame.push(`lame exited with code ${code}.`, true)

      if (code != 0 && this.opts.stopOnError){ // stop everything
        this.cancel(true)
        return
      }

      // check if all tracks are encoded
      const trackList = this.opts.singleTrack ? [track] : this.tracks

      if (trackList.every(t => t.status.mp3 != -1)){
        this.ripping = false
        const summary = trackList.map(t => `track ${t.id} done with exit code ${t.status.mp3}`).join('\n')
        const final = trackList.every(t => t.status.mp3 == 0) ? '\nSuccess, all tracks OK\n' : ''
        this.logLame.push('***********************\n' + summary + final, true)
        this.clearTemp()
      }
    },

    // cancel rip. kill child proc.
    // No need to kill encoding processes, they're quick enough.
    cancel: async function(isError = false){
      await bfc.killRip()
      
      this.ripping = false
      const msg = isError == true ? '*** RIP ERROR ***' : '*** CANCEL RIP ***'
      this.logLame.push(msg)
      this.logFlac.push(msg)
      this.logParanoia.push(msg)
      this.clearTemp()
    },

    // delete temp (wav) folder
    clearTemp: async function(){
      if (!this.tmpdir) return

      try {
        await bfc.rmTmp()
      }
      catch(ex) {
        console.error(`Error deleting temp folder ${this.tmpdir}`, ex)
      }
    },

    // returns object with 2 properties:
    // tracks: array of Tracks with basic info,
    // runtime: (string) total cd runtime
    getTOC: async function(): Promise<{tracks: Track[], runtime: string}> {
      const { stderr } = await bfc.getTOC()
      const tracks = []
      // parse response array to get track number, length and start
      const rx = /(?<tn>\d+)\.\s*\d+\s*\[(?<length>[\d:\.]+)\]\s*\d+\s*\[(?<start>[\d:\.]+)\]/ig

      let match
      while(match = rx.exec(stderr)) {
        tracks.push(new Track({
          id: parseInt(match.groups?.tn as string, 10),
          start: match.groups?.start,
          length: match.groups?.length
        }))
      }

      const fingerprint = await getCDFingerprint(tracks)
      if (fingerprint)
        this.history.push(fingerprint)

      // get total cd runtime
      const rtm = /TOTAL\s*\d+\s*\[(?<rt>\d+:\d+\.\d+)\]/i.exec(stderr),
            runtime = rtm?.groups?.rt || ''

      return { tracks: tracks, runtime: runtime }
    },

    // track edition: select next logical field upon certain keydown
    moveFocus: function(e: KeyboardEvent){
      let target
      const currentTarget = e.currentTarget as HTMLElement|null

      if (e.key === 'ArrowUp'){// previous field of same type (artist or title)
        const row = currentTarget?.parentElement?.parentElement?.previousElementSibling
        if (row)
          target = row.querySelector(`.${currentTarget.classList[0]}`)
      }
      else if (e.key === 'ArrowDown'){// next field of same type
        const row = currentTarget?.parentElement?.parentElement?.nextElementSibling
        if (row)
          target = row.querySelector(`.${currentTarget.classList[0]}`)
      }
      else if (e.key === 'Enter'){// next logical field
        const type = currentTarget?.classList[0]
        if (type === 'trackArtist')
          target = currentTarget?.parentElement?.parentElement?.querySelector('.trackTitle')
        else if (type === 'trackTitle'){
          const row = currentTarget?.parentElement?.parentElement?.nextElementSibling
          if (row)
            target = row.querySelector('.trackTitle')
        }
      }

      if (target)
        (target as HTMLElement).focus()
    },

    // testEncodeFlac: async function(){
    //   const target = new Track({ id: '1' })
    //   this.tmpdir = '/home/bleuarff/.config/bfc-ripper/rip-1569964527211'
    //   this.albumArtist = target.artist = 'ufomammut'
    //   this.albumTitle = target.albumTitle = '8'
    //   this.genre = target.genre = ''
    //   this.releaseYear = target.year = ''
    //   target.trackCount = this.tracks.length
    //   // this.imagePath = '/home/bleuarff/dev/bfc-ripper/ufomammut - 8.jpeg'

    //   await bfc.mkdir(await this.flacOutputDir),
    //   this.encodeFLAC(target)
    // },

    // testEncodeMp3: async function(){
    //   const target = new Track({ id: '1' })
    //   this.tmpdir = '/home/bleuarff/.config/bfc-ripper/rip-1569964527211'
    //   this.albumArtist = target.artist = 'Ûfömammut'
    //   this.albumTitle = target.albumTitle = '8'
    //   this.genre = target.genre = ''
    //   this.releaseYear = target.year = ''
    //   target.trackCount = this.tracks.length
    //   // this.imagePath = '/home/bleuarff/dev/bfc-ripper/ufomammut - 8.jpeg'

    //   await bfc.mkdir(await this.mp3OutputDir)
    //   this.encodeMP3(target)
    // },

    selectImage: async function(e: Event){
      const currentTarget = e.currentTarget as HTMLInputElement

      if (!currentTarget?.files?.length)
        return

      const file = currentTarget.files[0]
      this.imagePath = await bfc.getPathForFile(file)
      this.imageUrl = URL.createObjectURL(file)
      this.imageSize = file.size / 1e3
    },

    loadConfig: async function(){
      const conf = localStorage.getItem('config')
      if (conf)
        this.config = JSON.parse(conf)
    },

    // Checks if there's a cd in drive and changes state prop accordingly.
    watchDrive: async function(){
      const { stdout } = await bfc.setCD()

      this.drivePresent = stdout.includes('Disc found in drive')
      return
    },

    openDirDialog: async function(type: ProcessType){
      const dirPath = await bfc.getDirectory()

      if (dirPath)
        this.setOutputDir(dirPath, type)
    },

    // sets flac or mp3 base directory & update localstorage config
    setOutputDir: function(path: string, type: ProcessType){
      if (type === 'flac')
        this.config.flacBasePath = path
      else if (type ==='mp3')
        this.config.mp3BasePath = path

      localStorage.setItem('config', JSON.stringify(this.config))
    },

    clearAllLogs: function(): void {
      this.logParanoia.clear()
      this.logFlac.clear()
      this.logLame.clear()
    }
  }
})

const app = createApp(appDef)
app.mount('#app')