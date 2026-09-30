import assert from 'node:assert/strict';
import test from 'node:test';
import { parseFriendDayArchive } from './friend-day-archive.ts';
const day={schemaVersion:1,longAgentId:'friend',date:'2026-09-29',timeZone:'Asia/Shanghai',sessions:[],works:[],occurrences:[],summary:null};
test('daily archive distinguishes missing files from completed executions and preserves Markdown',()=>{
 const value={...day,works:[{workId:'work-1',sessionId:'session-1',title:'Daily summary',contextProjectId:null,status:'completed',error:null,createdAt:'2026-09-30T00:00:00Z'}]};
 assert.equal(parseFriendDayArchive(value,'friend',day.date).summary,null);
 const saved={...value,summary:{date:day.date,markdown:'# 完成\n\n- fact',updatedAt:'2026-09-30T00:10:00Z',revision:'rev-1',fileName:'summary.md'}};
 assert.equal(parseFriendDayArchive(saved,'friend',day.date).summary.markdown,saved.summary.markdown);
});
test('daily archive rejects identity drift, malformed status, missing fields and wrong-date summaries',()=>{
 for(const value of [{...day,longAgentId:'another'}, {...day,works:[{}]}, {...day,summary:{}}, {...day,summary:{date:'2026-09-28',markdown:'bad',updatedAt:'2026-09-30T00:10:00Z',revision:null,fileName:'summary.md'}}]) assert.throws(()=>parseFriendDayArchive(value,'friend',day.date));
});
