'use strict'

Vue.component('bfc-log', {
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
    }
  },
  template: `
    <textarea readonly class="bfc-log log">{{content}}</textarea>
  `
})
