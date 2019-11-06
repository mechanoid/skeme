import { Response } from 'node-fetch'
import path from 'path'
import fs from 'fs'

// our fetch implementation for looking up our fixture files
// from file system instead of establishing real http connections.
export const fetchDummy = baseUrl => async url => {
  return new Promise((resolve, reject) => {
    const fixtureFilePath = path.resolve(process.cwd(), url.pathname.slice(1))

    fs.readFile(fixtureFilePath, 'utf8', (err, data) => {
      if (err) {
        return reject(err)
      }

      return resolve(new Response(data, { status: 200, statusText: 'OK' }))
    })
  })
}
