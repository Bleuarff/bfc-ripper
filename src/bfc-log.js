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
    push: function(data){
      this.content += data
    }
  },
  template: `
    <textarea readonly class="bfc-log log">{{content}}</textarea>
  `
})
