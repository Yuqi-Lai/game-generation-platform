const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../apps/web/public/playable/runtime.js'), 'utf8');

test('explicit scene minion IDs retain their own sprite and combat stats', () => {
    const context = vm.createContext({});
    vm.runInContext(source.slice(source.indexOf('function playableManifestToScenes('),
        source.indexOf('\nfunction playOpeningSequence(')), context);
    const manifest = {
        player: { name: 'Witch', description: 'Pink hat' }, npcs: [],
        minions: ['coral-crab', 'teal-crab'].map(id => ({
            id, name: id, assets: { sprite: `minion.${id}.sprite` },
            stats: { hp: 24, attack: 4, defense: 2 },
        })),
        scenes: [{ minionIds: ['coral-crab', 'teal-crab'], collisionRectangles: [] }],
    };
    const actors = context.playableManifestToScenes(manifest)[0].minions;
    assert.equal(actors.length, 2);
    assert.equal(actors[0].sprite, 'minion.coral-crab.sprite');
    assert.equal(actors[1].sprite, 'minion.teal-crab.sprite');
    assert.equal(actors[0].hp, 24);
    assert.equal(actors[0].attack, 4);
});

test('crab combat applies damage and ends in victory without negative HP', () => {
    let victory = false;
    const context = vm.createContext({
        battleContainer: { visible: true },
        playerStats: { hp: 100, attack: 16, defense: 8 },
        battleLogText: { setText() {} }, battleNpcSprite: {}, battlePlayerSprite: {},
        shakeSprite() {}, playHitSfx() {}, updateBattleStats() {},
        endBattle(scene, win) { victory = win; },
    });
    vm.runInContext(source.slice(source.indexOf('function executeBattleTurn('),
        source.indexOf('\nfunction updateBattleStats(')), context);
    const crab = { name: 'Crab', hp: 24, attack: 4, defense: 2 };
    const scene = { time: { delayedCall(delay, callback) { callback(); } } };
    context.executeBattleTurn(scene, crab);
    assert.equal(crab.hp, 9);
    assert.equal(context.playerStats.hp, 99);
    context.executeBattleTurn(scene, crab);
    assert.equal(crab.hp, 0);
    assert.equal(victory, true);
});
