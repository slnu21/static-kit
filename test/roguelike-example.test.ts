import { describe, expect, it } from 'vitest';
import { createSaveCode } from '../src/save/code';
import { codec, fromSave, generateFloor, naiveSave, newRun, simulate, toSave } from '../examples/roguelike';

function scenario(kind: 'fresh' | 'small' | 'large') {
  if (kind === 'fresh') return newRun('run-7f3k');
  if (kind === 'small') {
    const s = newRun('run-7f3k');
    simulate(s, 40);
    return s;
  }
  const s = newRun('run-7f3k', 12);
  s.player.lvl = 9;
  s.player.xp = 4210;
  s.player.maxHp = 64;
  s.player.hp = 37;
  simulate(s, 2500);
  for (let i = 1; i <= 12; i++) s.inventory.set(`relic-${i}`, 1);
  return s;
}

describe('roguelike example: save inputs, regenerate outputs', () => {
  it('map generation is deterministic', () => {
    expect(generateFloor('abc', 3).tiles).toEqual(generateFloor('abc', 3).tiles);
    expect(generateFloor('abc', 3).tiles).not.toEqual(generateFloor('abc', 4).tiles);
  });

  it('code round-trip restores an identical run (map, exploration, RNG continuation)', async () => {
    const s = scenario('large');
    const code = await codec.exportCode(toSave(s));
    const back = fromSave(await codec.importCode(code));
    expect(back.map.tiles).toEqual(s.map.tiles);
    expect(back.explored).toEqual(s.explored);
    expect(back.player).toEqual(s.player);
    expect([...back.inventory]).toEqual([...s.inventory]);
    // Future rolls continue identically
    simulate(s, 100);
    simulate(back, 100);
    expect(back.player).toEqual(s.player);
    expect(back.rng.state()).toEqual(s.rng.state());
  });

  it('codes stay short (and much shorter than saving the map)', async () => {
    const rows: string[] = [];
    const naiveCodec = createSaveCode({ gameId: 'dungeon', version: 1 });
    for (const kind of ['fresh', 'small', 'large'] as const) {
      const s = scenario(kind);
      const save = toSave(s);
      const json = JSON.stringify(save).length;
      const code = (await codec.exportCode(save)).length;
      const naive = (await naiveCodec.exportCode(naiveSave(s))).length;
      const explored = s.explored.reduce((a, b) => a + b, 0);
      rows.push(
        `| ${kind} | ${s.floor} | ${explored}/${s.explored.length} | ${s.inventory.size} | ${json} | **${code}** | ${naive} |`,
      );
      expect(code).toBeLessThan(naive);
      expect(code).toBeLessThan(kind === 'large' ? 900 : 300);
    }
    if ((import.meta as { env?: { MODE?: string } }).env?.MODE === 'measure') {
      console.log(
        [
          '| 상태 | 층 | 탐험 타일 | 인벤 종류 | JSON 문자 | 세이브 코드 문자 | (비교) 맵 통째 저장 코드 |',
          '|---|---|---|---|---|---|---|',
          ...rows,
        ].join('\n'),
      );
    }
  });
});
