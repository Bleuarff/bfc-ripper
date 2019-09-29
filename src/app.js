'use strict'

const app = new Vue({
  el: '#app',
  data: {
    albumArtist: '',
    albumTitle: '',
    releaseYear: '',
    genre: '',
    tracks: [],
    ripping: false,
    output: '',

    childProc: null,
  },
  mounted: function(){
    this.start()
  },
  watch: {
    albumArtist: function(val){
      // when album artist is edited, all tracks inherit it
      this.tracks.forEach(x => {x.artist = val})
    }
  },
  methods: {
    // start: refresh TOC
    start: async function(){
      this.tracks = await this.getTOC()
    },

    rip: async function(test = false){
      this.ripping = true
      this.output = ''
      const { spawn } = require('child_process'),
            { mkdir } = require('fs').promises,
            tmp = require('os').tmpdir() + '/bfcripper-' + Date.now()

      await mkdir(tmp)
      const options = [
        '--output-wav',
        '--verbose',
        test ? '1': '--batch'
      ]
      const start = Date.now()
      this.childProc = spawn('cdparanoia', options, {cwd: tmp})

      // cdparanoia outputs everything on stderr, no need to listen to stdout
      this.childProc.stderr.on('data', (data) => {
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

      this.childProc.on('close', (code) => {
        this.ripping = false
        this.$refs['log-paranoia'].push(`child process exited with code ${code}`)
        this.$refs['log-paranoia'].push(`\nRip time: ${this.parseTime(Date.now() - start)}`)
      })
    },

    encodeFLAC: function(track){
      console.log('Encode to FLAC')
      console.log(track)
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
      this.childProc.kill('SIGTERM')
    },

    clear: function(path){
      if (!path) return

      const rimraf = require('rimraf')
      rimraf(path, err => {
        if (err) console.error(`Error deleting temp folder ${path}`)
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
            tracks.push({
              id: parseInt(match.groups.tn, 10),
              start: match.groups.start,
              length: match.groups.length,
              artist: '',
              title: '',
              enabled: true
            })
          }
          resolve(tracks)
        })
      })
    }
  }
})
