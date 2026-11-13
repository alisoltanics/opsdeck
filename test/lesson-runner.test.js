'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { joinLines, splitOutside } = require('../src/main/kubernetes/lesson-runner');

test('lesson scripts join continuations, drop comments and capture heredocs', () => {
  const out = joinLines("# note\nkubectl create secret generic a \\\n  --from-literal=x=1\ncat <<'EOF' | kubectl apply -f -\na: b\nEOF\n");
  assert.equal(out.length, 2);
  assert.match(out[0].line, /--from-literal=x=1$/);
  assert.equal(out[1].stdin, 'a: b\n');
});

test('statement splitting respects quotes', () => {
  assert.deepEqual(splitOutside("kubectl get a | grep 'x|y'", '|'), ['kubectl get a', "grep 'x|y'"]);
  assert.deepEqual(splitOutside('a && b', '&&'), ['a', 'b']);
});
