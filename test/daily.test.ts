import { describe, expect, it } from 'vitest';
import {
  addDays,
  computeStreak,
  dailySeed,
  dateKey,
  daysBetween,
  emojiGrid,
  epochDay,
  fromEpochDay,
  msUntilNextDay,
  parseDateKey,
  puzzleNumber,
  recordPlay,
  shareText,
  streakOn,
  type StreakState,
} from '../src/daily';

describe('dateKey and time zones', () => {
  // 2026-11-14 15:30 UTC == 2026-11-15 00:30 in Seoul (UTC+9) == 2026-11-14 07:30 in LA (UTC-8)
  const instant = Date.UTC(2026, 10, 14, 15, 30);

  it('same instant, different calendar days per zone', () => {
    expect(dateKey(instant, { timeZone: 'UTC' })).toBe('2026-11-14');
    expect(dateKey(instant, { timeZone: 'Asia/Seoul' })).toBe('2026-11-15');
    expect(dateKey(instant, { timeZone: 'America/Los_Angeles' })).toBe('2026-11-14');
  });

  it('rolls over exactly at local midnight', () => {
    const seoulMidnight = Date.UTC(2026, 10, 14, 15, 0); // 00:00 KST on 11-15
    expect(dateKey(seoulMidnight - 1, { timeZone: 'Asia/Seoul' })).toBe('2026-11-14');
    expect(dateKey(seoulMidnight, { timeZone: 'Asia/Seoul' })).toBe('2026-11-15');
  });

  it('handles a half-hour zone and year boundaries', () => {
    const t = Date.UTC(2026, 11, 31, 18, 45); // 00:15 on 2027-01-01 in Kolkata (UTC+5:30)
    expect(dateKey(t, { timeZone: 'Asia/Kolkata' })).toBe('2027-01-01');
    expect(dateKey(t, { timeZone: 'UTC' })).toBe('2026-12-31');
  });

  it('accepts Date objects', () => {
    expect(dateKey(new Date(instant), { timeZone: 'UTC' })).toBe('2026-11-14');
  });

  it('msUntilNextDay counts to the zone midnight', () => {
    expect(msUntilNextDay(instant, { timeZone: 'UTC' })).toBe((8 * 60 + 30) * 60_000);
    expect(msUntilNextDay(instant, { timeZone: 'Asia/Seoul' })).toBe((23 * 60 + 30) * 60_000);
  });
});

describe('calendar math', () => {
  it('parses and validates keys', () => {
    expect(parseDateKey('2024-02-29')).toEqual({ year: 2024, month: 2, day: 29 });
    expect(() => parseDateKey('2026-02-29')).toThrow(RangeError);
    expect(() => parseDateKey('2026-1-5')).toThrow(RangeError);
    expect(() => parseDateKey('2026-13-01')).toThrow(RangeError);
  });

  it('epoch days round-trip and add across months, leap years and DST dates', () => {
    expect(epochDay('1970-01-01')).toBe(0);
    expect(fromEpochDay(epochDay('2026-11-15'))).toBe('2026-11-15');
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    // US DST starts 2026-03-08: still exactly one calendar day apart
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
  });

  it('puzzleNumber: launch day is #1', () => {
    expect(puzzleNumber('2026-11-01', '2026-11-01')).toBe(1);
    expect(puzzleNumber('2026-11-01', '2026-11-15')).toBe(15);
    expect(puzzleNumber('2026-11-01', '2026-10-31')).toBe(0);
    const t = Date.UTC(2026, 10, 14, 15, 30);
    expect(puzzleNumber('2026-11-01', t, { timeZone: 'Asia/Seoul' })).toBe(15);
    expect(puzzleNumber('2026-11-01', t, { timeZone: 'UTC' })).toBe(14);
  });

  it('dailySeed', () => {
    expect(dailySeed('tiles', '2026-11-15')).toBe('tiles/2026-11-15');
    expect(dailySeed('tiles', Date.UTC(2026, 10, 14, 15, 30), { timeZone: 'Asia/Seoul' })).toBe('tiles/2026-11-15');
  });
});

describe('streaks', () => {
  it('recordPlay: consecutive, same-day, gap, backwards clock', () => {
    let s: StreakState | undefined;
    s = recordPlay(s, '2026-11-10');
    expect(s).toEqual({ current: 1, best: 1, last: '2026-11-10' });
    s = recordPlay(s, '2026-11-11');
    s = recordPlay(s, '2026-11-11'); // same day: no change
    s = recordPlay(s, '2026-11-12');
    expect(s).toEqual({ current: 3, best: 3, last: '2026-11-12' });
    s = recordPlay(s, '2026-11-10'); // clock went back: ignored
    expect(s.current).toBe(3);
    s = recordPlay(s, '2026-11-14'); // missed 11-13
    expect(s).toEqual({ current: 1, best: 3, last: '2026-11-14' });
  });

  it('streak crosses month/year boundaries', () => {
    let s: StreakState | undefined;
    for (const d of ['2026-12-30', '2026-12-31', '2027-01-01']) s = recordPlay(s, d);
    expect(s?.current).toBe(3);
  });

  it('streakOn: alive through yesterday, dead after a missed day', () => {
    const s: StreakState = { current: 4, best: 6, last: '2026-11-14' };
    expect(streakOn(s, '2026-11-14')).toEqual({ current: 4, best: 6, playedToday: true, last: '2026-11-14' });
    expect(streakOn(s, '2026-11-15')).toMatchObject({ current: 4, playedToday: false });
    expect(streakOn(s, '2026-11-16')).toMatchObject({ current: 0, best: 6 });
    expect(streakOn(undefined, '2026-11-16')).toEqual({ current: 0, best: 0, playedToday: false, last: undefined });
  });

  it('computeStreak from history (unordered, duplicates)', () => {
    const played = ['2026-11-14', '2026-11-01', '2026-11-13', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-14'];
    expect(computeStreak(played, '2026-11-15')).toEqual({
      current: 2,
      best: 4,
      playedToday: false,
      last: '2026-11-14',
    });
    expect(computeStreak([], '2026-11-15').current).toBe(0);
  });
});

describe('share text', () => {
  it('builds the classic block', () => {
    const grid = emojiGrid(
      [
        [0, 1, 2],
        [2, 2, 2],
      ],
      ['⬛', '🟨', '🟩'],
    );
    expect(grid).toEqual(['⬛🟨🟩', '🟩🟩🟩']);
    expect(shareText({ title: 'Tiles', number: 15, score: '2/6', grid, url: 'https://example.com' })).toBe(
      'Tiles #15 2/6\n\n⬛🟨🟩\n🟩🟩🟩\n\nhttps://example.com',
    );
    expect(shareText({ title: 'Timer' })).toBe('Timer');
  });
});
