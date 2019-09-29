'use strict'

const fsp = require('fs').promises,
      { spawn } = require('child_process'),
      path = require('path')

const app = new Vue({
  el: '#app',
  data: {
    albumArtist: '',
    albumTitle: '',
    releaseYear: '',
    genre: '',
    tracks: [],
    ripping: false,

    cdparanoiaProc: null,
    config: null,
  },
  mounted: async function(){
    this.start()

    try{
      const { safeLoad } = require('js-yaml')

      const conf = await fsp.readFile('./config.yml', 'utf8')
      this.config = safeLoad(conf)
    }
    catch(ex){
      alert('Error loading config file.')
    }
  },
  watch: {
    albumArtist: function(val){
      // when album artist is edited, all tracks inherit it
      this.tracks.forEach(x => {x.artist = val})
    }
  },
  computed: {
    folderName: function(){
      return `${this.albumArtist} - ${this.albumTitle} (${this.releaseYear})`
    },
    flacOutputDir: function(){
      return path.resolve(this.config.FLAC.directory, this.folderName)
    }
  },
  methods: {
    // start: refresh TOC
    start: async function(){
      this.tracks = await this.getTOC()
    },

    rip: async function(test = false){
      try{
        this.validate()
      }
      catch(ex){
        console.error(ex)
        alert(ex.message)
        return
      }

      /* SETUP */
      this.tracks.forEach(t => {
        t.albumTitle = this.albumTitle
        t.year = this.releaseYear
        t.trackCount = this.tracks.length
        t.genre = this.genre
      })

      this.tmpdir = require('os').tmpdir() + '/bfcripper-' + Date.now()
      const args = [ // cdparanoia arguments
        '--output-wav',
        '--verbose',
        test ? '1': '--batch' // test mode: rip first track only
      ]

      // create temp dir for wav & flac output dir
      const ps = await Promise.all([
        fsp.mkdir(this.tmpdir),
        Utils.mkdirp(this.flacOutputDir)
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
        else if (data.indexOf('Done.') > -1){
          track = this.tracks[this.tracks.length - 1]
        }

        if (track)
          this.encodeFLAC(track)
      })

      this.cdparanoiaProc.on('close', (code) => {
        this.ripping = false
        this.$refs['log-paranoia'].push(`cdparanoia exited with code ${code}`)
        this.$refs['log-paranoia'].push(`\nRip time: ${this.parseTime(Date.now() - start)}`)
      })
    },

    // checks metadata are there
    validate: function(){
      if (this.tracks.some(x => !x.artist))
        throw new Error('Missing artist name')
      else if (this.tracks.some(x => !x.title))
        throw new Error('Missing track title')
      else if (!this.releaseYear)
        throw new Error('Missing release year')
    },

    encodeFLAC: function(track){
      if (!track) throw new Error('Track object is null')

      console.log('Encode to FLAC')
      // console.log(track)
      const inputFile = path.resolve(this.tmpdir, track.sourcename),
            outputFile = path.resolve(this.flacOutputDir, `${track.filename}.flac`),
            args = [
              ` "${inputFile}"`,
              '-3',
              '-f',
              `-T ARTIST="${track.artist}"`,
              `-T TITLE="${track.title}"`,
              `-T ALBUM="${track.albumTitle}"`,
              `-T TRACKNUMBER="${track.pos}"`,
              `-T DATE="${track.year}"`,
              `-T GENRE="${this.genre}"`,
              `-o "${outputFile}"`,
            ]

      console.log('flac ' + args.join(' '))

      this.flacProc = spawn('flac', args, {cwd: this.tmpdir})
      this.flacProc.stdout.on('data', data => {
        console.log('stdout: ' + data)
      })
      this.flacProc.stderr.on('data', data => {
        console.log('stderr: ' + data)
      })
      this.flacProc.on('close', (code) => {
        // this.ripping = false
        console.log(`flac exited with code ${code}.`)
      })

    },

    // converts a duration in ms into a string with minutes and seconds
    parseTime: function(val){
      val /= 1000 // convert to seconds
      const min = Math.floor(val / 60),
            sec = Math.floor(val - min*60).toString().padStart(2, '0')
      return `${min}m ${sec}s`
    },

    // cancel rip. kill child proc.
    cancel: function(){
      this.cdparanoiaProc.kill('SIGTERM')
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
      const {exec} = require('child_process')
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

    testEncodeFlac: function(){
      const target = this.tracks[0]
      this.tmpdir = "/tmp/bfcripper-1569790390611"
      target.artist = 'Ufomammut'
      target.albumTitle = '8'
      target.genre = 'Doom'
      target.year = '2017'
      target.trackCount = this.tracks.length

      this.encodeFLAC(target)
    }
  }
})
