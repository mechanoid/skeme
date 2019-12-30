/* global window, fetch, jsyaml */

const FILE_LOOKUP_CACHE = {}

const clone = obj => JSON.parse(JSON.stringify(obj))

/**
 * simple object type recognition to recognize js objects from parsed documents
 */
const objectType = obj => {
  const objectTypePattern = /\[object (.*)\]/
  const stringifiedType = Object.prototype.toString.call(obj)
  const match = stringifiedType.match(objectTypePattern)

  if (match) {
    return match[1]
  } else {
    throw new Error(`unknown type of object for "${obj}"`)
  }
}

const isObject = item => objectType(item) === 'Object'

/**
 * simple browser recognition. If window context is not given, we assume nodejs runtime.
 */
const isBrowser = () => { try { return !!window && !!window.location } catch (e) { return false } }

/**
 * best effort method to derive origin.
 * If not used in browser context no origin is returned,
 * all passed URIs must be passed full qualified then.
 */
const origin = () => {
  if (isBrowser()) {
    const location = window.location

    if (location.origin) {
      return location.origin
    }

    return `${location.protocol}//${location.host}`
  }

  return undefined // no origin to derive
}

/**
 * simple file extension check
 */
const extname = (path = '') => {
  const dotSegments = path.split('.')
  return dotSegments.length > 1 ? dotSegments[dotSegments.length - 1] : ''
}

/**
 * library default function.
 */
export const skeme = async (pathOrUrl, options = { }) => {
  let fetchClient, yamlClient
  const fetchOptions = options.fetchOptions || {}
  const useCache = !!options.cache || true // cache file lookups by default

  // try to bind mandatory dependencies
  try {
    fetchClient = options.fetch || fetch
  } catch (e) {
    if (e instanceof ReferenceError) {
      console.error(`${e.message}. Please provide the dependency via "options" or via global context (e.g in "window")`)
    }

    throw e
  }

  // try to bind optional dependencies
  try {
    yamlClient = options.yaml || jsyaml
  } catch (e) {
    if (e instanceof ReferenceError) {
      console.warn(`${e.message}. The dependency has not been provided. Functionality, like e.g. YAML parsing might not be given.
Please provide the dependency via "options" or via global context (e.g in "window") if you experience missing functionality.`)
    }
  }

  const baseUrl = options.baseUrl || origin()

  /**
   * skeme supports json and yaml format of schema files.
   * Here we try to deserialize what has been loaded before.
   */
  const deserialize = async (res, url) => {
    const fileExt = extname(url.pathname)

    const contentType = res.headers.get('Content-Type')

    // we check the content-type first, but we also guess for file extension of the path segment.
    // so for files matching either of that criterias we deserialize to yaml.
    if (contentType.indexOf('text/yaml') >= 0 || /^(yml|yaml)$/.test(fileExt)) {
      if (yamlClient) {
        const text = await res.text()
        return yamlClient.load(text)
      }

      console.warn('content type indicates YAML content. No YAML parsing library has been provided.')
    }

    // for everything else we assume json
    return res.json()
  }

  const cacheUrl = url => url.href.split('#')[0]

  /**
   * if caching is not disabled, search for cached
   * results and fetch the file from server if not.
   */
  const cachedFetch = async (url, { options = {} }) => {
    const key = cacheUrl(url)

    const [data, hit] = useCache && !!FILE_LOOKUP_CACHE[key]
      ? [await FILE_LOOKUP_CACHE[key], true]
      : [await fetchClient(url, options), false]

    return [data, hit]
  }

  /**
   * update the cache if caching is enabled
   */
  const updateCache = (key, data, hit) => {
    if (useCache && !hit) {
      // if not yet cached, write deserialized js-Objects to cache
      FILE_LOOKUP_CACHE[key] = data
    }
  }

  // loading schema files via HTTP
  const load = async url => {
    const defaults = { method: 'GET', mode: 'cors', credentials: 'include', redirect: 'follow' }

    const [res, hit] = await cachedFetch(url, Object.assign({}, defaults, fetchOptions))

    if (hit) {
      // return deserialized entry from cache on cache HIT
      return res
    }

    // On cache misses, we have an URL response here.
    // So we need to check for success. 4xx is success, otherwise.
    // Only 5xx errors are hitting the catch blocks.
    if (!res.ok) {
      throw new Error(`cannot resolve url ${url}, status: ${res.status}`)
    }

    // deserialize json or yaml responses
    const deserialized = deserialize(res, url)
    updateCache(cacheUrl(url), deserialized, hit)

    return deserialized
  }

  const urlHashToPropertyList = rawHash => {
    const hash = rawHash.indexOf('#') === 0 ? rawHash.slice(1) : rawHash // remove initial `#`
    return hash.split('/').filter(prop => !!prop)
  }

  /**
   * $ref links allow referencing deep nested properties
   * by adding a property path as anchor / url hash.
   * This method takes this hash and tries to resolve
   * the targeted value.
   */
  const getNestedPropertyByUrlHash = (item, hash) => {
    try {
      return urlHashToPropertyList(hash).reduce((nested, prop, index) => nested[prop], item)
    } catch (e) {
      throw new Error(`The object
  ${JSON.stringify(item)}
  cannot be resolved with the hash: ${hash}
  `)
    }
  }

  /**
   * schema file loading and deserializing supporting json and yaml files.
   * yaml files are recognized by content-type or file-extension (yml, yaml).
   */
  const loadSchema = async (pathOrUrl, { baseUrl, resolveChain }) => {
    // as we fetch the schema file by HTTP lookup we need to care for a full qualified URI.
    // This also helps to check for circular dependencies later.
    const url = new URL(pathOrUrl, baseUrl)

    if (resolveChain.indexOf(url.toString()) > 0) {
      throw new Error(`reference cycle for ${url.toString()}`)
    }
    const newChain = resolveChain.slice(0)
    newChain.push(url.toString())
    // const hash = url.hash

    const result = await load(url)
    return [result, url.toString(), newChain]
  }

  /**
   * resolve objects with $ref reference
   */
  const resolveRef = async (schema, { baseUrl, resolveChain }) => {
    const ref = schema.$ref

    const url = new URL(ref, baseUrl)
    const hash = url.hash

    const [fullData, newBaseUrl, newResolveChain] = await loadSchema(url, { baseUrl, resolveChain })

    const data = hash ? getNestedPropertyByUrlHash(fullData, hash) : fullData

    if (isObject(data)) {
      const cleanedSchema = Object.keys(schema).filter(k => k !== '$ref').reduce((result, k) => {
        result[k] = schema[k]
        return result
      }, {})

      const merged = Object.assign({}, cleanedSchema, data)
      return [merged, newBaseUrl, newResolveChain]
    }

    return [data, newBaseUrl, newResolveChain]
  }

  /**
   * resolves HashMaps / Objects provided as values in json schemas.
   */
  const resolveObject = async (schema, { baseUrl, resolveChain }) => {
    const properties = Object.keys(schema)

    return properties.reduce(async (resultFuture, prop) => {
      const result = await resultFuture
      const value = schema[prop]

      const [data, newBaseUrl, newResolveChain] = value && value.$ref
        ? await resolveRef(value, { baseUrl, resolveChain })
        : [value, baseUrl, resolveChain]

      const dereferenced = await resolveSchema(data, { baseUrl: newBaseUrl, resolveChain: newResolveChain })

      result[prop] = dereferenced
      return result
    }, Promise.resolve({}))
  }

  /**
   * resolves Arrays provided as values in json schemas.
   */
  const resolveArray = async (schema, { baseUrl, resolveChain }) =>
    Promise.all(schema.map(async data => resolveSchema(data, { baseUrl, resolveChain })))

  /**
   * Map of different resolver functions, to transform and resolve
   * the content to an expanded object, not containing any unresolved `$ref`
   * properties anymore.
   * So this map does only contain collection objects, that might contain nested
   * schema references.
   *
   * Keys refer to Object Types identified by `objectType(schema)`
   */
  const schemaResolver = {
    Object: resolveObject,
    Array: resolveArray
  }

  /**
   * takes in arbitrary "schemas" and tries to resolve
   * the content to a plain js object.
   */
  const resolveSchema = async (schema, { baseUrl, resolveChain }) => {
    const type = objectType(schema)
    const resolve = schemaResolver[type]

    if (resolve) {
      return resolve(schema, { baseUrl, resolveChain })
    }

    // if there is no specific resolver, return the plain result
    return schema
  }

  const [data, newBaseUrl, resolveChain] = await loadSchema(pathOrUrl, { baseUrl, resolveChain: [] })
  return resolveSchema(data, { baseUrl: newBaseUrl, resolveChain })
}

// default module function
export default skeme
