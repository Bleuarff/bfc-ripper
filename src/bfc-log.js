'use strict'

window.cpnts = window.cpnts || []

window.cpnts.push(['bfc-log', {
  data: function(){
    return {
      content: ''
    }
  },
  updated: async function(){
    await this.$nextTick()
    this.$el.scrollTop = this.$el.scrollHeight
  },
  methods: {
    // data: (Buffer) output from child process
    // end: (bool) message from terminated process
    push: function(data, end = false){
      if (typeof data !== 'string')
        data = data.toString('utf8')

      data = data.trimStart()
        .replace(/\s*$/, '\n') // clean multiple spaces/new lines at end of string, or insert newline
        .replace(/+/g, '') // remove flac progress marks

      if (end)
        data += '\n'

      this.content += data
    },

    clear: function(){
      this.content = ''
    }
  },
  template: `
    <textarea readonly class="bfc-log log">{{content}}</textarea>
  `
}])
