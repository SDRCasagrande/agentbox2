// Run with `npm test` (node's own test runner, which strips the types).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cliFromWhere } from './wherecli.ts';

const app = 'C:\\Users\\ana\\AppData\\Local\\Programs\\AgentBox\\AgentBox.exe';
const cli = 'C:\\Users\\ana\\AppData\\Local\\AgentBox\\bin\\agentbox.exe';

test('cliFromWhere takes the first match', () => {
  assert.equal(cliFromWhere(`${cli}\r\nC:\\tools\\agentbox.exe\r\n`, app), cli);
});

test("cliFromWhere skips the app's own executable, whatever its case", () => {
  assert.equal(cliFromWhere(`${app}\r\n${cli}\r\n`, app), cli);
  assert.equal(cliFromWhere(`${app.toLowerCase()}\r\n${cli}`, app), cli);
});

test('cliFromWhere is null when only the app matches, or nothing does', () => {
  assert.equal(cliFromWhere(app, app), null);
  assert.equal(cliFromWhere(null, app), null);
  assert.equal(cliFromWhere('', app), null);
});
