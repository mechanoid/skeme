# skeme

skeme [skiːm] is a JSON Schema resolver. It loads, deserialises (JSON and YAML) schema files
and explodes all $ref references to their referenced values.

All HTTP responses are cached to speedup the resolution of reoccurring $ref-references.
