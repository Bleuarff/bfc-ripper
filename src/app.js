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
      this.childProc = spawn('cdparanoia', [test ? '1': '--batch', '--verbose'], {cwd: tmp});

      this.childProc.stdout.on('data', (data) => {
        this.$refs['log-paranoia'].push(data)
      })

      this.childProc.stderr.on('data', (data) => {
        // this.output += '\n' + data
        this.$refs['log-paranoia'].push(data)
      })

      this.childProc.on('close', (code) => {
        this.ripping = false
        this.$refs['log-paranoia'].push(`child process exited with code ${code}`)
      })

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
