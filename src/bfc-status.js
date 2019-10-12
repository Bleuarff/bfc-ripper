'use strict'

Vue.component('bfc-status', {
  props: {
    status: {type: Number, required: true}
  },
  computed: {
    // return class value based on status
    statusClass: function(){
      let val = ''
      switch (this.status){
        case -1:
          val = 'waiting'
          break
        case IN_PROGRESS:
          val = 'inprogress'
          break
        case 0:
          val = 'done'
          break
        default:
          val = 'error'
      }
      return val
    }
  },
  template: `
  <div class="bfc-status">
    <img src="./img/icon.png" width="21" height="21">
    <span class="bg" :class=statusClass></span>
  </div>
  `
})
