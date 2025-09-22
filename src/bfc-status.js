'use strict'

window.cpnts = window.cpnts || []

window.cpnts.push(['bfc-status', {
  props: {
    status: {type: Number, required: true},
    ripping: {type: Boolean, required: true} // whether global ripping process is running
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
    <img src="./img/status.png" width="21" height="21">
    <span class="bg" :class="[statusClass, {ripping: ripping}]"></span>
  </div>
  `
}])
