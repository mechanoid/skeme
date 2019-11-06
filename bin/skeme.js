#!/usr/bin/env node --experimental-modules

import arg from 'arg'
import skeme from '../index.js'
import fetch from 'node-fetch'
import yaml from 'js-yaml'

const args = arg({
  '--url': String,
  '-u': '--url'
})

const url = args['--url'] || (args._ && args._[0])

if (!url) {
  console.error('no URL given. Please provide a URI as parameter')
  process.exit(1)
}

console.log(`
loading schema from: ${url}
`)

skeme(url, { fetch, yaml })
  .then(console.log)
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
