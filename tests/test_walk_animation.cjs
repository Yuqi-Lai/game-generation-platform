const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const runtime = fs.readFileSync(path.join(__dirname, '../apps/web/public/playable/runtime.js'), 'utf8');
const walkFunction = runtime.slice(runtime.indexOf('function playWalkAnim('), runtime.indexOf('\nfunction update()'));

function fixture() {
    const animations = new Map(['down', 'up', 'right'].map(direction => [
        `walk-${direction}`, { frames: [{}, {}, {}], sheet: `player_${direction}_sheet` },
    ]));
    const player = {
        texture: { key: 'player_down_sheet' },
        activeAnimation: 'walk-down',
        flipX: false,
        setTexture(key) { this.texture.key = key; },
        setFlipX(value) { this.flipX = value; },
        setFrame(value) { this.frame = value; },
        play(key) { this.activeAnimation = key; },
        anims: { stop() { player.activeAnimation = null; } },
        tick() {
            if (this.activeAnimation) this.texture.key = animations.get(this.activeAnimation).sheet;
        },
    };
    const scene = {
        textures: { exists: () => true },
        anims: { exists: key => animations.has(key), get: key => animations.get(key) },
        time: { now: 200 },
    };
    const context = vm.createContext({ player, playerAnimState: { dir: 'down', frame: 0, lastTime: 0 } });
    vm.runInContext(walkFunction, context);
    return { player, scene, play: direction => context.playWalkAnim(scene, direction), animations };
}

test('changing from up/down to left uses the mirrored side animation on subsequent ticks', () => {
    for (const previous of ['up', 'down', 'right']) {
        const f = fixture();
        f.play(previous);
        f.play('left');
        f.player.tick();
        assert.equal(f.player.activeAnimation, 'walk-right');
        assert.equal(f.player.texture.key, 'player_right_sheet');
        assert.equal(f.player.flipX, true);
        for (const direction of ['right', 'up', 'down']) {
            f.play(direction);
            f.player.tick();
            assert.equal(f.player.texture.key, `player_${direction}_sheet`);
            assert.equal(f.player.flipX, false);
        }
    }
});

test('manual-frame fallback stops an earlier animation before selecting frames', () => {
    const f = fixture();
    f.animations.delete('walk-right');
    f.play('left');
    f.player.tick();
    assert.equal(f.player.activeAnimation, null);
    assert.equal(f.player.texture.key, 'player_right_sheet');
    assert.equal(f.player.flipX, true);
});
