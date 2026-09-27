import assert from 'node:assert/strict';
import test from 'node:test';
import { artifactMatchesScope } from './task-results.ts';

test('task results follow source IDs across dates, repeated runs and revisions', () => {
  const sources = [
    {taskId:'t1',dutyId:'d1',workId:'w1'},
    {taskId:'t1',dutyId:'d1',workId:'w2'},
    {taskId:'t2',dutyId:'d1',workId:'w3'},
    {taskId:null,dutyId:'d2',workId:null},
    {taskId:null,dutyId:null,workId:'w4'},
  ];
  const count = (kind,id) => sources.filter(a => artifactMatchesScope(a,{kind,id})).length;
  assert.equal(count('task','t1'),2);
  assert.equal(count('duty','d1'),3);
  assert.equal(count('work','w1'),1);
  assert.equal(count('duty','d2'),1);
  assert.equal(count('work','w4'),1);
  assert.equal(count('task','unknown'),0);
});
