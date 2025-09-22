'use strict'

const gulp = require('gulp')

function copyLibs(){
  return gulp.src([
    'node_modules/less/dist/less.js',
    'node_modules/vue/dist/vue.global.prod.js'
  ])
  .pipe(gulp.dest('lib/'))
}

exports.default = gulp.series(copyLibs)
