// What a node does, as an object rather than as a field name.
//
// Every node that does anything authored does it the same way: its text says
// what should happen, an AI turns that into a body, and the body is what runs.
// A node whose body runs as code hands that body out as a `Logic`, so no caller
// names a config key or reaches into an untyped bag to find it. How an AI
// writes a body, any kind of body, is `generation.ts`.

/** Where a logic keeps its body inside an element's stored config. */
export interface LogicFields {
  /** The config key holding the body. */
  body: string;
}

/**
 * One element's authored half: the body, and where it is kept.
 *
 * Constructed by the element from its own config, so the field names above
 * appear once — in the element that owns them — instead of travelling to every
 * caller that wants the body. Running it is the element's: no failure policy
 * here, what a failure costs is the executor's business (`catch_errors`).
 */
export class Logic {
  /** What runs. Empty means "not written yet". */
  readonly body: string;
  /** Which config key the body is kept in. */
  readonly fields: LogicFields;

  // Fields declared and assigned rather than written as constructor parameter
  // properties: graph/ has to survive Node's type stripping, and a
  // parameter property is one of the few TypeScript spellings that emits code
  // rather than only removing types. `strippable.test.ts` holds every file here
  // to that.
  constructor(body: string, fields: LogicFields) {
    this.body = body;
    this.fields = fields;
  }

  /** Whether anything was actually written. */
  get isEmpty(): boolean {
    return !this.body.trim();
  }
}

/** Read a logic straight off a subject's config, given where its body lives. */
export function logicFrom(subject: { config: Record<string, unknown> }, fields: LogicFields): Logic {
  return new Logic(String(subject.config[fields.body] ?? ''), fields);
}
