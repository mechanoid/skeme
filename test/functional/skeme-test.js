import tape from 'tape'
import _test from 'tape-promise'
import yaml from 'js-yaml'
import { skeme } from '../../index.js'
import { fetchDummy } from './helper/fetch.js'

const test = _test.default(tape)

const clone = obj => JSON.parse(JSON.stringify(obj))

const baseUrl = 'http://some-test-host.fubar'
const fetch = fetchDummy(baseUrl)

test('loading and deserializing schema files:', async test => {
  test.strictEqual(typeof skeme, 'function', 'skeme function is defined')
  let simpleJsonSchema, simpleYamlSchema, schemaWithRef

  try {
    simpleJsonSchema = await skeme('http://not-existing-host:3000/test/examples/single-file-spec.json', { baseUrl, fetch, yaml })
    simpleYamlSchema = await skeme('http://not-existing-host:3000/test/examples/single-file-spec.yml', { baseUrl, fetch, yaml })
    schemaWithRef = await skeme('http://not-existing-host:3000/test/examples/spec-with-ref.json', { baseUrl, fetch, yaml })
  } catch (e) {
    console.log(e)
  }

  await test.test('for a simple json schema file', async t => {
    await test.deepEqual(Object.keys(simpleJsonSchema), ['someSpec'], 'json content should contain valid keys')
    t.end()
  })

  await test.test('for a simple yaml schema file', async t => {
    await test.deepEqual(Object.keys(simpleYamlSchema), ['someSpec'])
    t.end()
  })

  await test.test('json and yaml output should be identical, for identical specifications', async t => {
    test.deepEqual(simpleJsonSchema, simpleYamlSchema)
    t.end()
  })

  await test.test('relative reference should be resolved to contain the referenced content', async t => {
    const schemaWithRefCopy = clone(schemaWithRef)
    schemaWithRefCopy.someSpec.someRelativeRef = clone(simpleJsonSchema)

    test.deepEqual(schemaWithRef, schemaWithRefCopy, 'references should be resolved')
    t.end()
  })

  await test.test('absolute reference should be resolved to contain the referenced content', async t => {
    const schemaWithRefCopy = clone(schemaWithRef)
    schemaWithRefCopy.someSpec.someAbsolutePathRef = clone(simpleJsonSchema)

    test.deepEqual(schemaWithRef, schemaWithRefCopy, 'references should be resolved')
    t.end()
  })

  await test.test('resolving deep nested properties by adding a hash to a $ref should be properly resolved', async t => {
    const schemaWithRefCopy = clone(schemaWithRef)
    schemaWithRefCopy.someSpec.someArrayRefWithHash = clone(simpleJsonSchema).someSpec.withArray
    schemaWithRefCopy.someSpec.someObjectRefWithHash = clone(simpleJsonSchema).someSpec.withObject
    schemaWithRefCopy.someSpec.someObjectRefWithHash.someOtherProperty = 'some content'
    schemaWithRefCopy.someSpec.someStringRefWithHash = clone(simpleJsonSchema).someSpec.withString
    schemaWithRefCopy.someSpec.someNumberRefWithHash = clone(simpleJsonSchema).someSpec.withNumber
    schemaWithRefCopy.someSpec.someBooleanRefWithHash = clone(simpleJsonSchema).someSpec.withBoolean
    schemaWithRefCopy.someSpec.someNullRefWithHash = clone(simpleJsonSchema).someSpec.withNull

    test.deepEqual(schemaWithRef, schemaWithRefCopy, 'references should be resolved')
    t.end()
  })

  await test.test('absolute path reference should be resolved to contain the referenced content', async t => {
    const schemaWithRefCopy = clone(schemaWithRef)
    schemaWithRefCopy.someSpec.someAbsoluteRef = clone(simpleJsonSchema)

    test.deepEqual(schemaWithRef, schemaWithRefCopy, 'references should be resolved')
    t.end()
  })

  await test.test('nested references should be resolved, also yml should be recognized', async t => {
    const schemaWithRefCopy = clone(schemaWithRef)
    schemaWithRefCopy.someSpec.someNestedRef = clone(simpleJsonSchema)
    schemaWithRefCopy.someSpec.someNestedRef.someSpec.someRelativeRefToYmlFile = simpleJsonSchema
    schemaWithRefCopy.someSpec.someNestedRef.someSpec.someAbsoluteRefToYmlFile = simpleJsonSchema

    test.deepEqual(schemaWithRef, schemaWithRefCopy, 'references should be resolved')
    t.end()
  })
})

test('loading a looped reference should fail', async test => {
  test.rejects(async () => {
    await skeme('http://not-existing-host:3000/test/examples/spec-with-loop-ref.json', { baseUrl, fetch, yaml })
  }, /reference cycle/, 'reference loops should fail')

  test.end()
})

test('loading with keeping refs, should preserve $ref properties in resolved objects', async test => {
  let schema
  try {
    schema = await skeme('http://not-existing-host:3000/test/examples/spec-with-ref.json', { baseUrl, fetch, yaml, keepRefs: true })
  } catch (e) {
    console.log(e)
  }

  await test.test('for a simple json schema file', async t => {
    await test.deepEqual(schema.someSpec.someObjectRefWithHash, {
      someOtherProperty: 'some content',
      a: 1,
      b: 2,
      c: 3,
      $ref: './single-file-spec.json#someSpec/withObject'
    },
    'json content should preserve $refs in objects')
    t.end()
  })

  test.end()
})
