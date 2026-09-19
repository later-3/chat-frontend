import assert from "node:assert/strict";
import test from "node:test";
import { BUILTIN_SLASH_COMMANDS, getBuiltinSlashCommand } from "./builtin-slash-commands.ts";

test("absolute paths and slash-prefixed prose remain messages instead of UI commands", () => {
  for (const text of [
    "/Users/example/Code/Chat 请检查这个路径",
    "/tmp",
    "/tmp/a folder/file.ts\n请解释这个文件",
    "/compact/file.ts 请检查文件",
    "//server/share/file.txt",
    "/这是普通文字",
    "/unknown 这是未注册的命令样式文字",
    "请解释 /compact 的含义",
  ]) assert.equal(getBuiltinSlashCommand(text), undefined, text);
});

test("registered slash commands match complete names, including arguments and pasted whitespace", () => {
  for (const command of BUILTIN_SLASH_COMMANDS) {
    assert.equal(getBuiltinSlashCommand(`/${command.name}`), command);
    assert.equal(getBuiltinSlashCommand(`  /${command.name}\targument\n`), command);
    assert.equal(getBuiltinSlashCommand(`/${command.name}-file`), undefined);
    assert.equal(getBuiltinSlashCommand(`/${command.name}/file`), undefined);
  }
});
