'use strict'

window.cpnts = window.cpnts || []

// Simple alert modal
window.cpnts.push(['bfc-alert', {
    data: function(){
        return {
            // input arg is split on line breaks
            message: [],

            visible: false,
            
            // true to add space between first and 2nd lines
            title: false,

            // true to show non-first line as list (indentation + marker)
            list: false,
        }
    },
    methods: {
        show: function(msg, opts = {}){
            this.message = msg.split('\n')    
            this.title = !!opts.title
            this.list = !!opts.list
        
            this.visible = true
        },
        close: function(){
            this.visible = false
        }
    },
    template: `
    <div id="alert" :class="{hidden: !visible}">
        <div id="alert-ctnr" :class="{title: title, list: list}" >
            <div v-for="line in message">{{ line }}</div>
            <button @click="close">Close</button>
        </div>
    </div>
    `
}])