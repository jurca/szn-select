'use strict'

const del = require('del')
const fs = require('fs')
const glob = require('glob')
const gulp = require('gulp')
const babel = require('gulp-babel')
const concat = require('gulp-concat')
const rename = require('gulp-rename')
const postCss = require('gulp-postcss')
const postCustomProperties = require('postcss-custom-properties')
const util = require('util')

async function injectCss(done) {
  await Promise.all([
    'szn-select',
    'szn-select--button',
    'szn-select--options',
    'szn-select--ui',
  ].map(elementName => processElement(elementName)))

  done()

  async function processElement(elementName) {
    const readFile = util.promisify(fs.readFile)
    const writeFile = util.promisify(fs.writeFile)

    const [css, es6] = await Promise.all([
      readFile(`./dist/${elementName}.css`, 'utf-8'),
      readFile(`./${elementName}.js`, 'utf-8'),
    ])

    return writeFile(`./dist/${elementName}.js`, es6.replace('%{CSS_STYLES}%', css), 'utf-8')
  }
}

function concatElements() {
  return gulp
    .src('./dist/*.js')
    .pipe(concat('szn-select.es6.js'))
    .pipe(gulp.dest('./dist'))
}

async function injectA11yImplementations(done) {
  const readFile = util.promisify(fs.readFile)
  const writeFile = util.promisify(fs.writeFile)

  const baseClass = await readFile('./a11y/AccessibilityBroker.js', 'utf-8')
  const implementationSources = await util.promisify(glob)('./a11y/!(AccessibilityBroker).js')
  const implementations = await Promise.all(implementationSources.map(sourceFile => readFile(sourceFile, 'utf-8')))

  const selectSource = await readFile('./dist/szn-select.es6.js', 'utf-8')
  const newSource = selectSource.replace('// %{A11Y_IMPLEMENTATIONS}%', [baseClass, ...implementations].join('\n'))

  await writeFile('./dist/szn-select.es6.js', newSource, 'utf-8')

  done()
}

async function injectInitCode(done) {
  const readFile = util.promisify(fs.readFile)
  const writeFile = util.promisify(fs.writeFile)

  const source = await readFile('./dist/szn-select.es6.js', 'utf-8')
  const patchedSource = `${source}\nif (SznElements.init) {\n  SznElements.init()\n}\n`
  await writeFile('./dist/szn-select.es6.js', patchedSource, 'utf-8')

  done()
}

function compileJS() {
  return gulp
    .src('./dist/szn-select.es6.js')
    .pipe(babel({
      presets: [['env', {
        targets: {
          browsers: ['ie 8'],
        },
      }]],
    }))
    .pipe(rename('szn-select.es3.js'))
    .pipe(gulp.dest('./dist'))
}

const copy = gulp.parallel(
  copyPackageMetaFiles,
  copyNoJsCss,
)

function copyPackageMetaFiles() {
  return gulp
    .src(['./LICENSE', './package.json', './README.md'])
    .pipe(gulp.dest('./dist'))
}

function copyNoJsCss() {
  return gulp
    .src('./szn-select-nojs.css')
    .pipe(gulp.dest('./dist'))
}

function compileCss() {
  return gulp
    .src('./*.css')
    .pipe(postCss([
      postCustomProperties({
        preserve: true,
      }),
    ]))
    .pipe(gulp.dest('./dist'))
}

function minify() {
  return gulp
    .src('./dist/*.js')
    .pipe(babel({
      presets: ['minify'],
    }))
    .pipe(rename({
      suffix: '.min',
    }))
    .pipe(gulp.dest('./dist'))
}

function clean() {
  return del('./dist')
}

function cleanup() {
  return del('./dist/szn-select{,--button,--options,--ui}.{css,js}')
}

exports.default = gulp.series(
  clean,
  gulp.parallel(
    compileCss,
    copy,
  ),
  injectCss,
  concatElements,
  injectA11yImplementations,
  injectInitCode,
  cleanup,
  compileJS,
  minify,
)
