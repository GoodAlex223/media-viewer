// CoalescingSaver (G3 member 2): one write per folder at a time, the newest payload wins, nothing rejects.
// Spec: docs/superpowers/specs/2026-11-02-g3-rating-data-safety-design.md § 3.2
import { describe, it, expect, vi } from 'vitest';
import { CoalescingSaver } from '../coalescing-saver.js';

/** A writer whose calls stay open until the test finishes them, in any order. */
function heldWriter() {
    const calls = [];
    const write = vi.fn(
        (folder, payload) =>
            new Promise((resolve, reject) => {
                calls.push({ folder, payload, finish: resolve, fail: reject });
            })
    );
    return { write, calls };
}

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Whether `promise` has settled yet, without waiting for it. */
async function isSettled(promise) {
    let settled = false;
    promise.then(() => {
        settled = true;
    });
    await flushMicrotasks();
    return settled;
}

describe('CoalescingSaver', () => {
    it('starts the write synchronously', () => {
        const { write, calls } = heldWriter();
        new CoalescingSaver(write).request('/A', 1);
        expect(calls.map((c) => [c.folder, c.payload])).toEqual([['/A', 1]]);
    });

    it('never runs two writes of one folder at once', async () => {
        const { write, calls } = heldWriter();
        const saver = new CoalescingSaver(write);
        saver.request('/A', 1);
        saver.request('/A', 2);
        await flushMicrotasks();
        expect(calls).toHaveLength(1);
        calls[0].finish();
        await flushMicrotasks();
        expect(calls).toHaveLength(2);
        expect(calls[1].payload).toBe(2);
    });

    it('writes only the newest of the payloads queued while a write runs', async () => {
        const { write, calls } = heldWriter();
        const saver = new CoalescingSaver(write);
        saver.request('/A', 1);
        saver.request('/A', 2);
        saver.request('/A', 3);
        calls[0].finish();
        await flushMicrotasks();
        calls[1].finish();
        await flushMicrotasks();
        expect(calls.map((c) => c.payload)).toEqual([1, 3]);
    });

    it("another folder's request neither replaces a queued save nor waits behind a running one", async () => {
        const { write, calls } = heldWriter();
        const saver = new CoalescingSaver(write);
        saver.request('/A', 'a1');
        saver.request('/A', 'a2');
        saver.request('/B', 'b1');
        // A drive that hangs on /A must not hold /B's ratings back.
        expect(calls.map((c) => c.payload)).toEqual(['a1', 'b1']);
        calls[0].finish();
        await flushMicrotasks();
        expect(calls.map((c) => c.payload)).toEqual(['a1', 'b1', 'a2']);
    });

    it('a request settles only once its payload, or a newer one of that folder, is written', async () => {
        const { write, calls } = heldWriter();
        const saver = new CoalescingSaver(write);
        const first = saver.request('/A', 1);
        const second = saver.request('/A', 2);
        const third = saver.request('/A', 3);
        expect(await isSettled(first)).toBe(false);
        calls[0].finish();
        expect(await isSettled(first)).toBe(true);
        expect(await isSettled(second)).toBe(false);
        expect(await isSettled(third)).toBe(false);
        calls[1].finish();
        expect(await isSettled(second)).toBe(true);
        expect(await isSettled(third)).toBe(true);
    });

    it('a request made after a write finished starts a new write at once', async () => {
        const { write, calls } = heldWriter();
        const saver = new CoalescingSaver(write);
        const first = saver.request('/A', 1);
        calls[0].finish();
        await first;
        saver.request('/A', 2);
        expect(calls.map((c) => c.payload)).toEqual([1, 2]);
    });

    it('whenIdle(folder) waits for that folder, its queued write included, and for no other', async () => {
        const { write, calls } = heldWriter();
        const saver = new CoalescingSaver(write);
        saver.request('/A', 1);
        saver.request('/A', 2);
        saver.request('/B', 'hung');
        const idleA = saver.whenIdle('/A');
        calls.find((c) => c.payload === 1).finish();
        expect(await isSettled(idleA)).toBe(false); // the queued write has started by now
        calls.find((c) => c.payload === 2).finish();
        expect(await isSettled(idleA)).toBe(true);
    });

    it('whenIdle() waits for every folder, and for a request made while it waits', async () => {
        const { write, calls } = heldWriter();
        const saver = new CoalescingSaver(write);
        saver.request('/A', 1);
        saver.request('/B', 2);
        const idle = saver.whenIdle();
        calls[0].finish();
        expect(await isSettled(idle)).toBe(false);
        saver.request('/C', 3);
        calls[1].finish();
        expect(await isSettled(idle)).toBe(false);
        calls[2].finish();
        expect(await isSettled(idle)).toBe(true);
    });

    it('whenIdle settles at once with nothing owed', async () => {
        const saver = new CoalescingSaver(vi.fn());
        expect(await isSettled(saver.whenIdle())).toBe(true);
        expect(await isSettled(saver.whenIdle('/A'))).toBe(true);
    });

    it('a writer that rejects or throws neither rejects the request nor wedges the queue', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { write, calls } = heldWriter();
        const saver = new CoalescingSaver(write);
        const first = saver.request('/A', 1);
        const second = saver.request('/A', 2);
        calls[0].fail(new Error('EPERM'));
        await expect(first).resolves.toBeUndefined();
        calls[1].finish();
        await expect(second).resolves.toBeUndefined();

        write.mockImplementationOnce(() => {
            throw new Error('sync');
        });
        await expect(saver.request('/A', 3)).resolves.toBeUndefined();
        await expect(saver.whenIdle()).resolves.toBeUndefined();
        expect(warn).toHaveBeenCalledTimes(2);
        warn.mockRestore();
    });
});
