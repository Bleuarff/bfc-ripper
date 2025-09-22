'use strict'

const { mkdir } = require('fs').promises,
      { spawn, exec } = require('child_process'),
      path = require('path'),
      os = require('os'),
      { rimraf } = require('rimraf'),
      { mkdirp } = require('mkdirp')

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
      return Utils.normalize(`${this.albumArtist} - ${this.albumTitle}${year}`)
    },
    flacOutputDir: function(){
      return path.resolve(this.config.flacBasePath, this.folderName)
    },
    mp3OutputDir: function(){
      return path.resolve(this.config.mp3BasePath, this.folderName)
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
        alert('Select at least one encoding option (FLAC or MP3).')
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
        alert(ex.message)
        return
      }

      this.tmpdir = path.resolve(os.tmpdir(), 'bfcrip-' + Date.now().toString())

      try{
        // create temp dir for wav & flac output dir
        const ps = await Promise.all([
          mkdir(this.tmpdir),
          mkdirp(this.flacOutputDir),
          mkdirp(this.mp3OutputDir),
        ])
      }
      catch(ex){
        console.error(ex)
        alert('Error creating output directories')
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

      this.cdparanoiaProc = spawn('cdparanoia', args, {cwd: this.tmpdir})

      // cdparanoia outputs everything on stderr, no need to listen to stdout
      this.cdparanoiaProc.stderr.on('data', (data) => {
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

      this.cdparanoiaProc.on('close', (code) => {
        this.$refs['log-paranoia'].push(`cdparanoia exited with code ${code}`)
        this.$refs['log-paranoia'].push(`\nRip time: ${Utils.parseTime(Date.now() - start)}`)
      })
    },

    // checks metadata are there
    validate: function(){
      const mandatory = ['artist', 'albumTitle']

      if (!this.opts.singleTrack) // title field is mandatory if not ripping as single track
        mandatory.push('title')

      mandatory.forEach(field => {
        if (this.tracks.some(t => !t[field]))
          throw new Error(`Missing field: ${field}`)
      })

      if (!this.config.flacBasePath || !this.config.mp3BasePath)
        throw new Error('Missing output paths')
    },

    encodeFLAC: function(track){
      if (!track) throw new Error('Track object is null')

      track.status.flac = IN_PROGRESS
      const inputFile = path.resolve(this.tmpdir, track.sourcename),
            outputFile = path.resolve(this.flacOutputDir, `${track.filename}.flac`)

      const cmd = [
        'flac',
        '-3',
        `-T ARTIST="${track.artist}"`,
        `-T TITLE="${track.title}"`,
        `-T ALBUM="${track.albumTitle}"`,
        `-T TRACKNUMBER="${track.pos}"`,
        `-T DATE="${track.year}"`,
        `-T GENRE="${this.genre}"`,
        `-T DISCNUMBER="${track.discNumber}"`,
        this.imagePath ? `--picture="${this.imagePath}"` : '',
        `-o "${outputFile}"`,
        `"${inputFile}"`
      ].join(' ')
      console.log(cmd)

      this.$refs['log-flac'].push(`${inputFile}\n→ ${outputFile}`)
      const flacProc = spawn(cmd, [], {shell: true})
      flacProc.stdout.on('data', data => {
        this.$refs['log-flac'].push(data)
      })
      flacProc.stderr.on('data', data => {
        this.$refs['log-flac'].push(data)
      })
      flacProc.on('close', (code) => {
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

    encodeMP3: function(track){
      if (!track) throw new Error('Track object is null')

      track.status.mp3 = IN_PROGRESS
      const inputFile = path.resolve(this.tmpdir, track.sourcename),
            outputFile = path.resolve(this.mp3OutputDir, `${track.filename}.mp3`)

      const cmd = [
        'lame',
        '-S',
        '-V2',
        '--noreplaygain',
        '--add-id3v2',
        `--tt "${track.title}"`,
        `--ta "${track.artist}"`,
        `--tl "${track.albumTitle}"`,
        `--ty "${track.year}"`,
        `--tn "${track.pos}"`,
        `--tg "${track.genre}"`,
        this.imagePath ? `--ti "${this.imagePath}"` : '',
        `--tv "TPOS=${track.discNumber}"`,
        `"${inputFile}"`,
        `"${outputFile}"`
      ].join(' ')
      console.log(cmd)

      this.$refs['log-lame'].push(`${inputFile}\n→ ${outputFile}`)
      const mp3Proc = spawn(cmd, [], {shell: true})
      mp3Proc.stdout.on('data', data => {
        this.$refs['log-lame'].push(data)
      })
      mp3Proc.stderr.on('data', data => {
        this.$refs['log-lame'].push(data)
      })
      mp3Proc.on('close', (code) => {
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
    cancel: function(isError = false){
      this.cdparanoiaProc.kill('SIGTERM')
      this.ripping = false
      const msg = isError == true ? '*** RIP ERROR ***' : '*** CANCEL RIP ***'
      this.$refs['log-lame'].push(msg)
      this.$refs['log-flac'].push(msg)
      this.$refs['log-paranoia'].push(msg)
      this.clearTemp()
    },

    // delete temp (wav) folder
    clearTemp: function(){
      if (!this.tmpdir) return

      rimraf(this.tmpdir)
      .then(err => {
        if (err) console.error(`Error deleting temp folder ${this.tmpdir}`)
      })
    },

    // returns object with 2 properties:
    // tracks: array of Tracks with basic info,
    // runtime: (string) total cd runtime
    getTOC: function(){
      return new Promise((resolve, reject) => {
        exec('cdparanoia -Q', (err, stdout, stderr) => {
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
          resolve({tracks: tracks, runtime: runtime})
        })
      })
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

      await mkdirp(this.flacOutputDir),
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

      await mkdirp(this.mp3OutputDir)
      this.encodeMP3(target)
    },

    selectImage: function(e){
      if (!e.currentTarget.files.length)
        return

      const file = e.currentTarget.files[0]
      this.imagePath = file.path
      this.imageUrl = URL.createObjectURL(file)
      this.imageSize = (file.size / 1e3).toFixed(1)
    },

    loadConfig: async function(){
      const conf = localStorage.getItem('config')
      if (conf)
        this.config = JSON.parse(conf)
    },

    // Checks if there's a cd in drive and changes state prop accordingly.
    watchDrive: function(){
      return new Promise(resolve => {
        exec('setcd -i', (err, stdout, stderr) => {
          this.drivePresent = stdout.indexOf('Disc found in drive') > -1
          resolve()
        })
      })
    },

    // sets flac or mp3 base directory & update localstorage config
    selectOutputDir: function(e, type){
      if (!e.currentTarget.files.length)
        return

      const path = e.currentTarget.files[0].path
      if (type === 'flac')
        this.config.flacBasePath = path
      else if (type ==='mp3')
        this.config.mp3BasePath = path

      localStorage.setItem('config', JSON.stringify(this.config))
    }
  }
}

const app = Vue.createApp(appDef)

for(const [name, def] of window.cpnts){
  app.component(name, def)
}

app.mount('#app')