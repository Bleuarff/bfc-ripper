'use strict'

const gulp = require('gulp')

function copyLibs(){
  return gulp.src(['node_modules/less/dist/less.js'])
  .pipe(gulp.dest('lib/'))
}

exports.default = gulp.series(copyLibs)
