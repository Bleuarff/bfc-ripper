import { type ModalOptions } from "../types/modalOptions.mjs"
import { defineComponent } from "vue"

// Simple alert modal
export default defineComponent({
    data: function(){
        return {
            // input arg is split on line breaks
            message: [] as string[],

            visible: false,
            
            // true to add space between first and 2nd lines
            title: false,

            // true to show non-first line as list (indentation + marker)
            list: false,
        }
    },
    methods: {
        show: function(msg: string, opts: ModalOptions = {}){
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
})