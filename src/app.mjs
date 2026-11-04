import { IN_PROGRESS, Track } from './track.mjs'
import bfcStatus from './bfc-status.mjs'
import bfcAlert from './bfc-alert.mjs'
import bfcLog from './bfc-log.mjs'
import { normalize, parseTime } from './utils.mjs'
import {createApp} from '../lib/vue.esm-browser.prod.js'

class ValidationError extends Error {
  constructor(fields){
    super()
    this.message = 'Missing fields'
    this.fields = fields
  }
}

const appDef = {
  data: function(){
    return {
      albumArtist: '',
      albumTitle: '',
      releaseYear: '',
      genre: '',
      tracks: [],
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
      }
    }
  },
  mounted: async function(){
    await this.watchDrive()
    this.loadConfig()

    // check drive state regularly to look for new CDs
    setInterval(this.watchDrive, 5000)

  },
  watch: {
    albumArtist: function(val){
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
    folderName: function(){
      const year = this.releaseYear ? ` (${this.releaseYear})` : ''
      return normalize(`${this.albumArtist} - ${this.albumTitle}${year}`)
    },
    flacOutputDir: async function(){
      return window.bfc.resolve(this.config.flacBasePath, this.folderName)
    },
    mp3OutputDir: async function(){
      return window.bfc.resolve(this.config.mp3BasePath, this.folderName)
    }
  },
  methods: {
    // refresh TOC
    refresh: async function(){
      const toc = await this.getTOC()
      this.tracks = toc.tracks
      this.runtime = toc.runtime
      ;['paranoia', 'flac', 'lame'].forEach(x => this.$refs['log-' + x].clear()) // clear all logs
    },

    rip: async function(){
      if (!this.opts.encodeFlac && !this.opts.encodeMp3){
        this.$refs.alert.show('Select at least one encoding option (FLAC or MP3).')
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
      catch(ex){
        this.$refs.alert.show(`Missing field${ex.fields.length > 1 ? 's' : ''}:\n${ ex.fields.join('\n')}`, {title: true, list: true})
        return
      }

      this.tmpdir = await window.bfc.getTmpDir()

      try{
        // create temp dir for wav & flac output dir
        const ps = await Promise.all([
          bfc.mkdir(this.tmpdir),
          bfc.mkdir(await this.flacOutputDir),
          bfc.mkdir(await this.mp3OutputDir),
        ])
      }
      catch(ex){
        console.error(ex)
        this.$refs.alert.show('Error creating output directories')
        return
      }

      /* Start ripping process */
      this.ripping = true
      ;['paranoia', 'flac', 'lame'].forEach(x => this.$refs['log-' + x].clear()) // clear all logs

      const args = [ // cdparanoia arguments
        '--output-wav',
        '--verbose',
        this.opts.singleTrack ? `"1-${this.tracks.length}"`: '--batch' // test mode: rip first track only
      ]
      console.log('cdparanoia ' + args.join(' '))
      const start = Date.now()

      const id = await bfc.spawnRip(args)

      // cdparanoia outputs everything on stderr, no need to listen to stdout
      const offStderr = bfc.onStderr(id, data => {
        if (typeof data !== 'string')
          data = data.toString()

        this.$refs['log-paranoia'].push(data)

        let track

        // detect a track is done when cdparanoia announces it starts a new track...
        const match = /outputting to (?<nst>track(?<tn>\d+)\.)?cdda\.wav/.exec(data)
        if (match){
          const newTrackId = parseInt(match.groups.tn, 10), // get id of track being encoded
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

      bfc.onError(id, msg => {
        console.error('ERROR', msg)
      })

      bfc.onClose(id, code => {
        this.$refs['log-paranoia'].push(`cdparanoia exited with code ${code}`)
        this.$refs['log-paranoia'].push(`\nRip time: ${parseTime(Date.now() - start)}`)
      })
    },

    // checks metadata are there
    validate: function(){
      const mandatory = ['artist', 'albumTitle']

      if (!this.opts.singleTrack) // title field is mandatory if not ripping as single track
        mandatory.push('title')

      const missing = []

      mandatory.forEach(field => {
        if (this.tracks.some(t => !t[field]))
          missing.push(field)
      })

      if (!this.config.flacBasePath || !this.config.mp3BasePath)
        missing.push('output paths')

      if (missing.length > 0){
        throw new ValidationError(missing)
      }
    },

    encodeFLAC: async function(track){
      if (!track) throw new Error('Track object is null')

      track.status.flac = IN_PROGRESS
      const inputFile = await window.bfc.resolve(this.tmpdir, track.sourcename),
            outputFile = await window.bfc.resolve(await this.flacOutputDir, `${track.filename}.flac`)

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

      this.$refs['log-flac'].push(`${inputFile}\n→ ${outputFile}`)

      const id = await bfc.spawnFlac(cmdParams)

      bfc.onFlacData(id, data => {
        this.$refs['log-flac'].push(data)
      })

      bfc.onFlacClose(id, code => {
        track.status.flac = code
        this.$refs['log-flac'].push(`flac exited with code ${code}.`, true)

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
          this.$refs['log-flac'].push('***********************\n' + summary + final, true)
        }
      })
    },

    encodeMP3: async function(track){
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

      this.$refs['log-lame'].push(`${inputFile}\n→ ${outputFile}`)

      const id = await bfc.spawnLame(cmdParams)

      bfc.onLameData(id, data => {
        this.$refs['log-lame'].push(data)
      })
      
      bfc.onLameClose(id, code => {
        track.status.mp3 = code
        this.$refs['log-lame'].push(`lame exited with code ${code}.`, true)

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
          this.$refs['log-lame'].push('***********************\n' + summary + final, true)
          this.clearTemp()
        }
      })
    },

    // cancel rip. kill child proc.
    // No need to kill encoding processes, they're quick enough.
    cancel: async function(isError = false){
      await bfc.killRip()
      
      this.ripping = false
      const msg = isError == true ? '*** RIP ERROR ***' : '*** CANCEL RIP ***'
      this.$refs['log-lame'].push(msg)
      this.$refs['log-flac'].push(msg)
      this.$refs['log-paranoia'].push(msg)
      this.clearTemp()
    },

    // delete temp (wav) folder
    clearTemp: async function(){
      if (!this.tmpdir) return

      try {
        await bfc.rmTmp()
      }
      catch(ex) {
        console.error(`Error deleting temp folder ${this.tmpdir}`, err)
      }
    },

    // returns object with 2 properties:
    // tracks: array of Tracks with basic info,
    // runtime: (string) total cd runtime
    getTOC: async function(){
      const { stderr } = await bfc.getTOC()
      const tracks = []
      // parse response array to get track number, length and start
      const rx = /(?<tn>\d+)\.\s*\d+\s*\[(?<length>[\d:\.]+)\]\s*\d+\s*\[(?<start>[\d:\.]+)\]/ig

      let match
      while(match = rx.exec(stderr)){
        tracks.push(new Track({
          id: parseInt(match.groups.tn, 10),
          start: match.groups.start,
          length: match.groups.length
        }))
      }

      // get total cd runtime
      const rtm = /TOTAL\s*\d+\s*\[(?<rt>\d+:\d+\.\d+)\]/i.exec(stderr),
            runtime = rtm ? rtm.groups.rt : ''
      return { tracks: tracks, runtime: runtime }
    },

    // track edition: select next logical field upon certain keydown
    moveFocus: function(e){
      let target

      if (e.key === 'ArrowUp'){// previous field of same type (artist or title)
        const row = e.currentTarget.parentElement.parentElement.previousElementSibling
        if (row)
          target = row.querySelector(`.${e.currentTarget.classList[0]}`)
      }
      else if (e.key === 'ArrowDown'){// next field of same type
        const row = e.currentTarget.parentElement.parentElement.nextElementSibling
        if (row)
          target = row.querySelector(`.${e.currentTarget.classList[0]}`)
      }
      else if (e.key === 'Enter'){// next logical field
        const type = e.currentTarget.classList[0]
        if (type === 'trackArtist')
          target = e.currentTarget.parentElement.parentElement.querySelector('.trackTitle')
        else if (type === 'trackTitle'){
          const row = e.currentTarget.parentElement.parentElement.nextElementSibling
          if (row)
            target = row.querySelector('.trackTitle')
        }
      }

      if (target)
        target.focus()
    },

    testEncodeFlac: async function(){
      const target = new Track({ id: '1' })
      this.tmpdir = '/home/bleuarff/.config/bfc-ripper/rip-1569964527211'
      this.albumArtist = target.artist = 'ufomammut'
      this.albumTitle = target.albumTitle = '8'
      this.genre = target.genre = ''
      this.releaseYear = target.year = ''
      target.trackCount = this.tracks.length
      // this.imagePath = '/home/bleuarff/dev/bfc-ripper/ufomammut - 8.jpeg'

      await bfc.mkdir(await this.flacOutputDir),
      this.encodeFLAC(target)
    },

    testEncodeMp3: async function(){
      const target = new Track({ id: '1' })
      this.tmpdir = '/home/bleuarff/.config/bfc-ripper/rip-1569964527211'
      this.albumArtist = target.artist = 'Ûfömammut'
      this.albumTitle = target.albumTitle = '8'
      this.genre = target.genre = ''
      this.releaseYear = target.year = ''
      target.trackCount = this.tracks.length
      // this.imagePath = '/home/bleuarff/dev/bfc-ripper/ufomammut - 8.jpeg'

      await bfc.mkdir(await this.mp3OutputDir)
      this.encodeMP3(target)
    },

    selectImage: async function(e){
      if (!e.currentTarget.files.length)
        return

      const file = e.currentTarget.files[0]
      this.imagePath = await window.bfc.getPathForFile(file)
      this.imageUrl = URL.createObjectURL(file)
      this.imageSize = (file.size / 1e3).toFixed(1)
    },

    loadConfig: async function(){
      const conf = localStorage.getItem('config')
      if (conf)
        this.config = JSON.parse(conf)
    },

    // Checks if there's a cd in drive and changes state prop accordingly.
    watchDrive: async function(){
      const { stdout } = await window.bfc.setCD()

      this.drivePresent = stdout.includes('Disc found in drive')
      return
    },

    openDirDialog: async function(type){
      const dirPath = await window.bfc.getDirectory()

      if (dirPath)
        this.setOutputDir(dirPath, type)
    },

    // sets flac or mp3 base directory & update localstorage config
    setOutputDir: function(path, type){
      if (type === 'flac')
        this.config.flacBasePath = path
      else if (type ==='mp3')
        this.config.mp3BasePath = path

      localStorage.setItem('config', JSON.stringify(this.config))
    },
  }
}

const app = createApp(appDef)

app.component('bfc-status', bfcStatus)
app.component('bfc-alert', bfcAlert)
app.component('bfc-log', bfcLog)
app.mount('#app')