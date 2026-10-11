// G1 § 12: every ffmpeg/ffprobe run is pinned to the file protocol. Measured 2026-10-11 on the
// bundled builds: with `-protocol_whitelist file`, a playlist disguised as a video is refused at
// its first network segment ("Protocol 'http' not on whitelist 'file'!"), while a real H.264 file,
// the keyframe extraction and a Windows drive path all still work. The build's own default for a
// nested open is already 'file,crypto', so no behavioural test can tell the flag apart; this pins
// it at the source instead: one wrapper adds it, and no call bypasses the wrapper.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf-8');

describe('ffmpeg and ffprobe run with -protocol_whitelist file (G1)', () => {
    it('one wrapper prepends the flag to every argument list', () => {
        const wrapper = main.match(/function runMediaTool\(toolPath, args, options\) \{([\s\S]*?)\n\}/);
        expect(wrapper).not.toBeNull();
        expect(wrapper[1]).toContain("execFileAsync(toolPath, ['-protocol_whitelist', 'file', ...args], options)");
    });

    it('no ffmpeg or ffprobe call bypasses the wrapper', () => {
        expect(main).not.toMatch(/execFile(Async)?\(\s*(ffprobePath|ffmpegPath)/);
        expect(main).not.toMatch(/spawn\(\s*(ffprobePath|ffmpegPath)/);
        expect([...main.matchAll(/runMediaTool\(\s*(ffprobePath|ffmpegPath)/g)]).toHaveLength(4);
    });
});
