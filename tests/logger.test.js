import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import os from 'os';

const require = createRequire(import.meta.url);

const SESSION_LOG = /^media-viewer-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(-\d+)?\.log$/;
const pad = (n) => String(n).padStart(2, '0');

describe('logger', () => {
    let logger;
    let testLogDir;

    const sessionLogs = () =>
        fs
            .readdirSync(testLogDir)
            .filter((name) => SESSION_LOG.test(name))
            .sort();
    const readLines = (file = logger.getLogPath()) => fs.readFileSync(file, 'utf8').trim().split('\n');
    const at = (second) => vi.setSystemTime(new Date(2026, 9, 5, 10, 0, second)); // local 2026-10-05 10:00:ss

    beforeEach(() => {
        testLogDir = fs.mkdtempSync(path.join(os.tmpdir(), 'logger-test-'));
        // Fresh require for each test to reset module state
        delete require.cache[require.resolve('../logger')];
        logger = require('../logger');
    });

    afterEach(() => {
        try {
            logger.cleanup();
        } catch (_e) {
            // ignore if already cleaned up
        }
        vi.useRealTimers();
        vi.restoreAllMocks();
        fs.rmSync(testLogDir, { recursive: true, force: true });
    });

    describe('init()', () => {
        it('creates a dated session log in the specified directory', () => {
            logger.init(testLogDir);
            const logPath = logger.getLogPath();
            expect(path.dirname(logPath)).toBe(testLogDir);
            expect(path.basename(logPath)).toMatch(SESSION_LOG);
            expect(fs.existsSync(logPath)).toBe(true);
        });

        it('names the file by the local start time', () => {
            vi.useFakeTimers({ toFake: ['Date'] });
            vi.setSystemTime(new Date(2026, 9, 6, 1, 30, 5)); // local 2026-10-06 01:30:05
            logger.init(testLogDir);
            expect(path.basename(logger.getLogPath())).toBe('media-viewer-2026-10-06_01-30-05.log');
        });

        it('opens the session with a header line naming the pid', () => {
            logger.init(testLogDir);
            expect(readLines()[0]).toMatch(
                new RegExp(`\\[INFO\\] \\[logger\\] Session started \\(pid ${process.pid}\\)$`)
            );
        });

        it('creates directory if it does not exist', () => {
            const nestedDir = path.join(testLogDir, 'nested', 'logs');
            logger.init(nestedDir);
            expect(fs.existsSync(nestedDir)).toBe(true);
            expect(path.dirname(logger.getLogPath())).toBe(nestedDir);
        });

        it('closes existing fd before opening a new one on second init', () => {
            const closeSyncSpy = vi.spyOn(fs, 'closeSync');
            logger.init(testLogDir);
            const callsAfterFirst = closeSyncSpy.mock.calls.length;
            logger.init(testLogDir);
            const callsAfterSecond = closeSyncSpy.mock.calls.length;
            expect(callsAfterSecond).toBe(callsAfterFirst + 1);
        });

        it('gives a second session started in the same second its own file', () => {
            vi.useFakeTimers({ toFake: ['Date'] });
            at(0);
            logger.init(testLogDir);
            const first = logger.getLogPath();
            logger.cleanup();
            logger.init(testLogDir);
            expect(path.basename(logger.getLogPath())).toBe('media-viewer-2026-10-05_10-00-00-2.log');
            expect(readLines(first).at(-1)).toMatch(/Session ended \(clean quit\)$/);
        });
    });

    describe('retention', () => {
        it('keeps only the newest 10 session logs', () => {
            vi.useFakeTimers({ toFake: ['Date'] });
            for (let s = 0; s < 11; s++) {
                at(s);
                logger.init(testLogDir);
                logger.cleanup();
            }
            const kept = sessionLogs();
            expect(kept).toHaveLength(10);
            expect(kept).not.toContain('media-viewer-2026-10-05_10-00-00.log');
            expect(kept).toContain('media-viewer-2026-10-05_10-00-10.log');
        });

        it('never prunes the perf log or a legacy media-viewer.log', () => {
            const legacy = path.join(testLogDir, 'media-viewer.log');
            const perf = path.join(testLogDir, 'media-viewer-perf.log');
            fs.writeFileSync(legacy, 'legacy crash log\n');
            fs.writeFileSync(perf, 'perf\n');
            vi.useFakeTimers({ toFake: ['Date'] });
            for (let s = 0; s < 12; s++) {
                at(s);
                logger.init(testLogDir);
                logger.cleanup();
            }
            expect(fs.readFileSync(legacy, 'utf8')).toBe('legacy crash log\n');
            expect(fs.readFileSync(perf, 'utf8')).toBe('perf\n');
            expect(sessionLogs()).toHaveLength(10);
        });

        it('never prunes the session it just opened, even when later-stamped logs fill the quota', () => {
            // PR #73 review: a clock set back, a move west or a DST fall-back leaves names stamped
            // "after now"; ordering by name put the new log 11th and init() deleted its own file.
            for (let i = 0; i < 10; i++) {
                fs.writeFileSync(path.join(testLogDir, `media-viewer-2099-01-01_00-00-0${i}.log`), 'future\n');
            }
            logger.init(testLogDir);
            expect(fs.existsSync(logger.getLogPath())).toBe(true);
            expect(sessionLogs()).toHaveLength(10);
        });

        it('orders sessions by modification time, so skewed names cannot evict the previous session', () => {
            const old = new Date(2020, 0, 1);
            for (let i = 0; i < 10; i++) {
                const name = path.join(testLogDir, `media-viewer-2099-01-01_00-00-0${i}.log`);
                fs.writeFileSync(name, 'future\n');
                fs.utimesSync(name, old, old);
            }
            logger.init(testLogDir);
            const previous = logger.getLogPath();
            logger.cleanup();
            logger.init(testLogDir); // relaunch: the previous session must still be there to read
            expect(fs.existsSync(previous)).toBe(true);
            expect(fs.existsSync(logger.getLogPath())).toBe(true);
            expect(sessionLogs()).toHaveLength(10);
        });

        it('treats a modification time in the future as oldest, so a clock set back cannot evict the previous session', () => {
            // PR #73 review round 2: logs written under a fast clock carry future mtimes, which newer
            // sessions never outrank — ordering them newest made each relaunch delete the prior log.
            const future = new Date(2099, 0, 1);
            for (let i = 0; i < 10; i++) {
                const name = path.join(testLogDir, `media-viewer-2099-01-01_00-00-0${i}.log`);
                fs.writeFileSync(name, 'future\n');
                fs.utimesSync(name, future, future);
            }
            logger.init(testLogDir);
            const previous = logger.getLogPath();
            logger.cleanup();
            logger.init(testLogDir); // relaunch: the previous session must still be there to read
            expect(fs.existsSync(previous)).toBe(true);
            expect(sessionLogs()).toHaveLength(10);
        });

        it('still starts when the header line cannot be written (PR #73 review)', () => {
            vi.spyOn(fs, 'writeSync').mockImplementationOnce(() => {
                const err = new Error('ENOSPC: no space left on device');
                err.code = 'ENOSPC';
                throw err;
            });
            expect(() => logger.init(testLogDir)).not.toThrow();
            expect(fs.existsSync(logger.getLogPath())).toBe(true);
        });

        it('still starts the session when an old log cannot be deleted', () => {
            vi.useFakeTimers({ toFake: ['Date'] });
            for (let s = 0; s < 10; s++) {
                at(s);
                logger.init(testLogDir);
                logger.cleanup();
            }
            vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {
                const err = new Error('EBUSY: resource busy or locked');
                err.code = 'EBUSY';
                throw err;
            });
            at(10);
            expect(() => logger.init(testLogDir)).not.toThrow();
            logger.log('main', 'still logging');
            expect(readLines().at(-1)).toMatch(/\[INFO\] \[main\] still logging$/);
            expect(sessionLogs()).toHaveLength(11); // nothing could be pruned — retried on the next launch
        });
    });

    describe('log/warn/error()', () => {
        it('writes INFO line with timestamp, level, source, and message', () => {
            logger.init(testLogDir);
            logger.log('main', 'Application started');
            expect(readLines().at(-1)).toMatch(
                /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\] \[INFO\] \[main\] Application started$/
            );
        });

        it('writes WARN line', () => {
            logger.init(testLogDir);
            logger.warn('main', 'Something unusual');
            expect(readLines().at(-1)).toMatch(/\[WARN\] \[main\] Something unusual$/);
        });

        it('writes ERROR line', () => {
            logger.init(testLogDir);
            logger.error('renderer', 'Uncaught TypeError');
            expect(readLines().at(-1)).toMatch(/\[ERROR\] \[renderer\] Uncaught TypeError$/);
        });

        it('appends multiple lines within a session, after the header', () => {
            logger.init(testLogDir);
            logger.log('main', 'First');
            logger.warn('main', 'Second');
            logger.error('renderer', 'Third');
            const lines = readLines().slice(1);
            expect(lines).toHaveLength(3);
            expect(lines[0]).toContain('[INFO]');
            expect(lines[1]).toContain('[WARN]');
            expect(lines[2]).toContain('[ERROR]');
        });

        it('stamps the local date, not the UTC date', () => {
            // The hour whose UTC date differs from the local one: just after midnight east of UTC,
            // just before midnight west of it. At UTC+0 no hour discriminates and this passes
            // either way — it was RED on the UTC+3 machine it was written on.
            const offsetMinutes = -new Date(2026, 9, 6, 12).getTimezoneOffset();
            const hour = offsetMinutes >= 0 ? 0 : 23;
            vi.useFakeTimers({ toFake: ['Date'] });
            vi.setSystemTime(new Date(2026, 9, 6, hour, 15, 0));
            logger.init(testLogDir);
            logger.log('main', 'late');
            expect(readLines().at(-1)).toBe(`[2026-10-06 ${pad(hour)}:15:00.000] [INFO] [main] late`);
        });
    });

    describe('cleanup()', () => {
        it('keeps the session log and ends it with a clean-quit footer', () => {
            logger.init(testLogDir);
            const logFile = logger.getLogPath();
            logger.cleanup();
            expect(fs.existsSync(logFile)).toBe(true);
            expect(readLines(logFile).at(-1)).toMatch(/\[INFO\] \[logger\] Session ended \(clean quit\)$/);
        });

        it('leaves no footer on a session that never reached cleanup (a crash or a kill)', () => {
            logger.init(testLogDir);
            logger.log('main', 'working');
            expect(readLines().at(-1)).not.toMatch(/Session ended/);
        });

        it('resets logPath to null', () => {
            logger.init(testLogDir);
            logger.cleanup();
            expect(logger.getLogPath()).toBeNull();
        });

        it('is safe to call before init', () => {
            expect(() => logger.cleanup()).not.toThrow();
        });

        it('is safe to call twice', () => {
            logger.init(testLogDir);
            logger.cleanup();
            expect(() => logger.cleanup()).not.toThrow();
        });
    });

    describe('getLogPath()', () => {
        it('returns null before init', () => {
            expect(logger.getLogPath()).toBeNull();
        });
    });

    describe('logPerf()', () => {
        it('appends a [PERF] line to media-viewer-perf.log', () => {
            logger.init(testLogDir);
            logger.logPerf('resume: 42ms');
            const content = fs.readFileSync(path.join(testLogDir, 'media-viewer-perf.log'), 'utf-8');
            expect(content).toContain('[PERF] resume: 42ms');
        });

        it('persists the perf log across cleanup, alongside the session log', () => {
            logger.init(testLogDir);
            logger.logPerf('x: 1ms');
            logger.cleanup();
            expect(fs.existsSync(path.join(testLogDir, 'media-viewer-perf.log'))).toBe(true);
            expect(sessionLogs()).toHaveLength(1); // the session log survives quit too (G2)
        });

        it('appends across sessions (init does not truncate the perf log)', () => {
            logger.init(testLogDir);
            logger.logPerf('session1');
            logger.cleanup();
            logger.init(testLogDir);
            logger.logPerf('session2');
            const content = fs.readFileSync(path.join(testLogDir, 'media-viewer-perf.log'), 'utf-8');
            expect(content).toContain('session1');
            expect(content).toContain('session2');
        });

        it('is a no-op before init (does not throw, writes nothing)', () => {
            expect(() => logger.logPerf('x')).not.toThrow();
        });
    });
});
