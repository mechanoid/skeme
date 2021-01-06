import tape from 'tape'
import yaml from 'js-yaml'
import { skeme } from '../../index.js'
import { fetchDummy } from './helper/fetch.js'

const clone = obj => JSON.parse(JSON.stringify(obj))

const baseUrl = 'http://some-test-host.fubar'
const fetch = fetchDummy(baseUrl)

tape('loading and deserializing schema files:', async test => {
  test.strictEqual(typeof skeme, 'function', 'skeme function is defined')
  let simpleJsonSchema, simpleYamlSchema, schemaWithRef

  try {
    simpleJsonSchema = await skeme('http://not-existing-host:3000/test/examples/single-file-spec.json', { baseUrl, fetch, yaml })
    simpleYamlSchema = await skeme('http://not-existing-host:3000/test/examples/single-file-spec.yml', { baseUrl, fetch, yaml })
    schemaWithRef = await skeme('http://not-existing-host:3000/test/examples/spec-with-ref.json', { baseUrl, fetch, yaml })
  } catch (e) {
    console.log(e)
  }

  test.test('for a simple json schema file', async t => {
    t.deepEqual(Object.keys(simpleJsonSchema), ['someSpec'], 'json content should contain valid keys')
  })

  test.test('for a simple yaml schema file', async t => {
    t.deepEqual(Object.keys(simpleYamlSchema), ['someSpec'])
  })

  test.test('json and yaml output should be identical, for identical specifications', async t => {
    t.deepEqual(simpleJsonSchema, simpleYamlSchema)
  })

  await test.test('relative reference should be resolved to contain the referenced content', async t => {
    const schemaWithRefCopy = clone(schemaWithRef)
    schemaWithRefCopy.someSpec.someRelativeRef = clone(simpleJsonSchema)

    t.deepEqual(schemaWithRef, schemaWithRefCopy, 'references should be resolved')
  })

  await test.test('absolute reference should be resolved to contain the referenced content', async t => {
    const schemaWithRefCopy = clone(schemaWithRef)
    schemaWithRefCopy.someSpec.someAbsolutePathRef = clone(simpleJsonSchema)

    t.deepEqual(schemaWithRef, schemaWithRefCopy, 'references should be resolved')
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

    t.deepEqual(schemaWithRef, schemaWithRefCopy, 'references should be resolved')
  })

  await test.test('absolute path reference should be resolved to contain the referenced content', async t => {
    const schemaWithRefCopy = clone(schemaWithRef)
    schemaWithRefCopy.someSpec.someAbsoluteRef = clone(simpleJsonSchema)

    t.deepEqual(schemaWithRef, schemaWithRefCopy, 'references should be resolved')
  })

  await test.test('nested references should be resolved, also yml should be recognized', async t => {
    const schemaWithRefCopy = clone(schemaWithRef)
    schemaWithRefCopy.someSpec.someNestedRef = clone(simpleJsonSchema)
    schemaWithRefCopy.someSpec.someNestedRef.someSpec.someRelativeRefToYmlFile = simpleJsonSchema
    schemaWithRefCopy.someSpec.someNestedRef.someSpec.someAbsoluteRefToYmlFile = simpleJsonSchema

    t.deepEqual(schemaWithRef, schemaWithRefCopy, 'references should be resolved')
  })
})

// tape('loading a looped reference should fail', async test => {
//   test.throws(async () => // XXX throws seems not to work as expected with promises
//     skeme('http://not-existing-host:3000/test/examples/spec-with-loop-ref.json', { baseUrl, fetch, yaml }),
//   /reference cycle/,
//   'reference loops should fail'
//   )
// })

// tape('resolving a non existing reference should fail', async test => {
//   test.rejects(async () => {
//     await skeme('http://not-existing-host:3000/test/examples/spec-with-non-existing-ref.json', { baseUrl, fetch, yaml })
//   }, /cannot be resolved with the hash/, 'resolving non-existing references should make the library fail')

//   test.end()
// })

tape('loading with keeping refs, should preserve $ref properties in resolved objects', async test => {
  let schema
  try {
    schema = await skeme('http://not-existing-host:3000/test/examples/spec-with-ref.json', { baseUrl, fetch, yaml, keepRefs: true })
  } catch (e) {
    console.log(e)
  }

  await test.test('for a simple json schema file', async t => {
    await t.deepEqual(schema.someSpec.someObjectRefWithHash, {
      someOtherProperty: 'some content',
      a: 1,
      b: 2,
      c: 3,
      $deref: './single-file-spec.json#someSpec/withObject'
    },
    'json content should preserve $refs in objects')
  })
})
