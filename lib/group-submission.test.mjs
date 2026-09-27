import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGroupRoundInput, parseGroupWorkInput } from './group-submission.ts';
test('recovered discussion keeps its original policy and targets and rejects corrupt recovery data', () => {
  assert.deepEqual(parseGroupRoundInput('{"policy":"mention","targets":["nexus"]}'), {policy:'mention',targets:['nexus']});
  for (const text of ['null', '{"policy":"unknown"}', '{"policy":"mention","targets":[null]}']) assert.throws(() => parseGroupRoundInput(text));
});
test('recovered background work is a validated snapshot, not the current form draft', () => {
  const input = {kind:'work',to:'',question:'',title:'Weekly review',instruction:'Summarize changes'};
  assert.deepEqual(parseGroupWorkInput(JSON.stringify(input)), input);
  assert.throws(() => parseGroupWorkInput(JSON.stringify({...input,instruction:[] })));
});
