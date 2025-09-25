'use strict'

window.cpnts = window.cpnts || []

// Simple alert modal
window.cpnts.push(['bfc-alert', {
    data: function(){
        return {
            message: '',
            visible: false,
        }
    },
    methods: {
        show: function(msg){
            this.message = msg
            this.visible = true
        },
        close: function(){
            this.visible = false
        }
    },
    template: `
    <div id="alert" :class="{hidden: !visible}">
        <div id="alert-ctnr">
            <div>{{ message }}</div>
            <button @click="close">Close</button>
        </div>
    </div>
    `
}])