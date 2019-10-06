'use strict'

const gulp = require('gulp'),
      watch = require('gulp-watch'),
      less = require('gulp-less')

function defaultTask(cb){
  cb()
}

function makeStyle(cb){
  return gulp.src(['style/*.less'])
  .pipe(less())
  .pipe(gulp.dest('style/'))
}

gulp.watch(['style/*.less'], makeStyle)

exports.makeStyle = makeStyle
exports.default = gulp.series(makeStyle)
