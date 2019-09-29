'use strict'

Vue.component('bfc-log', {
  data: function(){
    return {
      content: ''
    }
  },
  updated: async function(){
    await this.$nextTick()
    const nd = this.$el.getElementsByClassName('log')[0]
    nd.scrollTop = nd.scrollHeight
  },
  methods: {
    push: function(data){
      this.content += data      
    }
  },
  template: `
  <div class="bfc-log">
    <textarea readonly class="log">{{content}}</textarea>
  </div>
  `
})
