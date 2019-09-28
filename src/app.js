'use strict'

const app = new Vue({
  el: '#app',
  data: {
    albumArtist: '',
    albumTitle: '',
    releaseYear: '',
    genre: '',
    tracks: [],
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
              tn: parseInt(match.groups.tn, 10),
              start: match.groups.start,
              length: match.groups.length,
              artist: '',
              title: ''
            })
            // match = rx.exec(data)
          }
          resolve(tracks)
        })
      })
    }
  }
})
