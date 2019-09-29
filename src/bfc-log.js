'use strict'

Vue.component('bfc-log', {
  data: function(){
    return {
      content: ''
    }
  },
  methods: {
    push: function(data){
      this.content += data
    }
  },
  template: `
  <div class="bfc-log">
    <textarea readonly>{{content}}</textarea>
  </div>
  `
})
