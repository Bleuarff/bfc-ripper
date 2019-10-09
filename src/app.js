'use strict'

const fsp = require('fs').promises,
      { spawn, exec } = require('child_process'),
      path = require('path'),
      os = require('os'),
      { safeLoad } = require('js-yaml')



const app = new Vue({
  el: '#app',
  data: {
    albumArtist: '',
    albumTitle: '',
    releaseYear: '',
    genre: '',
    tracks: [],
    imagePath: '', // cover image filepath
    imageUrl: '', // data url
    imageSize: 0,
    discNumber: '01',
    ripping: false,

    cdparanoiaProc: null,
    config: null,
    tmpdir: '',

    // rip options
    encodeFlac: true,
    encodeMp3: true,
    singleTrack: false,
    stopOnError: true
  },
  mounted: async function(){
    this.start()
    this.loadConfig()
  },
  watch: {
    albumArtist: function(val){
      // when album artist is edited, all tracks inherit it
      this.tracks.forEach(x => {x.artist = val})
    }
  },
  computed: {
    folderName: function(){
      const year = this.releaseYear ? ` (${this.releaseYear})` : ''
      return Utils.normalize(`${this.albumArtist} - ${this.albumTitle}${year}`)
    },
    flacOutputDir: function(){
      return path.resolve(this.config.FLAC.directory, this.folderName)
    },
    mp3OutputDir: function(){
      return path.resolve(this.config.MP3.directory, this.folderName)
    }
  },
  methods: {
    // start: refresh TOC
    start: async function(){
      this.tracks = await this.getTOC()
    },

    rip: async function(test = false){
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

      const args = [ // cdparanoia arguments
        '--output-wav',
        '--verbose',
        test ? '1': '--batch' // test mode: rip first track only
      ]

      this.tmpdir = path.resolve(os.tmpdir(), 'bfcrip-' + Date.now().toString())

      // create temp dir for wav & flac output dir
      const ps = await Promise.all([
        fsp.mkdir(this.tmpdir),
        Utils.mkdirp(this.flacOutputDir),
        Utils.mkdirp(this.mp3OutputDir),
      ])

      /* Start ripping process */

      this.ripping = true
      const start = Date.now()
      this.cdparanoiaProc = spawn('cdparanoia', args, {cwd: this.tmpdir})

      // cdparanoia outputs everything on stderr, no need to listen to stdout
      this.cdparanoiaProc.stderr.on('data', (data) => {
        this.$refs['log-paranoia'].push(data)

        let track
        // detect a track is done when cdparanoia announces it starts a new track.
        const match = /outputting to track(?<tn>\d+)/.exec(data)
        if (match){
          const tn = parseInt(match.groups.tn, 10) - 1 // get previous track number
          if (tn > 0)
            track = this.tracks.find(x => x.id === tn)
        }
        else if (data.indexOf('Done.') > -1){ // or get last track
          track = this.tracks[this.tracks.length - 1]
        }

        if (track)
          this.encodeFLAC(track)
      })

      this.cdparanoiaProc.on('close', (code) => {
        this.$refs['log-paranoia'].push(`cdparanoia exited with code ${code}`)
        this.$refs['log-paranoia'].push(`\nRip time: ${Utils.parseTime(Date.now() - start)}`)
      })
    },

    // checks metadata are there
    validate: function(){
      const mandatory = ['artist', 'title', 'albumTitle']
      mandatory.forEach(field => {
        if (this.tracks.some(t => !t[field]))
          throw new Error(`Missing field: ${field}`)
      })
    },

    encodeFLAC: function(track){
      if (!track) throw new Error('Track object is null')

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

        if (code != 0 && this.stopOnError){ // stop everything
          this.cancel()
          return
        }

        // Don't start a new process if operations have been cancelled.
        // Otherwise mp3-encode a track once it's been encoded to flac
        if (this.ripping)
          this.encodeMP3(track)

        // check if all tracks are encoded
        if (this.tracks.every(t => t.status.flac != -1)){
          const summary = this.tracks.map(t => `track ${t.id} done with exit code ${t.status.flac}`).join('\n')
          const final = this.tracks.every(t => t.status.flac == 0) ? '\nSuccess, all tracks OK\n' : ''
          this.$refs['log-flac'].push('***********************\n' + summary + final, true)
        }
      })
    },

    encodeMP3: function(track){
      if (!track) throw new Error('Track object is null')

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

        if (code != 0 && this.stopOnError){ // stop everything
          this.cancel()
          return
        }

        // check if all tracks are encoded
        if (this.tracks.every(t => t.status.mp3 != -1)){
          this.ripping = false
          const summary = this.tracks.map(t => `track ${t.id} done with exit code ${t.status.mp3}`).join('\n')
          const final = this.tracks.every(t => t.status.mp3 == 0) ? '\nSuccess, all tracks OK\n' : ''
          this.$refs['log-lame'].push('***********************\n' + summary + final, true)
        }
      })
    },

    // cancel rip. kill child proc.
    // No need to kill encoding processes, they're quick enough.
    cancel: function(){
      this.cdparanoiaProc.kill('SIGTERM')
      this.ripping = false
      const msg = '*** CANCEL RIP ***'
      this.$refs['log-lame'].push(msg)
      this.$refs['log-flac'].push(msg)
      this.$refs['log-paranoia'].push(msg)
    },

    // delete temp (wav) folder
    clear: function(){
      if (!this.tmpdir) return

      const rimraf = require('rimraf')
      rimraf(this.tmpdir, err => {
        if (err) console.error(`Error deleting temp folder ${this.tmpdir}`)
      })
    },

    // returns an array of tracks with basic info
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
          resolve(tracks)
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

      await Utils.mkdirp(this.flacOutputDir),
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

      await Utils.mkdirp(this.mp3OutputDir)
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
      try{
        const conf = await fsp.readFile('./config.yml', 'utf8')
        this.config = safeLoad(conf)
      }
      catch(ex){
        alert('Error loading config file.')
      }
    }
  }
})
