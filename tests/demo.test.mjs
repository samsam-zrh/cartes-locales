import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createApp} from '../server.mjs';
import {cleanCard, RARITIES} from '../lib/database.mjs';

const seedPath = fileURLToPath(new URL('../data/cards.json', import.meta.url));

test('the demo catalogue is self-contained and accepts every rarity', async () => {
  const cards = JSON.parse(await readFile(seedPath, 'utf8'));
  assert.equal(cards.length, 24);
  assert.equal(new Set(cards.map(card => card.id)).size, cards.length);
  assert.equal(new Set(cards.map(card => card.title)).size, cards.length);
  for (const rarity of RARITIES) assert.equal(cards.filter(card => card.rarity === rarity).length, 4);
  for (const card of cards) {
    assert.deepEqual(cleanCard(card), card);
    assert.equal(card.image, '');
    assert.equal(card.wikiUrl, '');
    assert.equal(card.qScore, null);
    assert.equal(card.views, null);
    assert.equal(card.source.observed, false);
    assert.equal(card.source.contentOrigin, 'original fictional demo');
  }
});

test('the public demo opens packs and claims local rewards without captured data', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cartes-demo-'));
  let app;
  try {
    app = createApp({dbPath: join(dir, 'demo.sqlite'), seedPath, publicDir: dir,
      achievementsPath: join(dir, 'no-captured-achievements.json')});
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + app.server.address().port;
    let cookie = '';
    const call = async (path, method = 'GET', body, expected = 200) => {
      const response = await fetch(base + path, {method,
        headers: {...(body ? {'content-type': 'application/json'} : {}), ...(cookie ? {cookie} : {})},
        body: body ? JSON.stringify(body) : undefined});
      assert.equal(response.status, expected);
      if (response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      return response.json();
    };
    await call('/api/login', 'POST', {userId: 1});
    const before = await call('/api/state');
    assert.equal(before.counts.cards, 24);
    const draw = await call('/api/packs/open', 'POST', {});
    assert.equal(draw.cards.length, 5);
    assert.equal(new Set(draw.cards.map(card => card.instanceId)).size, 5);
    const after = await call('/api/state');
    assert.equal(after.stats.totalCards, before.stats.totalCards + 5);
    assert.equal(after.packs, before.packs - 1);
    const {achievements} = await call('/api/achievements');
    assert.equal(achievements.length, 51);
    assert.ok(achievements.every(achievement => achievement.localRule === true));
    const opened = achievements.find(achievement => achievement.key === 'packsOpened' && achievement.threshold === 1);
    assert.equal(opened.unlocked, true);
    const reward = await call('/api/achievements/' + opened.id + '/claim', 'POST', {});
    assert.equal(reward.user.coins, after.user.coins + opened.reward);
    await call('/api/achievements/' + opened.id + '/claim', 'POST', {}, 409);
    assert.equal((await call('/api/state')).user.coins, reward.user.coins);
  } finally {
    if (app) {
      if (app.server.listening) await new Promise(resolve => app.server.close(resolve));
      app.db.close();
    }
    await rm(dir, {recursive: true, force: true});
  }
});
