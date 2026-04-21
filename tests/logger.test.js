import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import os from 'os';

const require = createRequire(import.meta.url);

describe('logger', () => {
    let logger;
    let testLogDir;

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
        // Clean up temp directory
        fs.rmSync(testLogDir, { recursive: true, force: true });
    });

    describe('init()', () => {
        it('creates log file in the specified directory', () => {
            logger.init(testLogDir);
            const logPath = logger.getLogPath();
            expect(logPath).toBe(path.join(testLogDir, 'media-viewer.log'));
            expect(fs.existsSync(logPath)).toBe(true);
        });

        it('creates directory if it does not exist', () => {
            const nestedDir = path.join(testLogDir, 'nested', 'logs');
            logger.init(nestedDir);
            expect(fs.existsSync(nestedDir)).toBe(true);
            expect(fs.existsSync(path.join(nestedDir, 'media-viewer.log'))).toBe(true);
        });

        it('closes existing fd before opening a new one on second init', () => {
            const closeSyncSpy = vi.spyOn(fs, 'closeSync');
            logger.init(testLogDir);
            const callsAfterFirst = closeSyncSpy.mock.calls.length;
            logger.init(testLogDir);
            const callsAfterSecond = closeSyncSpy.mock.calls.length;
            expect(callsAfterSecond).toBe(callsAfterFirst + 1);
            closeSyncSpy.mockRestore();
        });
    });

    describe('getLogPath()', () => {
        it('returns null before init', () => {
            expect(logger.getLogPath()).toBeNull();
        });

        it('returns log file path after init', () => {
            logger.init(testLogDir);
            expect(logger.getLogPath()).toBe(path.join(testLogDir, 'media-viewer.log'));
        });
    });

    describe('log/warn/error()', () => {
        function readLog() {
            const logFile = logger.getLogPath();
            return fs.readFileSync(logFile, 'utf8');
        }

        it('writes INFO line with timestamp, level, source, and message', () => {
            logger.init(testLogDir);
            logger.log('main', 'Application started');
            const content = readLog();
            expect(content).toMatch(
                /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\] \[INFO\] \[main\] Application started\n$/
            );
        });

        it('writes WARN line', () => {
            logger.init(testLogDir);
            logger.warn('main', 'Something unusual');
            const content = readLog();
            expect(content).toMatch(/\[WARN\] \[main\] Something unusual/);
        });

        it('writes ERROR line', () => {
            logger.init(testLogDir);
            logger.error('renderer', 'Uncaught TypeError');
            const content = readLog();
            expect(content).toMatch(/\[ERROR\] \[renderer\] Uncaught TypeError/);
        });

        it('appends multiple lines within a session', () => {
            logger.init(testLogDir);
            logger.log('main', 'First');
            logger.warn('main', 'Second');
            logger.error('renderer', 'Third');
            const content = readLog();
            const lines = content.trim().split('\n');
            expect(lines).toHaveLength(3);
            expect(lines[0]).toContain('[INFO]');
            expect(lines[1]).toContain('[WARN]');
            expect(lines[2]).toContain('[ERROR]');
        });
    });

    describe('cleanup()', () => {
        it('deletes the log file', () => {
            logger.init(testLogDir);
            const logFile = logger.getLogPath();
            expect(fs.existsSync(logFile)).toBe(true);
            logger.cleanup();
            expect(fs.existsSync(logFile)).toBe(false);
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
});
